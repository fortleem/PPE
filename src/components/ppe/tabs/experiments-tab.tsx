"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Beaker, Loader2, Play, Sparkles, Timer } from "lucide-react";
import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState, ListSkeleton, StatusChip } from "@/components/ppe/shared";
import { ExperimentDetail } from "@/components/ppe/tabs/experiment-detail";
import { MODE_CONFIG, type ExperimentMode } from "@/lib/ppe";
import {
  apiGet,
  apiSend,
  fmtDate,
  fmtMs,
  fmtPct,
  type ExperimentsResponse,
  type ExperimentStatus,
} from "@/lib/ppe-client";

const MODE_ICONS: Record<ExperimentMode, string> = {
  zero_shot: "🧭",
  few_shot: "🖼️",
  many_shot: "📚",
};

export function ExperimentsTab() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery<ExperimentsResponse>({
    queryKey: ["experiments"],
    queryFn: () => apiGet<ExperimentsResponse>("/api/experiments"),
    refetchInterval: (query) => {
      const exps = query.state.data?.experiments ?? [];
      const anyActive = exps.some((e) => e.status === "pending" || e.status === "running");
      return anyActive ? 3_000 : 15_000;
    },
  });

  const startModes = async (modes: ExperimentMode[]) => {
    setStarting(true);
    try {
      await apiSend<ExperimentsResponse>("/api/experiments", "POST", { modes });
      toast({
        title: modes.length > 1 ? "بدأت التجارب الثلاث" : `بدأت تجربة ${MODE_CONFIG[modes[0]].name}`,
        description: "تعمل في الخلفية — تابع التقدم بالأسفل (تحديث تلقائي كل 3 ثوانٍ).",
      });
      await refetch();
    } catch (err) {
      toast({ variant: "destructive", title: "تعذر بدء التجارب", description: (err as Error).message });
    } finally {
      setStarting(false);
    }
  };

  const anyActive = (data?.experiments ?? []).some(
    (e) => e.status === "pending" || e.status === "running" || e.live
  );
  const busy = starting || anyActive;

  if (isError) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-6 w-6" />}
        title="تعذر جلب التجارب"
        description={(error as Error)?.message ?? "حدث خطأ في الاتصال بالخادم"}
      />
    );
  }

  const experiments = data?.experiments ?? [];
  const selected = experiments.find((e) => e.id === selectedId) ?? null;

  /* -------- detail view -------- */
  if (selectedId && selected) {
    return (
      <ExperimentDetail
        experiment={selected}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* mode cards + start buttons */}
      <div className="grid gap-4 md:grid-cols-3">
        {(data?.modes ?? Object.entries(MODE_CONFIG).map(([key, m]) => ({ key, ...m }))).map(
          (mode) => (
            <Card key={mode.key} className="rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span aria-hidden="true">{MODE_ICONS[mode.key as ExperimentMode]}</span>
                  {mode.name}
                </CardTitle>
                <CardDescription>{mode.descAr}</CardDescription>
              </CardHeader>
              <CardContent className="pb-2 text-xs text-muted-foreground space-y-1">
                <p>
                  أمثلة لكل فئة: <strong className="text-foreground tabular-nums">{mode.examplesPerClass}</strong>
                </p>
                <p>
                  صور في السياق (البرومبت):{" "}
                  <strong className="text-foreground tabular-nums">{mode.contextImages}</strong>
                </p>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full border-amber-300 text-amber-800 hover:bg-amber-50 hover:text-amber-900"
                  disabled={busy}
                  onClick={() => startModes([mode.key as ExperimentMode])}
                >
                  {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  ابدأ التجربة
                </Button>
              </CardFooter>
            </Card>
          )
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          قارن أداء النموذج بنفس مجموعة الاختبار المحجوزة مع تغيير عدد الأمثلة داخل البرومبت فقط.
        </p>
        <Button
          size="lg"
          disabled={busy}
          onClick={() => startModes(["zero_shot", "few_shot", "many_shot"])}
          className="bg-amber-600 text-white hover:bg-amber-700"
        >
          {starting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          شغّل التجارب الثلاث
        </Button>
      </div>

      {/* runs list */}
      {isLoading ? (
        <ListSkeleton />
      ) : experiments.length === 0 ? (
        <EmptyState
          icon={<Beaker className="h-6 w-6" />}
          title="لا توجد تجارب بعد"
          description="اضغط «شغّل التجارب الثلاث» بالأعلى لبدء تجارب الأداء — ستظهر النتائج هنا مع مؤشر تقدم مباشر."
          action={
            <Button
              disabled={busy}
              onClick={() => startModes(["zero_shot", "few_shot", "many_shot"])}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              <Sparkles className="h-4 w-4" />
              شغّل التجارب الثلاث
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <RunRow
              key={exp.id}
              exp={exp}
              onSelect={() => setSelectedId(exp.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */

function RunRow({
  exp,
  onSelect,
}: {
  exp: ExperimentsResponse["experiments"][number];
  onSelect: () => void;
}) {
  const running = exp.status === "running";
  const done = exp.status === "done";
  const errored = exp.status === "error";
  const pct = exp.total > 0 ? Math.round((exp.progress / exp.total) * 100) : 0;

  return (
    <Card
      className={`rounded-xl transition-shadow hover:shadow-md ${done ? "cursor-pointer" : ""}`}
      onClick={done ? onSelect : undefined}
      tabIndex={done ? 0 : undefined}
      role={done ? "button" : undefined}
      aria-label={done ? `عرض تفاصيل ${exp.name}` : undefined}
      onKeyDown={
        done
          ? (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
            <span aria-hidden="true">{MODE_ICONS[exp.mode]}</span> {MODE_CONFIG[exp.mode]?.name ?? exp.mode}
          </Badge>
          <StatusChip status={exp.status} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{exp.name}</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Timer className="h-3.5 w-3.5" />
            {fmtDate(exp.createdAt)}
          </div>
        </div>

        {running || exp.status === "pending" ? (
          <div className="space-y-1.5">
            <Progress value={running ? Math.max(4, pct) : 3} className="h-2 bg-amber-100" />
            <p className="text-xs text-muted-foreground tabular-nums">
              {running
                ? exp.total > 0
                  ? `معالجة ${exp.progress} من ${exp.total} صورة (${pct}%)`
                  : "جارٍ تجهيز مجموعة الاختبار…"
                : "في قائمة الانتظار…"}
            </p>
          </div>
        ) : null}

        {errored && exp.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">{exp.error}</p>
        ) : null}

        {done && exp.metrics ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="tabular-nums">
              تطابق تام:{" "}
              <strong className={exp.metrics.exactMatch >= 0.8 ? "text-emerald-700" : "text-foreground"}>
                {fmtPct(exp.metrics.exactMatch)}
              </strong>
            </span>
            <span className="tabular-nums">
              Macro F1: <strong>{fmtPct(exp.metrics.macroF1)}</strong>
            </span>
            <span className="tabular-nums text-muted-foreground">
              {exp.metrics.n} صورة اختبار • متوسط {fmtMs(exp.metrics.latency?.avg)}
            </span>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              اضغط لعرض التفاصيل ←
            </Badge>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
