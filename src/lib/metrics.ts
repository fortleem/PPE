// Metrics computation for PPE experiments (4 classes one-vs-rest + attributes)
import { COMBOS, PPE_CLASSES, type Combo, type PpeClass } from "./ppe";

export interface MetricsInputRow {
  gtHelmet: boolean;
  gtVest: boolean;
  predHelmet: boolean;
  predVest: boolean;
  latencyMs?: number | null;
}

export interface ClassMetrics {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1: number;
  support: number; // ground-truth positives for this class
}

export interface AttributeConfusion {
  // rows: ground truth [true, false]; cols: predicted [true, false]
  tt: number;
  tf: number;
  ft: number;
  ff: number;
}

export interface MetricsResult {
  n: number;
  exactMatch: number; // both attributes correct
  helmetAccuracy: number;
  vestAccuracy: number;
  macroF1: number;
  classes: Record<PpeClass, ClassMetrics>;
  helmetConfusion: AttributeConfusion;
  vestConfusion: AttributeConfusion;
  comboOrder: Combo[];
  comboConfusion: number[][]; // 4x4, rows = GT combo, cols = predicted combo
  latency: { avg: number; p50: number; p95: number };
}

function safeDiv(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

function prf(tp: number, fp: number, fn: number, support: number): ClassMetrics {
  const precision = safeDiv(tp, tp + fp);
  const recall = safeDiv(tp, tp + fn);
  const f1 = safeDiv(2 * precision * recall, precision + recall);
  return { tp, fp, fn, tn: 0, precision, recall, f1, support };
}

export function computeMetrics(rows: MetricsInputRow[]): MetricsResult {
  const n = rows.length;

  // One-vs-rest class metrics
  const classes = {} as Record<PpeClass, ClassMetrics>;
  for (const cls of PPE_CLASSES) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;
    for (const r of rows) {
      const isHelmetAttr = cls === "helmet" || cls === "no_helmet";
      const gt = isHelmetAttr ? r.gtHelmet : r.gtVest;
      const pred = isHelmetAttr ? r.predHelmet : r.predVest;
      const positive = cls === "helmet" || cls === "safety_vest" ? gt : !gt;
      const predPositive = cls === "helmet" || cls === "safety_vest" ? pred : !pred;
      if (positive && predPositive) tp++;
      else if (!positive && predPositive) fp++;
      else if (positive && !predPositive) fn++;
      else tn++;
    }
    const m = prf(tp, fp, fn, tp + fn);
    m.tn = tn;
    classes[cls] = m;
  }
  const macroF1 = safeDiv(
    PPE_CLASSES.reduce((s, c) => s + classes[c].f1, 0),
    PPE_CLASSES.length
  );

  // Attribute accuracy + confusion
  let helmetCorrect = 0;
  let vestCorrect = 0;
  let exactMatch = 0;
  const helmetConfusion: AttributeConfusion = { tt: 0, tf: 0, ft: 0, ff: 0 };
  const vestConfusion: AttributeConfusion = { tt: 0, tf: 0, ft: 0, ff: 0 };
  for (const r of rows) {
    if (r.gtHelmet === r.predHelmet) helmetCorrect++;
    if (r.gtVest === r.predVest) vestCorrect++;
    if (r.gtHelmet === r.predHelmet && r.gtVest === r.predVest) exactMatch++;
    helmetConfusion[r.gtHelmet ? (r.predHelmet ? "tt" : "tf") : r.predHelmet ? "ft" : "ff"]++;
    vestConfusion[r.gtVest ? (r.predVest ? "tt" : "tf") : r.predVest ? "ft" : "ff"]++;
  }

  // 4x4 combo confusion
  const comboConfusion: number[][] = COMBOS.map(() => COMBOS.map(() => 0));
  for (const r of rows) {
    const gtCombo = COMBOS.indexOf((r.gtHelmet ? "T" : "F") + (r.gtVest ? "T" : "F") as Combo);
    const predCombo = COMBOS.indexOf((r.predHelmet ? "T" : "F") + (r.predVest ? "T" : "F") as Combo);
    comboConfusion[gtCombo][predCombo]++;
  }

  // Latency stats
  const lats = rows.map((r) => r.latencyMs ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
  const pick = (p: number) => (lats.length ? lats[Math.min(lats.length - 1, Math.floor(p * lats.length))] : 0);
  const latency = {
    avg: lats.length ? Math.round(lats.reduce((s, v) => s + v, 0) / lats.length) : 0,
    p50: pick(0.5),
    p95: pick(0.95),
  };

  return {
    n,
    exactMatch: safeDiv(exactMatch, n),
    helmetAccuracy: safeDiv(helmetCorrect, n),
    vestAccuracy: safeDiv(vestCorrect, n),
    macroF1,
    classes,
    helmetConfusion,
    vestConfusion,
    comboOrder: [...COMBOS],
    comboConfusion,
    latency,
  };
}
