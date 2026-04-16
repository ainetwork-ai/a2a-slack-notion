# Notion Clone — Dogfood Testing Issues

**Summary:** 7 issues found (1 CRITICAL, 2 HIGH, 2 MEDIUM, 1 LOW, 1 INFO)

---

## CRITICAL

### ISSUE-001: Agent @mention always returns "No results"

**Severity:** CRITICAL  
**Userflow Step:** 4 (@멘션으로 에이전트 호출)

**Description:**
Typing `@` in the editor shows "No results" dropdown instead of listing registered agents. The @mention suggestion UI appears but remains empty regardless of input.

**Root Cause:**
In `apps/web/src/components/editor/extensions.ts:125`, the mention handler captures `workspaceId` in a closure at editor mount time. When `workspaceId` is an empty string `''` at that moment, the guard clause immediately returns `[]`:

```ts
items: async ({ query }) => {
  if (!workspaceId) return [];   // <-- short-circuits here
  return fetchSuggestions(query, workspaceId);
},
```

This prevents any API calls to `/api/v1/mentions/suggest` from ever being made.

**Exact File/Line:**
- `apps/web/src/components/editor/extensions.ts:125`

**Steps to Fix:**
1. Pass `workspaceId` reactively into the extension configuration, or defer editor mount until `workspaceId` is confirmed non-empty.
2. Verify that the page component at `apps/web/src/app/(app)/workspace/[workspaceId]/[pageId]/page.tsx:300` does not mount `CollaborativeEditor` before `workspaceId` is available.
3. Consider using a `useCallback` or `useMemo` dependency on `workspaceId` to rebuild the extension when it changes.
4. Test: Type `@` and confirm agent suggestions appear in the dropdown.

---

## HIGH

### ISSUE-002: No Share / Publish button on pages

**Severity:** HIGH  
**Userflow Step:** 7 (최종 퍼블리시)

**Description:**
The "More actions" menu on a page only shows "Save as template" and "Export as Markdown". There is no "Share" or "Publish to web" option visible to users.

**Root Cause:**
Share UI is not yet implemented. The file `apps/web/src/components/share/share-panel.tsx` does not exist and is tracked as Phase 18 in `plan.md`.

**Exact File/Line:**
- `apps/web/src/components/share/share-panel.tsx` (missing)
- Page header toolbar (location TBD — likely in `apps/web/src/app/(app)/workspace/[workspaceId]/[pageId]/page.tsx`)

**Steps to Fix:**
1. Implement `apps/web/src/components/share/share-panel.tsx` with share settings (public/private, permissions, link generation).
2. Add a "Share" menu item to the page header "More actions" dropdown.
3. Link the "Share" button to open the share-panel modal/panel.
4. Implement backend API endpoint for managing page sharing permissions if not already present.
5. Test: Click "Share" and confirm the share panel opens.

---

### ISSUE-003: No login/authentication page

**Severity:** HIGH  
**Userflow Step:** 1 (워크스페이스 접속 — 로그인)

**Description:**
Navigating to `http://localhost:3010` goes directly to workspace creation without any login screen. The app auto-logs in as "Default User" (walletAddress: "default") in development mode, but there is no visible authentication UI.

**Root Cause:**
Authentication is wallet-based (SIWE) but currently falls back to a hardcoded "Default User" for development. No login UI page exists.

**Exact File/Line:**
- Auth middleware/context (likely `apps/web/src/app/layout.tsx` or middleware)
- Missing login page at `apps/web/src/app/login/page.tsx`

**Steps to Fix:**
1. Create a login page at `apps/web/src/app/login/page.tsx` with SIWE (Sign In with Ethereum) integration.
2. Add clear documentation that the current development login is a fallback for local testing.
3. Update middleware or root layout to redirect unauthenticated users to the login page.
4. For production, ensure SIWE flow is properly implemented (wallet connection, signature verification).
5. Test: Access `http://localhost:3010` and confirm you see a login page or SIWE prompt (not workspace creation).

---

## MEDIUM

### ISSUE-004: Agent status indicator missing from sidebar

**Severity:** MEDIUM  
**Userflow Step:** 3 (에이전트 등록 — 온라인/오프라인 상태 표시)

**Description:**
After registering an agent, the sidebar AGENTS section shows the agent name but no online/offline status dot or badge. The userflow expects a visible status indicator.

