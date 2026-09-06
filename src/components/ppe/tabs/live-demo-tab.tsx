"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Images,
  Loader2,
  ScanSearch,
  Upload,
  XCircle,
} from "lucide-react";
import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, GallerySkeleton, HelmetVestBadges } from "@/components/ppe/shared";
import { COMBO_LABELS, MODE_CONFIG, type ExperimentMode } from "@/lib/ppe";
import {
  apiGet,
  apiSend,
  apiUpload,
  fmtMs,
  type ClassifyResponse,
  type DatasetResponse,
  type UploadResponse,
} from "@/lib/ppe-client";

const MODE_ICONS: Record<ExperimentMode, string> = {
  zero_shot: "🧭",
  few_shot: "🖼️",
  many_shot: "📚",
};

export function LiveDemoTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = React.useState<ExperimentMode>("many_shot");
  const [imageId, setImageId] = React.useState<string | null>(null);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const pickerQuery = useQuery<DatasetResponse>({
    queryKey: ["dataset", "picker"],
    queryFn: () =>
      apiGet<DatasetResponse>("/api/dataset?split=all&combo=all&labeled=all&page=1"),
  });

  const classifyMutation = useMutation({
    mutationFn: () => apiSend<ClassifyResponse>("/api/classify", "POST", { imageId, mode }),
  });

  const classify = async () => {
    if (!imageId) return;
    try {
      await classifyMutation.mutateAsync();
    } catch (err) {
      toast({ variant: "destructive", title: "فشل التصنيف", description: (err as Error).message });
    }
  };

  const pickUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const list = Array.from(files).slice(0, 1);
    setUploading(true);
    try {
      const res = await apiUpload<UploadResponse>("/api/dataset", list);
      if (!res.created.length) throw new Error("فشل حفظ الصورة");
      const first = res.created[0];
      setImageId(first.id);
      setImageUrl(first.url);
      toast({
        title: "رُفعت الصورة ووُسّمت آلياً",
        description: first.note,
      });
      await queryClient.invalidateQueries({ queryKey: ["dataset"] });
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الرفع", description: (err as Error).message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const result = classifyMutation.data ?? null;
  const running = classifyMutation.isPending;

  return (
    <div className="space-y-6">
      {/* mode selector */}
      <div>
        <p className="mb-2 text-sm font-semibold">وضع التصنيف (عدد الأمثلة في البرومبت)</p>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="وضع التصنيف">
          {(Object.keys(MODE_CONFIG) as ExperimentMode[]).map((key) => {
            const m = MODE_CONFIG[key];
            const active = mode === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMode(key)}
                className={`rounded-xl border p-4 text-start transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  active
                    ? "border-amber-600 bg-amber-50 shadow-sm"
                    : "border-border bg-card hover:border-amber-300 hover:bg-amber-50/40"
                }`}
              >
                <p className="flex items-center gap-2 font-semibold text-sm">
                  <span aria-hidden="true">{MODE_ICONS[key]}</span>
                  {m.name}
                  {active ? <CheckCircle2 className="ms-auto h-4 w-4 text-amber-600" /> : null}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{m.descAr}</p>
                <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
                  {m.contextImages} صورة في السياق
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* image picker */}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">اختر صورة للتجربة</CardTitle>
          <CardDescription>من الصفحة الأولى للداتاسيت — أو ارفع صورة جديدة (تُوسَّم آلياً كغير مقسّمة)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="رفع صورة للتجربة"
              onChange={(e) => pickUpload(e.target.files)}
              disabled={uploading}
            />
            <Button
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              aria-label="رفع صورة جديدة"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              ارفع صورة
            </Button>
            {imageUrl && imageId?.startsWith("up_") ? (
              <div className="flex items-center gap-2">
                <img
                  src={imageUrl}
                  alt="الصورة المرفوعة للتجربة"
                  className="h-12 w-12 rounded-lg border-2 border-amber-500 object-cover"
                />
                <span className="text-xs text-muted-foreground">الصورة المرفوعة محددة</span>
              </div>
            ) : null}
          </div>

          {pickerQuery.isLoading ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="h-16 w-16 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : pickerQuery.isError ? (
            <EmptyState
              icon={<AlertTriangle className="h-6 w-6" />}
              title="تعذر جلب الصور"
              description={(pickerQuery.error as Error)?.message ?? "حدث خطأ في الاتصال بالخادم"}
            />
          ) : !pickerQuery.data || pickerQuery.data.items.length === 0 ? (
            <EmptyState
              icon={<Images className="h-6 w-6" />}
              title="لا توجد صور بعد"
              description="جارٍ تجميع الداتاسيت — أو ارفع صورة للتجربة الآن."
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {pickerQuery.data.items.map((item) => {
                const active = imageId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setImageId(item.id);
                      setImageUrl(item.url);
                    }}
                    aria-label={`اختيار الصورة ${item.id}`}
                    aria-pressed={active}
                    className={`relative rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                      active ? "border-amber-500 scale-105 shadow" : "border-transparent hover:border-amber-300"
                    }`}
                  >
                    <img
                      src={item.url}
                      alt={item.sourceQuery ?? `صورة ${item.id}`}
                      loading="lazy"
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                    {active ? (
                      <CheckCircle2 className="absolute -top-1.5 -end-1.5 h-5 w-5 rounded-full bg-white text-amber-600" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* classify action */}
      <div className="flex flex-col items-center gap-2">
        <Button
          size="lg"
          onClick={classify}
          disabled={!imageId || running || uploading}
          className="w-full max-w-md bg-amber-600 text-white hover:bg-amber-700"
        >
          {running ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              جارٍ التصنيف… (5–30 ثانية)
            </>
          ) : (
            <>
              <ScanSearch className="h-5 w-5" />
              صنّف الصورة
            </>
          )}
        </Button>
        {!imageId ? (
          <p className="text-xs text-muted-foreground">اختر صورة من الأعلى أولاً</p>
        ) : null}
      </div>

      {/* result */}
      {classifyMutation.isError ? (
        <AlertBanner message={(classifyMutation.error as Error).message} />
      ) : null}
      {running ? <ResultSkeleton /> : null}
      {result ? <ClassifyResult result={result} /> : null}
    </div>
  );
}

/* ================================================================== */

function AlertBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

function ResultSkeleton() {
  return (
    <Card className="rounded-xl">
      <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
        <div className="h-56 w-full animate-pulse rounded-lg bg-muted" />
        <div className="space-y-3">
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
          <div className="h-16 w-full animate-pulse rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

function ClassifyResult({ result }: { result: ClassifyResponse }) {
  const gtNull = result.groundTruth.helmet === null || result.groundTruth.vest === null;

  const verdict =
    result.correct === null
      ? gtNull
        ? { label: "الصورة غير موسومة — لا توجد حقيقة أرضية للمقارنة", tone: "text-muted-foreground", icon: null }
        : { label: "مقارنة جزئية", tone: "text-muted-foreground", icon: null }
      : result.correct
        ? { label: "✓ تصنيف صحيح تماماً", tone: "text-emerald-700", icon: <CheckCircle2 className="h-5 w-5" /> }
        : { label: "✗ تصنيف خاطئ", tone: "text-red-700", icon: <XCircle className="h-5 w-5" /> };

  const combo = (result.prediction.helmet ? "T" : "F") + (result.prediction.vest ? "T" : "F");

  return (
    <Card className="rounded-xl border-2 border-amber-200">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5 text-amber-600" />
            نتيجة التصنيف
          </span>
          <div className="flex flex-wrap items-center gap-2 text-xs font-normal">
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
              {result.modeName}
            </Badge>
            <span className="text-muted-foreground tabular-nums">{fmtMs(result.latencyMs)}</span>
            <span className="text-muted-foreground tabular-nums">
              {result.contextImages} صورة سياق
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <img
          src={result.url}
          alt="الصورة المصنّفة"
          className="w-full rounded-lg border object-contain max-h-72 sm:max-h-96 bg-muted"
        />
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold">التنبؤ</p>
            <HelmetVestBadges hasHelmet={result.prediction.helmet} hasVest={result.prediction.vest} size="lg" />
            <p className="text-sm text-muted-foreground">
              حالة الالتزام:{" "}
              <span className="font-medium text-foreground">{COMBO_LABELS[combo as keyof typeof COMBO_LABELS]}</span>
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">مقارنة مع الحقيقة الأرضية</p>
            {gtNull ? (
              <p className="rounded-lg border border-dashed bg-muted/40 p-2.5 text-xs text-muted-foreground">
                الصورة غير موسومة — لا توجد حقيقة أرضية للمقارنة. راجعها في تبويب «الداتاسيت».
              </p>
            ) : (
              <div className="space-y-1.5 text-sm">
                <p className="flex items-center gap-2">
                  الخوذة:
                  {result.helmetCorrect ? (
                    <span className="font-medium text-emerald-700">✓ صحيح</span>
                  ) : (
                    <span className="font-medium text-red-700">✗ خطأ</span>
                  )}
                </p>
                <p className="flex items-center gap-2">
                  السديري:
                  {result.vestCorrect ? (
                    <span className="font-medium text-emerald-700">✓ صحيح</span>
                  ) : (
                    <span className="font-medium text-red-700">✗ خطأ</span>
                  )}
                </p>
              </div>
            )}
          </div>

          <div
            className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium ${
              result.correct === true
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : result.correct === false
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-border bg-muted/40 text-muted-foreground"
            }`}
          >
            {verdict.icon}
            {verdict.label}
          </div>

          {result.reasoning ? (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">تفكير النموذج:</p>
              <p className="text-xs leading-relaxed text-foreground">{result.reasoning}</p>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
