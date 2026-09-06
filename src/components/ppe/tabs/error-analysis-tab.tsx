"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, KpiCard, KpiSkeletonRow, ListSkeleton } from "@/components/ppe/shared";
import { ERROR_CATEGORY_LABELS, type ErrorCategory } from "@/lib/ppe";
import {
  apiGet,
  apiSend,
  fmtPct,
  type ExperimentsResponse,
  type ExperimentDetail,
  type PredictionItem,
} from "@/lib/ppe-client";

const ATTRIBUTE_LABELS: Record<string, string> = {
  helmet: "الخوذة",
  vest: "السديري",
};

export function ErrorAnalysisTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [analyzing, setAnalyzing] = React.useState(false);

  const experimentsQuery = useQuery<ExperimentsResponse>({
    queryKey: ["experiments"],
    queryFn: () => apiGet<ExperimentsResponse>("/api/experiments"),
    refetchInterval: 15_000,
  });

  const doneExperiments = (experimentsQuery.data?.experiments ?? []).filter(
    (e) => e.status === "done"
  );

  // auto-select latest done experiment
  React.useEffect(() => {
    if (!selectedId && doneExperiments.length > 0) {
      setSelectedId(doneExperiments[0].id);
    }
  }, [selectedId, doneExperiments]);

  const detailQuery = useQuery<ExperimentDetail>({
    queryKey: ["experiment", selectedId],
    queryFn: () => apiGet<ExperimentDetail>(`/api/experiments/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const detail = detailQuery.data;
  const predictionsById = React.useMemo(() => {
    const map = new Map<string, PredictionItem>();
    for (const p of detail?.predictions ?? []) map.set(p.id, p);
    return map;
  }, [detail]);

  const runAnalysis = async () => {
    if (!selectedId) return;
    setAnalyzing(true);
    try {
      await apiSend<{ ok: boolean }>(`/api/experiments/${selectedId}/analyze`, "POST");
      toast({
        title: "اكتمل تحليل الأخطاء",
        description: "صُنّفت الأخطاء حسب التصنيف العشري ووُلّد ملخص بالعربية.",
      });
      await queryClient.invalidateQueries({ queryKey: ["experiment", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["experiments"] });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "فشل تحليل الأخطاء",
        description: (err as Error).message,
      });
    } finally {
      setAnalyzing(false);
    }
  };

  if (experimentsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <ListSkeleton count={2} />
        <KpiSkeletonRow count={3} />
      </div>
    );
  }

  if (experimentsQuery.isError) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-6 w-6" />}
        title="تعذر جلب التجارب"
        description={(experimentsQuery.error as Error)?.message ?? "حدث خطأ في الاتصال بالخادم"}
      />
    );
  }

  if (doneExperiments.length === 0) {
    return (
      <EmptyState
        icon={<Search className="h-6 w-6" />}
        title="لا توجد تجارب مكتملة لتحليلها"
        description="شغّل التجارب من تبويب «التجارب» أولاً — بعد اكتمالها يمكن تحليل أخطائها وتصنيف أسبابها هنا."
      />
    );
  }

  const summary = detail?.errorSummary ?? null;

  return (
    <div className="space-y-6">
      {/* experiment selector */}
      <Card className="rounded-xl">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <BarChart3 className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 w-full sm:w-96">
              <label htmlFor="exp-select" className="mb-1 block text-xs text-muted-foreground">
                اختر تجربة مكتملة لتحليل أخطائها
              </label>
              <Select
                value={selectedId ?? ""}
                onValueChange={(v) => setSelectedId(v)}
              >
                <SelectTrigger id="exp-select" className="w-full" aria-label="اختيار التجربة">
                  <SelectValue placeholder="اختر تجربة…" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {doneExperiments.map((e) => (
                    <SelectItem key={e.id} value={e.id} className="whitespace-normal">
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {summary ? (
            <BadgeOk />
          ) : (
            <Button
              onClick={runAnalysis}
              disabled={analyzing || detailQuery.isLoading}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ تحليل الأخطاء… (1–2 دقيقة)
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  حلّل الأخطاء الآن
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {detailQuery.isLoading ? (
        <div className="space-y-6">
          <KpiSkeletonRow count={3} />
          <ListSkeleton count={3} />
        </div>
      ) : detailQuery.isError ? (
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="تعذر جلب تفاصيل التجربة"
          description={(detailQuery.error as Error)?.message ?? "حدث خطأ في الاتصال بالخادم"}
        />
      ) : !detail ? null : !summary ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="لم يُحلَّل هذا التجربة بعد"
          description="اضغط «حلّل الأخطاء الآن» لتصنيف كل خطأ على مستوى السمة (خوذة/سديري) حسب التصنيف العشري عبر نموذج لغوي."
        />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="إجمالي الأخطاء"
              value={summary.totalErrors}
              sub={`من ${detail.metrics?.n ?? "—"} تنبؤ`}
              accent="red"
            />
            <KpiCard
              icon={<BarChart3 className="h-4 w-4" />}
              label="نسبة الخطأ"
              value={fmtPct(summary.errorRate)}
              accent="red"
            />
            <KpiCard
              icon={<Sparkles className="h-4 w-4" />}
              label="فئات الأخطاء النشطة"
              value={summary.categories.filter((c) => c.count > 0).length}
              sub={`من ${summary.categories.length} فئة`}
              accent="amber"
            />
          </div>

          {/* categories chart */}
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-base">توزيع الأخطاء حسب الفئة</CardTitle>
              <CardDescription>تصنيف عشري لأسباب الأخطاء على مستوى السمة</CardDescription>
            </CardHeader>
            <CardContent>
              {summary.categories.length > 0 ? (
                <div dir="ltr" className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={summary.categories}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#475569" }} />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={150}
                        tick={{ fontSize: 11, fill: "#475569" }}
                      />
                      <Tooltip
                        formatter={(v) => [`${v} خطأ`, "العدد"]}
                        contentStyle={{ direction: "rtl", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}
                      />
                      <Bar dataKey="count" name="العدد" fill="#d97706" radius={[0, 6, 6, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Arabic summary */}
          <Card className="rounded-xl border-amber-200 bg-amber-50/60">
            <CardHeader>
              <CardTitle className="text-base">ملخص تحليل الأخطاء</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-foreground">{summary.summaryAr}</p>
            </CardContent>
          </Card>

          {/* explanations */}
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-base">
                تفسير الأخطاء الفردية
                <span className="ms-2 text-xs font-normal text-muted-foreground">
                  ({summary.explanations.length})
                </span>
              </CardTitle>
              <CardDescription>كل خطأ مع صورته والسمة الخاطئة وفئة السبب وشرح موجز</CardDescription>
            </CardHeader>
            <CardContent>
              {summary.explanations.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="h-6 w-6" />}
                  title="لا توجد أخطاء في هذه التجربة 🎉"
                  description="تنبّأ النموذج صحيحاً بكل السمات في كل صور الاختبار."
                />
              ) : (
                <div className="max-h-[28rem] space-y-2.5 overflow-y-auto custom-scroll pe-1">
                  {summary.explanations.map((ex, i) => {
                    const pred = predictionsById.get(ex.predictionId);
                    const cat = ERROR_CATEGORY_LABELS[ex.category as ErrorCategory];
                    return (
                      <div
                        key={`${ex.predictionId}-${ex.attribute}-${i}`}
                        className="flex items-start gap-3 rounded-xl border p-3"
                      >
                        {pred ? (
                          <img
                            src={pred.url}
                            alt={`صورة الخطأ ${pred.imageId}`}
                            loading="lazy"
                            className="h-14 w-14 shrink-0 rounded-lg border object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">
                            ؟
                          </div>
                        )}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="rounded-full bg-red-100 border border-red-200 px-2 py-0.5 font-medium text-red-800">
                              {ATTRIBUTE_LABELS[ex.attribute] ?? ex.attribute}
                            </span>
                            {cat ? (
                              <span className="rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 font-medium text-amber-800">
                                {cat.emoji} {cat.ar}
                              </span>
                            ) : (
                              <span className="rounded-full bg-muted border px-2 py-0.5 text-muted-foreground">
                                {ex.category}
                              </span>
                            )}
                            {pred ? (
                              <span className="text-muted-foreground tabular-nums" dir="ltr">
                                {pred.latencyMs ? `${pred.latencyMs}ms` : ""}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground">{ex.explanation}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function BadgeOk() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
      <CheckCircle2 className="h-3.5 w-3.5" />
      محّللة — العرض بالأسفل
    </span>
  );
}
