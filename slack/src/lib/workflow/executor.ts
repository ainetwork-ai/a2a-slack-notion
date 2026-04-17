import { db } from "@/lib/db";
import { workflows, workflowRuns, channels, channelMembers, messages, dmConversations, dmMembers, users, canvases } from "@/lib/db/schema";
import { eq, and, or, ilike } from "drizzle-orm";
import { sendToAgent } from "@/lib/a2a/message-bridge";
import { substituteVariables } from "./substitute";
import type { WorkflowStep, PendingInput } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AIN_ADDRESS_RE = /^0x[a-f0-9]{40}$/i;

// ── Unblock editorial pipeline: parse Damien's assignment response ──
// Extracts reporter and manager agent IDs from the text (same regex logic
// as test_confirm.py's pick_reporter / pick_manager).

// a2aId values match DB registration (without "unblock-" prefix)
const REPORTERS: Record<string, { kor: string; en: string }> = {
  "max":   { kor: "맥스",     en: "Max" },
  "techa": { kor: "테카",     en: "Techa" },
  "mark":  { kor: "마크",     en: "Mark" },
  "roy":   { kor: "로이",     en: "Roy" },
  "april": { kor: "에이프릴", en: "April" },
};

const MANAGERS: Record<string, { kor: string; en: string }> = {
  "victoria": { kor: "빅토리아", en: "Victoria" },
  "logan":    { kor: "로건",     en: "Logan" },
  "lilly":    { kor: "릴리",     en: "Lilly" },
};

const REPORTER_TO_MANAGER: Record<string, string> = {
  "max":   "victoria",
  "mark":  "victoria",
  "techa": "logan",
  "april": "logan",
  "roy":   "lilly",
};

function pickAgentFromText(text: string, roster: Record<string, { kor: string; en: string }>): string | null {
  // Note: \b doesn't work with Korean in JS regex — use lookahead/behind or
  // simple substring matching instead. @mentions use @\s*Name pattern without \b.
  const atHits: [number, string][] = [];
  const nameHits: [number, string][] = [];
  for (const [agentId, info] of Object.entries(roster)) {
    for (const form of [info.kor, info.en]) {
      // @mention match (no \b — Korean chars aren't word chars in JS)
      const atMatch = new RegExp(`@\\s*${form}`, "i").exec(text);
      if (atMatch) atHits.push([atMatch.index, agentId]);
      // Plain name match — use word boundary only for ASCII names
      const isAscii = /^[a-zA-Z]+$/.test(form);
      const pattern = isAscii ? `\\b${form}\\b` : form;
      const nameRe = new RegExp(pattern, "ig");
      let m;
      while ((m = nameRe.exec(text)) !== null) {
        nameHits.push([m.index, agentId]);
      }
    }
  }
  if (atHits.length) {
    atHits.sort((a, b) => a[0] - b[0]);
    return atHits[0]![1];
  }
  if (nameHits.length) {
    nameHits.sort((a, b) => a[0] - b[0]);
    return nameHits[0]![1];
  }
  return null;
}

/** Resolve a dot-separated path against the vars object. */
function resolveVarPath(vars: Record<string, unknown>, path: string): unknown {
  return path
    .trim()
    .split(".")
    .reduce(
      (obj: unknown, k: string) =>
        obj != null && typeof obj === "object"
          ? (obj as Record<string, unknown>)[k]
          : undefined,
      vars as unknown
    );
}

function parseVerdictResponse(text: string): { approved: boolean } {
  const hasApprove = /승인|발행/.test(text);
  const hasReject = /반려/.test(text);

  if (hasApprove && hasReject) {
    // Both present — last occurrence wins
    const lastApprove = Math.max(text.lastIndexOf("승인"), text.lastIndexOf("발행"));
    const lastReject = text.lastIndexOf("반려");
    return { approved: lastApprove > lastReject };
  }
  if (hasReject) return { approved: false };
  // Default to approved (승인 found, or neither — avoid infinite loops)
  return { approved: true };
}

