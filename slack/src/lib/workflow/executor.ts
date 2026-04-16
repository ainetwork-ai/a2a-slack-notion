import { db } from "@/lib/db";
import { workflows, workflowRuns, channels, channelMembers, messages, dmConversations, dmMembers, users } from "@/lib/db/schema";
import { eq, and, or, ilike } from "drizzle-orm";
import { sendToAgent } from "@/lib/a2a/message-bridge";
import { substituteVariables } from "./substitute";
import type { WorkflowStep, PendingInput } from "./types";

/**
 * Resolve an agent reference (name, a2aId, or UUID) to the agent row.
 * Prefer name/a2aId per workspace convention; UUID is accepted for back-compat.
 */
async function resolveAgent(ref: string): Promise<{
  id: string;
  displayName: string;
  agentCardJson: unknown;
} | null> {
  const trimmed = ref.trim().replace(/^@/, "");
  if (!trimmed) return null;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    trimmed
  );

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
 * Resolve a channel reference (name with or without #, or UUID).
 */
async function resolveChannel(ref: string): Promise<{ id: string; name: string } | null> {
  const trimmed = ref.trim().replace(/^#/, "");
  if (!trimmed) return null;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    trimmed
  );

  const [row] = await db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .where(isUuid ? eq(channels.id, trimmed) : ilike(channels.name, trimmed))
    .limit(1);

  return row ?? null;
}

/**
 * Resolve a user reference (display name or UUID).
 */
async function resolveUser(ref: string): Promise<{ id: string; displayName: string } | null> {
  const trimmed = ref.trim().replace(/^@/, "");
  if (!trimmed) return null;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    trimmed
  );

  const [row] = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(isUuid ? eq(users.id, trimmed) : ilike(users.displayName, trimmed))
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
  executeSteps(run.id, workflow.steps as WorkflowStep[], {
    ...(initialVariables ?? {}),
  }, 0).catch(() => {
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

  executeSteps(runId, workflow.steps as WorkflowStep[], vars, resumeFrom).catch(() => {
    // Error handling is done inside executeSteps
  });
}

async function executeSteps(
  runId: string,
  steps: WorkflowStep[],
  vars: Record<string, unknown>,
  startIndex: number = 0
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
        const paused = await executePausableStep(runId, step, vars, i);
        if (paused) return; // execution will resume via submit API
        // If not paused (e.g. no approver found), continue
        continue;
      }

      const result = await executeStep(step, vars);
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
  stepIndex: number
): Promise<boolean> {
  if (step.type === "form") {
    const title = substituteVariables(step.title, vars);
    const channelId = step.submitToChannelId;

    // Post form message to channel if specified
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

    // Get triggeredBy user to expect response from
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
    const approverUserId = step.approverUserId;

    // Find or create DM with approver
    const dmId = await findOrCreateDm(approverUserId, approverUserId);

    const approvalMsg = `**Approval Required**\n\n${message}\n\n_Reply with **approve** or **reject** to respond._\n\n_Run ID: ${runId}_`;

    await db.insert(messages).values({
      conversationId: dmId,
      userId: approverUserId,
      content: approvalMsg,
      contentType: "workflow",
      metadata: { isWorkflow: true, workflowRunId: runId, stepIndex, type: "approval" },
    });

    const pendingInput: PendingInput = { type: "approval", stepIndex, expectedFrom: approverUserId };
    await db
      .update(workflowRuns)
      .set({ status: "paused", pendingInput })
      .where(eq(workflowRuns.id, runId));

    return true;
  }

  return false;
}

async function findOrCreateDm(userId1: string, userId2: string): Promise<string> {
  // Look for existing DM between the two users
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

  // Create new DM
  const [conv] = await db.insert(dmConversations).values({}).returning();
  await db.insert(dmMembers).values([
    { conversationId: conv.id, userId: userId1 },
    ...(userId1 !== userId2 ? [{ conversationId: conv.id, userId: userId2 }] : []),
  ]).onConflictDoNothing();
  return conv.id;
}

async function executeStep(
  step: WorkflowStep,
  vars: Record<string, unknown>
): Promise<unknown> {
  switch (step.type) {
    case "send_message":
    case "post_to_channel": {
      const channelId = step.channelId;
      const messageText = substituteVariables(step.message, vars);

      // Find first member to send as (system/workflow user)
      const [member] = await db
        .select({ userId: channelMembers.userId })
        .from(channelMembers)
        .where(eq(channelMembers.channelId, channelId))
        .limit(1);

      if (!member) throw new Error(`No members found in channel ${channelId}`);

      const [msg] = await db
        .insert(messages)
        .values({
          channelId,
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

      const agentMessage = await sendToAgent({
        agentId: step.agentId,
        text: prompt,
        skillId: step.skillId,
      });

      return agentMessage.content;
    }

    case "invoke_skill": {
      // Resolve agent by name (preferred) or UUID
      const agent = await resolveAgent(step.agent);
      if (!agent) {
        throw new Error(`Agent not found: "${step.agent}"`);
      }

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

      // Build structured skill invocation. The agent's system prompt + skill
      // instruction drive behavior — no free-form prompt needed.
      const resolvedInputs = step.inputs
        ? Object.fromEntries(
            Object.entries(step.inputs).map(([k, v]) => [
              k,
              substituteVariables(v, vars),
            ])
          )
        : {};

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

      const agentMessage = await sendToAgent({
        agentId: agent.id,
        text: skillMessage,
        skillId: step.skillId,
      });

      return agentMessage.content;
    }

    case "condition": {
      const conditionKey = step.if.trim();
      const condValue = conditionKey
        .split(".")
        .reduce(
          (obj: unknown, k: string) =>
            obj != null && typeof obj === "object"
              ? (obj as Record<string, unknown>)[k]
              : undefined,
          vars as unknown
        );

      const isTruthy = Boolean(condValue);
      const branchSteps = isTruthy ? step.then : (step.else ?? []);

      // Execute branch steps and collect variables
      let branchVars = { ...vars };
      for (const branchStep of branchSteps) {
        const result = await executeStep(branchStep, branchVars);
        const saveAs = (branchStep as { saveAs?: string }).saveAs;
        if (saveAs && result !== undefined) {
          branchVars = { ...branchVars, [saveAs]: result };
        }
      }

      // Merge branch vars back
      Object.assign(vars, branchVars);
      return undefined;
    }

    case "wait": {
      await new Promise((resolve) => setTimeout(resolve, step.durationMs));
      return undefined;
    }

    case "create_channel": {
      const channelName = substituteVariables(step.name, vars);
      const description = step.description
        ? substituteVariables(step.description, vars)
        : undefined;

      // Find a workspace to create in — use first available
      const [existingChannel] = await db
        .select({ workspaceId: channels.workspaceId })
        .from(channels)
        .limit(1);

      if (!existingChannel?.workspaceId) {
        throw new Error("No workspace found to create channel in");
      }

      const [newChannel] = await db
        .insert(channels)
        .values({
          name: channelName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          description: description ?? null,
          workspaceId: existingChannel.workspaceId,
          isPrivate: false,
          isArchived: false,
        })
        .returning();

      // Invite agents if specified
      if (step.inviteAgents?.length) {
        for (const agentId of step.inviteAgents) {
          await db
            .insert(channelMembers)
            .values({ channelId: newChannel.id, userId: agentId, role: "member" })
            .onConflictDoNothing();
        }
      }

      return newChannel.id;
    }

    case "dm_user": {
      const messageText = substituteVariables(step.message, vars);
      const dmId = await findOrCreateDm(step.userId, step.userId);

      await db.insert(messages).values({
        conversationId: dmId,
        userId: step.userId,
        content: messageText,
        contentType: "workflow",
        metadata: { isWorkflow: true },
      });

      return undefined;
    }

    case "add_to_channel": {
      await db
        .insert(channelMembers)
        .values({ channelId: step.channelId, userId: step.userId, role: "member" })
        .onConflictDoNothing();
      return undefined;
    }

    case "write_canvas": {
      const channel = await resolveChannel(step.channel);
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

    case "form":
    case "approval":
      // These are handled in executeSteps via executePausableStep
      return undefined;

    default:
      throw new Error(`Unknown step type: ${(step as { type: string }).type}`);
  }
}
