/**
 * Assign DiceBear avatars to every user in the DB that doesn't have one.
 *
 *   bottts-neutral   — for agents (is_agent=true), robot style
 *   avataaars        — for humans
 *
 * Usage:
 *   POSTGRES_URL=... node scripts/assign-avatars.mjs
 *
 * Re-runnable: skips rows that already have avatar_url set (pass --force to
 * overwrite).
 */
import pg from "pg";

const FORCE = process.argv.includes("--force");
const url = process.env.POSTGRES_URL;
if (!url) {
  console.error("POSTGRES_URL env var is required");
  process.exit(1);
}

const c = new pg.Client({ connectionString: url });
await c.connect();

const where = FORCE ? "" : "WHERE avatar_url IS NULL";
const { rows } = await c.query(
  `SELECT id, display_name, is_agent FROM users ${where}`
);

let updated = 0;
for (const r of rows) {
  const style = r.is_agent ? "bottts-neutral" : "avataaars";
  const seed = encodeURIComponent(r.display_name);
  const url = `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
  await c.query("UPDATE users SET avatar_url = $1 WHERE id = $2", [url, r.id]);
  updated++;
  console.log((r.is_agent ? "🤖" : "👤"), r.display_name);
}

console.log(`\nupdated: ${updated}`);
await c.end();
