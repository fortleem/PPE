"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
  Beaker,
  FlaskConical,
  Images,
  Info,
  Trophy,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PwaInstallGuide } from "@/components/ppe/InstallPwa";
import { EmptyState, KpiCard, KpiSkeletonRow } from "@/components/ppe/shared";
import { CLASS_LABELS, COMBO_LABELS, MODE_CONFIG, PPE_CLASSES, type ExperimentMode } from "@/lib/ppe";
import { apiGet, fmtPct, type StatsResponse } from "@/lib/ppe-client";

const CLASS_ICONS: Record<string, string> = {
  helmet: "⛑️",
  no_helmet: "🚫",
  safety_vest: "🦺",
  no_vest: "⭕",
};

export function OverviewTab() {
  const { data, isLoading, isError, error } = useQuery<StatsResponse>({
    queryKey: ["stats"],
    queryFn: () => apiGet<StatsResponse>("/api/stats"),
    refetchInterval: 10_000,
  });

  if (isError) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-6 w-6" />}
        title="تعذر جلب الإحصائيات"
        description={(error as Error)?.message ?? "حدث خطأ في الاتصال بالخادم"}
      />
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <KpiSkeletonRow />
        <Card className="rounded-xl">
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-56 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const chartData = data.byCombo.map((c) => ({
    name: COMBO_LABELS[c.key],
    عدد: c.count,
  }));

  const hasData = data.totalImages > 0;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon={<Images className="h-4 w-4" />}
          label="إجمالي الصور"
          value={data.totalImages}
          sub={`ويب: ${data.sources.web} • رفع: ${data.sources.upload}`}
        />
        <KpiCard
          icon={<Beaker className="h-4 w-4" />}
          label="صور موسومة"
          value={data.labeled}
          sub={`غير موسومة: ${data.totalImages - data.labeled}`}
          accent="emerald"
        />
        <KpiCard
          icon={<FlaskConical className="h-4 w-4" />}
          label="صور الاختبار"
          value={data.splits.test}
          sub={`تدريب: ${data.splits.train} • بدون: ${data.splits.none}`}
          accent="slate"
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="تعارضات التوسيم"
          value={data.conflicts}
          sub="حقيقة أرضية تحتاج مراجعة"
          accent={data.conflicts > 0 ? "red" : "slate"}
        />
        <KpiCard
          icon={<Trophy className="h-4 w-4" />}
          label="تجارب مكتملة"
          value={data.experiments.done}
          sub={
            data.experiments.running
              ? "⏳ تجربة قيد التشغيل الآن…"
              : `من أصل ${data.experiments.count} تجربة`
          }
          accent={data.experiments.done > 0 ? "emerald" : "slate"}
        />
      </div>

      {/* best result badge */}
      {data.experiments.best ? (
        <Card className="rounded-xl border-emerald-200 bg-emerald-50/60">
          <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
            <Trophy className="h-5 w-5 text-emerald-600" />
            <span className="font-semibold text-emerald-900">أفضل نتيجة:</span>
            <Badge className="bg-emerald-600 hover:bg-emerald-600">
              {MODE_CONFIG[data.experiments.best.mode as ExperimentMode]?.name ??
                data.experiments.best.mode}
            </Badge>
            <span className="tabular-nums">
              تطابق تام <strong>{fmtPct(data.experiments.best.exactMatch)}</strong> • Macro F1{" "}
              <strong>{fmtPct(data.experiments.best.macroF1)}</strong>
            </span>
          </CardContent>
        </Card>
      ) : null}

      {/* combo chart + by class grid */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="rounded-xl lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">توزيع حالات الالتزام</CardTitle>
            <CardDescription>عدد الصور الموسومة لكل حالة (خوذة × سديري)</CardDescription>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <div dir="ltr" className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} interval={0} tickMargin={8} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#475569" }} width={32} />
                    <Tooltip
                      formatter={(v) => [`${v} صورة`, "العدد"]}
                      contentStyle={{ direction: "rtl", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}
                    />
                    <Bar dataKey="عدد" fill="#d97706" radius={[6, 6, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                icon={<Images className="h-6 w-6" />}
                title="لا توجد بيانات بعد"
                description="جارٍ تجميع الداتاسيت في الخلفية — ستظهر الصور والإحصائيات تلقائياً."
              />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">عدد صور كل فئة</CardTitle>
            <CardDescription>الفئات الأربع وفق الصيغة ثنائية السمة</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {PPE_CLASSES.map((cls) => (
              <div key={cls} className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">
                  <span aria-hidden="true">{CLASS_ICONS[cls]}</span> {CLASS_LABELS[cls].ar}
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums">{data.byClass[cls]}</p>
                <p className="text-[10px] text-muted-foreground">{CLASS_LABELS[cls].en}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* formulation explanation */}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-amber-600" />
            صيغة المسألة: فئتان ثنائيتان × 4 حالات التزام
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            يُصوَّر كل عامل بسمتين ثنائيتين مستقلتين: <strong className="text-foreground">ارتداء الخوذة (نعم/لا)</strong> و
            <strong className="text-foreground"> ارتداء السديري (نعم/لا)</strong>. تُشتق منهما الفئات الأربع المطلوبة:
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PPE_CLASSES.map((cls) => (
              <div key={cls} className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2.5">
                <span aria-hidden="true" className="text-lg">
                  {CLASS_ICONS[cls]}
                </span>
                <div>
                  <p className="font-medium text-foreground">{CLASS_LABELS[cls].ar}</p>
                  <p className="text-xs">{CLASS_LABELS[cls].en}</p>
                </div>
              </div>
            ))}
          </div>
          <p>
            ويجتمع السمتان في <strong className="text-foreground">4 حالات التزام</strong>:{" "}
            {(["TT", "TF", "FT", "FF"] as const).map((c) => COMBO_LABELS[c]).join(" — ")}. يُقيَّم النموذج على كل فئة
            بمقاييس Precision / Recall / F1 (فئة مقابل الباقي)، إضافة إلى مصفوفة التباس 4×4 لحالات الالتزام.
          </p>
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0" />
            الحقيقة الأرضية أُنشئت بتوسيم آلي عبر نموذج رؤية-لغوي مع مراجعة بشرية من هذه الواجهة (إشراف ضعيف موثّق في التقرير التقني).
          </p>
        </CardContent>
      </Card>

      {/* PWA install card */}
      <Card className="rounded-xl border-amber-200 bg-gradient-to-l from-amber-50 to-white">
        <CardHeader>
          <CardTitle className="text-base">📲 ثبّت التطبيق على جوالك بدون متجر</CardTitle>
          <CardDescription>
            يعمل التطبيق كـ PWA — ثبّته من المتصفح مباشرة على أندرويد وآيفون (بدون App Store أو Google Play) ليعمل
            بملء الشاشة ويتحدث تلقائياً.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PwaInstallGuide />
        </CardContent>
      </Card>
    </div>
  );
}
