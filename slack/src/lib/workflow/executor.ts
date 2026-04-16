import { db } from "@/lib/db";
import { workflows, workflowRuns, channels, channelMembers, messages } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { sendToAgent } from "@/lib/a2a/message-bridge";
import { substituteVariables } from "./substitute";
import type { WorkflowStep } from "./types";

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
  }).catch(() => {
    // Error handling is done inside executeSteps
  });

  return { runId: run.id, status: "running" };
}

async function executeSteps(
  runId: string,
  steps: WorkflowStep[],
  vars: Record<string, unknown>
): Promise<void> {
  try {
    for (let i = 0; i < steps.length; i++) {
      await db
        .update(workflowRuns)
        .set({ currentStepIndex: i, variables: vars })
        .where(eq(workflowRuns.id, runId));

      const step = steps[i];
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

    default:
      throw new Error(`Unknown step type: ${(step as { type: string }).type}`);
  }
}
