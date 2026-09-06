import { db } from "@/lib/db";
import { COMBOS, COMBO_LABELS, comboOf } from "@/lib/ppe";
import { isRunning } from "@/lib/runner";

export const dynamic = "force-dynamic";

/** GET /api/experiments/:id — full details incl. per-image predictions */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const exp = await db.experiment.findUnique({
      where: { id },
      include: { predictions: { include: { image: true } } },
    });
    if (!exp) return Response.json({ error: "التجربة غير موجودة" }, { status: 404 });

    let metrics = null;
    if (exp.metricsJson) {
      try {
        metrics = JSON.parse(exp.metricsJson);
      } catch {
        /* ignore */
      }
    }
    let errorSummary = null;
    if (exp.errorSummary) {
      try {
        errorSummary = JSON.parse(exp.errorSummary);
      } catch {
        /* ignore */
      }
    }

    const predictions = exp.predictions
      .slice()
      .sort((a, b) => a.image.id.localeCompare(b.image.id))
      .map((p) => ({
        id: p.id,
        imageId: p.imageId,
        url: `/api/media/${p.imageId}`,
        gtHelmet: p.image.hasHelmet,
        gtVest: p.image.hasVest,
        gtCombo:
          p.image.hasHelmet !== null && p.image.hasVest !== null
            ? comboOf(p.image.hasHelmet, p.image.hasVest)
            : null,
        predHelmet: p.predHelmet,
        predVest: p.predVest,
        predCombo: comboOf(p.predHelmet, p.predVest),
        helmetCorrect: p.helmetCorrect,
        vestCorrect: p.vestCorrect,
        correct: p.correct,
        reasoning: p.reasoning,
        latencyMs: p.latencyMs,
        helmetErrorCat: p.helmetErrorCat,
        vestErrorCat: p.vestErrorCat,
        theme: p.image.theme,
        gtNotes: p.image.gtNotes,
      }));

    const contextImageIds: string[] = exp.contextImageIds ? JSON.parse(exp.contextImageIds) : [];
    const testImageIds: string[] = exp.testImageIds ? JSON.parse(exp.testImageIds) : [];

    return Response.json({
      id: exp.id,
      name: exp.name,
      mode: exp.mode,
      examplesPerClass: exp.examplesPerClass,
      status: exp.status,
      progress: exp.progress,
      total: exp.total,
      error: exp.error,
      live: isRunning(exp.id),
      startedAt: exp.startedAt,
      finishedAt: exp.finishedAt,
      createdAt: exp.createdAt,
      metrics,
      errorSummary,
      comboLabels: COMBOS.map((c) => ({ key: c, label: COMBO_LABELS[c] })),
      contextImageIds,
      contextThumbnails: contextImageIds.map((cid) => `/api/media/${cid}`),
      testImageIds,
      predictions,
    });
  } catch (err) {
    console.error("[api/experiments/:id GET]", (err as Error).message);
    return Response.json({ error: "تعذر جلب تفاصيل التجربة" }, { status: 500 });
  }
}
