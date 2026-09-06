import { db } from "@/lib/db";
import { COMBOS, COMBO_LABELS, PPE_CLASSES, comboOf } from "@/lib/ppe";
import { markStaleExperiments } from "@/lib/runner";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await markStaleExperiments();
    const images = await db.datasetImage.findMany();
    const labeled = images.filter((i) => i.hasHelmet !== null && i.hasVest !== null);
    const helmetTrue = labeled.filter((i) => i.hasHelmet!).length;
    const vestTrue = labeled.filter((i) => i.hasVest!).length;

    const byCombo: Record<string, number> = {};
    for (const c of COMBOS) byCombo[c] = 0;
    for (const i of labeled) byCombo[comboOf(i.hasHelmet!, i.hasVest!)]++;

    const experiments = await db.experiment.findMany({ orderBy: { createdAt: "desc" } });
    const done = experiments.filter((e) => e.status === "done");
    let best: { mode: string; exactMatch: number; macroF1: number } | null = null;
    for (const e of done) {
      if (!e.metricsJson) continue;
      try {
        const m = JSON.parse(e.metricsJson) as { exactMatch: number; macroF1: number };
        if (!best || m.exactMatch > best.exactMatch) best = { mode: e.mode, exactMatch: m.exactMatch, macroF1: m.macroF1 };
      } catch {
        /* ignore */
      }
    }

    const latestReport = await db.report.findFirst({ orderBy: { createdAt: "desc" } });
    const anyRunning = experiments.some((e) => e.status === "running" || e.status === "pending");

    return Response.json({
      totalImages: images.length,
      labeled: labeled.length,
      byCombo: COMBOS.map((c) => ({ key: c, label: COMBO_LABELS[c], count: byCombo[c] })),
      byClass: {
        helmet: helmetTrue,
        no_helmet: labeled.length - helmetTrue,
        safety_vest: vestTrue,
        no_vest: labeled.length - vestTrue,
      },
      classLabels: PPE_CLASSES,
      splits: {
        train: images.filter((i) => i.split === "train").length,
        test: images.filter((i) => i.split === "test").length,
        none: images.filter((i) => i.split === "none").length,
      },
      conflicts: images.filter((i) => i.gtFlags).length,
      sources: {
        web: images.filter((i) => i.source === "web").length,
        upload: images.filter((i) => i.source !== "web").length,
      },
      experiments: {
        count: experiments.length,
        done: done.length,
        running: anyRunning,
        best,
      },
      report: latestReport ? { id: latestReport.id, createdAt: latestReport.createdAt } : null,
    });
  } catch (err) {
    console.error("[api/stats]", (err as Error).message);
    return Response.json({ error: "تعذر جلب الإحصائيات" }, { status: 500 });
  }
}
