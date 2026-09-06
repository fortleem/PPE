import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { DATA_DIR } from "@/lib/serverPaths";

export const dynamic = "force-dynamic";

/** PATCH /api/dataset/:id — human label correction / split change */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      hasHelmet?: boolean;
      hasVest?: boolean;
      split?: string;
    };
    const img = await db.datasetImage.findUnique({ where: { id } });
    if (!img) return Response.json({ error: "الصورة غير موجودة" }, { status: 404 });

    const data: Record<string, unknown> = {};
    let humanEdited = false;
    if (typeof body.hasHelmet === "boolean") {
      data.hasHelmet = body.hasHelmet;
      humanEdited = true;
    }
    if (typeof body.hasVest === "boolean") {
      data.hasVest = body.hasVest;
      humanEdited = true;
    }
    if (humanEdited) {
      data.gtConfidence = "human";
      data.gtFlags = null; // human resolves intent conflicts
    }
    if (body.split && ["train", "test", "none"].includes(body.split)) {
      data.split = body.split;
    }
    if (!Object.keys(data).length) return Response.json({ error: "لا يوجد تغيير صالح" }, { status: 400 });

    const updated = await db.datasetImage.update({ where: { id }, data });
    return Response.json({
      id: updated.id,
      hasHelmet: updated.hasHelmet,
      hasVest: updated.hasVest,
      split: updated.split,
      gtConfidence: updated.gtConfidence,
      gtFlags: updated.gtFlags ? JSON.parse(updated.gtFlags) : [],
    });
  } catch (err) {
    console.error("[api/dataset/:id PATCH]", (err as Error).message);
    return Response.json({ error: "تعذر تحديث الصورة" }, { status: 500 });
  }
}

/** DELETE /api/dataset/:id */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const img = await db.datasetImage.findUnique({ where: { id } });
    if (!img) return Response.json({ error: "الصورة غير موجودة" }, { status: 404 });
    await db.datasetImage.delete({ where: { id } });
    await fs.rm(path.join(DATA_DIR, img.filename), { force: true }).catch(() => {});
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/dataset/:id DELETE]", (err as Error).message);
    return Response.json({ error: "تعذر حذف الصورة" }, { status: 500 });
  }
}
