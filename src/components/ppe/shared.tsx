"use client";

import { HardHat, Shirt, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExperimentStatus, GtConfidence, Split } from "@/lib/ppe-client";

/* ---------- KPI card ---------- */

export function KpiCard({
  icon,
  label,
  value,
  sub,
  accent = "amber",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "amber" | "emerald" | "red" | "slate";
}) {
  const accents: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
    slate: "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{value}</p>
            {sub ? <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div> : null}
          </div>
          <div className={`shrink-0 rounded-lg border p-2 ${accents[accent]}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Empty state ---------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center">
      <div className="rounded-full bg-amber-50 border border-amber-200 p-3 text-amber-600">{icon}</div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ---------- Image tile badges ---------- */

export function HelmetVestBadges({
  hasHelmet,
  hasVest,
  size = "sm",
}: {
  hasHelmet: boolean | null;
  hasVest: boolean | null;
  size?: "sm" | "lg";
}) {
  const cls = size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5";
  const box = size === "lg" ? "gap-1.5 px-2.5 py-1.5 text-sm" : "gap-1 px-2 py-1 text-[11px]";
  const items: { label: string; value: boolean | null; icon: React.ReactNode; tone: string }[] = [
    {
      label: "خوذة",
      value: hasHelmet,
      icon: hasHelmet ? <HardHat className={cls} /> : <X className={cls} />,
      tone: hasHelmet ? "bg-emerald-500/95 text-white" : "bg-red-500/95 text-white",
    },
    {
      label: "سديري",
      value: hasVest,
      icon: hasVest ? <Shirt className={cls} /> : <X className={cls} />,
      tone: hasVest ? "bg-emerald-500/95 text-white" : "bg-red-500/95 text-white",
    },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) =>
        it.value === null ? (
          <span
            key={it.label}
            className={`inline-flex items-center ${box} rounded-full bg-slate-700/80 font-medium text-white backdrop-blur-sm`}
          >
            {it.label} ؟
          </span>
        ) : (
          <span
            key={it.label}
            className={`inline-flex items-center ${box} rounded-full font-medium backdrop-blur-sm ${it.tone}`}
          >
            {it.icon}
            {it.label}
          </span>
        )
      )}
    </div>
  );
}

const SPLIT_STYLES: Record<Split, { label: string; cls: string }> = {
  train: { label: "تدريب", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  test: { label: "اختبار", cls: "bg-slate-200 text-slate-700 border-slate-300" },
  none: { label: "بدون تقسيم", cls: "bg-muted text-muted-foreground border-border" },
};

export function SplitBadge({ split }: { split: Split }) {
  const s = SPLIT_STYLES[split];
  return (
    <Badge variant="outline" className={`px-2 py-0.5 text-[10px] ${s.cls}`}>
      {s.label}
    </Badge>
  );
}

const CONF_STYLES: Record<GtConfidence, { label: string; cls: string }> = {
  high: { label: "ثقة عالية", cls: "text-emerald-700" },
  medium: { label: "ثقة متوسطة", cls: "text-amber-700" },
  low: { label: "ثقة منخفضة", cls: "text-red-700" },
  human: { label: "موسومة يدوياً", cls: "text-purple-700 border border-purple-300 rounded px-1" },
};

export function ConfidenceText({ confidence }: { confidence: GtConfidence | null }) {
  if (!confidence) return null;
  const c = CONF_STYLES[confidence];
  return <span className={`text-[10px] font-medium ${c.cls}`}>{c.label}</span>;
}

/* ---------- Experiment status chip ---------- */

export const STATUS_LABELS: Record<ExperimentStatus, string> = {
  pending: "في الانتظار",
  running: "قيد التشغيل",
  done: "مكتملة",
  error: "فاشلة",
};

export function StatusChip({ status }: { status: ExperimentStatus }) {
  const styles: Record<ExperimentStatus, string> = {
    pending: "bg-muted text-muted-foreground border-border",
    running: "bg-amber-100 text-amber-800 border-amber-300",
    done: "bg-emerald-100 text-emerald-800 border-emerald-300",
    error: "bg-red-100 text-red-800 border-red-300",
  };
  return (
    <Badge variant="outline" className={`gap-1 px-2 py-0.5 text-xs ${styles[status]}`}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

/* ---------- Loading skeletons ---------- */

export function KpiSkeletonRow({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="rounded-xl">
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-14" />
            <Skeleton className="h-3 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function GallerySkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="h-3 w-2/3 mx-auto" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

/* ---------- Error alert ---------- */

export function FetchError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <span className="truncate">{message}</span>
    </div>
  );
}
