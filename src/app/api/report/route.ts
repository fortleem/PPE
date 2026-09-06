import { db } from "@/lib/db";
import { generateReport } from "@/lib/report";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/report — latest technical report */
export async function GET() {
  try {
    const report = await db.report.findFirst({ orderBy: { createdAt: "desc" } });
    if (!report) return Response.json({ report: null });
    return Response.json({ report: { id: report.id, content: report.content, createdAt: report.createdAt } });
  } catch (err) {
    console.error("[api/report GET]", (err as Error).message);
    return Response.json({ error: "تعذر جلب التقرير" }, { status: 500 });
  }
}

/** POST /api/report — regenerate the technical report */
export async function POST() {
  try {
    const result = await generateReport();
    return Response.json(
      {
        report: { id: result.id, content: result.content, createdAt: new Date().toISOString() },
        fallback: result.fallback,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[api/report POST]", (err as Error).message);
    return Response.json({ error: "تعذر توليد التقرير" }, { status: 500 });
  }
}
