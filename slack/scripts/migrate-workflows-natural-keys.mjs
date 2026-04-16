/**
 * Rewrite persisted workflow JSON configs so step/trigger references are
 * natural keys instead of UUIDs.
 *
 *   channelId        → channel  (channel.name)
 *   userId           → user     (users.ainAddress)
 *   agentId          → agent    (users.a2aId || users.displayName)
 *   approverUserId   → approver (users.ainAddress)
 *   submitToChannelId → submitToChannel (channel.name)
 *
 * Trigger configs: channelId → channel.
 *
 * Run against both local dev DB and Neon.
 */
import pg from "pg";

const url =
  process.argv[2] ||
  process.env.POSTGRES_URL ||
  "postgresql://slack:slack@localhost:5433/slack_a2a";

const c = new pg.Client({ connectionString: url });
await c.connect();
console.log("target:", url.replace(/:[^:@]+@/, ":***@"));

async function channelKey(id) {
  const { rows } = await c.query(
    `SELECT name FROM channels WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0]?.name ?? null;
}

async function userKey(id) {
  const { rows } = await c.query(
    `SELECT ain_address, display_name FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0]?.ain_address ?? rows[0]?.display_name ?? null;
}

async function agentKey(id) {
  const { rows } = await c.query(
    `SELECT a2a_id, display_name FROM users WHERE id = $1 AND is_agent = true LIMIT 1`,
    [id]
  );
  return rows[0]?.a2a_id ?? rows[0]?.display_name ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function migrateStep(step) {
  const s = { ...step };

  // channelId → channel
  if (s.channelId && UUID_RE.test(s.channelId)) {
    const name = await channelKey(s.channelId);
    if (name) {
      s.channel = name;
      delete s.channelId;
    }
  } else if (s.channelId) {
    s.channel = s.channelId;
    delete s.channelId;
  }

  // submitToChannelId → submitToChannel
  if (s.submitToChannelId) {
    if (UUID_RE.test(s.submitToChannelId)) {
      const name = await channelKey(s.submitToChannelId);
      if (name) s.submitToChannel = name;
    } else {
      s.submitToChannel = s.submitToChannelId;
    }
    delete s.submitToChannelId;
  }

  // userId → user (skip add_to_channel.userId which means "user to add", still user)
  if (s.userId) {
    if (UUID_RE.test(s.userId)) {
      const key = await userKey(s.userId);
      if (key) s.user = key;
    } else {
      s.user = s.userId;
    }
    delete s.userId;
  }

  // agentId → agent
  if (s.agentId) {
    if (UUID_RE.test(s.agentId)) {
      const key = await agentKey(s.agentId);
      if (key) s.agent = key;
    } else {
      s.agent = s.agentId;
    }
    delete s.agentId;
  }

  // approverUserId → approver
  if (s.approverUserId) {
    if (UUID_RE.test(s.approverUserId)) {
      const key = await userKey(s.approverUserId);
      if (key) s.approver = key;
    } else {
      s.approver = s.approverUserId;
    }
    delete s.approverUserId;
  }

  // Nested branches
  if (Array.isArray(s.then)) s.then = await Promise.all(s.then.map(migrateStep));
  if (Array.isArray(s.else)) s.else = await Promise.all(s.else.map(migrateStep));
  if (Array.isArray(s.onApprove)) s.onApprove = await Promise.all(s.onApprove.map(migrateStep));
  if (Array.isArray(s.onReject)) s.onReject = await Promise.all(s.onReject.map(migrateStep));

  return s;
}

async function migrateTrigger(cfg) {
  if (!cfg || typeof cfg !== "object") return cfg;
  const out = { ...cfg };
  if (out.channelId) {
    if (UUID_RE.test(out.channelId)) {
      const name = await channelKey(out.channelId);
      if (name) out.channel = name;
    } else {
      out.channel = out.channelId;
    }
    delete out.channelId;
  }
  if (out.agentId) {
    if (UUID_RE.test(out.agentId)) {
      const key = await agentKey(out.agentId);
      if (key) out.agent = key;
    } else {
      out.agent = out.agentId;
    }
    delete out.agentId;
  }
  return out;
}

const { rows: wfs } = await c.query(
  `SELECT id, name, steps, trigger_config FROM workflows`
);

let migrated = 0;
for (const wf of wfs) {
  const steps = Array.isArray(wf.steps) ? wf.steps : [];
  const newSteps = await Promise.all(steps.map(migrateStep));
  const newTrigger = await migrateTrigger(wf.trigger_config || {});

  const stepsChanged = JSON.stringify(steps) !== JSON.stringify(newSteps);
  const triggerChanged =
    JSON.stringify(wf.trigger_config || {}) !== JSON.stringify(newTrigger);

  if (stepsChanged || triggerChanged) {
    await c.query(
      `UPDATE workflows SET steps = $1, trigger_config = $2, updated_at = now() WHERE id = $3`,
      [JSON.stringify(newSteps), JSON.stringify(newTrigger), wf.id]
    );
    migrated++;
    console.log(` ✓ ${wf.name} (${wf.id})`);
  }
}

console.log(`Migrated ${migrated} of ${wfs.length} workflows.`);
await c.end();
