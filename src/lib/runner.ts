// Background experiment runner: VLM classification of the fixed test set
// under zero/few/many-shot in-context example settings.
import path from "path";
import { db } from "@/lib/db";
import { classifyImage } from "@/lib/vlm";
import { computeMetrics, type MetricsInputRow, type MetricsResult } from "@/lib/metrics";
import { COMBOS, MODE_CONFIG, comboOf, type ExperimentMode } from "@/lib/ppe";
import { DATA_DIR } from "@/lib/serverPaths";

const running = new Set<string>();
// VLM API rate-limits hard with concurrent/multi-image requests — sequential + paced is far more reliable
const CLASSIFY_CONCURRENCY = 1;
const INTER_CALL_PACE_MS = 2_500;

export function isRunning(experimentId: string): boolean {
  return running.has(experimentId);
}

/** Build the in-context example set for a mode (deterministic). */
export async function selectContextExamples(
  mode: ExperimentMode
): Promise<{ filePath: string; helmet: boolean; vest: boolean; imageId: string }[]> {
  if (mode === "zero_shot") return [];
  const k = MODE_CONFIG[mode].examplesPerClass;
  const trainImages = await db.datasetImage.findMany({
    where: { split: "train", hasHelmet: { not: null }, hasVest: { not: null } },
    orderBy: { id: "asc" },
  });
  const examples: { filePath: string; helmet: boolean; vest: boolean; imageId: string }[] = [];
  for (const c of COMBOS) {
    const group = trainImages.filter((i) => comboOf(i.hasHelmet!, i.hasVest!) === c);
    for (const img of group.slice(0, k)) {
      examples.push({
        filePath: path.join(DATA_DIR, img.filename),
        helmet: img.hasHelmet!,
        vest: img.hasVest!,
        imageId: img.id,
      });
    }
  }
  return examples;
}

/** Fire-and-forget run of one experiment. */
export function startExperimentRun(experimentId: string): void {
  if (running.has(experimentId)) return;
  running.add(experimentId);
  void processExperiment(experimentId).finally(() => running.delete(experimentId));
}

async function processExperiment(experimentId: string): Promise<void> {
  try {
    const exp = await db.experiment.findUnique({ where: { id: experimentId } });
    if (!exp || exp.status === "done") return;
    const mode = exp.mode as ExperimentMode;
    if (!(mode in MODE_CONFIG)) throw new Error(`وضع غير معروف: ${exp.mode}`);

    await db.experiment.update({
      where: { id: experimentId },
      data: { status: "running", startedAt: new Date(), progress: 0, error: null, finishedAt: null },
    });

    // Fixed test set — identical across modes for fair comparison
    const testImages = await db.datasetImage.findMany({
      where: { split: "test", hasHelmet: { not: null }, hasVest: { not: null } },
      orderBy: { id: "asc" },
    });
    if (!testImages.length) throw new Error("لا توجد صور اختبار موسومة — وسّم بيانات الاختبار أولاً");

    const examples = await selectContextExamples(mode);

    await db.prediction.deleteMany({ where: { experimentId } });
    await db.experiment.update({
      where: { id: experimentId },
      data: {
        total: testImages.length,
        contextImageIds: JSON.stringify(examples.map((e) => e.imageId)),
        testImageIds: JSON.stringify(testImages.map((i) => i.id)),
      },
    });

    let completed = 0;
    let skipped = 0;
    const rows: MetricsInputRow[] = [];
    const queue = [...testImages];

    const workers = Array.from({ length: Math.min(CLASSIFY_CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const img = queue.shift()!;
        const result = await classifyImage(
          path.join(DATA_DIR, img.filename),
          examples.map(({ filePath, helmet, vest }) => ({ filePath, helmet, vest })),
          mode
        );
        await new Promise((r) => setTimeout(r, INTER_CALL_PACE_MS));
        completed++;
        if (!result) {
          skipped++;
          continue;
        }
        const helmetCorrect = result.helmet === img.hasHelmet;
        const vestCorrect = result.vest === img.hasVest;
        try {
          await db.prediction.create({
            data: {
              experimentId,
              imageId: img.id,
              predHelmet: result.helmet,
              predVest: result.vest,
              helmetCorrect,
              vestCorrect,
              correct: helmetCorrect && vestCorrect,
              reasoning: result.reasoning,
              latencyMs: result.latencyMs,
            },
          });
          await db.experiment.update({
            where: { id: experimentId },
            data: { progress: Math.min(completed, testImages.length), currentImageId: img.id },
          });
        } catch (dbErr) {
          console.error("[runner] per-image DB write failed (continuing):", (dbErr as Error).message);
        }
        rows.push({
          gtHelmet: img.hasHelmet!,
          gtVest: img.hasVest!,
          predHelmet: result.helmet,
          predVest: result.vest,
          latencyMs: result.latencyMs,
        });
      }
    });
    await Promise.all(workers);

    const metrics: MetricsResult = computeMetrics(rows);
    const tooManySkipped = skipped > testImages.length * 0.2;
    await db.experiment.update({
      where: { id: experimentId },
      data: {
        status: tooManySkipped ? "error" : "done",
        error: tooManySkipped
          ? `فشل تصنيف ${skipped} من ${testImages.length} صورة (مشكلة اتصال بالنموذج)`
          : skipped > 0
            ? `تنبيه: تم تخطي ${skipped} صورة بسبب فشل الاستدعاء — المقاييس محسوبة على ${rows.length} صورة`
            : null,
        metricsJson: JSON.stringify(metrics),
        finishedAt: new Date(),
        progress: testImages.length,
      },
    });
    console.log(`[runner] experiment ${experimentId} (${mode}) done — exactMatch=${metrics.exactMatch.toFixed(3)} skipped=${skipped}`);
  } catch (err) {
    console.error("[runner] experiment failed:", experimentId, (err as Error).message);
    await db.experiment
      .update({
        where: { id: experimentId },
        data: { status: "error", error: (err as Error).message.slice(0, 500), finishedAt: new Date() },
      })
      .catch(() => {});
  }
}

/** Mark experiments that claim to be running/pending but no live worker exists (server restart etc.). */
export async function markStaleExperiments(): Promise<void> {
  const active = await db.experiment.findMany({
    where: { status: { in: ["running", "pending"] } },
  });
  const now = Date.now();
  for (const e of active) {
    if (running.has(e.id)) continue;
    const started = e.startedAt ? new Date(e.startedAt).getTime() : new Date(e.createdAt).getTime();
    const staleMinutes = e.status === "running" ? 12 : 15;
    if (now - started > staleMinutes * 60_000) {
      await db.experiment
        .update({
          where: { id: e.id },
          data: {
            status: "error",
            error: "توقف غير متوقع (إعادة تشغيل الخادم؟) — أعد تشغيل التجربة",
            finishedAt: new Date(),
          },
        })
        .catch(() => {});
    }
  }
}
