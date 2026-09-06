// Backend-only wrappers around z-ai-web-dev-sdk (VLM + LLM)
import sharp from "sharp";
import ZAI from "z-ai-web-dev-sdk";
import { MODE_CONFIG, type ExperimentMode } from "./ppe";
import { readImageBuffer } from "./imageStore";

/** Sentinel: the AI endpoint is not reachable from this runtime (e.g. serverless). */
export const AI_UNREACHABLE = "AI_SERVICE_UNREACHABLE";

function retryDelays(): number[] {
  const raw = process.env.ZAI_RETRY_DELAYS_MS;
  if (raw) {
    return raw
      .split(",")
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n >= 0);
  }
  return [5_000, 15_000, 45_000, 90_000, 150_000];
}
const RETRY_DELAYS_MS = retryDelays();

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  validate: (result: T) => boolean
): Promise<T | null> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await fn();
      if (validate(result)) return result;
      console.warn(`[${label}] attempt ${attempt}: invalid response`);
    } catch (err) {
      const msg = (err as Error).message;
      // network-unreachable — retrying can never succeed, fail immediately
      if (msg === AI_UNREACHABLE) return null;
      console.warn(`[${label}] attempt ${attempt} failed: ${msg.slice(0, 160)}`);
    }
    if (attempt < RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  return null;
}

// Cached SDK instance (backend only — never import from client components)
let zaiPromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null;

