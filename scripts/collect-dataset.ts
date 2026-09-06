/**
 * Dataset collection script (run: bun scripts/collect-dataset.ts)
 * 1. Real web images via `z-ai image-search` CLI (one query per theme)
 * 2. Download + normalize (sharp -> JPEG <=1280px) + dedupe (md5)
 * 3. Ground-truth annotation via VLM (strong prompt with definitions)
 * 4. Intent conflict flags + stratified train/test split
 */
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { annotateImage } from "../src/lib/vlm";
import { COMBOS, comboOf } from "../src/lib/ppe";

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();
const DATA_DIR = path.join(process.cwd(), "data", "dataset");
const TMP_DIR = path.join(process.cwd(), "data", "tmp");
const SEARCH_CACHE_FILE = path.join(process.cwd(), "data", "search-cache.json");
const FAILED_URLS_FILE = path.join(process.cwd(), "data", "failed-urls.json");
const DONE_SENTINEL = path.join(process.cwd(), "data", "collect.done");

async function loadJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}
async function saveJson(file: string, data: unknown): Promise<void> {
  await fs.writeFile(file, JSON.stringify(data, null, 1), "utf-8").catch(() => {});
}

const MAX_IMAGES = 110;
const SEARCH_QUERY_DELAY_MS = 12_000; // the search service is heavily rate-limited
const DOWNLOAD_CONCURRENCY = 8;
const ANNOTATE_CONCURRENCY = 1; // VLM API rate-limits hard — go slow and steady
const ANNOTATE_PACE_MS = 3_000;

interface SearchQuery {
  theme: string;
  q: string;
}

const QUERIES: SearchQuery[] = [
  { theme: "helmet", q: "construction worker wearing yellow hard hat and hi-vis safety vest on site" },
  { theme: "helmet", q: "construction worker in white safety helmet at building site" },
  { theme: "helmet", q: "worker wearing red hard hat helmet closeup portrait" },
  { theme: "helmet", q: "engineer wearing blue safety helmet inspecting construction site" },
  { theme: "no_helmet", q: "construction workers without hard hats on their heads" },
  { theme: "no_helmet", q: "worker wearing baseball cap instead of helmet at construction site" },
  { theme: "no_helmet", q: "man working without helmet in industrial factory" },
  { theme: "no_helmet", q: "construction worker bare head without helmet at site" },
  { theme: "safety_vest", q: "worker wearing orange hi-vis reflective safety vest" },
  { theme: "safety_vest", q: "warehouse worker in yellow high visibility vest" },
  { theme: "safety_vest", q: "road worker wearing reflective safety vest" },
  { theme: "safety_vest", q: "airport ground crew wearing hi-vis safety vests" },
  { theme: "no_vest", q: "construction worker in plain clothes without safety vest" },
  { theme: "no_vest", q: "factory worker in plain uniform no hi-vis jacket" },
  { theme: "no_vest", q: "mechanic working in regular work clothes in garage" },
  { theme: "no_vest", q: "worker wearing normal clothes no reflective vest at work" },
];

