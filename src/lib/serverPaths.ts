// Server-only filesystem paths (kept out of src/lib/ppe.ts which is client-safe)
import path from "path";

export const DATA_DIR = path.join(process.cwd(), "data", "dataset");
