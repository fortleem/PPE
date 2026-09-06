// Client-safe API types + fetch helpers for the PPE frontend.
// Mirrors the verified backend contract in worklog.md ("=== API CONTRACT ===").
import type { Combo, ExperimentMode, PpeClass } from "@/lib/ppe";

/* ---------------- types ---------------- */

export interface StatsBest {
  mode: string;
  exactMatch: number; // 0..1
  macroF1: number; // 0..1
}

export interface StatsResponse {
  totalImages: number;
  labeled: number;
  byCombo: { key: Combo; label: string; count: number }[];
  byClass: Record<PpeClass, number>;
  classLabels: string[];
  splits: { train: number; test: number; none: number };
  conflicts: number;
  sources: { web: number; upload: number };
  experiments: {
    count: number;
    done: number;
    running: boolean;
    best: StatsBest | null;
  };
  report: { id: string; createdAt: string } | null;
}

export type GtConfidence = "high" | "medium" | "low" | "human";
export type Split = "train" | "test" | "none";

export interface DatasetItem {
  id: string;
  url: string;
  hasHelmet: boolean | null;
  hasVest: boolean | null;
  combo: Combo | null;
  split: Split;
  theme: string | null;
  source: string;
  sourceQuery: string | null;
  gtConfidence: GtConfidence | null;
  gtNotes: string | null;
  gtFlags: string[];
  width: number | null;
  height: number | null;
  size: number | null;
  createdAt: string;
}

export interface DatasetResponse {
  items: DatasetItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UploadResponse {
  created: {
    id: string;
    url: string;
    hasHelmet: boolean | null;
    hasVest: boolean | null;
    note: string;
  }[];
  count: number;
}

export interface ExperimentMetricsSummary {
  n: number;
  exactMatch: number; // 0..1
  helmetAccuracy: number;
  vestAccuracy: number;
  macroF1: number;
  latency?: { avg: number; p50: number; p95: number };
}

export type ExperimentStatus = "pending" | "running" | "done" | "error";

export interface ExperimentListItem {
  id: string;
  name: string;
  mode: ExperimentMode;
  examplesPerClass: number;
  contextImages: number;
  status: ExperimentStatus;
  progress: number;
  total: number;
  error: string | null;
  live: boolean;
  metrics: ExperimentMetricsSummary | null;
  hasErrorAnalysis: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface ModeInfo {
  key: ExperimentMode;
  name: string;
  examplesPerClass: number;
  contextImages: number;
  descAr: string;
}

export interface ExperimentsResponse {
  experiments: ExperimentListItem[];
  modes: ModeInfo[];
}

export interface ClassMetrics {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number; // 0..1
  recall: number;
  f1: number;
  support: number;
}

export interface PredictionItem {
  id: string;
  imageId: string;
  url: string;
  gtHelmet: boolean | null;
  gtVest: boolean | null;
  gtCombo: Combo | null;
  predHelmet: boolean;
  predVest: boolean;
  predCombo: Combo;
  helmetCorrect: boolean;
  vestCorrect: boolean;
  correct: boolean;
  reasoning: string | null;
  latencyMs: number | null;
  helmetErrorCat: string | null;
  vestErrorCat: string | null;
  theme: string | null;
  gtNotes: string | null;
}

export interface ErrorSummary {
  totalErrors: number;
  errorRate: number; // 0..1
  categories: { key: string; label: string; count: number }[];
  summaryAr: string;
  explanations: {
    predictionId: string;
    attribute: string; // "helmet" | "vest"
    category: string;
    explanation: string;
  }[];
}

export interface ExperimentDetail {
  id: string;
  name: string;
  mode: ExperimentMode;
  examplesPerClass: number;
  status: ExperimentStatus;
  progress: number;
  total: number;
  error: string | null;
  live: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  metrics:
    | (ExperimentMetricsSummary & {
        classes: Record<PpeClass, ClassMetrics>;
        helmetConfusion: { tt: number; tf: number; ft: number; ff: number };
        vestConfusion: { tt: number; tf: number; ft: number; ff: number };
        comboOrder: Combo[];
        comboConfusion: number[][];
      })
    | null;
  errorSummary: ErrorSummary | null;
  comboLabels: { key: Combo; label: string }[];
  contextImageIds: string[];
  contextThumbnails: string[];
  testImageIds: string[];
  predictions: PredictionItem[];
}

export interface ReportResponse {
  report: { id: string; content: string; createdAt: string } | null;
}

export interface ClassifyResponse {
  imageId: string;
  url: string;
  mode: ExperimentMode;
  modeName: string;
  contextImages: number;
  prediction: { helmet: boolean; vest: boolean };
  groundTruth: { helmet: boolean | null; vest: boolean | null };
  helmetCorrect: boolean | null;
  vestCorrect: boolean | null;
  correct: boolean | null;
  reasoning: string | null;
  latencyMs: number | null;
}

/* ---------------- fetch helpers ---------------- */

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : null) ?? `فشل الطلب (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  return parse<T>(res);
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

export async function apiUpload<T>(path: string, files: File[]): Promise<T> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  const res = await fetch(path, { method: "POST", body: form });
  return parse<T>(res);
}

/* ---------------- formatting helpers ---------------- */

/** 0..1 fraction → "87.5%" */
export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtMs(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (v < 1000) return `${Math.round(v)} م.ث`;
  return `${(v / 1000).toFixed(1)} ث`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