/** On serverless, verify the AI endpoint is reachable before any call. */
async function assertZaiReachable(baseUrl: string | undefined): Promise<void> {
  if (!process.env.VERCEL || !baseUrl) return;
  try {
    // any HTTP response (even 404) proves connectivity; a network error does not
    await fetch(baseUrl, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new Error(AI_UNREACHABLE);
  }
}

export async function getZAI() {
  if (!zaiPromise) {
    zaiPromise = (async () => {
      // On serverless runtimes the SDK config file can't be committed with the repo,
      // so we materialize the ZAI_CONFIG_JSON env var into the writable /tmp home.
      const envConfig = process.env.ZAI_CONFIG_JSON;
      if (envConfig && process.env.VERCEL) {
        try {
          process.env.HOME = "/tmp";
          const { writeFile, mkdir } = await import("fs/promises");
          await mkdir("/tmp", { recursive: true });
          await writeFile("/tmp/.z-ai-config", envConfig);
        } catch {
          /* fall through to the file-based lookup */
        }
        try {
          await assertZaiReachable(JSON.parse(envConfig).baseUrl);
        } catch {
          // surface the sentinel through the cached promise so every caller fails fast
          throw new Error(AI_UNREACHABLE);
        }
      }
      return ZAI.create();
    })();
  }
  return zaiPromise;
}

export async function imageToDataUrl(filePath: string): Promise<string> {
  const buf = await readImageBuffer(filePath);
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

/** Smaller version for in-context example images (reduces request payload). */
export async function imageToDataUrlSmall(filePath: string): Promise<string> {
  const buf = await readImageBuffer(filePath);
  const small = await sharp(buf)
    .flatten({ background: "#ffffff" })
    .resize(640, 640, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  return `data:image/jpeg;base64,${small.toString("base64")}`;
}

/** Robust JSON extraction from an LLM/VLM text answer */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    /* fall through */
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1)) as T;
    } catch {
      /* fall through */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ground-truth annotation prompt (strong "oracle" prompt with definitions)
// ---------------------------------------------------------------------------
export const GT_ANNOTATION_PROMPT = `You are annotating a dataset for a PPE (Personal Protective Equipment) compliance detection system.

Analyze the image and decide two binary attributes:
1. "helmet" — is at least one clearly visible worker wearing a hard hat / safety helmet?
2. "vest" — is at least one clearly visible worker wearing a high-visibility reflective safety vest?

Strict definitions:
- helmet = true ONLY for proper hard hats / construction safety helmets (yellow, white, red, blue, etc.). Baseball caps, beanies, hoods, cowboy hats, straw hats and bicycle helmets do NOT count.
- vest = true ONLY for hi-vis reflective safety vests (usually yellow/green/orange with reflective strips). Regular jackets, hoodies or work clothes without hi-vis reflective material do NOT count.
- If several workers are visible with mixed equipment, set the attribute true if at least one worker clearly wears the item.
- Decide only from what is actually visible.

Respond with JSON only, nothing else:
{"helmet": true, "vest": false, "confidence": "high|medium|low", "notes": "very short English note about visibility, occlusion or ambiguity"}`;

export interface GtAnnotation {
  helmet: boolean;
  vest: boolean;
  confidence: string;
  notes: string;
}

/** Annotate one image with the strong GT prompt. Returns null on repeated failure. */
export async function annotateImage(filePath: string): Promise<GtAnnotation | null> {
  type VisionResp = { choices?: Array<{ message?: { content?: string } }> };
  const result = await retryWithBackoff<GtAnnotation | null>(
    async () => {
      const zai = await getZAI();
      const dataUrl = await imageToDataUrl(filePath);
      const response = await zai.chat.completions.createVision({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: GT_ANNOTATION_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        thinking: { type: "disabled" },
      });
      const content = (response as unknown as VisionResp).choices?.[0]?.message?.content ?? "";
      const parsed = extractJson<GtAnnotation>(content);
      if (parsed && typeof parsed.helmet === "boolean" && typeof parsed.vest === "boolean") {
        return {
          helmet: parsed.helmet,
          vest: parsed.vest,
          confidence: String(parsed.confidence ?? "medium"),
          notes: String(parsed.notes ?? ""),
        };
      }
      return null;
    },
    "vlm.annotateImage",
    (r) => r !== null && r !== undefined
  );
  return result ?? null;
}

// ---------------------------------------------------------------------------
// The "model": VLM classifier with in-context examples (zero/few/many-shot)
// ---------------------------------------------------------------------------
export const CLASSIFY_INSTRUCTION = `Task: PPE compliance check for the workers visible in the image.
Decide two things:
- "helmet": does at least one visible worker wear a hard hat / safety helmet?
- "vest": does at least one visible worker wear a hi-vis reflective safety vest?
Answer strictly with JSON only, no other text:
{"helmet": true, "vest": false, "reasoning": "one short English sentence about what you see"}`;

export interface ClassifyExample {
  filePath: string;
  helmet: boolean;
  vest: boolean;
}

export interface ClassifyResult {
  helmet: boolean;
  vest: boolean;
  reasoning: string;
  latencyMs: number;
}

/** Classify a test image. `examples` are in-context labeled images (the "training data"). */
export async function classifyImage(
  testPath: string,
  examples: ClassifyExample[],
  mode: ExperimentMode
): Promise<ClassifyResult | null> {
  const start = Date.now();
  type VisionResp = { choices?: Array<{ message?: { content?: string } }> };
  const result = await retryWithBackoff<ClassifyResult | null>(
    async () => {
      const zai = await getZAI();
      const parts: Array<Record<string, unknown>> = [];

      const intro = examples.length
        ? `${CLASSIFY_INSTRUCTION}\n\nBelow are ${examples.length} labeled example images from this dataset. Learn the labeling conventions from them (what counts as a helmet, what counts as a hi-vis vest, how distant or partially visible workers are labeled). Each image is followed by its correct ground-truth labels.\nAfter the examples, classify the FINAL image the same way.`
        : CLASSIFY_INSTRUCTION;
      parts.push({ type: "text", text: intro });

      for (let i = 0; i < examples.length; i++) {
        const ex = examples[i];
        parts.push({
          type: "text",
          text: `Example ${i + 1} — ground truth: {"helmet": ${ex.helmet}, "vest": ${ex.vest}}`,
        });
        parts.push({ type: "image_url", image_url: { url: await imageToDataUrlSmall(ex.filePath) } });
      }

      if (examples.length) {
        parts.push({ type: "text", text: "Now classify this final image. Respond with JSON only." });
      }
      parts.push({ type: "image_url", image_url: { url: await imageToDataUrl(testPath) } });

      const response = await zai.chat.completions.createVision({
        messages: [{ role: "user", content: parts }],
        thinking: { type: "disabled" },
      });
      const content = (response as unknown as VisionResp).choices?.[0]?.message?.content ?? "";
      const parsed = extractJson<{ helmet: boolean; vest: boolean; reasoning?: string }>(content);
      if (parsed && typeof parsed.helmet === "boolean" && typeof parsed.vest === "boolean") {
        return {
          helmet: parsed.helmet,
          vest: parsed.vest,
          reasoning: String(parsed.reasoning ?? ""),
          latencyMs: Date.now() - start,
        };
      }
      return null;
    },
    `vlm.classifyImage:${MODE_CONFIG[mode].name}`,
    (r) => r !== null && r !== undefined
  );
  return result ?? null;
}

// ---------------------------------------------------------------------------
// Plain LLM (text) helpers
// ---------------------------------------------------------------------------
export async function chatLLM(system: string, user: string): Promise<string | null> {
  const result = await retryWithBackoff<string | null>(
    async () => {
      const zai = await getZAI();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: system },
          { role: "user", content: user },
        ],
        thinking: { type: "disabled" },
      });
      const content = (completion as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]
        ?.message?.content;
      return content && content.trim().length > 0 ? content : null;
    },
    "vlm.chatLLM",
    (r) => r !== null && r !== undefined
  );
  return result ?? null;
}

export async function chatLLMJson<T>(system: string, user: string): Promise<T | null> {
  const text = await chatLLM(system, user);
  return text ? extractJson<T>(text) : null;
}
