/**
 * Entity resolvers used by API routes that accept natural keys OR UUIDs in
 * their URL path params. The natural keys come from URL segments users
 * actually see (channel name, AIN address), while UUIDs are the fallback for
 * internal calls and legacy links.
 */

import { db } from "@/lib/db";
import { channels, users, workspaces, workspaceMembers, dmConversations, dmMembers } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AIN_ADDRESS_RE = /^0x[a-f0-9]{40}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isAinAddress(value: string): boolean {
  return AIN_ADDRESS_RE.test(value);
}

/**
 * Resolve a channel param (URL segment) to a concrete channel row.
 *
 * Accepts:
 *   - A UUID
 *   - A channel name, scoped by the caller's workspace memberships (unique
 *     index on (workspaceId, name) means this is unambiguous per workspace,
 *     but a user in multiple workspaces may have overlapping names — we
 *     pick the first match, preferring the most recently active membership)
 */
export async function resolveChannelParam(
  param: string,
  viewerUserId: string,
  workspaceHint?: string | null
) {
  const value = decodeURIComponent(param);

  if (isUuid(value)) {
    const [row] = await db
      .select()
      .from(channels)
      .where(eq(channels.id, value))
      .limit(1);
    return row ?? null;
  }

  const memberships = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, viewerUserId));

  const workspaceIds = memberships.map((m) => m.workspaceId);
  if (workspaceIds.length === 0) return null;

  const scopedIds = workspaceHint ? [workspaceHint] : workspaceIds;

  const [row] = await db
    .select()
    .from(channels)
    .where(
      and(
        inArray(channels.workspaceId, scopedIds),
        eq(channels.name, value)
      )
    )
    .orderBy(sql`${channels.isArchived} asc, ${channels.createdAt} desc`)
    .limit(1);

  return row ?? null;
}

/**
 * Resolve a user param (URL segment) to a user row.
 *
 * Accepts:
 *   - A UUID
 *   - An AIN address (0x…40-hex)
 *   - An a2aId (for agents)
 */
export async function resolveUserParam(param: string) {
  const value = decodeURIComponent(param);

  if (isUuid(value)) {
    const [row] = await db.select().from(users).where(eq(users.id, value)).limit(1);
    return row ?? null;
  }

  if (isAinAddress(value)) {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.ainAddress, value.toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.a2aId, value))
    .limit(1);
  return row ?? null;
}

/**
 * Resolve a DM param (URL segment) to a concrete dm_conversation row.
 *
 * Accepts:
 *   - A UUID (conversation id)
 *   - An AIN address (1:1 DM between viewer and that user)
 *   - An a2aId (1:1 DM between viewer and that agent)
 */
export async function resolveDmParam(param: string, viewerUserId: string) {
  const value = decodeURIComponent(param);

  if (isUuid(value)) {
    const [row] = await db
      .select()
      .from(dmConversations)
      .where(eq(dmConversations.id, value))
      .limit(1);
    return row ?? null;
  }

  const partner = await resolveUserParam(value);
  if (!partner) return null;

  const viewerRows = await db
    .select({ conversationId: dmMembers.conversationId })
    .from(dmMembers)
    .where(eq(dmMembers.userId, viewerUserId));

  for (const row of viewerRows) {
    const [other] = await db
      .select()
      .from(dmMembers)
      .where(
        and(
          eq(dmMembers.conversationId, row.conversationId),
          eq(dmMembers.userId, partner.id)
        )
      )
      .limit(1);
    if (other) {
      const [conv] = await db
        .select()
        .from(dmConversations)
        .where(eq(dmConversations.id, row.conversationId))
        .limit(1);
      return conv ?? null;
    }
  }

  return null;
}

/**
 * Resolve a workspace param (URL segment) to a workspace row.
 *
 * Accepts a UUID or a slug.
 */
export async function resolveWorkspaceParam(param: string) {
  const value = decodeURIComponent(param);

  if (isUuid(value)) {
    const [row] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, value))
      .limit(1);
    return row ?? null;
  }

  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, value))
    .limit(1);
  return row ?? null;
}