function parseAssignmentResponse(text: string): Record<string, string> {
  const reporterId = pickAgentFromText(text, REPORTERS) ?? "max";
  let managerId = pickAgentFromText(text, MANAGERS);
  if (!managerId) {
    managerId = REPORTER_TO_MANAGER[reporterId] ?? "victoria";
  }
  return {
    reporter: reporterId,
    manager: managerId,
    reporterKor: REPORTERS[reporterId]?.kor ?? reporterId,
    managerKor: MANAGERS[managerId]?.kor ?? managerId,
  };
}

/**
 * Resolve an agent reference (a2aId, displayName, or UUID) to the agent row.
 * Prefer a2aId / displayName; UUID is accepted for back-compat.
 */
async function resolveAgent(ref: string): Promise<{
  id: string;
  displayName: string;
  agentCardJson: unknown;
} | null> {
  const trimmed = ref.trim().replace(/^@/, "");
  if (!trimmed) return null;

  const isUuid = UUID_RE.test(trimmed);

  const [row] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      agentCardJson: users.agentCardJson,
    })
    .from(users)
    .where(
      and(
        eq(users.isAgent, true),
        isUuid
          ? or(eq(users.id, trimmed), eq(users.a2aId, trimmed))!
          : or(ilike(users.displayName, trimmed), eq(users.a2aId, trimmed))!
      )
    )
    .limit(1);

  return row ?? null;
}

/**
 * Resolve a channel reference (name, with or without `#`) scoped to a workspace.
 * UUIDs are accepted as a fallback for legacy workflow configs.
 */
async function resolveChannel(
  ref: string,
  workspaceId: string | null
): Promise<{ id: string; name: string } | null> {
  const trimmed = ref.trim().replace(/^#/, "");
  if (!trimmed) return null;

  if (UUID_RE.test(trimmed)) {
    const [row] = await db
      .select({ id: channels.id, name: channels.name })
      .from(channels)
      .where(eq(channels.id, trimmed))
      .limit(1);
    return row ?? null;
  }

  const scope = workspaceId
    ? and(
        eq(channels.workspaceId, workspaceId),
        ilike(channels.name, trimmed),
        eq(channels.isArchived, false)
      )
    : and(ilike(channels.name, trimmed), eq(channels.isArchived, false));

  const [row] = await db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .where(scope)
    .limit(1);

  return row ?? null;
}

/**
 * Resolve a user reference (AIN address, displayName, a2aId, or UUID).
 */
async function resolveUser(ref: string): Promise<{ id: string; displayName: string } | null> {
  const trimmed = ref.trim().replace(/^@/, "");
  if (!trimmed) return null;

  const isUuid = UUID_RE.test(trimmed);
  const isAinAddress = AIN_ADDRESS_RE.test(trimmed);
  const normalized = isAinAddress ? trimmed.toLowerCase() : trimmed;

  const [row] = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(
      isUuid
        ? eq(users.id, trimmed)
        : isAinAddress
        ? eq(users.ainAddress, normalized)
        : or(ilike(users.displayName, trimmed), eq(users.a2aId, trimmed))!
    )
    .limit(1);

  return row ?? null;
}

export async function runWorkflow(
  workflowId: string,
  initialVariables?: Record<string, unknown>,
  triggeredBy?: string
): Promise<{ runId: string; status: string }> {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);

  if (!workflow) throw new Error("Workflow not found");
  if (!workflow.enabled) throw new Error("Workflow is disabled");

  const [run] = await db
    .insert(workflowRuns)
    .values({
      workflowId,
      status: "running",
      triggeredBy: triggeredBy ?? null,
      variables: initialVariables ?? {},
      currentStepIndex: 0,
    })
    .returning();

  // Execute async — fire and forget from caller's perspective
  executeSteps(
    run.id,
    workflow.steps as WorkflowStep[],
    { ...(initialVariables ?? {}) },
    0,
    workflow.workspaceId
  ).catch(() => {
    // Error handling is done inside executeSteps
  });

  return { runId: run.id, status: "running" };
}

