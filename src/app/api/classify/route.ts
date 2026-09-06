import path from "path";
import { db } from "@/lib/db";
import { EXPERIMENT_MODES, MODE_CONFIG, type ExperimentMode } from "@/lib/ppe";
import { DATA_DIR } from "@/lib/serverPaths";
import { selectContextExamples } from "@/lib/runner";
import { classifyImage } from "@/lib/vlm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/classify — live single-image classification demo */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { imageId?: string; mode?: string };
    const imageId = body.imageId;
    const mode = (
      (EXPERIMENT_MODES as readonly string[]).includes(body.mode ?? "") ? body.mode : "many_shot"
    ) as ExperimentMode;
    if (!imageId) return Response.json({ error: "حدد صورة (imageId)" }, { status: 400 });

    const img = await db.datasetImage.findUnique({ where: { id: imageId } });
    if (!img) return Response.json({ error: "الصورة غير موجودة" }, { status: 404 });

    const examples = await selectContextExamples(mode);
    const result = await classifyImage(
      path.join(DATA_DIR, img.filename),
      examples.map(({ filePath, helmet, vest }) => ({ filePath, helmet, vest })),
      mode
    );
    if (!result) return Response.json({ error: "فشل استدعاء النموذج — حاول مرة أخرى" }, { status: 502 });

    const helmetCorrect = img.hasHelmet !== null ? result.helmet === img.hasHelmet : null;
    const vestCorrect = img.hasVest !== null ? result.vest === img.hasVest : null;

    return Response.json({
      imageId: img.id,
      url: `/api/media/${img.id}`,
      mode,
      modeName: MODE_CONFIG[mode].name,
      contextImages: examples.length,
      prediction: { helmet: result.helmet, vest: result.vest },
      groundTruth: { helmet: img.hasHelmet, vest: img.hasVest },
      helmetCorrect,
      vestCorrect,
      correct: helmetCorrect === null || vestCorrect === null ? null : helmetCorrect && vestCorrect,
      reasoning: result.reasoning,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    console.error("[api/classify]", (err as Error).message);
    return Response.json({ error: "تعذر تصنيف الصورة" }, { status: 500 });
  }
}