interface SearchResult {
  original_url: string;
  source?: string;
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await fn(items[idx]);
      } catch (err) {
        console.error("  pool item failed:", (err as Error).message);
        results[idx] = undefined as unknown as R;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function parseSearchStdout(stdout: string): { success?: boolean; results?: SearchResult[] } | null {
  // CLI prints banner lines before the JSON — extract the JSON object
  const start = stdout.indexOf("{");
  if (start === -1) return null;
  const candidate = stdout.slice(start);
  try {
    return JSON.parse(candidate) as { success?: boolean; results?: SearchResult[] };
  } catch {
    // maybe trailing junk — try to close at the last "}"
    const end = candidate.lastIndexOf("}");
    if (end > start) {
      try {
        return JSON.parse(candidate.slice(0, end + 1)) as { success?: boolean; results?: SearchResult[] };
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function searchImages(query: SearchQuery, idx: number): Promise<SearchResult[]> {
  for (let tryIdx = 0; tryIdx < 4; tryIdx++) {
    try {
      const { stdout } = await execFileAsync(
        "z-ai",
        ["image-search", "-q", query.q, "-c", "8", "--gl", "us", "--no-rank"],
        { timeout: 180_000, maxBuffer: 20 * 1024 * 1024 }
      );
      const json = parseSearchStdout(stdout);
      if (json?.success && Array.isArray(json.results)) {
        console.log(`[search ${idx + 1}/${QUERIES.length}] "${query.q}" -> ${json.results.length} results`);
        return json.results;
      }
      console.log(`[search ${idx + 1}] "${query.q}" -> no results (try ${tryIdx + 1})`);
      return [];
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (msg.includes("429")) {
        console.log(`[search ${idx + 1}] rate-limited, waiting 35s (try ${tryIdx + 1}/4)...`);
        await new Promise((r) => setTimeout(r, 35_000));
        continue;
      }
      console.error(`[search ${idx + 1}] "${query.q}" failed:`, msg.slice(0, 200));
      return [];
    }
  }
  return [];
}

async function downloadAndNormalize(
  item: SearchResult & { theme: string; query: string },
  seenHashes: Set<string>,
  seenUrls: Set<string>
): Promise<string | null> {
  const url = item.original_url;
  if (!url || seenUrls.has(url)) return null;
  seenUrls.add(url);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 5_000 || buf.byteLength > 8_000_000) return null;

    const normalized = await sharp(buf)
      .flatten({ background: "#ffffff" })
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    if (normalized.byteLength < 4_000) return null;

    const md5 = crypto.createHash("md5").update(normalized).digest("hex");
    if (seenHashes.has(md5)) return null;
    seenHashes.add(md5);

    const id = `img_${crypto.randomBytes(6).toString("hex")}`;
    const filename = `${id}.jpg`;
    await fs.writeFile(path.join(DATA_DIR, filename), normalized);

    const meta = await sharp(normalized).metadata();
    await prisma.datasetImage.create({
      data: {
        id,
        filename,
        url,
        theme: item.theme,
        sourceQuery: item.query,
        source: "web",
        width: meta.width ?? null,
        height: meta.height ?? null,
        size: normalized.byteLength,
        hasHelmet: null,
        hasVest: null,
        split: "none",
      },
    });
    return id;
  } catch {
    return null;
  }
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });

  const existing = await prisma.datasetImage.findMany({ select: { url: true, filename: true } });
  const seenUrls = new Set(existing.map((e) => e.url).filter(Boolean) as string[]);
  const seenHashes = new Set<string>();
  // hash existing files to avoid re-adding identical content under different URLs
  for (const e of existing) {
    try {
      const buf = await fs.readFile(path.join(DATA_DIR, e.filename));
      seenHashes.add(crypto.createHash("md5").update(buf).digest("hex"));
    } catch {
      /* missing file — ignore */
    }
  }
  // normalize legacy rows whose source accidentally stored the site name
  await prisma.datasetImage
    .updateMany({ where: { source: { notIn: ["web", "upload"] } }, data: { source: "web" } })
    .catch(() => {});

  let count = await prisma.datasetImage.count();
  console.log(`\n=== Phase 1: image search (${QUERIES.length} queries) — existing: ${count} ===`);

  // resumable search cache (query -> results) so re-runs skip completed searches
  const searchCache = await loadJson<Record<string, SearchResult[]>>(SEARCH_CACHE_FILE, {});
  const failedUrls = new Set(await loadJson<string[]>(FAILED_URLS_FILE, []));

  // sequential searches — the service rate-limits aggressively (429)
  const allResults: (SearchResult & { theme: string; query: string })[] = [];
  for (let i = 0; i < QUERIES.length; i++) {
    if (count + allResults.length >= MAX_IMAGES + 30) break;
    const cached = searchCache[QUERIES[i].q];
    if (Array.isArray(cached)) {
      console.log(`[search ${i + 1}/${QUERIES.length}] (cached) "${QUERIES[i].q}" -> ${cached.length} results`);
      for (const r of cached) allResults.push({ ...r, theme: QUERIES[i].theme, query: QUERIES[i].q });
      continue;
    }
    const rs = await searchImages(QUERIES[i], i);
    searchCache[QUERIES[i].q] = rs;
    await saveJson(SEARCH_CACHE_FILE, searchCache);
    for (const r of rs) allResults.push({ ...r, theme: QUERIES[i].theme, query: QUERIES[i].q });
    console.log(`  cumulative candidate URLs: ${allResults.length}`);
    if (i < QUERIES.length - 1) {
      await new Promise((r) => setTimeout(r, SEARCH_QUERY_DELAY_MS));
    }
  }

  console.log(`\n=== Phase 2: download + normalize (candidates: ${allResults.length}) ===`);
  const downloadedIds: string[] = [];
  await pool(allResults, DOWNLOAD_CONCURRENCY, async (item) => {
    if (downloadedIds.length + count >= MAX_IMAGES) return;
    if (failedUrls.has(item.original_url)) return;
    const id = await downloadAndNormalize(item, seenHashes, seenUrls);
    if (id) {
      downloadedIds.push(id);
      if (downloadedIds.length % 10 === 0) console.log(`  downloaded ${downloadedIds.length}`);
    } else {
      failedUrls.add(item.original_url);
    }
  });
  await saveJson(FAILED_URLS_FILE, [...failedUrls]);
  console.log(`  downloaded total: ${downloadedIds.length} (db now: ${await prisma.datasetImage.count()})`);

  console.log(`\n=== Phase 3: VLM ground-truth annotation ===`);
  const unlabeled = await prisma.datasetImage.findMany({
    where: { hasHelmet: null, hasVest: null },
    orderBy: { id: "asc" },
  });
  let done = 0;
  let failed = 0;
  await pool(unlabeled, ANNOTATE_CONCURRENCY, async (img) => {
    const filePath = path.join(DATA_DIR, img.filename);
    try {
      await fs.access(filePath);
    } catch {
      return;
    }
    const gt = await annotateImage(filePath);
    await new Promise((r) => setTimeout(r, ANNOTATE_PACE_MS));
    done++;
    if (!gt) {
      failed++;
      console.log(`  [fail] ${img.filename}`);
      if (img.url) failedUrls.add(img.url);
      await prisma.datasetImage.delete({ where: { id: img.id } }).catch(() => {});
      await fs.rm(filePath, { force: true }).catch(() => {});
      return;
    }
    const flags: string[] = [];
    if (img.theme === "helmet" && !gt.helmet) flags.push("intent_helmet_missing");
    if (img.theme === "no_helmet" && gt.helmet) flags.push("intent_helmet_unexpected");
    if (img.theme === "safety_vest" && !gt.vest) flags.push("intent_vest_missing");
    if (img.theme === "no_vest" && gt.vest) flags.push("intent_vest_unexpected");

    await prisma.datasetImage.update({
      where: { id: img.id },
      data: {
        hasHelmet: gt.helmet,
        hasVest: gt.vest,
        gtConfidence: gt.confidence,
        gtNotes: gt.notes,
        gtFlags: flags.length ? JSON.stringify(flags) : null,
        split: "train",
      },
    });
    if (done % 10 === 0) console.log(`  annotated ${done}/${unlabeled.length} (failed: ${failed})`);
  });
  console.log(`  annotation done: ${done}, failed: ${failed}`);
  await saveJson(FAILED_URLS_FILE, [...failedUrls]);

  console.log(`\n=== Phase 4: stratified train/test split ===`);
  const labeled = await prisma.datasetImage.findMany({
    where: { hasHelmet: { not: null }, hasVest: { not: null } },
    orderBy: { id: "asc" },
  });
  const groups: Record<string, typeof labeled> = { TT: [], TF: [], FT: [], FF: [] };
  for (const img of labeled) {
    groups[comboOf(img.hasHelmet!, img.hasVest!)].push(img);
  }
  // deterministic shuffle by filename hash for stable, balanced splits
  for (const c of COMBOS) {
    groups[c].sort(
      (a, b) =>
        crypto.createHash("md5").update(a.filename).digest("hex") >
        crypto.createHash("md5").update(b.filename).digest("hex")
          ? 1
          : -1
    );
  }
  for (const c of COMBOS) {
    const size = groups[c].length;
    const testCount = size >= 10 ? 6 : size >= 5 ? 3 : size >= 2 ? 1 : 0;
    for (let i = 0; i < size; i++) {
      await prisma.datasetImage.update({
        where: { id: groups[c][i].id },
        data: { split: i < testCount ? "test" : "train" },
      });
    }
    console.log(`  combo ${c}: total=${size}, test=${testCount}`);
  }

  const finalCount = await prisma.datasetImage.count();
  const unlabeledLeft = await prisma.datasetImage.count({ where: { hasHelmet: null } });
  const finalStats = await prisma.datasetImage.groupBy({
    by: ["hasHelmet", "hasVest", "split"],
    _count: { _all: true },
  });
  console.log(`\n=== DONE: ${finalCount} images (unlabeled left: ${unlabeledLeft}) ===`);
  console.log(JSON.stringify(finalStats, null, 2));
  if (unlabeledLeft === 0) {
    await fs.writeFile(DONE_SENTINEL, new Date().toISOString(), "utf-8").catch(() => {});
    console.log("SENTINEL WRITTEN: data/collect.done");
  }
}

main()
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
