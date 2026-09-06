// Server-side image resolution with graceful degradation across runtimes:
// 1. local filesystem (dev machine / same disk)           — data/dataset/<file>
// 2. in-memory registry (just-uploaded images in this lambda)
// 3. database base64 fallback (uploads on read-only filesystems)
// 4. static public copy of the shipped dataset (Vercel CDN) — /dataset/<file>
import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { DATA_DIR } from "./serverPaths";

const MEMORY_CACHE_LIMIT = 80;
const memoryImages = new Map<string, Buffer>();

/** Register an in-memory image (used right after an upload in the same request). */
export function setMemoryImage(filename: string, buf: Buffer): void {
  if (memoryImages.size >= MEMORY_CACHE_LIMIT) {
    const oldest = memoryImages.keys().next().value;
    if (oldest !== undefined) memoryImages.delete(oldest);
  }
  memoryImages.set(filename, buf);
}

export function clearMemoryImage(filename: string): void {
  memoryImages.delete(filename);
}

function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  const dep = process.env.VERCEL_URL;
  if (dep) return `https://${dep}`;
  return "http://localhost:3000";
}

async function fetchStaticDatasetImage(filename: string): Promise<Buffer | null> {
  try {
    const url = `${siteOrigin()}/dataset/${encodeURIComponent(filename)}`;
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Resolve a dataset image to its raw bytes, working on both local and serverless runtimes. */
export async function readImageBuffer(filePathOrFilename: string): Promise<Buffer> {
  const filename = path.basename(filePathOrFilename);

  // 1. local filesystem
  try {
    const buf = await fs.readFile(path.join(DATA_DIR, filename));
    return buf;
  } catch {
    /* ENOENT on serverless — continue */
  }

  // 2. in-memory registry (fresh uploads in this process)
  const mem = memoryImages.get(filename);
  if (mem) return mem;

  // 3. base64 stored in the database (serverless uploads)
  try {
    const row = await db.datasetImage.findUnique({
      where: { filename },
      select: { dataBase64: true },
    });
    if (row?.dataBase64) return Buffer.from(row.dataBase64, "base64");
  } catch {
    /* ignore DB errors here — try static next */
  }

  // 4. static public copy shipped with the repo (Vercel CDN)
  const fetched = await fetchStaticDatasetImage(filename);
  if (fetched) {
    setMemoryImage(filename, fetched); // cache for the rest of this lambda's life
    return fetched;
  }

  throw new Error(`image not found: ${filename}`);
}

export { siteOrigin };
