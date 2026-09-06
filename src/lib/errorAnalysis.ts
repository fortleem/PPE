// Error analysis: categorize every misclassified attribute into a fixed
// taxonomy via LLM, then aggregate causes + Arabic summary.
import { db } from "@/lib/db";
import { chatLLMJson } from "@/lib/vlm";
import { ERROR_CATEGORIES, ERROR_CATEGORY_LABELS, type ErrorCategory } from "@/lib/ppe";

export interface ErrorSummary {
  totalErrors: number;
  errorRate: number; // errors / predictions evaluated
  categories: { key: ErrorCategory; label: string; count: number }[];
  summaryAr: string;
  explanations: { predictionId: string; attribute: "helmet" | "vest"; category: string; explanation: string }[];
}

interface ErrorRecord {
  predictionId: string;
  attribute: "helmet" | "vest";
  gt: boolean;
  pred: boolean;
  reasoning: string;
  theme: string | null;
  gtNotes: string | null;
}

export async function runErrorAnalysis(experimentId: string): Promise<ErrorSummary | null> {
  const exp = await db.experiment.findUnique({
    where: { id: experimentId },
    include: { predictions: { include: { image: true } } },
  });
  if (!exp) return null;
  if (exp.status !== "done") throw new Error("التجربة لم تكتمل بعد");

  // 1. collect attribute-level errors
  const records: ErrorRecord[] = [];
  for (const p of exp.predictions) {
    if (!p.helmetCorrect) {
      records.push({
        predictionId: p.id,
        attribute: "helmet",
        gt: p.image.hasHelmet!,
        pred: p.predHelmet,
        reasoning: p.reasoning ?? "",
        theme: p.image.theme,
        gtNotes: p.image.gtNotes,
      });
    }
    if (!p.vestCorrect) {
      records.push({
        predictionId: p.id,
        attribute: "vest",
        gt: p.image.hasVest!,
        pred: p.predVest,
        reasoning: p.reasoning ?? "",
        theme: p.image.theme,
        gtNotes: p.image.gtNotes,
      });
    }
  }

  if (records.length === 0) {
    const summary: ErrorSummary = {
      totalErrors: 0,
      errorRate: 0,
      categories: [],
      summaryAr: "لا توجد أخطاء في هذه التجربة — كل التنبؤات صحيحة.",
      explanations: [],
    };
    await db.experiment.update({ where: { id: experimentId }, data: { errorSummary: JSON.stringify(summary) } });
    return summary;
  }

  // 2. LLM categorization (text-only: reasoning + labels carry the visual context)
  const taxonomy = ERROR_CATEGORIES.map((k) => `${k}: ${ERROR_CATEGORY_LABELS[k].ar}`).join("\n");
  const system = `You are an expert computer-vision error analyst for a PPE (helmet / safety-vest) classification system.
For each misclassification you receive: the attribute (helmet or vest), the ground-truth value, the predicted value,
the model's own reasoning sentence, the dataset theme the image was collected with, and annotation notes.

Categorize each error into EXACTLY ONE category from this taxonomy:
${taxonomy}

Respond with JSON only:
{"items":[{"predictionId":"...","attribute":"helmet|vest","category":"<taxonomy key>","explanation":"جملة عربية واحدة تشرح سبب الخطأ في هذه الحالة"}],"summaryAr":"فقرة عربية من 2 إلى 4 جمل تلخص الأنماط الرئيسية للأخطاء وتوصيات مختصرة"}`;

  const userPayload = JSON.stringify(
    records.map((r) => ({
      predictionId: r.predictionId,
      attribute: r.attribute,
      groundTruth: r.gt,
      predicted: r.pred,
      modelReasoning: r.reasoning,
      collectedViaTheme: r.theme,
      annotationNotes: r.gtNotes,
    })),
    null,
    1
  );

  const parsed = await chatLLMJson<{
    items: { predictionId: string; attribute: string; category: string; explanation: string }[];
    summaryAr: string;
  }>(system, `Misclassification list:\n${userPayload}\n\nCategorize every item and write the Arabic summary.`);

  const validCats = new Set<string>(ERROR_CATEGORIES);
  const items = (parsed?.items ?? []).filter(
    (it) => it && typeof it.predictionId === "string" && validCats.has(String(it.category))
  );

  // 3. persist categories on predictions
  const byKey = new Map<string, (typeof items)[number]>();
  for (const it of items) byKey.set(`${it.predictionId}:${it.attribute}`, it);
  for (const r of records) {
    const it = byKey.get(`${r.predictionId}:${r.attribute}`);
    const cat = it?.category ?? "other";
    if (r.attribute === "helmet") {
      await db.prediction.update({ where: { id: r.predictionId }, data: { helmetErrorCat: cat } });
    } else {
      await db.prediction.update({ where: { id: r.predictionId }, data: { vestErrorCat: cat } });
    }
  }

  // 4. aggregate
  const counts = new Map<string, number>();
  for (const r of records) {
    const it = byKey.get(`${r.predictionId}:${r.attribute}`);
    const cat = it?.category ?? "other";
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  const total = exp.predictions.length;
  const categories = ERROR_CATEGORIES.map((key) => ({
    key,
    label: ERROR_CATEGORY_LABELS[key].ar,
    count: counts.get(key) ?? 0,
  }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const summary: ErrorSummary = {
    totalErrors: records.length,
    errorRate: total > 0 ? records.length / (total * 2) : 0, // per-attribute error rate
    categories,
    summaryAr:
      parsed?.summaryAr ??
      "تعذّر توليد ملخص تلقائي للأخطاء — راجع التفسيرات الفردية بالأسفل.",
    explanations: items.map((it) => ({
      predictionId: it.predictionId,
      attribute: it.attribute as "helmet" | "vest",
      category: String(it.category),
      explanation: String(it.explanation ?? ""),
    })),
  };

  await db.experiment.update({ where: { id: experimentId }, data: { errorSummary: JSON.stringify(summary) } });
  return summary;
}
