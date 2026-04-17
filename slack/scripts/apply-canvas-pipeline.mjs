/**
 * Apply the canvas pipeline migration (0009_canvas_pipeline.sql).
 *
 * Usage:
 *   node scripts/apply-canvas-pipeline.mjs [POSTGRES_URL]
 *
 * Falls back to POSTGRES_URL env var if no argument given.
 */

import pg from "pg";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const url = process.argv[2] || process.env.POSTGRES_URL;
if (!url) {
  console.error("Usage: node apply-canvas-pipeline.mjs <POSTGRES_URL>");
  process.exit(1);
}

const sqlPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../drizzle/0009_canvas_pipeline.sql"
);
const sql = fs.readFileSync(sqlPath, "utf8");

const c = new pg.Client({ connectionString: url });
await c.connect();

for (const stmt of sql.split("--> statement-breakpoint")) {
  const s = stmt.trim();
  if (!s) continue;
  console.log("→", s.slice(0, 100));
  await c.query(s);
  console.log("  ✓");
}

// Verify
const { rows } = await c.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'canvases' ORDER BY ordinal_position`
);
console.log("\ncanvases columns after migration:");
for (const r of rows) console.log(" ", r.column_name);

const { rows: constraints } = await c.query(`
  SELECT conname FROM pg_constraint
  WHERE conrelid = 'canvases'::regclass AND conname LIKE '%channel_id_unique%'
`);
if (constraints.length === 0) {
  console.log("\n✓ channelId unique constraint successfully removed");
} else {
  console.warn("\n⚠ channelId unique constraint still exists:", constraints);
}

await c.end();
