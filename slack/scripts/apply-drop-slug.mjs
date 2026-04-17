import pg from "pg";
import fs from "node:fs";

const url = process.argv[2] || process.env.POSTGRES_URL;
if (!url) {
  console.error("Usage: node apply-drop-slug.mjs <POSTGRES_URL>");
  process.exit(1);
}

const sql = fs.readFileSync(
  new URL("../drizzle/0006_drop_workspace_slug.sql", import.meta.url),
  "utf8"
);

const c = new pg.Client({ connectionString: url });
await c.connect();

for (const stmt of sql.split("--> statement-breakpoint")) {
  const s = stmt.trim();
  if (!s) continue;
  console.log("→", s.slice(0, 80));
  await c.query(s);
}

const { rows } = await c.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'workspaces' ORDER BY ordinal_position`
);
console.log("\nworkspaces columns after migration:");
for (const r of rows) console.log(" ", r.column_name);

await c.end();
