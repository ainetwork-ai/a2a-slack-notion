import { Client } from "pg";

const c = new Client({ connectionString: "postgresql://slack:slack@localhost:5433/slack_a2a" });
await c.connect();

const cmd = process.argv[2];

if (cmd === "migrate") {
  const stmts = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_invited_by uuid`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_visibility text DEFAULT 'private'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_category text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_tags jsonb DEFAULT '[]'::jsonb`,
  ];
  for (const s of stmts) {
    console.log("→", s);
    await c.query(s);
  }
} else if (cmd === "user") {
  const r = await c.query(
    `SELECT id, display_name, ain_address FROM users WHERE is_agent = false ORDER BY created_at LIMIT 3`
  );
  console.log(JSON.stringify(r.rows, null, 2));
} else {
  console.log("usage: node local-db.mjs <migrate|user>");
}

await c.end();
