import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { DATA_DIR } from "@/lib/serverPaths";

export const dynamic = "force-dynamic";

/** GET /api/media/:id — stream a dataset image */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const img = await db.datasetImage.findUnique({ where: { id } });
    if (!img) return new Response("not found", { status: 404 });
    const filePath = path.join(DATA_DIR, img.filename);
    const buf = await fs.readFile(filePath);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
