// Technical report generation: gathers all system results and produces an
// Arabic markdown report (LLM-generated with a deterministic fallback).
import { db } from "@/lib/db";
import { chatLLM } from "@/lib/vlm";
import {
  CLASS_LABELS,
  COMBO_LABELS,
  ERROR_CATEGORY_LABELS,
  MODE_CONFIG,
  PPE_CLASSES,
  EXPERIMENT_MODES,
  type ExperimentMode,
  type PpeClass,
} from "@/lib/ppe";
import type { MetricsResult } from "@/lib/metrics";

export interface ReportData {
  generatedAt: string;
  dataset: {
    total: number;
    labeled: number;
    splits: { train: number; test: number; none: number };
    combos: { key: string; label: string; count: number }[];
    classes: { key: PpeClass; label: string; count: number }[];
    conflicts: number;
    lowConfidence: number;
    sources: { web: number; upload: number };
  };
  experiments: {
    mode: ExperimentMode;
    name: string;
    examplesPerClass: number;
    contextImages: number;
    status: string;
    metrics: {
      n: number;
      exactMatch: number;
      helmetAccuracy: number;
      vestAccuracy: number;
      macroF1: number;
      perClass: { key: PpeClass; label: string; precision: number; recall: number; f1: number; support: number }[];
      latency: { avg: number; p50: number; p95: number };
    } | null;
    errorAnalysis: {
      totalErrors: number;
      categories: { key: string; label: string; count: number }[];
      summaryAr: string;
    } | null;
  }[];
}

