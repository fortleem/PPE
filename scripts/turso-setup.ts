// Push the schema + full seed data (dataset, experiments, predictions, report)
// from the local SQLite file to the Turso remote database.
//
// Usage:
//   DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." bun scripts/turso-setup.ts
import fs from "fs/promises";
import path from "path";
import { Database } from "bun:sqlite";
import { createClient } from "@libsql/client";

const TURSO_URL = process.env.DATABASE_URL ?? "";
const TOKEN = process.env.TURSO_AUTH_TOKEN ?? "";
const LOCAL_DB = process.env.LOCAL_DB ?? path.join(process.cwd(), "db", "custom.db");
const SCHEMA_SQL = path.join(process.cwd(), "data", "tmp", "turso-schema.sql");

if (!TURSO_URL.startsWith("libsql://") || !TOKEN) {
  console.error("Set DATABASE_URL (libsql://...) and TURSO_AUTH_TOKEN first");
  process.exit(1);
}

const turso = createClient({ url: TURSO_URL, authToken: TOKEN });

function readTable(db: Database, table: string): Record<string, unknown>[] {
  const rows = db.query(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
  return rows;
}

async function execStatements(sqlText: string): Promise<void> {
  // strip comments then split statements on ";\n" (prisma emits one stmt per line group)
  const statements = sqlText
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.toUpperCase().startsWith("PRAGMA"));
  for (const stmt of statements) {
    await turso.execute(stmt);
  }
  console.log(`applied ${statements.length} schema statements`);
}

async function insertTable(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) {
    console.log(`${table}: 0 rows`);
    return;
  }
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const placeholders = cols.map(() => "?").join(", ");
  const sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;

  const BATCH = 25;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({
      sql,
      args: cols.map((c) => r[c] as unknown),
    }));
    await turso.batch(batch, "write");
  }
  console.log(`${table}: inserted ${rows.length} rows`);
}

async function main() {
  const local = new Database(LOCAL_DB, { readonly: true });

  // 1. create schema (idempotent-ish: drop then recreate)
  console.log("== schema ==");
  try {
    await turso.execute('DROP TABLE IF EXISTS "Prediction"');
    await turso.execute('DROP TABLE IF EXISTS "Experiment"');
    await turso.execute('DROP TABLE IF EXISTS "Report"');
    await turso.execute('DROP TABLE IF EXISTS "DatasetImage"');
  } catch (err) {
    console.warn("drop skipped:", (err as Error).message);
  }
  const schemaSql = await fs.readFile(SCHEMA_SQL, "utf-8");
  await execStatements(schemaSql);

  // 2. copy data in FK-safe order
  console.log("== data ==");
  await insertTable("DatasetImage", readTable(local, "DatasetImage"));
  await insertTable("Experiment", readTable(local, "Experiment"));
  await insertTable("Prediction", readTable(local, "Prediction"));
  await insertTable("Report", readTable(local, "Report"));

  // 3. verify
  console.log("== verify ==");
  for (const t of ["DatasetImage", "Experiment", "Prediction", "Report"]) {
    const r = await turso.execute(`SELECT COUNT(*) AS n FROM "${t}"`);
    console.log(`${t}: ${JSON.stringify(r.rows[0])}`);
  }
  local.close();
}

main()
  .then(() => {
    console.log("DONE");
    process.exit(0);
  })
  .catch((err) => {
    console.error("FAILED:", err);
    process.exit(1);
  });
