/**
 * Automation Engine
 *
 * Checks active automations when database rows change. Fault-tolerant:
 * all errors are caught and logged; nothing here can crash the API.
 */

import { createLogger } from '@notion/shared';
import { prisma } from './prisma.js';
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
    const automationRows = await prisma.automation.findMany({
      where: {
        active: true,
        workspace: {
          blocks: { some: { id: databaseId } },
        },
      },
    });

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
    const automationRows = await prisma.automation.findMany({
      where: {
        active: true,
        workspace: {
          blocks: { some: { id: databaseId } },
        },
      },
    });

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

// ── Private helpers ───────────────────────────────────────────────────────────

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

    // Persist notification record
    await prisma.notification.create({
      data: {
        userId,
        type: 'automation',
        title: 'Automation triggered',
        body: message,
        pageId: rowId,
      },
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

    const row = await prisma.block.findUnique({
      where: { id: rowId },
      select: { properties: true },
    });
    if (!row) {
      logger.warn({ rowId }, 'update_property: row not found');
      return;
    }

    const props = row.properties as Record<string, unknown>;
    const values = (props['values'] as Record<string, unknown>) ?? {};
    values[propertyId] = value;

    await prisma.block.update({
      where: { id: rowId },
      data: { properties: { ...props, values } as object },
    });

    logger.info({ rowId, propertyId }, 'update_property action executed');
  } else {
    logger.warn({ action, databaseId, rowId }, 'Unknown automation action type — skipped');
  }
}
