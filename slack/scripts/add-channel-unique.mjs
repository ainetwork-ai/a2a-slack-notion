import pg from "pg";

const url =
  process.env.POSTGRES_URL ||
  "postgresql://slack:slack@localhost:5433/slack_a2a";
const c = new pg.Client({ connectionString: url });
await c.connect();

await c.query(
  `CREATE UNIQUE INDEX IF NOT EXISTS channels_workspace_name_active
   ON channels(workspace_id, name)
   WHERE is_archived = false`
);
const { rows } = await c.query(
  `SELECT indexname FROM pg_indexes WHERE tablename='channels' ORDER BY indexname`
);
console.log("channels indexes:");
for (const r of rows) console.log(" ", r.indexname);
await c.end();