export async function resumeWorkflow(
  runId: string,
  mergeVariables: Record<string, unknown>
): Promise<void> {
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, runId))
    .limit(1);

  if (!run) throw new Error("Run not found");
  if (run.status !== "paused") throw new Error("Run is not paused");

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, run.workflowId))
    .limit(1);

  if (!workflow) throw new Error("Workflow not found");

  const vars = { ...(run.variables as Record<string, unknown>), ...mergeVariables };
  const resumeFrom = (run.currentStepIndex ?? 0) + 1;

  // Clear pending input and resume
  await db
    .update(workflowRuns)
    .set({ status: "running", pendingInput: null, variables: vars })
    .where(eq(workflowRuns.id, runId));

  executeSteps(
    runId,
    workflow.steps as WorkflowStep[],
    vars,
    resumeFrom,
    workflow.workspaceId
  ).catch(() => {
    // Error handling is done inside executeSteps
  });
}

async function executeSteps(
  runId: string,
  steps: WorkflowStep[],
  vars: Record<string, unknown>,
  startIndex: number = 0,
  workspaceId: string | null = null
): Promise<void> {
  try {
    for (let i = startIndex; i < steps.length; i++) {
      await db
        .update(workflowRuns)
        .set({ currentStepIndex: i, variables: vars })
        .where(eq(workflowRuns.id, runId));

      const step = steps[i];

      // Handle pause-able steps
      if (step.type === "form" || step.type === "approval") {
        const paused = await executePausableStep(runId, step, vars, i, workspaceId);
        if (paused) return; // execution will resume via submit API
        continue;
      }

      const result = await executeStep(step, vars, workspaceId);
      if (result !== undefined) {
        const saveAs = (step as { saveAs?: string }).saveAs;
        if (saveAs) {
          vars = { ...vars, [saveAs]: result };
        }
      }
    }

    await db
      .update(workflowRuns)
      .set({ status: "completed", completedAt: new Date(), variables: vars })
      .where(eq(workflowRuns.id, runId));
  } catch (err) {
    await db
      .update(workflowRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(workflowRuns.id, runId));
  }
}

async function executePausableStep(
  runId: string,
  step: WorkflowStep & { type: "form" | "approval" },
  vars: Record<string, unknown>,
  stepIndex: number,
  workspaceId: string | null
): Promise<boolean> {
  if (step.type === "form") {
    const title = substituteVariables(step.title, vars);
    let channelId: string | undefined;
    if (step.submitToChannel) {
      const ch = await resolveChannel(step.submitToChannel, workspaceId);
      if (!ch) throw new Error(`form.submitToChannel not found: "${step.submitToChannel}"`);
      channelId = ch.id;
    }

    if (channelId) {
      const fieldLines = step.fields
        .map(f => `• **${f.label}**${f.required ? " (required)" : ""}${f.type === "select" && f.options ? ` [${f.options.join(" | ")}]` : ""}`)
        .join("\n");
      const formMsg = `**${title}**\n\nPlease fill out this form:\n${fieldLines}\n\n_Reply with your responses in format: fieldname: value_`;

      const [member] = await db
        .select({ userId: channelMembers.userId })
        .from(channelMembers)
        .where(eq(channelMembers.channelId, channelId))
        .limit(1);

      if (member) {
        await db.insert(messages).values({
          channelId,
          userId: member.userId,
          content: formMsg,
          contentType: "workflow",
          metadata: { isWorkflow: true, workflowRunId: runId, stepIndex, type: "form" },
        });
      }
    }

    const [run] = await db
      .select({ triggeredBy: workflowRuns.triggeredBy })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
      .limit(1);

    const expectedFrom = run?.triggeredBy ?? "unknown";

    const pendingInput: PendingInput = { type: "form", stepIndex, expectedFrom };
    await db
      .update(workflowRuns)
      .set({ status: "paused", pendingInput })
      .where(eq(workflowRuns.id, runId));

    return true;
  }

  if (step.type === "approval") {
    const message = substituteVariables(step.message, vars);
    const approver = await resolveUser(step.approver);
    if (!approver) throw new Error(`Approver not found: "${step.approver}"`);

    const [run] = await db
      .select({ triggeredBy: workflowRuns.triggeredBy })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
      .limit(1);

    const requester = run?.triggeredBy ?? approver.id;
    const dmId = await findOrCreateDm(requester, approver.id);

    const approvalMsg = `**Approval Required**\n\n${message}\n\n_Reply with **approve** or **reject** to respond._\n\n_Run ID: ${runId}_`;

    await db.insert(messages).values({
      conversationId: dmId,
      userId: requester,
      content: approvalMsg,
      contentType: "workflow",
      metadata: { isWorkflow: true, workflowRunId: runId, stepIndex, type: "approval" },
    });

    const pendingInput: PendingInput = { type: "approval", stepIndex, expectedFrom: approver.id };
    await db
      .update(workflowRuns)
      .set({ status: "paused", pendingInput })
      .where(eq(workflowRuns.id, runId));

    return true;
  }

  return false;
}

