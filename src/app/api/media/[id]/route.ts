import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { DATA_DIR } from "@/lib/serverPaths";

export const dynamic = "force-dynamic";

/** GET /api/media/:id — stream a dataset image (fs → db base64 → static redirect) */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const img = await db.datasetImage.findUnique({ where: { id } });
    if (!img) return new Response("not found", { status: 404 });

    // 1. local filesystem (dev / persistent disk)
    try {
      const buf = await fs.readFile(path.join(DATA_DIR, img.filename));
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(buf.byteLength),
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    } catch {
      /* serverless — no local file */
    }

    // 2. base64 fallback (uploads stored in the database on read-only filesystems)
    if (img.dataBase64) {
      const buf = Buffer.from(img.dataBase64, "base64");
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(buf.byteLength),
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    }

    // 3. static public copy of the shipped dataset (served by the CDN on Vercel)
    const staticUrl = new URL(`/dataset/${encodeURIComponent(img.filename)}`, request.url);
    return Response.redirect(staticUrl.toString(), 302);
  } catch {
    return new Response("not found", { status: 404 });
  }
}
