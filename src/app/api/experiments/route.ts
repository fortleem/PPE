import { db } from "@/lib/db";
import { EXPERIMENT_MODES, MODE_CONFIG, type ExperimentMode } from "@/lib/ppe";
import { isRunning, markStaleExperiments, startExperimentRun } from "@/lib/runner";

export const dynamic = "force-dynamic";

function serializeExperiment(e: {
  id: string;
  name: string;
  mode: string;
  examplesPerClass: number;
  status: string;
  progress: number;
  total: number;
  error: string | null;
  metricsJson: string | null;
  errorSummary: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}) {
  let metrics: {
    n: number;
    exactMatch: number;
    helmetAccuracy: number;
    vestAccuracy: number;
    macroF1: number;
    latency?: { avg: number; p50: number; p95: number };
  } | null = null;
  if (e.metricsJson) {
    try {
      metrics = JSON.parse(e.metricsJson);
    } catch {
      /* ignore */
    }
  }
  return {
    id: e.id,
    name: e.name,
    mode: e.mode,
    examplesPerClass: e.examplesPerClass,
    contextImages: MODE_CONFIG[e.mode as ExperimentMode]?.contextImages ?? 0,
    status: e.status,
    progress: e.progress,
    total: e.total,
    error: e.error,
    live: isRunning(e.id),
    metrics,
    hasErrorAnalysis: Boolean(e.errorSummary),
    startedAt: e.startedAt,
    finishedAt: e.finishedAt,
    createdAt: e.createdAt,
  };
}

/** GET /api/experiments — list all runs (newest first) */
export async function GET() {
  try {
    await markStaleExperiments();
    const experiments = await db.experiment.findMany({ orderBy: { createdAt: "desc" } });
    return Response.json({
      experiments: experiments.map(serializeExperiment),
      modes: EXPERIMENT_MODES.map((m) => ({
        key: m,
        ...MODE_CONFIG[m],
      })),
    });
  } catch (err) {
    console.error("[api/experiments GET]", (err as Error).message);
    return Response.json({ error: "تعذر جلب التجارب" }, { status: 500 });
  }
}

/** POST /api/experiments — create + start runs for the given modes */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { modes?: string[] };
    const requested = (body.modes ?? [...EXPERIMENT_MODES]).filter((m): m is ExperimentMode =>
      (EXPERIMENT_MODES as readonly string[]).includes(m)
    );
    if (!requested.length) {
      return Response.json({ error: "حدد أوضاعاً صالحة: zero_shot / few_shot / many_shot" }, { status: 400 });
    }

    const active = await db.experiment.findMany({
      where: { status: { in: ["running", "pending"] } },
    });

    const created: string[] = [];
    const skipped: { mode: string; reason: string }[] = [];
    for (const mode of requested) {
      const alreadyActive = active.find((e) => e.mode === mode);
      if (alreadyActive) {
        skipped.push({ mode, reason: "تجربة نفس الوضع قيد التشغيل بالفعل" });
        if (isRunning(alreadyActive.id)) continue;
        // stale row (not actually running) — restart it
        startExperimentRun(alreadyActive.id);
        continue;
      }
      const exp = await db.experiment.create({
        data: {
          name: `${MODE_CONFIG[mode].name} — ${new Date().toLocaleString("ar-EG")}`,
          mode,
          examplesPerClass: MODE_CONFIG[mode].examplesPerClass,
          status: "pending",
          total: 0,
          progress: 0,
        },
      });
      created.push(exp.id);
      startExperimentRun(exp.id);
    }

    const experiments = await db.experiment.findMany({ orderBy: { createdAt: "desc" } });
    return Response.json(
      { created, skipped, experiments: experiments.map(serializeExperiment) },
      { status: 201 }
    );
  } catch (err) {
    console.error("[api/experiments POST]", (err as Error).message);
    return Response.json({ error: "تعذر بدء التجارب" }, { status: 500 });
  }
}
