/**
 * Automation Engine
 *
 * Checks active automations when database rows change. Fault-tolerant:
 * all errors are caught and logged; nothing here can crash the API.
 */

import { and, eq } from 'drizzle-orm';
import { createLogger } from '@notion/shared';
import { db, notionNotifications } from './db.js';
import { automations, blocks } from '../../../../slack/src/lib/db/schema';
import { notificationQueue } from './queue.js';

const logger = createLogger('automation-engine');

// ── Trigger / Action types (mirrors the Zod schemas in routes/automations.ts) ──

interface StatusChangeTrigger {
  type: 'status_change';
  config: { databaseId: string; fromStatus?: string; toStatus: string };
}

interface ItemCreatedTrigger {
  type: 'item_created';
  config: { databaseId: string };
}

type AutomationTrigger = StatusChangeTrigger | ItemCreatedTrigger;

interface SendNotificationAction {
  type: 'send_notification';
  config: { userId: string; message: string };
}

interface UpdatePropertyAction {
  type: 'update_property';
  config: { propertyId: string; value: unknown };
}

type AutomationAction = SendNotificationAction | UpdatePropertyAction;

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Find active automations whose workspace contains the given database block.
 * Replaces the old Prisma `workspace.blocks.some` join.
 */
async function findActiveAutomationsForDatabase(databaseId: string) {
  // 1) Find the workspace of the database block
  const dbBlock = await db
    .select({ workspaceId: blocks.workspaceId })
    .from(blocks)
    .where(eq(blocks.id, databaseId))
    .limit(1)
    .then((r) => r[0]);

  if (!dbBlock) return [];

  // 2) Fetch active automations for that workspace
  return await db
    .select()
    .from(automations)
    .where(
      and(eq(automations.active, true), eq(automations.workspaceId, dbBlock.workspaceId)),
    );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Called after a database row is updated. Checks all active automations for the
 * database and fires matching ones.
 *
 * @param databaseId   - The database block id.
 * @param rowId        - The block id of the updated row.
 * @param changedProps - Map of propertyId → { oldValue, newValue } for changed fields.
 */
export async function checkAutomations(
  databaseId: string,
  rowId: string,
  changedProps: Record<string, { oldValue: unknown; newValue: unknown }>,
): Promise<void> {
  try {
    const automationRows = await findActiveAutomationsForDatabase(databaseId);
    if (automationRows.length === 0) return;

    for (const row of automationRows) {
      try {
        const trigger = row.trigger as unknown as AutomationTrigger;
        const actions = row.actions as unknown as AutomationAction[];

        const triggered = isTriggerFired(trigger, databaseId, changedProps);
        if (!triggered) continue;

        logger.info(`Automation "${row.name}" (${row.id}) triggered for row ${rowId}`);

        for (const action of actions) {
          await executeAction(action, databaseId, rowId).catch((err) => {
            logger.error({ err, automationId: row.id, action }, 'Failed to execute automation action');
          });
        }
      } catch (err) {
        logger.error({ err, automationId: row.id }, 'Failed to evaluate automation');
      }
    }
  } catch (err) {
    logger.error({ err, databaseId, rowId }, 'checkAutomations: unexpected error');
  }
}

/**
 * Called when a new database row is created.
 */
export async function checkAutomationsOnCreate(
  databaseId: string,
  rowId: string,
): Promise<void> {
  try {
    const automationRows = await findActiveAutomationsForDatabase(databaseId);
    if (automationRows.length === 0) return;

    for (const row of automationRows) {
      try {
        const trigger = row.trigger as unknown as AutomationTrigger;
        const actions = row.actions as unknown as AutomationAction[];

        if (trigger.type !== 'item_created') continue;
        if (trigger.config.databaseId !== databaseId) continue;

        logger.info(`Automation "${row.name}" (${row.id}) triggered on row create ${rowId}`);

        for (const action of actions) {
          await executeAction(action, databaseId, rowId).catch((err) => {
            logger.error({ err, automationId: row.id, action }, 'Failed to execute automation action on create');
          });
        }
      } catch (err) {
        logger.error({ err, automationId: row.id }, 'Failed to evaluate item_created automation');
      }
    }
  } catch (err) {
    logger.error({ err, databaseId, rowId }, 'checkAutomationsOnCreate: unexpected error');
  }
}

// ── Trigger / Action implementation ──────────────────────────────────────────

function isTriggerFired(
  trigger: AutomationTrigger,
  databaseId: string,
  changedProps: Record<string, { oldValue: unknown; newValue: unknown }>,
): boolean {
  if (trigger.type === 'status_change') {
    if (trigger.config.databaseId !== databaseId) return false;

    // Look for any changed property whose newValue matches toStatus
    for (const { oldValue, newValue } of Object.values(changedProps)) {
      const newStr = extractStatusString(newValue);
      if (newStr !== trigger.config.toStatus) continue;

      if (trigger.config.fromStatus !== undefined) {
        const oldStr = extractStatusString(oldValue);
        if (oldStr !== trigger.config.fromStatus) continue;
      }

      return true;
    }
    return false;
  }

  // item_created triggers are handled separately in checkAutomationsOnCreate
  return false;
}

function extractStatusString(val: unknown): string | undefined {
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object') {
    const v = val as Record<string, unknown>;
    if (typeof v['value'] === 'string') return v['value'];
    if (typeof v['name'] === 'string') return v['name'];
  }
  return undefined;
}

async function executeAction(
  action: AutomationAction,
  databaseId: string,
  rowId: string,
): Promise<void> {
  if (action.type === 'send_notification') {
    const { userId, message } = action.config;

    // Persist notification record (notion's extended notification shape)
    await db.insert(notionNotifications).values({
      userId,
      type: 'automation',
      title: 'Automation triggered',
      body: message,
      pageId: rowId,
    });

    // Enqueue for push delivery (best-effort)
    await notificationQueue.add('automation_notification', {
      userId,
      type: 'automation',
      title: 'Automation triggered',
      body: message,
      pageId: rowId,
    });

    logger.info({ userId, rowId }, 'send_notification action executed');
  } else if (action.type === 'update_property') {
    const { propertyId, value } = action.config;

    const row = await db
      .select({ properties: blocks.properties })
      .from(blocks)
      .where(eq(blocks.id, rowId))
      .limit(1)
      .then((r) => r[0]);

    if (!row) {
      logger.warn({ rowId }, 'update_property: row not found');
      return;
    }

    const props = (row.properties ?? {}) as Record<string, unknown>;
    const values = (props['values'] as Record<string, unknown>) ?? {};
    values[propertyId] = value;

    await db
      .update(blocks)
      .set({ properties: { ...props, values } as Record<string, unknown> })
      .where(eq(blocks.id, rowId));

    logger.info({ rowId, propertyId }, 'update_property action executed');
  } else {
    logger.warn({ action, databaseId, rowId }, 'Unknown automation action type — skipped');
  }
}
