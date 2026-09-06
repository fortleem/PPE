"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Apple, Download, Smartphone, Share, PlusCircle, Monitor, QrCode } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const check = () => {
      const ua = navigator.userAgent;
      const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsIOS(iOS);
      setIsStandalone(standalone);
    };
    check();

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  return { canInstall: Boolean(deferredPrompt), installed, isIOS, isStandalone, install };
}

/** QR code rendering the current URL (so phones can open + install instantly). */
function UrlQrCode({ size = 180 }: { size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const url = window.location.origin + "/";
        const qr = await QRCode.toDataURL(url, {
          width: size,
          margin: 1,
          color: { dark: "#451a03", light: "#ffffff" },
        });
        if (!cancelled) setDataUrl(qr);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [size]);

  if (error) return <div className="text-xs text-muted-foreground">تعذر توليد رمز QR</div>;
  if (!dataUrl) return <div className="animate-pulse rounded-lg bg-muted" style={{ width: size, height: size }} />;
  return (
    <img src={dataUrl} alt="رمز QR لفتح التطبيق على الجوال" width={size} height={size} className="rounded-lg border bg-white p-1" />
  );
}

/** Header button: installs directly (Android/Chrome) or opens the install guide (iOS). */
export function InstallPwaButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const { canInstall, installed, isIOS, isStandalone, install } = usePwaInstall();
  const [open, setOpen] = useState(false);

  if (installed || isStandalone) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 border border-emerald-200">
        <Smartphone className="h-3.5 w-3.5" />
        مثبّت على الجهاز
      </span>
    );
  }

  const handleClick = async () => {
    const didPrompt = await install();
    if (!didPrompt) setOpen(true); // iOS / unsupported → show instructions
  };

  return (
    <>
      <Button
        onClick={handleClick}
        variant={variant}
        size="sm"
        className="gap-2 bg-amber-600 text-white hover:bg-amber-700 border-amber-600"
      >
        <Download className="h-4 w-4" />
        {isIOS ? "تثبيت على الآيفون" : "تثبيت التطبيق"}
      </Button>

      <InstallGuideDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Full install guide dialog (iOS Safari + Android Chrome + desktop + QR). */
export function InstallGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <QrCode className="h-5 w-5 text-amber-600" />
            ثبّت التطبيق بدون متجر
          </DialogTitle>
          <DialogDescription className="text-right">
            التطبيق يعمل كـ PWA — يمكن تثبيته مباشرة من المتصفح على أندرويد وآيفون بدون App Store أو Google Play.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-center">
            <UrlQrCode />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            افتح كاميرا الجوال وامسح الرمز لفتح التطبيق، ثم اتبع الخطوات أدناه للتثبيت.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Apple className="h-4 w-4" /> آيفون / آيباد (Safari)
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                <li>افتح التطبيق في متصفح Safari.</li>
                <li>اضغط زر المشاركة <Share className="inline h-3 w-3 mx-0.5" /> (المربع مع السهم).</li>
                <li>اختر <span className="font-medium text-foreground">«إضافة إلى الشاشة الرئيسية»</span>.</li>
                <li>اضغط <span className="font-medium text-foreground">«إضافة»</span> — سيظهر التطبيق كأيقونة على جوالك.</li>
              </ol>
            </div>

            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Smartphone className="h-4 w-4" /> أندرويد (Chrome)
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                <li>افتح التطبيق في Chrome.</li>
                <li>اضغط زر <span className="font-medium text-foreground">«تثبيت التطبيق»</span> في أعلى الصفحة.</li>
                <li>أو من قائمة <PlusCircle className="inline h-3 w-3 mx-0.5" /> اختر «تثبيت التطبيق» / «إضافة إلى الشاشة الرئيسية».</li>
                <li>أكد التثبيت — سيعمل بملء الشاشة تماماً كتطبيق أصلي.</li>
              </ol>
            </div>
          </div>

          <div className="rounded-lg border p-3 flex items-start gap-2 text-xs text-muted-foreground">
            <Monitor className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <span>
              على الكمبيوتر: اضغط أيقونة التثبيت <Download className="inline h-3 w-3" /> في شريط عنوان المتصفح (Chrome / Edge) ثم «تثبيت».
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Standalone guide section (embeddable anywhere). */
export function PwaInstallGuide() {
  const { isStandalone } = usePwaInstall();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <InstallPwaButton />
      <Button variant="link" size="sm" className="text-amber-700" onClick={() => setOpen(true)}>
        كيف أثبّته على الجوال؟
      </Button>
      <InstallGuideDialog open={open} onOpenChange={setOpen} />
      {isStandalone && (
        <p className="text-xs text-muted-foreground">أنت تستخدم النسخة المثبتة من التطبيق ✓</p>
      )}
    </div>
  );
}
