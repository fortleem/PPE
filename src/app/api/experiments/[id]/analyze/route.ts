import { runErrorAnalysis } from "@/lib/errorAnalysis";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/experiments/:id/analyze — run/regenerate error analysis */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const summary = await runErrorAnalysis(id);
    if (!summary) return Response.json({ error: "التجربة غير موجودة" }, { status: 404 });
    return Response.json({ ok: true, summary });
  } catch (err) {
    console.error("[api/experiments/:id/analyze]", (err as Error).message);
    return Response.json({ error: (err as Error).message || "تعذر تحليل الأخطاء" }, { status: 500 });
  }
}
