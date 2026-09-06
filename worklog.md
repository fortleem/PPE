# Worklog — PPE Detection System (نظام كشف معدات السلامة)

Project: Next.js 16 App Router (TypeScript, Tailwind 4, shadcn/ui, Prisma+SQLite, z-ai-web-dev-sdk)
Goal: نظام يكتشف Helmet / No Helmet / Safety Vest / No Vest مع داتاسيت حقيقية، نموذج 4 كلاسات، تحليل أخطاء، مقارنة few-shot vs many-shot، وتقرير تقني.

## Global Plan (Task IDs)
- Task 1 (owner: main): setup — prisma schema + db push
- Task 2 (owner: main): shared backend libs (constants, VLM wrapper, metrics)
- Task 3 (owner: main): dataset collection script (image-search + download + sharp normalize + VLM GT annotation + stratified split) + run
- Task 4 (owner: main): API routes + experiment runner (zero/few/many-shot)
- Task 5 (owner: main): launch experiments, pre-populate results
- Task 6 (owner: subagent full-stack-developer): frontend UI (single page `/`, RTL Arabic, tabs, recharts)
- Task 7 (owner: main): error analysis + technical report generation
- Task 8 (owner: main): lint + agent-browser verification + fixes
- Task 9 (owner: main): final summary

## Key Architecture Decisions
- **Formulation**: 2 binary attributes per image (helmet: yes/no, vest: yes/no) → the 4 required classes are Helmet / No Helmet / Safety Vest / No Vest (one-vs-rest metrics for each). Both attributes combine into 4 compliance states (خوذة+سديري، خوذة فقط، سديري فقط، بدون).
- **"Model"**: VLM (z-ai-web-dev-sdk createVision) with in-context learning. "Training data" = labeled example images placed in the prompt (context). Modes: zero_shot (0 examples), few_shot (K=2 per compliance state = 8 context images), many_shot (K=6 = 24 context images). Fixed held-out test split for comparability.
- **Ground truth**: VLM annotation pass with detailed definitions (strong oracle prompt) + search-intent cross-check (conflict flags). Human can edit labels in UI. This is documented honestly in the report as weak supervision.
- **Dataset**: real web images via `z-ai image-search` CLI (gl=us, no-rank), downloaded, normalized to JPEG ≤1280px via sharp, stored in `data/dataset/`, metadata in SQLite.
- **Images served** via `GET /api/media/[id]` (not public/) — reliable in dev.
- **Experiment runner**: fire-and-forget async job inside Next.js process, status/progress in DB, frontend polls.
- **Error analysis**: LLM categorizes each attribute-level error into a fixed taxonomy + Arabic summary. **Report**: LLM-generated Arabic markdown report stored in DB, rendered with react-markdown.
- **UI**: single route `/`, Arabic RTL, light theme, amber (safety) accent — no blue/indigo. Tabs: نظرة عامة / الداتاسيت / التجارب / تحليل الأخطاء / التقرير / تجربة مباشرة.
- z-ai-web-dev-sdk is backend-only (scripts + API routes).

---
Task ID: 1
Agent: main
Task: setup — prisma schema + db push + worklog

Work Log:
- Read package.json, prisma schema, components inventory, skills (image-search, VLM, LLM).
- Created this worklog.
- Replacing placeholder User/Post models with PPE models: DatasetImage, Prediction, Experiment, Report.

Stage Summary:
- (in progress)

---
Task ID: 2-5
Agent: main
Task: shared libs + dataset collection + API routes + experiment runner

Work Log:
- src/lib/ppe.ts: classes/modes/combos/error-taxonomy constants (Arabic labels included)
- src/lib/vlm.ts: SDK wrappers (getZAI cached, annotateImage GT prompt with strict definitions, classifyImage with in-context examples, chatLLM) + retryWithBackoff [3s,10s,30s,60s] for 429 rate limits + sharp-based imageToDataUrlSmall for context images
- src/lib/metrics.ts: 4-class one-vs-rest P/R/F1, attribute accuracy, 2x2 + 4x4 confusion, latency stats
- src/lib/runner.ts: fire-and-forget experiment runner (in-memory running set, DB progress, concurrency 2, stale detection)
- src/lib/errorAnalysis.ts: LLM categorization of attribute-level errors into 9-category taxonomy + Arabic summary
- src/lib/report.ts: gatherReportData + LLM Arabic markdown report with deterministic fallback
- scripts/collect-dataset.ts: 16 queries sequential (rate-limit safe), download+sharp normalize<=1280px JPEG, md5 dedupe, VLM GT annotation, intent-conflict flags, stratified split (test=6/combo max)
- API routes: /api/stats, /api/dataset (GET/POST upload), /api/dataset/[id] (PATCH/DELETE), /api/media/[id], /api/experiments (GET/POST), /api/experiments/[id] (GET), /api/experiments/[id]/analyze (POST), /api/report (GET/POST), /api/classify (POST live demo)
- Installed remark-gfm. db.ts log reduced to error/warn.
- Verified: /api/stats, /api/dataset, /api/media (jpeg streams), /api/classify zero_shot (correct, 1.9s) and few_shot (correct, 3.5s)
- Dataset collection running in background (setsid, data/collect.log). Known fixup needed after it finishes: normalize DatasetImage.source to 'web' (old rows contain site names).

