"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Smartphone } from "lucide-react";
import * as React from "react";
import dynamic from "next/dynamic";
import { InstallPwaButton, InstallGuideDialog } from "@/components/ppe/InstallPwa";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { OverviewTab } from "@/components/ppe/tabs/overview-tab";

// Heavy tab bundles (recharts / markdown / galleries) compile on demand — keeps the
// initial page compile small so the dev server stays within the machine's memory budget.
const TabLoading = () => (
  <div className="space-y-4">
    <Skeleton className="h-24 w-full rounded-xl" />
    <Skeleton className="h-40 w-full rounded-xl" />
    <Skeleton className="h-40 w-full rounded-xl" />
  </div>
);

const DatasetTab = dynamic(
  () => import("@/components/ppe/tabs/dataset-tab").then((m) => m.DatasetTab),
  { loading: () => <TabLoading /> }
);
const ExperimentsTab = dynamic(
  () => import("@/components/ppe/tabs/experiments-tab").then((m) => m.ExperimentsTab),
  { loading: () => <TabLoading /> }
);
const ErrorAnalysisTab = dynamic(
  () => import("@/components/ppe/tabs/error-analysis-tab").then((m) => m.ErrorAnalysisTab),
  { loading: () => <TabLoading /> }
);
const ReportTab = dynamic(
  () => import("@/components/ppe/tabs/report-tab").then((m) => m.ReportTab),
  { loading: () => <TabLoading /> }
);
const LiveDemoTab = dynamic(
  () => import("@/components/ppe/tabs/live-demo-tab").then((m) => m.LiveDemoTab),
  { loading: () => <TabLoading /> }
);

const TAB_KEYS = ["overview", "dataset", "experiments", "errors", "report", "demo"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "نظرة عامة" },
  { key: "dataset", label: "الداتاسيت" },
  { key: "experiments", label: "التجارب" },
  { key: "errors", label: "تحليل الأخطاء" },
  { key: "report", label: "التقرير التقني" },
  { key: "demo", label: "تجربة مباشرة" },
];

function FadeSlide({ tabKey, children }: { tabKey: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tabKey}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function AppShell() {
  const [tab, setTab] = React.useState<TabKey>("overview");
  const [installGuideOpen, setInstallGuideOpen] = React.useState(false);

  // support ?tab= deep-link (e.g. PWA shortcut ?tab=demo)
  React.useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    if (fromUrl && TAB_KEYS.includes(fromUrl)) setTab(fromUrl);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* header (sticky) */}
      <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <img src="/icon-192.png" alt="شعار نظام كشف معدات السلامة" className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-foreground sm:text-lg">
              نظام كشف معدات السلامة
            </h1>
            <p className="truncate text-[11px] text-muted-foreground sm:text-xs" dir="rtl">
              PPE Detection — خوذة | سديري
            </p>
          </div>
          <div className="shrink-0">
            <InstallPwaButton />
          </div>
        </div>
      </header>

      {/* main tabs */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 sm:py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} dir="rtl" className="flex flex-col gap-6">
          <TabsList className="h-auto w-full max-w-full overflow-x-auto custom-scroll gap-1 rounded-xl bg-muted p-1">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-amber-700 data-[state=active]:shadow-sm"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-0 focus-visible:outline-none">
            <FadeSlide tabKey="overview">
              <OverviewTab />
            </FadeSlide>
          </TabsContent>
          <TabsContent value="dataset" className="mt-0 focus-visible:outline-none">
            <FadeSlide tabKey="dataset">
              <DatasetTab />
            </FadeSlide>
          </TabsContent>
          <TabsContent value="experiments" className="mt-0 focus-visible:outline-none">
            <FadeSlide tabKey="experiments">
              <ExperimentsTab />
            </FadeSlide>
          </TabsContent>
          <TabsContent value="errors" className="mt-0 focus-visible:outline-none">
            <FadeSlide tabKey="errors">
              <ErrorAnalysisTab />
            </FadeSlide>
          </TabsContent>
          <TabsContent value="report" className="mt-0 focus-visible:outline-none">
            <FadeSlide tabKey="report">
              <ReportTab />
            </FadeSlide>
          </TabsContent>
          <TabsContent value="demo" className="mt-0 focus-visible:outline-none">
            <FadeSlide tabKey="demo">
              <LiveDemoTab />
            </FadeSlide>
          </TabsContent>
        </Tabs>
      </main>

      {/* footer (sticky bottom via flex + mt-auto) */}
      <footer className="mt-auto border-t bg-muted/40 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground">
          <p className="max-w-full">
            نظام كشف معدات السلامة — PPE Detection • يعمل بنموذج رؤية-لغوي مع تعلم داخل السياق • داتاسيت صور
            حقيقية من الويب
          </p>
          <button
            type="button"
            onClick={() => setInstallGuideOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            aria-label="فتح دليل تثبيت التطبيق على الجوال"
          >
            <Smartphone className="h-3.5 w-3.5" />
            ثبّته على جوالك
          </button>
        </div>
        <InstallGuideDialog open={installGuideOpen} onOpenChange={setInstallGuideOpen} />
      </footer>
    </div>
  );
}
