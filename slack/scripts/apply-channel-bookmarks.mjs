/**
 * Apply channel bookmarks migration (0010_channel_bookmarks.sql).
 *
 * Usage:
 *   node scripts/apply-channel-bookmarks.mjs [POSTGRES_URL]
 */

import pg from "pg";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const url = process.argv[2] || process.env.POSTGRES_URL;
if (!url) {
  console.error("Usage: node apply-channel-bookmarks.mjs <POSTGRES_URL>");
  process.exit(1);
}

const sqlPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../drizzle/0010_channel_bookmarks.sql"
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

const { rows } = await c.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'channel_bookmarks' ORDER BY ordinal_position`
);
console.log("\nchannel_bookmarks columns:");
for (const r of rows) console.log(" ", r.column_name);

await c.end();
