import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);

const statements = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_invited_by uuid`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_visibility text DEFAULT 'private'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_category text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_tags jsonb DEFAULT '[]'::jsonb`,
];

for (const stmt of statements) {
  console.log("→", stmt);
  await sql.query(stmt);
  console.log("  ✓");
}

console.log("\nDone. Verifying columns:");
const cols = await sql`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'users' AND column_name LIKE 'agent_%'
  ORDER BY column_name
`;
console.table(cols);
