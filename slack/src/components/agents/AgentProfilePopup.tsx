'use client';

/**
 * AgentProfilePopup — the canonical agent profile popover.
 *
 * The implementation lives in the shared `UserProfilePopup` (under
 * `components/chat/`), which already supports both humans and agents and is
 * used by Slack's MessageItem sender popover. This module re-exports it as
 * an agent-only wrapper so that:
 *
 *   1. Notion (and any other surface) can import a focused, intention-revealing
 *      component without pulling from `chat/`.
 *   2. The popup stays a single source of truth — fixes/styling improvements
 *      to the shared component flow to every consumer.
 *
 * The wrapper always sets `isAgent=true` and takes a slightly narrower prop
 * surface (no human-only fields like `statusEmoji`/`statusMessage`).
 */
import UserProfilePopup from '@/components/chat/UserProfilePopup';

export interface AgentProfilePopupProps {
  /** Agent UUID (users.id). */
  agentId: string;
  displayName: string;
  avatarUrl?: string;
  /** Preferred lookup key — a2aId if available, otherwise UUID. */
  agentKey?: string;
  agentDescription?: string;
  agentSkills?: string[];
  children: React.ReactNode;
}

export function AgentProfilePopup({
  agentId,
  displayName,
  avatarUrl,
  agentKey,
  agentDescription,
  agentSkills,
  children,
}: AgentProfilePopupProps) {
  return (
    <UserProfilePopup
      userId={agentId}
      displayName={displayName}
      avatarUrl={avatarUrl}
      isAgent
      agentKey={agentKey}
      agentDescription={agentDescription}
      agentSkills={agentSkills}
    >
      {children}
    </UserProfilePopup>
  );
}

export default AgentProfilePopup;