**Root Cause:**
`apps/web/src/components/sidebar/agent-list.tsx` likely renders agent names only without a status indicator component.

**Exact File/Line:**
- `apps/web/src/components/sidebar/agent-list.tsx` (likely around agent rendering loop)

**Steps to Fix:**
1. Update `agent-list.tsx` to render a colored status dot next to each agent name:
   - Green dot: agent is online
   - Gray dot: agent is offline
2. Use the `agentStatus` field returned by the API to determine the color.
3. Optionally add a tooltip on hover showing "Online" or "Offline".
4. Test: Register an agent and confirm the status dot appears in the sidebar.

---

### ISSUE-005: Duplicate "New page" template picker

**Severity:** MEDIUM  
**Userflow Step:** 4 (새 페이지 생성)

**Description:**
Clicking "New page" in the sidebar renders two identical template picker panels side-by-side instead of one.

**Root Cause:**
Template picker component is likely rendered twice in the component tree, possibly due to a duplicate in the page layout or a stray component mount.

**Exact File/Line:**
- `apps/web/src/app/(app)/workspace/[workspaceId]/page.tsx` (workspace root page)
- `apps/web/src/components/sidebar/sidebar.tsx` (new-page handler)

**Steps to Fix:**
1. Inspect `workspace/[workspaceId]/page.tsx` for duplicate template picker renders.
2. Check the sidebar component for any duplicate event handlers or multiple template picker mounts.
3. Search for all occurrences of the template picker component name across the codebase.
4. Remove duplicate render; ensure only one template picker modal is open at a time.
5. Test: Click "New page" in sidebar and confirm only one template picker panel appears.

---

## LOW

### ISSUE-006: "Remove member" button always visible in sidebar

**Severity:** LOW  
**Userflow Step:** 2 (사용자 초대)

**Description:**
The "Remove member" button appears in the MEMBERS sidebar section without requiring selection of a specific member. It is always visible, even when no member is selected for removal.

**Root Cause:**
"Remove member" button is rendered at the section header level rather than as a per-member row action. No member-selection state is checked before rendering the button.

**Exact File/Line:**
- `apps/web/src/components/sidebar/member-list.tsx` (likely around section header or button render)

**Steps to Fix:**
1. Move "Remove member" button from the section header level to each individual member row.
2. Render it as a hover action, context menu, or inline button on each member row.
3. Only enable the remove action when the logged-in user is a workspace owner/admin.
4. Add a confirmation modal before removing a member.
5. Test: Hover over a member in the MEMBERS section and confirm the "Remove member" button appears; confirm it does not appear at the section level.

---

## INFO

### ISSUE-007: Agent listed in both MEMBERS and AGENTS sidebar sections

**Severity:** INFO  
**Userflow Step:** 3 (에이전트 등록)

**Description:**
After registering an agent, it appears in both the MEMBERS section (with role "member") and in the AGENTS section. This creates a duplicate display that may confuse users about the distinction between human members and agents.

**Root Cause:**
By design — agents are stored as workspace members with `isAgent=true`. However, the sidebar renders both the MEMBERS and AGENTS sections without filtering agents out of the members list.

**Exact File/Line:**
- `apps/web/src/components/sidebar/member-list.tsx` (members rendering)
- `apps/web/src/components/sidebar/agent-list.tsx` (agents rendering)

**Steps to Fix:**
1. Update `member-list.tsx` to filter out members where `isAgent === true` from the MEMBERS section display.
2. Alternatively, add a visual separator or label (e.g., "Agents are shown in the AGENTS section below") to make the distinction clear.
3. Ensure agents are only rendered in the AGENTS section, not duplicated in MEMBERS.
4. Test: Register an agent and confirm it appears only in AGENTS section, not in MEMBERS.

---

## Testing Checklist

- [ ] ISSUE-001: @mention shows agent suggestions
- [ ] ISSUE-002: Share button exists and opens share panel
- [ ] ISSUE-003: Login page or SIWE prompt appears on first visit
- [ ] ISSUE-004: Agent status dot visible in sidebar
- [ ] ISSUE-005: Only one template picker panel appears
- [ ] ISSUE-006: Remove member button only appears on member rows
- [ ] ISSUE-007: Agent appears only in AGENTS, not in MEMBERS
