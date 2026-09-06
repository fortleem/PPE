# PPE Detector — نظام كشف معدات السلامة

An end-to-end **PPE (Personal Protective Equipment) compliance detection system**: it classifies workers in real photos into the four classes **Helmet / No Helmet / Safety Vest / No Vest**, ships with a **real collected dataset (111 images)**, runs **zero-shot vs few-shot vs many-shot experiments**, performs **automatic error-cause analysis**, generates an **Arabic technical report**, and installs as an app on **Android and iOS without any app store** (PWA).

> **Live deployment:** https://ppe-smart.vercel.app (Vercel + Turso) — screenshots in [`docs/screenshots/`](docs/screenshots).

> نظام متكامل يكشف التزام معدات السلامة (خوذة / سديري) في صور حقيقية، مع داتاسيت مجمّعة من الويب، ومقارنة أداء بين عدد قليل وكبير من الأمثلة، وتحليل لأسباب الأخطاء، وتقرير تقني بالعربية — وقابل للتثبيت على الجوال بدون متجر تطبيقات.

---

## Results snapshot

Fixed stratified test split, fair comparison across modes (the "model" is a vision-language model doing in-context learning with labeled example images inside the prompt):

| Mode | Context examples | Test n | Exact match | Helmet acc | Vest acc | Macro-F1 | Latency p50 |
|---|---|---|---|---|---|---|---|
| Zero-shot | 0 | 19 | 94.7 % | 100 % | 94.7 % | **0.971** | ~1.4 s |
| Few-shot | 8 (2 per class) | 19 | 94.7 % | 100 % | 94.7 % | **0.971** | ~2.5 s |
| Many-shot | 24 (6 per class) | 19 | 94.7 % | 100 % | 94.7 % | **0.971** | ~4.6 s |

**Key findings**

- The **helmet attribute is classified perfectly** on the test set in all three modes.
- The **single residual error is the same image in every mode**: an orange *non-reflective* jacket predicted as a hi-vis vest. The automated error analysis labels it **`label_noise`** (ground-truth issue, not a model issue) — it can be corrected in one click from the Dataset tab.
- **Few vs many:** on this test set all three modes converge to the **same scores** (ceiling effect with 19 test images) — context examples brought no measurable accuracy gain over zero-shot, while **latency grows with context size** (more in-prompt images); the many-shot average is further skewed by one rate-limit retry outlier (p95 ≈ 311 s).
- Full metrics (per-class precision/recall/F1, 2×2 and 4×4 confusion matrices, latency percentiles, per-error explanations) are in the app under **التجارب** and **تحليل الأخطاء**, and the complete Arabic technical report under **التقرير التقني**.

## How it works

- **4 classes via 2 binary attributes** — each image is labeled with `hasHelmet` / `hasVest`; the four combinations (TT/TF/FT/FF) are exactly the four classes, evaluated one-vs-rest.
- **Ground truth = weak supervision + human review** — a strict-prompt VLM pass annotates every collected image (a *hard* helmet, not a cap; a *reflective hi-vis* vest, not any orange clothing), flags intent conflicts (e.g. a "no helmet" query returning helmeted workers), and the UI lets you correct any label manually (`gtConfidence: human`).
- **Classification = in-context learning** — the prompt embeds K labeled example images per class (K=0/2/6) followed by the test image; the VLM answers strict JSON `{ helmet, vest, reasoning }`.
- **Metrics** — per-class P/R/F1 (one-vs-rest), Macro-F1, exact match, per-attribute accuracy, 2×2 + 4×4 confusion, latency percentiles.
- **Error analysis** — an LLM assigns every wrong attribute to one of **9 causes** (multiple workers, small subject, occlusion, lookalike, lighting, no worker, label noise, ambiguous, other) with an Arabic explanation per error.

## Dataset

- **111 real web images** collected via 16 search queries across 4 themes (helmet / no-helmet / vest / no-vest), normalized to ≤1280 px JPEG, MD5-deduplicated.
- Distribution: helmet 77 / no-helmet 34 · vest 78 / no-vest 33 · combos TT 48, TF 29, FT 30, FF 4.
- **Stratified split:** 92 train (context pool) / **19 test** (fixed for all experiments).
- Ships with the repo: `data/dataset/` (images) + `db/custom.db` (labels, flags, experiments, predictions, report).

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma + SQLite (local) / Turso libsql (production, driver adapter) · **z-ai-web-dev-sdk** (vision LLM for annotation & classification, text LLM for error analysis & report) · sharp (image pipeline + icon generation) · recharts · react-markdown + remark-gfm · PWA service worker.

## Run locally

```bash
bun install
cp .env.example .env      # DATABASE_URL=file:../db/custom.db
bun run dev               # http://localhost:3000
```

The repo already contains the collected dataset, all experiment results and the generated report, so the app is fully populated out of the box. To start from an empty database instead: delete `db/custom.db`, then run `bun run db:push`.

Optional scripts:

```bash
bun scripts/collect-dataset.ts   # re-collect + annotate dataset (resumable, rate-limited)
bun scripts/gen-pwa-icons.ts     # regenerate PWA icons from public/logo.svg
bun run lint
```

## Production deployment (Vercel + Turso)

