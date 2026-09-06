"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ConfidenceText,
  EmptyState,
  GallerySkeleton,
  HelmetVestBadges,
  SplitBadge,
} from "@/components/ppe/shared";
import { useDebouncedValue } from "@/hooks/use-debounced";
import { COMBO_LABELS, COMBOS, comboOrNull, type Combo } from "@/lib/ppe";
import {
  apiGet,
  apiSend,
  apiUpload,
  fmtBytes,
  fmtDate,
  type DatasetItem,
  type DatasetResponse,
  type Split,
  type UploadResponse,
} from "@/lib/ppe-client";

const MAX_UPLOAD = 6;

/* ================================================================== */
/* Upload zone                                                          */
/* ================================================================== */

function UploadZone({ onUploaded }: { onUploaded: () => void }) {
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const list = Array.from(files).slice(0, MAX_UPLOAD);
    if (files.length > MAX_UPLOAD) {
      toast({
        variant: "destructive",
        title: "عدد كبير من الملفات",
        description: `سيتم رفع أول ${MAX_UPLOAD} ملفات فقط (الحد الأقصى للطلب الواحد).`,
      });
    }
    setBusy(true);
    try {
      const res = await apiUpload<UploadResponse>("/api/dataset", list);
      toast({
        title: `تم رفع ${res.count} صورة مع التوسيم الآلي`,
        description: "راجع التسميات وصحّحها إن لزم — الصور الجديدة بدون تقسيم (none).",
      });
      onUploaded();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "فشل الرفع",
        description: (err as Error).message,
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Card
      className="rounded-xl border-dashed border-amber-300 bg-amber-50/50"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer?.files ?? null);
      }}
    >
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
        <div className="rounded-full border border-amber-300 bg-white p-3 text-amber-600">
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
        </div>
        {busy ? (
          <div className="space-y-1">
            <p className="font-semibold text-foreground">جارٍ الرفع والتوسيم الآلي…</p>
            <p className="text-xs text-muted-foreground">قد يستغرق بضع ثوانٍ لكل صورة</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="font-semibold text-foreground">ارفع صوراً جديدة للداتاسيت</p>
            <p className="text-xs text-muted-foreground">
              اسحب الصور هنا أو اخترها — حتى {MAX_UPLOAD} صور × 8MB، تُوسَّم آلياً بالخوذة/السديري ثم تراجعها يدوياً
            </p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-label="اختر صوراً للرفع"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={busy}
        />
        <Button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="bg-amber-600 text-white hover:bg-amber-700"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          اختيار صور
        </Button>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/* Image tile                                                           */
/* ================================================================== */

function ImageTile({ item, onClick }: { item: DatasetItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`عرض تفاصيل الصورة ${item.id}`}
      className="group relative block w-full overflow-hidden rounded-lg border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
    >
      <img
        src={item.url}
        alt={item.sourceQuery ?? `صورة داتاسيت ${item.id}`}
        loading="lazy"
        className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-105"
      />
      {/* overlay badges */}
      <div className="absolute inset-x-1.5 top-1.5 flex flex-wrap items-start justify-between gap-1">
        <HelmetVestBadges hasHelmet={item.hasHelmet} hasVest={item.hasVest} />
        <SplitBadge split={item.split} />
      </div>
      <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 rounded-full bg-white/90 px-1.5 py-0.5 backdrop-blur-sm">
          <ConfidenceText confidence={item.gtConfidence} />
        </div>
        {item.gtFlags && item.gtFlags.length > 0 ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center rounded-full bg-red-500/95 px-2 py-1 text-[11px] text-white">
                  <AlertTriangle className="h-3.5 w-3.5" aria-label="تعارض توسيم" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" dir="rtl">
                <p className="text-xs font-semibold">تعارض توسيم ({item.gtFlags.length})</p>
                <p className="max-w-56 text-xs">{item.gtFlags.join(" • ")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
    </button>
  );
}

/* ================================================================== */
/* Edit dialog                                                          */
/* ================================================================== */

type PatchBody = { hasHelmet?: boolean; hasVest?: boolean; split?: Split };

type PatchResponse = {
  id: string;
  hasHelmet: boolean | null;
  hasVest: boolean | null;
  split: Split;
  gtConfidence: DatasetItem["gtConfidence"];
  gtFlags: string[];
};

function EditDialog({
  item,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: {
  item: DatasetItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUpdated: (updated: DatasetItem) => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [local, setLocal] = React.useState<DatasetItem | null>(item);

  React.useEffect(() => setLocal(item), [item]);

  const patchMutation = useMutation({
    mutationFn: (body: PatchBody) => apiSend<PatchResponse>(`/api/dataset/${item?.id}`, "PATCH", body),
    onMutate: async (body) => {
      if (!item) return;
      await queryClient.cancelQueries({ queryKey: ["dataset"] });
      const snapshot = queryClient.getQueryData<DatasetResponse>(["dataset"]);
      // optimistic cache update (combo recomputed from both attributes)
      queryClient.setQueriesData<DatasetResponse>({ queryKey: ["dataset"] }, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((it) =>
                it.id === item.id
                  ? {
                      ...it,
                      ...body,
                      gtConfidence:
                        body.hasHelmet !== undefined || body.hasVest !== undefined
                          ? "human"
                          : it.gtConfidence,
                      gtFlags:
                        body.hasHelmet !== undefined || body.hasVest !== undefined ? [] : it.gtFlags,
                      combo: comboOrNull(
                        body.hasHelmet !== undefined ? body.hasHelmet : it.hasHelmet,
                        body.hasVest !== undefined ? body.hasVest : it.hasVest
                      ),
                    }
                  : it
              ),
            }
          : old
      );
      return { snapshot };
    },
    onError: (err, _body, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(["dataset"], ctx.snapshot);
      setLocal(item);
      toast({ variant: "destructive", title: "فشل تحديث الصورة", description: (err as Error).message });
    },
    onSuccess: (updated) => {
      setLocal((prev) =>
        prev
          ? {
              ...prev,
              ...updated,
              combo: comboOrNull(updated.hasHelmet, updated.hasVest),
            }
          : prev
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["dataset"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiSend<{ ok: boolean }>(`/api/dataset/${item?.id}`, "DELETE"),
    onSuccess: () => {
      toast({ title: "تم حذف الصورة", description: `حُذفت ${item?.id} من الداتاسيت.` });
      onOpenChange(false);
      if (item) onDeleted(item.id);
      void queryClient.invalidateQueries({ queryKey: ["dataset"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "فشل الحذف", description: (err as Error).message });
    },
  });

  if (!local) return null;

  const applyPatch = (body: PatchBody) => {
    setLocal((prev) => (prev ? { ...prev, ...body } : prev));
    patchMutation.mutate(body);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-right">مراجعة الصورة وتحرير التسميات</DialogTitle>
          <DialogDescription className="text-right">
            التبديلات تُرسل فوراً وتُحفظ كتسمية بشرية (ثقة: موسومة يدوياً) — ويُمسح أي تعارض توسيم.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <img
            src={local.url}
            alt={local.sourceQuery ?? `صورة ${local.id}`}
            className="w-full rounded-lg border object-contain max-h-80 sm:max-h-96 bg-muted"
          />
          <div className="space-y-4">
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-semibold">الحقيقة الأرضية (سمتان ثنائيتان)</p>
              <div className="flex items-center justify-between">
                <span className="text-sm">خوذة؟</span>
                <Switch
                  checked={local.hasHelmet === true}
                  disabled={local.hasHelmet === null || patchMutation.isPending}
                  onCheckedChange={(v) => applyPatch({ hasHelmet: v })}
                  aria-label="تبديل تسمية الخوذة"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">سديري؟</span>
                <Switch
                  checked={local.hasVest === true}
                  disabled={local.hasVest === null || patchMutation.isPending}
                  onCheckedChange={(v) => applyPatch({ hasVest: v })}
                  aria-label="تبديل تسمية السديري"
                />
              </div>
              {local.hasHelmet === null || local.hasVest === null ? (
                <p className="rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
                  الصورة غير موسومة بعد — لا يمكن التبديل حتى اكتمال التوسيم الآلي.
                </p>
              ) : null}
              {patchMutation.isPending ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ الحفظ…
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
              <span className="text-sm font-semibold">التقسيم</span>
              <Select
                value={local.split}
                onValueChange={(v) => applyPatch({ split: v as Split })}
                disabled={patchMutation.isPending}
              >
                <SelectTrigger className="w-36" aria-label="تغيير التقسيم">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="train">تدريب</SelectItem>
                  <SelectItem value="test">اختبار</SelectItem>
                  <SelectItem value="none">بدون تقسيم</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 rounded-lg border p-3 text-xs text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">المعرف:</span>{" "}
                <span dir="ltr" className="font-mono">
                  {local.id}
                </span>
              </p>
              <p>
                <span className="font-semibold text-foreground">استعلام المصدر:</span>{" "}
                <span dir="ltr">{local.sourceQuery ?? "—"}</span>
              </p>
              {local.gtNotes ? (
                <p>
                  <span className="font-semibold text-foreground">ملاحظات التوسيم:</span> {local.gtNotes}
                </p>
              ) : null}
              {local.gtFlags && local.gtFlags.length > 0 ? (
                <p className="text-red-700">
                  <span className="font-semibold">تعارضات:</span> {local.gtFlags.join(" • ")}
                </p>
              ) : null}
              <p>
                <span className="font-semibold text-foreground">الأبعاد:</span> {local.width ?? "—"}×
                {local.height ?? "—"} • <span className="font-semibold text-foreground">الحجم:</span>{" "}
                {fmtBytes(local.size)} • <span className="font-semibold text-foreground">أُضيفت:</span>{" "}
                {fmtDate(local.createdAt)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-start">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                aria-label="حذف الصورة من الداتاسيت"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                حذف الصورة
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                <AlertDialogDescription>
                  سيُحذف ملف الصورة وسجلّها نهائياً من الداتاسيت. لا يمكن التراجع عن هذا الإجراء.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-red-600 hover:bg-red-700"
                >
                  حذف نهائي
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/* Dataset tab                                                          */
/* ================================================================== */

export function DatasetTab() {
  const [combo, setCombo] = React.useState<"all" | Combo>("all");
  const [split, setSplit] = React.useState<"all" | Split>("all");
  const [labeled, setLabeled] = React.useState<"all" | "yes" | "no">("all");
  const [flagged, setFlagged] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [page, setPage] = React.useState(1);

  const [selected, setSelected] = React.useState<DatasetItem | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const params = new URLSearchParams({
    combo,
    split,
    labeled,
    page: String(page),
  });
  if (flagged) params.set("flagged", "1");
  if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<DatasetResponse>({
    queryKey: ["dataset", combo, split, labeled, flagged, debouncedSearch, page],
    queryFn: () => apiGet<DatasetResponse>(`/api/dataset?${params.toString()}`),
    placeholderData: (prev) => prev, // keep old page visible while fetching next
  });

  // reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [combo, split, labeled, flagged, debouncedSearch]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const openImage = (item: DatasetItem) => {
    setSelected(item);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <UploadZone onUploaded={() => refetch()} />

      {/* filters */}
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Filter className="h-4 w-4 text-amber-600" />
            تصفية الداتاسيت {data ? `(${data.total} صورة)` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={combo} onValueChange={(v) => setCombo(v as "all" | Combo)}>
              <SelectTrigger className="w-full sm:w-40" aria-label="تصفية حسب حالة الالتزام">
                <SelectValue placeholder="حالة الالتزام" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">كل الحالات</SelectItem>
                {COMBOS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {COMBO_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={split} onValueChange={(v) => setSplit(v as "all" | Split)}>
              <SelectTrigger className="w-full sm:w-36" aria-label="تصفية حسب التقسيم">
                <SelectValue placeholder="التقسيم" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">كل التقسيمات</SelectItem>
                <SelectItem value="train">تدريب</SelectItem>
                <SelectItem value="test">اختبار</SelectItem>
                <SelectItem value="none">بدون تقسيم</SelectItem>
              </SelectContent>
            </Select>

            <Select value={labeled} onValueChange={(v) => setLabeled(v as "all" | "yes" | "no")}>
              <SelectTrigger className="w-full sm:w-36" aria-label="تصفية حسب التوسيم">
                <SelectValue placeholder="التوسيم" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">موسومة وغير موسومة</SelectItem>
                <SelectItem value="yes">موسومة فقط</SelectItem>
                <SelectItem value="no">غير موسومة فقط</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch
                id="flagged-switch"
                checked={flagged}
                onCheckedChange={setFlagged}
                aria-label="إظهار الصور المتعارضة فقط"
              />
              <label htmlFor="flagged-switch" className="cursor-pointer select-none text-sm">
                متعارضة فقط ⚠
              </label>
            </div>

            <div className="relative min-w-0 flex-1 basis-48">
              <Search className="absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو الاستعلام أو الملاحظات…"
                className="ps-8"
                aria-label="بحث في الداتاسيت"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* gallery */}
      {isError ? (
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="تعذر جلب الداتاسيت"
          description={(error as Error)?.message ?? "حدث خطأ في الاتصال بالخادم"}
        />
      ) : isLoading ? (
        <GallerySkeleton />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="لا نتائج مطابقة"
          description="جرّب تخفيف عوامل التصفية — أو لا تزال الداتاسيت تُجمع في الخلفية."
        />
      ) : (
        <div
          className={`grid grid-cols-2 gap-4 transition-opacity sm:grid-cols-3 lg:grid-cols-4 ${
            isFetching ? "opacity-60" : ""
          }`}
        >
          {data.items.map((item) => (
            <ImageTile key={item.id} item={item} onClick={() => openImage(item)} />
          ))}
        </div>
      )}

      {/* pagination */}
      {data && data.total > data.pageSize ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground tabular-nums">
            صفحة {data.page} من {totalPages}
            <span className="hidden sm:inline"> • {data.total} صورة</span>
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="الصفحة السابقة"
            >
              <ChevronRight className="h-4 w-4" />
              السابقة
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage((p) => p + 1)}
              aria-label="الصفحة التالية"
            >
              التالية
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <EditDialog
        item={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUpdated={() => refetch()}
        onDeleted={() => refetch()}
      />
    </div>
  );
}
