// Shared PPE domain constants & helpers (client-safe: NO node-only imports)
export const PPE_CLASSES = ["helmet", "no_helmet", "safety_vest", "no_vest"] as const;
export type PpeClass = (typeof PPE_CLASSES)[number];

export const CLASS_LABELS: Record<PpeClass, { ar: string; en: string }> = {
  helmet: { ar: "خوذة أمان", en: "Helmet" },
  no_helmet: { ar: "بدون خوذة", en: "No Helmet" },
  safety_vest: { ar: "سديري أمان", en: "Safety Vest" },
  no_vest: { ar: "بدون سديري", en: "No Vest" },
};

export const EXPERIMENT_MODES = ["zero_shot", "few_shot", "many_shot"] as const;
export type ExperimentMode = (typeof EXPERIMENT_MODES)[number];

export const MODE_CONFIG: Record<
  ExperimentMode,
  { name: string; examplesPerClass: number; contextImages: number; descAr: string }
> = {
  zero_shot: {
    name: "بدون بيانات (Zero-shot)",
    examplesPerClass: 0,
    contextImages: 0,
    descAr: "النموذج يعتمد على وصف النص فقط بدون أي أمثلة مرئية مساعدة",
  },
  few_shot: {
    name: "صور قليلة (Few-shot)",
    examplesPerClass: 2,
    contextImages: 8,
    descAr: "8 صور مرجعية موسومة (مثالان لكل حالة من حالات الالتزام الأربع)",
  },
  many_shot: {
    name: "صور كثيرة (Many-shot)",
    examplesPerClass: 6,
    contextImages: 24,
    descAr: "24 صورة مرجعية موسومة (6 أمثلة لكل حالة من حالات الالتزام الأربع)",
  },
};

// Compliance combos: helmet x vest
export const COMBOS = ["TT", "TF", "FT", "FF"] as const;
export type Combo = (typeof COMBOS)[number];

export const COMBO_LABELS: Record<Combo, string> = {
  TT: "خوذة + سديري",
  TF: "خوذة فقط",
  FT: "سديري فقط",
  FF: "بدون معدات",
};

export function comboOf(helmet: boolean, vest: boolean): Combo {
  return (helmet ? "T" : "F") + (vest ? "T" : "F") as Combo;
}

export function comboOrNull(helmet?: boolean | null, vest?: boolean | null): Combo | null {
  if (helmet === null || helmet === undefined || vest === null || vest === undefined) return null;
  return comboOf(helmet, vest);
}

// Fixed error taxonomy for error analysis
export const ERROR_CATEGORIES = [
  "multiple_workers",
  "small_subject",
  "occlusion",
  "lookalike",
  "lighting",
  "no_worker",
  "label_noise",
  "ambiguous",
  "other",
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export const ERROR_CATEGORY_LABELS: Record<ErrorCategory, { ar: string; emoji: string }> = {
  multiple_workers: { ar: "عمال متعددون بمعدات مختلفة", emoji: "👷" },
  small_subject: { ar: "الشخص صغير أو بعيد في الصورة", emoji: "🔍" },
  occlusion: { ar: "حجب جزئي للرأس أو الجسم", emoji: "🙈" },
  lookalike: { ar: "تشابه مع معدات مشابهة (كاب/جاكيت عاكس)", emoji: "🎩" },
  lighting: { ar: "إضاءة سيئة أو سطوع زائد", emoji: "💡" },
  no_worker: { ar: "لا يظهر عامل واضح في الصورة", emoji: "❓" },
  label_noise: { ar: "ملصق الحقيقة الأرضية غير دقيق", emoji: "🏷️" },
  ambiguous: { ar: "حالة حدية غامضة بصرياً", emoji: "⚖️" },
  other: { ar: "أخرى", emoji: "•" },
};

// Dataset images live outside public/ and are streamed via /api/media/[id]
// (DATA_DIR itself is defined in src/lib/serverPaths.ts — server-only)

export const THEMES = ["helmet", "no_helmet", "safety_vest", "no_vest"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  helmet: "استعلام: خوذة",
  no_helmet: "استعلام: بدون خوذة",
  safety_vest: "استعلام: سديري",
  no_vest: "استعلام: بدون سديري",
};
