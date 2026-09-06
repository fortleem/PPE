"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ppe/shared";
import { apiGet, apiSend, fmtDate, type ReportResponse } from "@/lib/ppe-client";

export function ReportTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = React.useState(false);

  const { data, isLoading, isError, error } = useQuery<ReportResponse>({
    queryKey: ["report"],
    queryFn: () => apiGet<ReportResponse>("/api/report"),
    staleTime: 60_000,
  });

  const generate = async (regenerate: boolean) => {
    setGenerating(true);
    try {
      const res = await apiSend<ReportResponse & { fallback: boolean }>("/api/report", "POST");
      await queryClient.invalidateQueries({ queryKey: ["report"] });
      toast({
        title: regenerate ? "أُعيد توليد التقرير" : "وُلّد التقرير التقني",
        description: res.fallback
          ? "وُلّد التقرير بالقالب الاحتياطي المحلي (تعذر استدعاء النموذج اللغوي)."
          : "وُلّد التقرير عبر النموذج اللغوي — يمكنك تنزيله كملف Markdown.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "فشل توليد التقرير",
        description: (err as Error).message,
      });
    } finally {
      setGenerating(false);
    }
  };

  const download = () => {
    const content = data?.report?.content;
    if (!content) return;
    // UTF-8 BOM so Arabic opens correctly in Word/Notepad
    const blob = new Blob(["\uFEFF" + content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ppe-technical-report.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: "بدأ التنزيل", description: "ppe-technical-report.md" });
  };

  if (isError) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-6 w-6" />}
        title="تعذر جلب التقرير"
        description={(error as Error)?.message ?? "حدث خطأ في الاتصال بالخادم"}
      />
    );
  }

  if (isLoading) {
    return (
      <Card className="rounded-xl">
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const report = data?.report ?? null;

  if (!report && !generating) {
    return (
      <EmptyState
        icon={<FileText className="h-6 w-6" />}
        title="لم يُولَّد التقرير التقني بعد"
        description="يُولَّد التقرير آلياً بالعربية (Markdown) من نتائج التجارب وتحليل الأخطاء وبيانات الداتاسيت — قد يستغرق 1–3 دقائق."
        action={
          <Button onClick={() => generate(false)} className="bg-amber-600 text-white hover:bg-amber-700">
            <Sparkles className="h-4 w-4" />
            ولّد التقرير الآن
          </Button>
        }
      />
    );
  }

  if (!report && generating) {
    return (
      <EmptyState
        icon={<Loader2 className="h-6 w-6 animate-spin" />}
        title="جارٍ توليد التقرير…"
        description="يجمع النظام النتائج ويطلب من النموذج اللغوي كتابة التقرير — قد يستغرق من دقيقة إلى ثلاث."
      />
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-4">
      {/* header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          تاريخ التوليد: <span className="font-medium text-foreground">{fmtDate(report.createdAt)}</span>
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => generate(true)}
            disabled={generating}
            aria-label="إعادة توليد التقرير"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            إعادة التوليد
          </Button>
          <Button
            size="sm"
            onClick={download}
            className="bg-amber-600 text-white hover:bg-amber-700"
            aria-label="تنزيل التقرير كملف Markdown"
          >
            <Download className="h-4 w-4" />
            تنزيل التقرير
          </Button>
        </div>
      </div>

      {/* markdown content */}
      <Card className="rounded-xl">
        <CardContent className="p-4 sm:p-6">
          <div className="md-report" dir="rtl">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.content}</ReactMarkdown>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