export async function gatherReportData(): Promise<ReportData> {
  const images = await db.datasetImage.findMany();
  const labeledImages = images.filter((i) => i.hasHelmet !== null && i.hasVest !== null);
  const combosMap = new Map<string, number>();
  for (const i of labeledImages) {
    const key = (i.hasHelmet! ? "T" : "F") + (i.hasVest! ? "T" : "F");
    combosMap.set(key, (combosMap.get(key) ?? 0) + 1);
  }
  const helmetTrue = labeledImages.filter((i) => i.hasHelmet!).length;
  const vestTrue = labeledImages.filter((i) => i.hasVest!).length;

  const experiments = await db.experiment.findMany({ orderBy: { createdAt: "asc" } });
  const expOut: ReportData["experiments"] = [];
  for (const mode of EXPERIMENT_MODES) {
    // latest experiment per mode
    const list = experiments.filter((e) => e.mode === mode);
    const exp = list[list.length - 1];
    if (!exp) continue;
    const metrics = exp.metricsJson ? (JSON.parse(exp.metricsJson) as MetricsResult) : null;
    const errSummary = exp.errorSummary ? JSON.parse(exp.errorSummary) : null;
    expOut.push({
      mode,
      name: MODE_CONFIG[mode].name,
      examplesPerClass: MODE_CONFIG[mode].examplesPerClass,
      contextImages: MODE_CONFIG[mode].contextImages,
      status: exp.status,
      metrics: metrics
        ? {
            n: metrics.n,
            exactMatch: metrics.exactMatch,
            helmetAccuracy: metrics.helmetAccuracy,
            vestAccuracy: metrics.vestAccuracy,
            macroF1: metrics.macroF1,
            perClass: PPE_CLASSES.map((c) => ({
              key: c,
              label: `${CLASS_LABELS[c].ar} (${CLASS_LABELS[c].en})`,
              precision: metrics.classes[c].precision,
              recall: metrics.classes[c].recall,
              f1: metrics.classes[c].f1,
              support: metrics.classes[c].support,
            })),
            latency: metrics.latency,
          }
        : null,
      errorAnalysis: errSummary
        ? {
            totalErrors: errSummary.totalErrors,
            categories: (errSummary.categories ?? []).map(
              (c: { key: string; label: string; count: number }) => ({
                key: c.key,
                label: c.label,
                count: c.count,
              })
            ),
            summaryAr: errSummary.summaryAr ?? "",
          }
        : null,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    dataset: {
      total: images.length,
      labeled: labeledImages.length,
      splits: {
        train: images.filter((i) => i.split === "train").length,
        test: images.filter((i) => i.split === "test").length,
        none: images.filter((i) => i.split === "none").length,
      },
      combos: [...combosMap.entries()].map(([key, count]) => ({
        key,
        label: key === "TT" || key === "TF" || key === "FT" || key === "FF" ? COMBO_LABELS[key] : key,
        count,
      })),
      classes: [
        { key: "helmet", label: "Helmet", count: helmetTrue },
        { key: "no_helmet", label: "No Helmet", count: labeledImages.length - helmetTrue },
        { key: "safety_vest", label: "Safety Vest", count: vestTrue },
        { key: "no_vest", label: "No Vest", count: labeledImages.length - vestTrue },
      ],
      conflicts: images.filter((i) => i.gtFlags).length,
      lowConfidence: labeledImages.filter((i) => i.gtConfidence === "low").length,
      sources: {
        web: images.filter((i) => i.source === "web").length,
        upload: images.filter((i) => i.source !== "web").length,
      },
    },
    experiments: expOut,
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** Deterministic fallback report (used if the LLM call fails). */
export function buildFallbackReport(data: ReportData): string {
  const d = data.dataset;
  const lines: string[] = [];
  lines.push(`# التقرير التقني — نظام كشف معدات السلامة (PPE Detection)`);
  lines.push("");
  lines.push(`**تاريخ التوليد:** ${new Date(data.generatedAt).toLocaleString("ar-EG")}`);
  lines.push("");
  lines.push("## 1) الملخص التنفيذي");
  lines.push("");
  lines.push(
    `نظام لكشف التزام معدات السلامة الشخصية عبر 4 كلاسات: Helmet / No Helmet / Safety Vest / No Vest، مبني على نموذج رؤية-لغوي (VLM) مع تعلّم داخل السياق (in-context learning)، ومدعوم بداتاسيت من ${d.total} صورة حقيقية (${d.labeled} موسومة).`
  );
  lines.push("");
  lines.push("## 2) الداتاسيت");
  lines.push("");
  lines.push(`| البند | القيمة |`);
  lines.push(`|---|---|`);
  lines.push(`| إجمالي الصور | ${d.total} |`);
  lines.push(`| صور موسومة | ${d.labeled} |`);
  lines.push(`| تدريب / اختبار | ${d.splits.train} / ${d.splits.test} |`);
  lines.push(`| صور بتعارض مع نية الجمع | ${d.conflicts} |`);
  lines.push(`| توسيم بثقة منخفضة | ${d.lowConfidence} |`);
  lines.push("");
  lines.push("توزيع حالات الالتزام:");
  lines.push("");
  for (const c of d.combos) lines.push(`- ${c.label}: ${c.count}`);
  lines.push("");
  lines.push("## 3) النتائج");
  for (const e of data.experiments) {
    lines.push("");
    lines.push(`### ${e.name} (${e.contextImages} صورة سياق)`);
    if (!e.metrics) {
      lines.push("");
      lines.push(`الحالة: ${e.status}`);
      continue;
    }
    lines.push("");
    lines.push(`| الكلاس | Precision | Recall | F1 | Support |`);
    lines.push(`|---|---|---|---|---|`);
    for (const c of e.metrics.perClass) {
      lines.push(`| ${c.label} | ${pct(c.precision)} | ${pct(c.recall)} | ${pct(c.f1)} | ${c.support} |`);
    }
    lines.push("");
    lines.push(
      `- الدقة الكلية (مطابقة تامة للسمتين): **${pct(e.metrics.exactMatch)}** — دقة الخوذة: ${pct(
        e.metrics.helmetAccuracy
      )} — دقة السديري: ${pct(e.metrics.vestAccuracy)} — Macro-F1: ${e.metrics.macroF1.toFixed(3)}`
    );
    lines.push(`- زمن الاستجابة: متوسط ${e.metrics.latency.avg}ms — وسيط ${e.metrics.latency.p50}ms`);
  }
  lines.push("");
  lines.push("## 4) تحليل الأخطاء");
  for (const e of data.experiments) {
    if (!e.errorAnalysis) continue;
    lines.push("");
    lines.push(`### ${e.name}`);
    lines.push(`- إجمالي أخطاء السمات: ${e.errorAnalysis.totalErrors}`);
    for (const c of e.errorAnalysis.categories) {
      lines.push(`- ${c.label}: ${c.count}`);
    }
    if (e.errorAnalysis.summaryAr) lines.push("", e.errorAnalysis.summaryAr);
  }
  lines.push("");
  lines.push("## 5) الاستنتاجات والتوصيات");
  lines.push("");
  lines.push(
    "- مقارنة أداء النموذج بين عدد صور مرجعية قليل (8) وكبير (24) تظهر في جداول القسم 3."
  );
  lines.push("- يوصى للتشغيل الإنتاجي بتدريب نموذج كشف كائنات مخصص (YOLO/DETR) على بيانات موسومة بالصناديق.");
  lines.push("- يوصى بتوسيع الداتاسيت لتغطية ظروف إضاءة وزوايا أكثر، وتوسيم بشري كامل بدل التوسيم الآلي.");
  return lines.join("\n");
}

export async function generateReport(): Promise<{ id: string; content: string; fallback: boolean }> {
  const data = await gatherReportData();

  const system = `أنت مهندس رؤية حاسوبية خبير. اكتب تقريراً تقنياً كاملاً ومحترفاً باللغة العربية (مع إبقاء المصطلحات التقنية والمقاييس بالإنجليزية) بصيغة Markdown عن نظام كشف معدات السلامة الشخصية (PPE) الذي يفرّق بين 4 كلاسات: Helmet / No Helmet / Safety Vest / No Vest.

استخدم البيانات المرفقة كما هي بدقة (لا تختلق أرقاماً). التزم بهذا الهيكل:
1. الملخص التنفيذي (فقرة موجزة بالنتائج الرئيسية)
2. المقدمة والأهداف
3. الداتاسيت: المصدر ومنهجية الجمع والتوسيم (توسيم آلي عبر VLM مع تعارضات موسومة + إمكانية تصحيح بشري)، التوزيع (جدول)
4. منهجية النموذج: نموذج VLM مع تعلم داخل السياق — "التدريب" هنا = أمثلة موسومة داخل الـ prompt؛ الأوضاع: zero-shot (بدون أمثلة)، few-shot (8 صور)، many-shot (24 صورة)؛ نفس مجموعة اختبار ثابتة للجميع
5. النتائج: جدول لكل وضع يحوي Precision/Recall/F1 لكل كلاس + الدقة الكلية وMacro-F1 وزمن الاستجابة، ثم جدول/نقاط مقارنة مباشرة بين الأوضاع (أثر عدد الصور)
6. تحليل الأخطاء وأسبابها: استخدم تصنيفات الأخطاء والملخص المرفق، واذكر أمثلة الأسباب
7. الاستنتاجات والتوصيات: بما فيها حدود النهج الحالي (VLM + in-context learning، توسيم آلي) والتوصية بتدريب كاشف كائنات مخصص للإنتاج (YOLO مثلاً) وتوسيع البيانات

اجعل التقرير من 600 إلى 1000 كلمة. استخدم جداول Markdown. لا تضف أي عنوان '# التقرير' مكرر — ابدأ بعنوان واحد رئيسي.`;

  const user = `بيانات النظام (JSON):
${JSON.stringify(data, null, 1)}

اكتب التقرير التقني الآن.`;

  const llmContent = await chatLLM(system, user);
  const content = llmContent?.trim() && llmContent.trim().length > 400 ? llmContent.trim() : buildFallbackReport(data);
  const fallback = !llmContent || llmContent.trim().length <= 400;

  const row = await db.report.create({ data: { content } });
  return { id: row.id, content, fallback };
}
