"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Images,
  Loader2,
  Timer,
  XCircle,
} from "lucide-react";
import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { EmptyState, HelmetVestBadges, KpiCard, KpiSkeletonRow, StatusChip } from "@/components/ppe/shared";
import { CLASS_LABELS, COMBO_LABELS, COMBOS, MODE_CONFIG, PPE_CLASSES, type Combo } from "@/lib/ppe";
import { apiGet, fmtDate, fmtMs, fmtPct, type ExperimentDetail as ExperimentDetailData, type ExperimentListItem, type PredictionItem } from "@/lib/ppe-client";

/* ================================================================== */
/* Detail view                                                          */
/* ================================================================== */

export function ExperimentDetail({
  experiment,
  onBack,
}: {
  experiment: ExperimentListItem;
  onBack: () => void;
}) {
  const { data, isLoading, isError, error } = useQuery<ExperimentDetailData>({
    queryKey: ["experiment", experiment.id],
    queryFn: () => apiGet<ExperimentDetailData>(`/api/experiments/${experiment.id}`),
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && (d.status === "running" || d.status === "pending") ? 3_000 : false;
    },
  });

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack} aria-label="العودة إلى قائمة التجارب">
          <ArrowRight className="h-4 w-4" />
          كل التجارب
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">{experiment.name}</h2>
          <p className="text-xs text-muted-foreground">
            {MODE_CONFIG[experiment.mode]?.name} • بدأت {fmtDate(experiment.startedAt ?? experiment.createdAt)}
            {experiment.finishedAt ? ` • انتهت ${fmtDate(experiment.finishedAt)}` : ""}
          </p>
        </div>
        <StatusChip status={experiment.status} />
      </div>

      {experiment.status === "error" && experiment.error ? (
        <Alert variant="destructive" dir="rtl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>فشلت التجربة</AlertTitle>
          <AlertDescription className="break-words">{experiment.error}</AlertDescription>
        </Alert>
      ) : null}

      {isError ? (
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="تعذر جلب تفاصيل التجربة"
          description={(error as Error)?.message ?? "حدث خطأ في الاتصال بالخادم"}
        />
      ) : isLoading || !data ? (
        <div className="space-y-6">
          <KpiSkeletonRow count={4} />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* KPI row */}
          {data.metrics ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="تطابق تام" value={fmtPct(data.metrics.exactMatch)} accent="emerald" />
                <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="دقة الخوذة" value={fmtPct(data.metrics.helmetAccuracy)} />
                <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="دقة السديري" value={fmtPct(data.metrics.vestAccuracy)} />
                <KpiCard icon={<Badge className="h-4 w-4" />} label="Macro F1" value={fmtPct(data.metrics.macroF1)} accent="slate" />
                <KpiCard icon={<Timer className="h-4 w-4" />} label="متوسط الزمن" value={fmtMs(data.metrics.latency?.avg)} sub={`p50: ${fmtMs(data.metrics.latency?.p50)} • p95: ${fmtMs(data.metrics.latency?.p95)}`} accent="slate" />
                <KpiCard icon={<Images className="h-4 w-4" />} label="صور الاختبار" value={data.metrics.n} accent="slate" />
              </div>

              {/* per-class metrics table */}
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">مقاييس الفئات الأربع (فئة مقابل الباقي)</CardTitle>
                  <CardDescription>نِسَب مئوية — Support = عدد الأمثلة الإيجابية للحقيقة الأرضية</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">الفئة</TableHead>
                        <TableHead className="text-right">Precision</TableHead>
                        <TableHead className="text-right">Recall</TableHead>
                        <TableHead className="text-right">F1</TableHead>
                        <TableHead className="text-right">Support</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">TP / FP / FN</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {PPE_CLASSES.map((cls) => {
                        const m = data.metrics?.classes?.[cls];
                        if (!m) return null;
                        return (
                          <TableRow key={cls}>
                            <TableCell className="font-medium">
                              {CLASS_LABELS[cls].ar}
                              <span className="block text-[10px] text-muted-foreground">{CLASS_LABELS[cls].en}</span>
                            </TableCell>
                            <TableCell className="tabular-nums">{fmtPct(m.precision)}</TableCell>
                            <TableCell className="tabular-nums">{fmtPct(m.recall)}</TableCell>
                            <TableCell className="tabular-nums font-semibold">{fmtPct(m.f1)}</TableCell>
                            <TableCell className="tabular-nums">{m.support}</TableCell>
                            <TableCell className="tabular-nums text-muted-foreground hidden sm:table-cell" dir="ltr">
                              {m.tp} / {m.fp} / {m.fn}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* confusion matrix */}
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">مصفوفة الالتباس 4×4 (حالات الالتزام)</CardTitle>
                  <CardDescription>
                    الصفوف = الحقيقة الأرضية، الأعمدة = التنبؤ — القطر (الأخضر) تنبؤ صحيح، وخارج القطر (الأحمر) أخطاء
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ConfusionMatrix
                    order={(data.metrics.comboOrder as Combo[]) ?? COMBOS}
                    matrix={data.metrics.comboConfusion ?? []}
                  />
                </CardContent>
              </Card>
            </>
          ) : (
            <EmptyState
              icon={<Loader2 className="h-6 w-6 animate-spin" />}
              title={data.status === "running" ? "التجربة قيد التشغيل" : "لا توجد مقاييس بعد"}
              description={`معالجة ${data.progress} من ${data.total} صورة — ستظهر المقاييس فور الاكتمال.`}
            />
          )}

          {/* context examples strip */}
          {data.contextThumbnails && data.contextThumbnails.length > 0 ? (
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-base">
                  صور السياق المُدرجة في البرومبت
                  <Badge variant="outline" className="ms-2 border-amber-300 bg-amber-50 text-amber-800">
                    {data.contextThumbnails.length}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  «بيانات التدريب» لهذه التجربة — أمثلة موسومة داخل النص (تعلّم داخل السياق)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TooltipProvider delayDuration={150}>
                  <div className="flex flex-wrap gap-2">
                    {data.contextThumbnails.map((url, i) => (
                      <Tooltip key={url + i}>
                        <TooltipTrigger asChild>
                          <img
                            src={url}
                            alt={`صورة سياق ${i + 1}`}
                            loading="lazy"
                            className="h-14 w-14 rounded-lg border-2 border-amber-300 object-cover hover:scale-110 transition-transform"
                          />
                        </TooltipTrigger>
                        <TooltipContent dir="rtl" className="text-xs">
                          صورة سياق #{i + 1}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
              </CardContent>
            </Card>
          ) : null}

          {/* predictions grid */}
          {data.predictions && data.predictions.length > 0 ? (
            <PredictionsGrid predictions={data.predictions} />
          ) : (
            data.status === "done" && (
              <EmptyState
                icon={<Images className="h-6 w-6" />}
                title="لا توجد تنبؤات"
                description="تعذر جلب تنبؤات هذه التجربة."
              />
            )
          )}
        </>
      )}
    </div>
  );
}

