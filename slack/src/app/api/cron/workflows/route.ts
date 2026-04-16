import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { runWorkflow } from "@/lib/workflow/executor";

function matchesCron(cron: string, now: Date): boolean {
  // Simple cron matching: minute hour dom month dow
  // Supports * and exact values only (no ranges/steps)
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dom, month, dow] = parts;
  const checks = [
    { value: now.getMinutes(), pattern: minute },
    { value: now.getHours(), pattern: hour },
    { value: now.getDate(), pattern: dom },
    { value: now.getMonth() + 1, pattern: month },
    { value: now.getDay(), pattern: dow },
  ];

  return checks.every(({ value, pattern }) => pattern === "*" || parseInt(pattern, 10) === value);
}

export async function GET() {
  const now = new Date();

  const scheduledWorkflows = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.triggerType, "schedule"), eq(workflows.enabled, true)));

  let fired = 0;
  for (const workflow of scheduledWorkflows) {
    const config = workflow.triggerConfig as { cron?: string } | null;
    if (!config?.cron) continue;

    if (matchesCron(config.cron, now)) {
      runWorkflow(workflow.id, { trigger: { type: "schedule", time: now.toISOString() } }).catch(
        () => {
          // Fire-and-forget, don't block
        }
      );
      fired++;
    }
  }

  return NextResponse.json({ checked: scheduledWorkflows.length, fired });
}
