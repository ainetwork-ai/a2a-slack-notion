import pg from "pg";

const url =
  process.env.POSTGRES_URL ||
  "postgresql://slack:slack@localhost:5433/slack_a2a";
const client = new pg.Client({ connectionString: url });
await client.connect();

const { rows: dups } = await client.query(`
  SELECT workspace_id, name, count(*) c
  FROM channels
  WHERE is_archived = false
  GROUP BY workspace_id, name
  HAVING count(*) > 1
`);
console.log("Active duplicate (workspace, name) groups:", dups.length);
for (const d of dups) console.log(" ", d);

if (dups.length > 0) {
  for (const d of dups) {
    const { rows } = await client.query(
      `SELECT c.id, c.name, c.created_at,
         (SELECT count(*) FROM messages m WHERE m.channel_id = c.id) msg_count
       FROM channels c
       WHERE c.workspace_id = $1 AND c.name = $2 AND c.is_archived = false
       ORDER BY msg_count DESC, c.created_at ASC`,
      [d.workspace_id, d.name]
    );
    console.log(`\nGroup "${d.name}" (${rows.length} channels):`);
    for (const r of rows) console.log(`  ${r.id}  msgs=${r.msg_count}  ${r.created_at}`);

    const [keep, ...toRename] = rows;
    console.log(`  → keeping ${keep.id}`);
    for (const r of toRename) {
      const date = new Date(r.created_at).toISOString().slice(0, 10);
      const newName = `${r.name}-${date}`;
      await client.query(`UPDATE channels SET name = $1 WHERE id = $2`, [newName, r.id]);
      console.log(`  → renamed ${r.id} to "${newName}"`);
    }
  }
}

await client.end();