async function findOrCreateDm(userId1: string, userId2: string): Promise<string> {
  const existing = await db
    .select({ conversationId: dmMembers.conversationId })
    .from(dmMembers)
    .where(eq(dmMembers.userId, userId1));

  for (const row of existing) {
    const other = await db
      .select()
      .from(dmMembers)
      .where(
        and(
          eq(dmMembers.conversationId, row.conversationId),
          eq(dmMembers.userId, userId2)
        )
      )
      .limit(1);
    if (other.length > 0) return row.conversationId;
  }

  const [conv] = await db.insert(dmConversations).values({}).returning();
  await db.insert(dmMembers).values([
    { conversationId: conv.id, userId: userId1 },
    ...(userId1 !== userId2 ? [{ conversationId: conv.id, userId: userId2 }] : []),
  ]).onConflictDoNothing();
  return conv.id;
}

async function executeStep(
  step: WorkflowStep,
  vars: Record<string, unknown>,
  workspaceId: string | null
): Promise<unknown> {
  switch (step.type) {
    case "send_message":
    case "post_to_channel": {
      const channel = await resolveChannel(step.channel, workspaceId);
      if (!channel) throw new Error(`Channel not found: "${step.channel}"`);
      const messageText = substituteVariables(step.message, vars);

      const [member] = await db
        .select({ userId: channelMembers.userId })
        .from(channelMembers)
        .where(eq(channelMembers.channelId, channel.id))
        .limit(1);

      if (!member) throw new Error(`No members in channel #${channel.name}`);

      const [msg] = await db
        .insert(messages)
        .values({
          channelId: channel.id,
          userId: member.userId,
          content: messageText,
          contentType: "workflow",
          metadata: { isWorkflow: true },
        })
        .returning();

      return msg.content;
    }

    case "ask_agent": {
      const prompt = substituteVariables(step.prompt, vars);
      const agent = await resolveAgent(step.agent);
      if (!agent) throw new Error(`Agent not found: "${step.agent}"`);

      // Post agent response to the trigger channel so it's visible in the UI
      const triggerForAsk = vars.trigger as { channelId?: string } | undefined;

      const agentMessage = await sendToAgent({
        agentId: agent.id,
        text: prompt,
        skillId: step.skillId,
        channelId: triggerForAsk?.channelId,
      });

      return agentMessage.content;
    }

    case "invoke_skill": {
      // Support dynamic agent routing: agent field can contain {{variables}}
      const agentRef = substituteVariables(step.agent, vars);
      const agent = await resolveAgent(agentRef);
      if (!agent) throw new Error(`Agent not found: "${agentRef}" (original: "${step.agent}")`);

      const card = agent.agentCardJson as {
        skills?: Array<{
          id: string;
          name: string;
          description: string;
          instruction?: string;
        }>;
      } | null;
      const skill = card?.skills?.find((s) => s.id === step.skillId);
      if (!skill) {
        const available = card?.skills?.map((s) => s.id).join(", ") || "none";
        throw new Error(
          `Skill "${step.skillId}" not found on agent ${agent.displayName}. Available: ${available}`
        );
      }

      const resolvedInputs = step.inputs
        ? Object.fromEntries(
            Object.entries(step.inputs).map(([k, v]) => [
              k,
              substituteVariables(v, vars),
            ])
          )
        : {};

      // Build a human-readable prompt for the agent
      const inputsBlock = Object.keys(resolvedInputs).length
        ? Object.entries(resolvedInputs)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")
        : "";

      const skillMessage = [
        `[A2A Skill Invocation]`,
        `Skill: ${skill.name} (${skill.id})`,
        `Description: ${skill.description}`,
        skill.instruction ? `Instruction: ${skill.instruction}` : "",
        "",
        inputsBlock
          ? `Inputs:\n${inputsBlock}`
          : "Execute this skill with the conversation context.",
      ]
        .filter(Boolean)
        .join("\n");

      // Pass inputs as metadata.variables for external A2A agents (e.g. unblock-agents)
      // that expect structured variables rather than text-formatted inputs.
      // Also pass channelId from trigger so responses appear in the channel.
      const trigger = vars.trigger as { channelId?: string } | undefined;

      const agentMessage = await sendToAgent({
        agentId: agent.id,
        text: skillMessage,
        skillId: step.skillId,
        variables: Object.keys(resolvedInputs).length > 0 ? resolvedInputs : undefined,
        channelId: trigger?.channelId,
      });

      return agentMessage.content;
    }

    case "parse_assignment": {
      const text = substituteVariables(step.input, vars);
      return parseAssignmentResponse(text);
    }

    case "parse_verdict": {
      const text = substituteVariables(step.input, vars);
      return parseVerdictResponse(text);
    }

    case "loop": {
      const maxIter = Math.min(step.maxIterations ?? 3, 10);
      const onMaxReached = step.onMaxReached ?? "continue";
      let loopVars = { ...vars };

      for (let iteration = 0; iteration < maxIter; iteration++) {
        // Check until condition BEFORE each iteration — exit if truthy
        if (Boolean(resolveVarPath(loopVars, step.until))) break;

        // Execute loop body
        for (const bodyStep of step.steps) {
          const result = await executeStep(bodyStep, loopVars, workspaceId);
          const saveAs = (bodyStep as { saveAs?: string }).saveAs;
          if (saveAs && result !== undefined) {
            loopVars = { ...loopVars, [saveAs]: result };
          }
        }
      }

      // Check if maxIterations reached without condition met
      if (!Boolean(resolveVarPath(loopVars, step.until)) && onMaxReached === "fail") {
        throw new Error(`Loop exceeded maxIterations (${maxIter}) without "${step.until}" becoming truthy`);
      }

      // Merge loop vars back to parent scope
      Object.assign(vars, loopVars);
      return undefined;
    }

    case "condition": {
      const condValue = resolveVarPath(vars, step.if);
      const isTruthy = Boolean(condValue);
      const branchSteps = isTruthy ? step.then : (step.else ?? []);

      let branchVars = { ...vars };
      for (const branchStep of branchSteps) {
        const result = await executeStep(branchStep, branchVars, workspaceId);
        const saveAs = (branchStep as { saveAs?: string }).saveAs;
        if (saveAs && result !== undefined) {
          branchVars = { ...branchVars, [saveAs]: result };
        }
      }

      Object.assign(vars, branchVars);
      return undefined;
    }

    case "wait": {
      await new Promise((resolve) => setTimeout(resolve, step.durationMs));
      return undefined;
    }

    case "create_channel": {
      const channelName = substituteVariables(step.name, vars)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
      const description = step.description
        ? substituteVariables(step.description, vars)
        : undefined;

      const targetWorkspaceId = workspaceId ?? (await (async () => {
        const [any] = await db
          .select({ workspaceId: channels.workspaceId })
          .from(channels)
          .limit(1);
        return any?.workspaceId ?? null;
      })());

      if (!targetWorkspaceId) {
        throw new Error("No workspace found to create channel in");
      }

      const [existing] = await db
        .select()
        .from(channels)
        .where(
          and(
            eq(channels.workspaceId, targetWorkspaceId),
            eq(channels.name, channelName),
            eq(channels.isArchived, false)
          )
        )
        .limit(1);

      const newChannel = existing
        ? existing
        : (
            await db
              .insert(channels)
              .values({
                name: channelName,
                description: description ?? null,
                workspaceId: targetWorkspaceId,
                isPrivate: false,
                isArchived: false,
              })
              .returning()
          )[0];

      if (step.inviteAgents?.length) {
        for (const agentRef of step.inviteAgents) {
          const agent = await resolveAgent(agentRef);
          if (!agent) continue;
          await db
            .insert(channelMembers)
            .values({ channelId: newChannel.id, userId: agent.id, role: "member" })
            .onConflictDoNothing();
        }
      }

      return newChannel.name;
    }

    case "dm_user": {
      const messageText = substituteVariables(step.message, vars);
      const user = await resolveUser(step.user);
      if (!user) throw new Error(`User not found: "${step.user}"`);

      const [run] = await db
        .select({ triggeredBy: workflowRuns.triggeredBy })
        .from(workflowRuns)
        .limit(1);

      const sender = run?.triggeredBy ?? user.id;
      const dmId = await findOrCreateDm(sender, user.id);

      await db.insert(messages).values({
        conversationId: dmId,
        userId: sender,
        content: messageText,
        contentType: "workflow",
        metadata: { isWorkflow: true },
      });

      return undefined;
    }

    case "add_to_channel": {
      const channel = await resolveChannel(step.channel, workspaceId);
      if (!channel) throw new Error(`Channel not found: "${step.channel}"`);
      const user = await resolveUser(step.user);
      if (!user) throw new Error(`User not found: "${step.user}"`);

      await db
        .insert(channelMembers)
        .values({ channelId: channel.id, userId: user.id, role: "member" })
        .onConflictDoNothing();
      return undefined;
    }

    case "write_canvas": {
      const channel = await resolveChannel(step.channel, workspaceId);
      if (!channel) throw new Error(`Channel not found: "${step.channel}"`);

      const content = substituteVariables(step.content, vars);
      const title = step.title ? substituteVariables(step.title, vars) : undefined;

      const { executeTool } = await import("@/lib/mcp/executor");
      const toolName = step.append ? "canvas_append" : "canvas_write";
      const params: Record<string, unknown> = { channelId: channel.id, content };
      if (title) params.title = title;

      const result = await executeTool("slack", toolName, params);
      if (!result.success) {
        throw new Error(`write_canvas failed: ${result.content}`);
      }

      return content;
    }

    case "create_canvas": {
      const channel = await resolveChannel(step.channel, workspaceId);
      if (!channel) throw new Error(`Channel not found: "${step.channel}"`);
      if (!workspaceId) throw new Error("create_canvas requires workspaceId");

      const title = substituteVariables(step.title, vars);
      const topic = step.topic ? substituteVariables(step.topic, vars) : title;

      // createdBy comes from whoever triggered this workflow; fall back to
      // the first channel member when the trigger is system-initiated.
      const triggeredBy =
        (vars.triggeredBy as string | undefined) ??
        (
          await db
            .select({ userId: channelMembers.userId })
            .from(channelMembers)
            .where(eq(channelMembers.channelId, channel.id))
            .limit(1)
        )[0]?.userId;
      if (!triggeredBy) throw new Error("create_canvas: no creator available");

      const [canvas] = await db
        .insert(canvases)
        .values({
          channelId: channel.id,
          workspaceId,
          title,
          topic,
          content: "",
          pipelineStatus: "draft",
          createdBy: triggeredBy,
        })
        .returning();

      return canvas.id;
    }

    case "form":
    case "approval":
      // These are handled in executeSteps via executePausableStep
      return undefined;

    default:
      throw new Error(`Unknown step type: ${(step as { type: string }).type}`);
  }
}
