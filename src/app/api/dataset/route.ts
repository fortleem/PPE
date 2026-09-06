import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { db } from "@/lib/db";
import { annotateImage } from "@/lib/vlm";
import { COMBOS, comboOf } from "@/lib/ppe";
import { DATA_DIR } from "@/lib/serverPaths";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;
const MAX_UPLOADS = 6;

/** GET /api/dataset — filterable paginated gallery */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const combo = searchParams.get("combo"); // TT|TF|FT|FF|all
    const split = searchParams.get("split"); // train|test|none|all
    const labeled = searchParams.get("labeled"); // all|yes|no
    const flagged = searchParams.get("flagged") === "1";
    const search = (searchParams.get("search") ?? "").trim().toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

    const images = await db.datasetImage.findMany({ orderBy: { id: "desc" } });
    let filtered = images;
    if (combo && combo !== "all" && COMBOS.includes(combo as (typeof COMBOS)[number])) {
      filtered = filtered.filter(
        (i) => i.hasHelmet !== null && i.hasVest !== null && comboOf(i.hasHelmet!, i.hasVest!) === combo
      );
    }
    if (labeled === "yes") filtered = filtered.filter((i) => i.hasHelmet !== null && i.hasVest !== null);
    if (labeled === "no") filtered = filtered.filter((i) => i.hasHelmet === null || i.hasVest === null);
    if (split && split !== "all") filtered = filtered.filter((i) => i.split === split);
    if (flagged) filtered = filtered.filter((i) => Boolean(i.gtFlags));
    if (search) {
      filtered = filtered.filter(
        (i) =>
          (i.filename ?? "").toLowerCase().includes(search) ||
          (i.sourceQuery ?? "").toLowerCase().includes(search) ||
          (i.gtNotes ?? "").toLowerCase().includes(search)
      );
    }

    const total = filtered.length;
    const start = (page - 1) * PAGE_SIZE;
    const items = filtered.slice(start, start + PAGE_SIZE).map((i) => ({
      id: i.id,
      url: `/api/media/${i.id}`,
      hasHelmet: i.hasHelmet,
      hasVest: i.hasVest,
      combo: i.hasHelmet !== null && i.hasVest !== null ? comboOf(i.hasHelmet, i.hasVest) : null,
      split: i.split,
      theme: i.theme,
      source: i.source,
      sourceQuery: i.sourceQuery,
      gtConfidence: i.gtConfidence,
      gtNotes: i.gtNotes,
      gtFlags: i.gtFlags ? JSON.parse(i.gtFlags) : [],
      width: i.width,
      height: i.height,
      size: i.size,
      createdAt: i.createdAt,
    }));

    return Response.json({ items, total, page, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error("[api/dataset GET]", (err as Error).message);
    return Response.json({ error: "تعذر جلب الداتاسيت" }, { status: 500 });
  }
}

/** POST /api/dataset — upload images (auto-annotated via VLM) */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) return Response.json({ error: "لم يتم إرسال أي ملفات" }, { status: 400 });
    if (files.length > MAX_UPLOADS) {
      return Response.json({ error: `الحد الأقصى ${MAX_UPLOADS} ملفات في المرة الواحدة` }, { status: 400 });
    }

    const created: unknown[] = [];
    for (const file of files) {
      if (file.size > 8_000_000) continue;
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.byteLength < 3_000) continue;
      try {
        const normalized = await sharp(buf)
          .flatten({ background: "#ffffff" })
          .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer();
        if (normalized.byteLength < 4_000) continue;

        const id = `up_${crypto.randomBytes(6).toString("hex")}`;
        const filename = `${id}.jpg`;
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(path.join(DATA_DIR, filename), normalized);

        const meta = await sharp(normalized).metadata();
        const gt = await annotateImage(path.join(DATA_DIR, filename));
        const row = await db.datasetImage.create({
          data: {
            id,
            filename,
            url: null,
            theme: null,
            sourceQuery: file.name ?? "upload",
            source: "upload",
            hasHelmet: gt?.helmet ?? null,
            hasVest: gt?.vest ?? null,
            gtConfidence: gt ? (gt.confidence === "high" ? "medium" : gt.confidence) : null,
            gtNotes: gt?.notes ?? "لم يتم التوسيم تلقائياً — أدخل التسمية يدوياً",
            split: "none",
            width: meta.width ?? null,
            height: meta.height ?? null,
            size: normalized.byteLength,
          },
        });
        created.push({
          id: row.id,
          url: `/api/media/${row.id}`,
          hasHelmet: row.hasHelmet,
          hasVest: row.hasVest,
          note: gt ? "تم التوسيم الآلي — راجع التسمية وصحّحها إن لزم" : "فشل التوسيم الآلي — وسّم الصورة يدوياً",
        });
      } catch (err) {
        console.error("[api/dataset POST] file failed:", (err as Error).message);
      }
    }

    if (!created.length) return Response.json({ error: "فشل حفظ الملفات (صيغة غير مدعومة أو حجم غير مناسب)" }, { status: 400 });
    return Response.json({ created, count: created.length }, { status: 201 });
  } catch (err) {
    console.error("[api/dataset POST]", (err as Error).message);
    return Response.json({ error: "تعذر رفع الصور" }, { status: 500 });
  }
}
