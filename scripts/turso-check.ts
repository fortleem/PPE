// Verify the production database path (Prisma + libsql driver adapter → Turso).
//
// Usage:
//   DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." bun scripts/turso-check.ts
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("libsql://")) {
  console.error("Set DATABASE_URL (libsql://...) and TURSO_AUTH_TOKEN first");
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaLibSQL({ url, authToken: process.env.TURSO_AUTH_TOKEN }),
});

async function main() {
  const images = await db.datasetImage.count();
  const labeled = await db.datasetImage.count({ where: { hasHelmet: { not: null } } });
  const test = await db.datasetImage.count({ where: { split: "test" } });
  const experiments = await db.experiment.findMany({
    where: { status: "done" },
    select: { mode: true, examplesPerClass: true, metricsJson: true },
  });
  const predictions = await db.prediction.count();
  const report = await db.report.findFirst({ orderBy: { createdAt: "desc" } });
  const sample = await db.datasetImage.findFirst({
    where: { split: "test" },
    select: { id: true, filename: true, hasHelmet: true, hasVest: true },
  });

  console.log(
    JSON.stringify(
      {
        images,
        labeled,
        test,
        doneExperiments: experiments.length,
        modes: experiments.map((e) => e.mode),
        predictions,
        reportLength: report?.content.length ?? 0,
        sample,
      },
      null,
      2
    )
  );
  await db.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("CHECK FAILED:", err);
    process.exit(1);
  });