The app is deployed at **https://ppe-smart.vercel.app** (connected to this repository via the Vercel GitHub integration) with **Turso** (libsql) as the remote database:

- `DATABASE_URL` = `libsql://…turso.io` and `TURSO_AUTH_TOKEN` switch the Prisma client to the **libsql driver adapter** automatically (no code change between local and production).
- Dataset images ship in `public/dataset/` and are served from the CDN; image lookups degrade gracefully: local file → in-memory → DB base64 → static CDN.
- The AI SDK config is injected at runtime via the `ZAI_CONFIG_JSON` env var (materialized to `/tmp/.z-ai-config` on serverless).
- Uploads on the read-only serverless filesystem are stored base64-encoded in the database.

```bash
# seed the remote database from the local file DB
bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > data/tmp/turso-schema.sql
DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" bun scripts/turso-setup.ts    # schema + data
DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" bun scripts/turso-check.ts    # verify via the adapter
```

## Install as an app — no store needed

The app is a full PWA (manifest + service worker + offline app shell):

- **Android (Chrome):** open the site → tap the **تثبيت التطبيق** button in the header, or Chrome menu ⋮ → *Install app*.
- **iOS (Safari):** open the site → Share button → **Add to Home Screen**.
- The installed app launches standalone (no browser UI) and its shell keeps working offline.

## Project structure

```
data/dataset/            111 collected images (the dataset)
db/custom.db             SQLite: labels, splits, experiments, predictions, report
prisma/schema.prisma     DatasetImage / Prediction / Experiment / Report
scripts/collect-dataset.ts   resumable collection + VLM annotation pipeline
scripts/gen-pwa-icons.ts     PWA icon generator (sharp)
src/app/page.tsx         single-page RTL Arabic dashboard
src/components/ppe/      app shell, 6 tabs, PWA install/registration
src/components/ui/       shadcn/ui component set
src/app/api/             stats, dataset(+[id]), media/[id], experiments(+[id], analyze), report, classify
src/lib/                 ppe (constants) · vlm (prompts + SDK) · metrics · runner · errorAnalysis · report
public/                  manifest.json, sw.js, icons
```

## API reference

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/stats` | dataset stats, best experiment, report status |
| GET / POST | `/api/dataset` | list/filter/paginate images · upload (≤6 files, auto-annotated) |
| PATCH / DELETE | `/api/dataset/[id]` | human ground-truth correction · delete image |
| GET | `/api/media/[id]` | stream image JPEG |
| GET / POST | `/api/experiments` | list experiments · start new run(s) by mode |
| GET | `/api/experiments/[id]` | experiment details + predictions + context thumbnails |
| POST | `/api/experiments/[id]/analyze` | run automated error analysis |
| GET / POST | `/api/report` | read · regenerate the technical report |
| POST | `/api/classify` | live demo: classify one image in a chosen mode |

## Notes & limitations

- Ground truth is VLM-annotated weak supervision with intent-conflict flags and a human-correction UI — this is stated honestly in the in-app technical report.
- The test set is small (19 images), so differences of one image move metrics by ~5 points; the few-vs-many comparison should be read with that in mind.
- Collection is rate-limited and resumable by design (search cache + failed-URL list + completion sentinel in `data/`).
- Images were collected from the web for research/educational purposes.

---

## التوثيق بالعربية

**نظام كشف معدات السلامة (PPE)** يصنّف العمال في صور حقيقية إلى أربع كلاسات: **خوذة / بدون خوذة / سديري عاكس / بدون سديري** — عبر سمتين ثنائيتين لكل صورة.

- **الداتاسيت:** 111 صورة حقيقية من الويب (16 استعلامًا في 4 محاور)، مُطبَّعة ومُزالة التكرار، مع توسيم VLM ببرومبت صارم + أعلام تعارض القصد + تصحيح بشري من الواجهة، وتقسيم طبقي 92 تدريب / 19 اختبار **ثابتة**.
- **التجارب:** مقارنة zero-shot (بلا أمثلة) مع few-shot (8 أمثلة موسومة داخل البرومبت) مع many-shot (24 مثالًا) على نفس مجموعة الاختبار.
- **النتائج:** F1 الكلي ~0.97 في الأوضاع الثلاثة، والخوذة مثالية 100%، والخطأ الوحيد المتبقي مصنَّف **ضوضاء تسمية** (سترة برتقالية غير عاكسة) وليس خطأ نموذج. زيادة الأمثلة فوق 8 لم تُضف دقة إضافية لكنها رفعت زمن الاستجابة.
- **تحليل الأخطاء:** كل خطأ يُصنَّف آليًا إلى واحدة من 9 فئات سبب مع تفسير عربي لكل حالة.
- **التقرير التقني:** يُولَّد آليًا داخل التطبيق (تبويب «التقرير التقني») ويغطي المنهجية والنتائج والتحليل والتوصيات.
- **التثبيت بدون متجر:** أندرويد من كروم (زر «تثبيت التطبيق») و iOS من سفاري (مشاركة ← إضافة إلى الشاشة الرئيسية) — يعمل كتطبيق مستقل مع دعم عمل دون اتصال.

**التشغيل:** `bun install` ثم `cp .env.example .env` ثم `bun run dev` — والمستودع يتضمن الداتاسيت والنتائج والتقرير جاهزة.