/* ================================================================== */
/* Confusion matrix (heat shaded 4×4)                                   */
/* ================================================================== */

function ConfusionMatrix({ order, matrix }: { order: Combo[]; matrix: number[][] }) {
  const max = Math.max(1, ...matrix.flat());

  const cellStyle = (val: number, isDiag: boolean): React.CSSProperties => {
    const intensity = val / max;
    if (val === 0) return {};
    const alpha = 0.12 + intensity * 0.55;
    return {
      backgroundColor: isDiag
        ? `rgba(16, 185, 129, ${alpha.toFixed(3)})`
        : `rgba(239, 68, 68, ${alpha.toFixed(3)})`,
    };
  };

  return (
    <div className="overflow-x-auto custom-scroll">
      <table className="w-full min-w-md border-collapse text-center text-sm" dir="rtl">
        <thead>
          <tr>
            <th className="p-2 text-xs font-semibold text-muted-foreground">
              الحقيقة ↓ / التنبؤ →
            </th>
            {order.map((c) => (
              <th key={c} className="border border-border p-2 text-xs font-semibold">
                {COMBO_LABELS[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((rowCombo, i) => (
            <tr key={rowCombo}>
              <th className="border border-border p-2 text-xs font-semibold whitespace-nowrap">
                {COMBO_LABELS[order[i]]}
              </th>
              {order.map((colCombo, j) => {
                const val = matrix[i]?.[j] ?? 0;
                const isDiag = i === j;
                return (
                  <td
                    key={colCombo}
                    style={cellStyle(val, isDiag)}
                    className="border border-border p-2 tabular-nums font-medium"
                  >
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================== */
/* Predictions grid                                                     */
/* ================================================================== */

function PredictionsGrid({ predictions }: { predictions: PredictionItem[] }) {
  const [onlyErrors, setOnlyErrors] = React.useState(false);
  const shown = onlyErrors ? predictions.filter((p) => !p.correct) : predictions;
  const errorsCount = predictions.filter((p) => !p.correct).length;

  return (
    <Card className="rounded-xl">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">
            تنبؤات النموذج على مجموعة الاختبار
            <Badge variant="outline" className="ms-2 border-slate-300 bg-slate-100 text-slate-700">
              {predictions.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            {errorsCount} خطأ من {predictions.length} ({fmtPct(errorsCount / Math.max(1, predictions.length))})
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setOnlyErrors(false)}
            aria-pressed={!onlyErrors}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              !onlyErrors
                ? "border-amber-600 bg-amber-600 text-white"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            الكل
          </button>
          <button
            type="button"
            onClick={() => setOnlyErrors(true)}
            aria-pressed={onlyErrors}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              onlyErrors
                ? "border-red-600 bg-red-600 text-white"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            الخطأ فقط ({errorsCount})
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-6 w-6" />}
            title="لا توجد أخطاء في هذه التجربة 🎉"
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((p) => (
              <PredictionTile key={p.id} p={p} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PredictionTile({ p }: { p: PredictionItem }) {
  const correct = p.correct;
  return (
    <div
      className={`overflow-hidden rounded-lg border-2 ${
        correct ? "border-emerald-500" : "border-red-500"
      } bg-card`}
    >
      <div className="relative">
        <img src={p.url} alt={`تنبؤ ${p.imageId}`} loading="lazy" className="aspect-square w-full object-cover" />
        <span
          className={`absolute top-1.5 start-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-white shadow ${
            correct ? "bg-emerald-500" : "bg-red-500"
          }`}
          aria-label={correct ? "تنبؤ صحيح" : "تنبؤ خاطئ"}
        >
          {correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        </span>
        <span className="absolute bottom-1.5 end-1.5 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] text-white tabular-nums backdrop-blur-sm">
          {fmtMs(p.latencyMs)}
        </span>
      </div>
      <div className="space-y-2 p-2.5">
        <HelmetVestBadges hasHelmet={p.predHelmet} hasVest={p.predVest} />
        <div className="space-y-0.5 text-[11px] leading-snug text-muted-foreground">
          <p>
            التنبؤ: <span className="font-medium text-foreground">{COMBO_LABELS[p.predCombo]}</span>
          </p>
          <p>
            الحقيقة:{" "}
            {p.gtCombo ? (
              <span className="font-medium text-foreground">{COMBO_LABELS[p.gtCombo]}</span>
            ) : (
              "غير موسومة"
            )}
            {!p.helmetCorrect && p.gtHelmet !== null ? " (خوذة ✗)" : null}
            {!p.vestCorrect && p.gtVest !== null ? " (سديري ✗)" : null}
          </p>
        </div>
        {p.reasoning ? (
          <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                className="w-full truncate text-start text-[11px] text-amber-700 underline decoration-dotted underline-offset-2"
                aria-label="عرض تفكير النموذج"
              >
                {p.reasoning}
              </button>
            </HoverCardTrigger>
            <HoverCardContent dir="rtl" side="top" className="w-72 text-xs leading-relaxed">
              <p className="mb-1 font-semibold">تفكير النموذج:</p>
              <p className="text-muted-foreground">{p.reasoning}</p>
            </HoverCardContent>
          </HoverCard>
        ) : null}
      </div>
    </div>
  );
}
