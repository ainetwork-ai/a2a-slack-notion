import pg from "pg";
import { config } from "dotenv";
config({ path: ".env.local" });

const client = new pg.Client({ connectionString: process.env.POSTGRES_URL });
await client.connect();

const { rows: all } = await client.query(
  `SELECT id, name, workspace_id, is_archived, created_at FROM channels ORDER BY created_at`
);
console.log("total channels:", all.length);
for (const r of all) console.log(" ", r.name, "ws=", r.workspace_id, "archived=", r.is_archived, r.id);

const { rows: nr } = await client.query(
  `SELECT id, name, workspace_id, is_archived, created_at FROM channels WHERE name='newsroom'`
);
console.log("\nnewsroom rows:", nr.length);
for (const r of nr) console.log(r);

await client.end();
