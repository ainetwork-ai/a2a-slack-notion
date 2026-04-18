/**
 * Automation Engine
 *
 * Checks active automations when database rows change.
 */

import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { automations, blocks, notionNotifications } from '@/lib/db/schema';
import { sseClients } from './sse-clients';

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

async function findActiveAutomationsForDatabase(databaseId: string) {
  const dbBlock = await db
    .select({ workspaceId: blocks.workspaceId })
    .from(blocks)
    .where(eq(blocks.id, databaseId))
    .limit(1)
    .then((r) => r[0]);

  if (!dbBlock) return [];

  return await db
    .select()
    .from(automations)
    .where(
      and(eq(automations.active, true), eq(automations.workspaceId, dbBlock.workspaceId)),
    );
}

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

        for (const action of actions) {
          await executeAction(action, databaseId, rowId).catch(() => {});
        }
      } catch {
        // Swallow automation errors
      }
    }
  } catch {
    // Swallow errors
  }
}

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

        for (const action of actions) {
          await executeAction(action, databaseId, rowId).catch(() => {});
        }
      } catch {
        // Swallow
      }
    }
  } catch {
    // Swallow
  }
}

function isTriggerFired(
  trigger: AutomationTrigger,
  databaseId: string,
  changedProps: Record<string, { oldValue: unknown; newValue: unknown }>,
): boolean {
  if (trigger.type === 'status_change') {
    if (trigger.config.databaseId !== databaseId) return false;

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
  _databaseId: string,
  rowId: string,
): Promise<void> {
  if (action.type === 'send_notification') {
    const { userId, message } = action.config;

    const [notification] = await db
      .insert(notionNotifications)
      .values({
        userId,
        // notionNotifications.type is a strict union — reuse 'page_update' for automation messages
        type: 'page_update',
        title: 'Automation triggered',
        body: message,
        pageId: rowId,
      })
      .returning();

    const writers = sseClients.get(userId);
    if (writers && writers.size > 0 && notification) {
      const payload = `data: ${JSON.stringify(notification)}\n\n`;
      for (const write of writers) write(payload);
    }
  } else if (action.type === 'update_property') {
    const { propertyId, value } = action.config;

    const row = await db
      .select({ properties: blocks.properties })
      .from(blocks)
      .where(eq(blocks.id, rowId))
      .limit(1)
      .then((r) => r[0]);

    if (!row) return;

    const props = (row.properties ?? {}) as Record<string, unknown>;
    const values = (props['values'] as Record<string, unknown>) ?? {};
    values[propertyId] = value;

    await db
      .update(blocks)
      .set({ properties: { ...props, values } as Record<string, unknown> })
      .where(eq(blocks.id, rowId));
  }
}