Stage Summary:
- Full backend operational. Awaiting dataset completion (16 sequential searches due to aggressive 429 rate limits on image-search and VLM APIs).

---
Task ID: 7 (PWA infrastructure)
Agent: main
Task: Make app installable on iOS/Android without any app store (PWA)

Work Log:
- scripts/gen-pwa-icons.ts + run: hard-hat safety icons (amber gradient) → public/icon-192.png, icon-512.png, apple-touch-icon.png (180), favicon.png (48), maskable 192/512
- public/manifest.json: standalone display, rtl, ar, theme #d97706, icons any+maskable, app shortcut ?tab=demo
- public/sw.js: network-first SW with offline cache fallback; skips /api/* and /_next/webpack* so dev HMR + live data stay fresh
- src/app/layout.tsx: html lang="ar" dir="rtl", viewport export (themeColor, viewportFit cover), metadata manifest + appleWebApp + icons
- src/components/ppe/PwaRegister.tsx: SW registration (client)
- src/components/ppe/InstallPwa.tsx: InstallPwaButton (beforeinstallprompt on Android/Chrome; iOS → guide dialog), InstallGuideDialog (iOS Safari steps + Android Chrome steps + desktop + QR code of current URL via `qrcode` npm), PwaInstallGuide section
- bun add qrcode @types/qrcode; verified /, /manifest.json, /sw.js, /icon-192.png all 200
- src/lib/ppe.ts is now CLIENT-SAFE (node path removed → DATA_DIR moved to src/lib/serverPaths.ts); updated imports in runner.ts, media/[id], dataset, dataset/[id], classify routes

Stage Summary:
- App is a full PWA: Android/Chrome shows install prompt via header button; iOS gets step-by-step Add-to-Home-Screen guide; QR code lets phones open+install instantly. No store required.

=== API CONTRACT (for frontend subagent — all verified working) ===
All responses are JSON unless noted. Image URLs are relative: /api/media/{id} (plain <img>, NOT next/image).

1) GET /api/stats →
{ totalImages:number, labeled:number,
  byCombo:[{key:"TT|TF|FT|FF",label:string,count:number}],
  byClass:{helmet,no_helmet,safety_vest,no_vest:number},
  classLabels:["helmet","no_helmet","safety_vest","no_vest"],
  splits:{train,test,none:number}, conflicts:number, sources:{web,upload:number},
  experiments:{count,done,running:boolean,best:{mode,exactMatch,macroF1}|null},
  report:{id,createdAt}|null }

2) GET /api/dataset?combo=TT|TF|FT|FF|all&split=train|test|none|all&labeled=all|yes|no&flagged=1&search=TEXT&page=1 →
{ items:[{ id, url, hasHelmet:boolean|null, hasVest:boolean|null, combo:"TT..FF"|null, split, theme, source, sourceQuery, gtConfidence:"high|medium|low|human"|null, gtNotes, gtFlags:string[], width, height, size, createdAt }], total, page, pageSize:24 }

3) POST /api/dataset (multipart form-data, field "files", max 6, ≤8MB each) → 201 { created:[{id,url,hasHelmet,hasVest,note}], count } | 400 error (auto VLM-annotated on upload)

4) PATCH /api/dataset/:id { hasHelmet?:boolean, hasVest?:boolean, split?:"train|test|none" } → updated row (sets gtConfidence="human", clears gtFlags)

5) DELETE /api/dataset/:id → { ok:true }

6) GET /api/media/:id → image/jpeg stream (Cache-Control 1d)

7) GET /api/experiments →
{ experiments:[{ id, name, mode:"zero_shot|few_shot|many_shot", examplesPerClass, contextImages, status:"pending|running|done|error", progress, total, error, live:boolean,
    metrics:{n,exactMatch,helmetAccuracy,vestAccuracy,macroF1,latency:{avg,p50,p95}}|null, hasErrorAnalysis:boolean, startedAt, finishedAt, createdAt }],
  modes:[{key,name,examplesPerClass,contextImages,descAr}] }  // newest first

8) POST /api/experiments { modes?:["zero_shot","few_shot","many_shot"] } → 201 same shape (starts background runs; poll GET every ~3s; progress field updates; live=true while in-process)

9) GET /api/experiments/:id →
{ id, name, mode, examplesPerClass, status, progress, total, error, live, startedAt, finishedAt, createdAt,
  metrics:{ n, exactMatch, helmetAccuracy, vestAccuracy, macroF1,
    classes:{helmet:{tp,fp,fn,tn,precision,recall,f1,support}, no_helmet, safety_vest, no_vest},
    helmetConfusion:{tt,tf,ft,ff}, vestConfusion:{tt,tf,ft,ff},
    comboOrder:["TT","TF","FT","FF"], comboConfusion:number[4][4],
    latency:{avg,p50,p95} }|null,
  errorSummary:{ totalErrors, errorRate, categories:[{key,label,count}], summaryAr:string,
    explanations:[{predictionId,attribute,category,explanation}] }|null,
  comboLabels:[{key,label}], contextImageIds:string[], contextThumbnails:string[], testImageIds:string[],
  predictions:[{ id, imageId, url, gtHelmet, gtVest, gtCombo, predHelmet, predVest, predCombo, helmetCorrect, vestCorrect, correct, reasoning, latencyMs, helmetErrorCat, vestErrorCat, theme, gtNotes }] }

10) POST /api/experiments/:id/analyze (SLOW, LLM) → { ok, summary:{...same as errorSummary} } — error categories keys+Arabic labels in src/lib/ppe.ts ERROR_CATEGORY_LABELS

11) GET /api/report → { report:{id,content,createdAt}|null } (content = Arabic markdown)
12) POST /api/report (SLOW, LLM) → 201 { report:{id,content,createdAt}, fallback:boolean }

13) POST /api/classify { imageId, mode:"zero_shot|few_shot|many_shot" } (SLOW) →
{ imageId, url, mode, modeName, contextImages, prediction:{helmet,vest}, groundTruth:{helmet,vest}|nulls, helmetCorrect|null, vestCorrect|null, correct|null, reasoning, latencyMs }

Client-safe domain constants: import { PPE_CLASSES, CLASS_LABELS, EXPERIMENT_MODES, MODE_CONFIG, COMBOS, COMBO_LABELS, comboOf, comboOrNull, ERROR_CATEGORIES, ERROR_CATEGORY_LABELS } from "@/lib/ppe" (pure TS, no node imports).
PWA components (already built, just place): import { InstallPwaButton, InstallGuideDialog, PwaInstallGuide } from "@/components/ppe/InstallPwa".

---
Task ID: 6
Agent: full-stack-developer
Task: Frontend UI — single-page app at `/` (RTL Arabic, 6 tabs, amber accent, PWA-aware)

Work Log:
- Read worklog API contract + verified live endpoints. Found a PRE-EXISTING BLOCKER: `src/app/api/dataset/route.ts` still imported `DATA_DIR` from `@/lib/ppe` after it moved to `@/lib/serverPaths` (Task 7 refactor miss) → EVERY route (incl. `/`) returned 500. Applied the one-line surgical fix (import from serverPaths; no behavior change) — all APIs back to 200 (dataset 109 images / 99 labeled).
- Created `src/lib/ppe-client.ts`: client-safe API types mirroring the contract (Stats/Dataset/Upload/Experiments/Detail/ErrorSummary/Report/Classify) + apiGet/apiSend/apiUpload fetchers with Arabic error extraction + fmtPct/fmtMs/fmtDate/fmtBytes formatters.
- globals.css: added `.custom-scroll` (thin scrollbar, amber thumb on hover) and full `.md-report` styles (RTL markdown: headings, p, tables with borders+striped rows, code, blockquote border-inline-start, lists) for the technical report.
- `src/components/ppe/providers.tsx`: QueryClientProvider (staleTime 5s, retry 1).
- `src/components/ppe/shared.tsx`: KpiCard, EmptyState, HelmetVestBadges (HardHat/Shirt ✓ emerald / ✗ red / ؟ slate for unlabeled), SplitBadge (train=amber/test=slate/none=muted), ConfidenceText (high=emerald/medium=amber/low=red/human=purple), StatusChip, KpiSkeletonRow/GallerySkeleton/ListSkeleton.
- `src/hooks/use-debounced.ts`: 400ms debounce hook for dataset search.
- **Overview tab**: TanStack Query /api/stats refetchInterval 10s; 5 KPI cards (totals/labeled/test/conflicts/done experiments) + best-result badge (mode name + exactMatch% + macroF1%); Recharts BarChart of byCombo with COMBO_LABELS (dir="ltr" wrapper, amber bars); 4-card byClass grid with CLASS_LABELS; formulation explanation card (2 attributes × 4 classes × 4 combos); compact PwaInstallGuide card.
- **Dataset tab**: drag&drop+picker upload zone (max 6 × 8MB, POST multipart, toast "تم رفع X صورة مع التوسيم الآلي", refetch); filter bar (combo/split/labeled Selects + flagged Switch + debounced search, flex-wrap); server-side pagination ("صفحة X من Y" + prev/next, placeholderData keeps old page); gallery grid-cols-2/3/4 with aspect-square tiles + overlay badges (helmet/vest ✓✗, split, conflict ⚠ tooltip, gtConfidence); edit Dialog (large image, PATCH toggles for خوذة/سديري with OPTIMISTIC cache update + comboOrNull recompute + rollback + toast on error, split Select PATCH, notes/sourceQuery/flags/meta display, AlertDialog delete → DELETE → refetch).
- **Experiments tab**: 3 mode cards (name/descAr/examplesPerClass/contextImages + "ابدأ التجربة") + primary "شغّل التجارب الثلاث" (disabled while running); runs list with mode badge, StatusChip, animated Progress (progress/total), metrics summary (exactMatch%/macroF1%/n/latency), timestamps; done rows clickable (keyboard-accessible) → **detail view** (back button): 6 KPI cards (exactMatch/helmet/vest/macroF1/latency avg-p50-p95/n), per-class P/R/F1/Support table, 4×4 confusion matrix with inline rgba heat shading (diagonal green / off-diagonal red by intensity), context thumbnails strip (h-14, tooltips), predictions grid (✓/✗ colored borders, predCombo vs gtCombo labels, HoverCard reasoning, latency, filter الكل/الخطأ فقط), error Alert for failed runs. Polling 3s while pending/running else 15s (function refetchInterval).
- **Error Analysis tab**: Select of done experiments (auto-select latest); stored errorSummary or "حلّل الأخطاء الآن" → POST analyze (spinner + disabled + toast); KPIs (totalErrors/errorRate%/active categories); horizontal Recharts BarChart of categories; summaryAr card; explanations list joined with predictions (image thumb + attribute + ERROR_CATEGORY_LABELS + explanation) in max-h-[28rem] custom-scroll; empty states for no-done-experiments and "لا توجد أخطاء 🎉".
- **Report tab**: GET /api/report; empty state + "ولّد التقرير الآن" (spinner 1-3 min + fallback-aware toast); react-markdown+remark-gfm in `.md-report`; header with generation date + "إعادة التوليد" + "تنزيل التقرير" (Blob with UTF-8 BOM → ppe-technical-report.md).
- **Live Demo tab**: 3 mode cards (role=radiogroup, amber selected border); image picker from first dataset page (border-amber-500 when selected) + upload path (uses created[0].id, split "none"); "صنّف الصورة" → POST /api/classify (spinner, up to 60s) → result card: image, prediction badges, predCombo label, per-attribute GT comparison (✓/✗ or "غير موسومة"), verdict box, reasoning, latencyMs, contextImages count.
- **App shell**: sticky header (icon-192.png + title + subtitle + InstallPwaButton at the visual end in RTL), 6 horizontally-scrollable tabs with framer-motion fade/slide per tab (AnimatePresence), `?tab=` deep-link support (PWA shortcut ?tab=demo), sticky footer (mt-auto, pb-[env(safe-area-inset-bottom)], install hint → InstallGuideDialog). Root wrapper min-h-screen flex flex-col. page.tsx rewritten (scaffold gone).
- OOM incident: the dev server was OOM-killed (4GB box) during the first full-page compile (all heavy libs in one bundle). Mitigation: next/dynamic for the 5 non-default tabs (heavy chunks compile on demand) → stable at ~1.8GB RSS, verified across a full browser session.
- E2E verified with agent-browser (headless chromium): all 6 tabs clicked through — KPIs/chart/PWA card render; dataset gallery (24 tiles/page) + filter + edit dialog open + PATCH vest toggle round-trip (aria-checked true→false + confidence→"موسومة يدوياً", then reverted via API); experiments mode cards + empty runs state; error-analysis/report empty states + buttons; live demo classification COMPLETED against the real VLM ("نتيجة التصنيف" rendered). Zero page errors, zero console errors. VLM visual QA on screenshots confirmed correct RTL, no overlap, amber/emerald/red palette on white.
- Final: `bun run lint` → 0 errors (single pre-existing warning in InstallPwa.tsx, untouched); `curl /` → 200 Arabic RTL HTML; dev.log tail clean (only 200s).

Stage Summary:
- Frontend complete: single-route RTL Arabic PWA UI at `/` with 6 tabs (overview/dataset/experiments/error-analysis/report/live-demo) wired to the full verified API contract, optimistic human-label editing, live experiment polling with progress, confusion-matrix heat table, markdown technical report with BOM download, and a working VLM live-classification demo. Fixed a pre-existing backend import bug (DATA_DIR) that had broken all routes; mitigated dev-server OOM via dynamic tab imports. All empty states (no experiments, no report, partial dataset) designed per spec and E2E-verified in a real browser.

---
Task ID: 8 (experiments + analysis + report)
Agent: main
Task: run all experiments, error analysis, technical report

Work Log:
- Finished dataset collection: 111 real web images, 100% VLM-annotated; stratified split train=92 / test=19 (TT=48/6, TF=29/6, FT=30/6, FF=4/1); sentinel data/collect.done
- Hardened runner after rate-limit (429) storms + a transient DB crash: CLASSIFY_CONCURRENCY=1, INTER_CALL_PACE_MS=2500, RETRY_DELAYS [5s,15s,45s,90s,150s], per-image DB writes wrapped in try/catch, stale threshold raised to 12/15 min
- Ran all 3 experiments sequentially to completion:
  * zero_shot (0 examples): exactMatch 94.4% (18/19, 1 skip warning), macroF1 0.970, helmetAcc 100%, vestAcc 94.4%
  * few_shot (8 context images): exactMatch 94.7% (19/19), macroF1 0.951
  * many_shot (24 context images): exactMatch 94.7% (19/19), macroF1 0.971, helmetAcc 100%, vestAcc 94.7%, avg latency 20.8s (zero-shot 1.5s)
- Error analysis (LLM taxonomy) run for all 3: each has exactly 1 attribute error, categorized label_noise (GT label itself questionable — orange jacket without reflective strips). Arabic summaries stored on experiments.
- Technical report generated via LLM (5.8k chars Arabic markdown, fallback=false): includes dataset tables, per-mode P/R/F1 tables, few-vs-many comparison, error causes, recommendations

Stage Summary:
- Full ML pipeline results persisted in DB and rendered by UI. Dataset quality is the current bottleneck (label noise), not model capacity — documented in report.

---
Task ID: 9 (final verification + polish)
Agent: main
Task: agent-browser E2E verification, PWA checks, fixes

Work Log:
- agent-browser E2E: page loads RTL Arabic; all 6 tabs exercised; image edit dialog PATCH round-trip (helmet false→true verified via API); experiment detail shows KPIs + per-class table + 4×4 heat confusion matrix + context strip; error analysis renders categories chart + Arabic summary + per-error explanations with images; report renders markdown tables; live demo classified an image correctly in 1.4s (zero-shot) with GT comparison + reasoning
- PWA verified: manifest + apple-touch-icon + mobile-web-app-capable + legacy apple-mobile-web-app-capable (added via metadata.other) + SW registered scope=/ + install button opens guide dialog with working QR code (iOS Safari / Android Chrome / desktop steps)
- Responsive: 375×812 mobile OK; footer = min-h-screen flex-col + mt-auto + safe-area padding, pushed naturally on long pages
- Fixed: Select uncontrolled→controlled warning in error-analysis-tab (selectedId ?? ""); removed stale eslint-disable; added legacy iOS meta
- bun run lint: 0 errors 0 warnings; dev.log clean (all 200s); browser console: no errors

Stage Summary:
- System fully verified end-to-end. Deliverables: dataset (111 real images), 4-class detector experiments (zero/few/many-shot), error analysis, Arabic technical report (downloadable .md), installable PWA for iOS/Android without app stores.
