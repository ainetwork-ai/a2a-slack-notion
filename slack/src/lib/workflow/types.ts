export type FormField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "number";
  options?: string[];
  required?: boolean;
};

/**
 * All entity references in steps/triggers are natural keys (resolved at runtime):
 *   - `channel` — channel name (e.g. "general"), scoped by workflow.workspaceId
 *   - `agent`   — a2aId / displayName (e.g. "bitcoinnewsresearcher")
 *   - `user` / `approver` — AIN address (0x…) or displayName
 */
export type WorkflowStep =
  | { type: "send_message"; channel: string; message: string; saveAs?: string }
  | {
      // A2A skill invocation — preferred. The agent's A2A card defines what
      // the skill does (name, description, instruction). Callers just pass
      // inputs and save the result. No free-form prompt needed.
      type: "invoke_skill";
      agent: string;
      skillId: string;
      inputs?: Record<string, string>;
      saveAs?: string;
    }
  | {
      // @deprecated — use `invoke_skill` with a skill defined in the agent's
      // A2A card. This type remains for backwards compatibility only.
      type: "ask_agent";
      agent: string;
      skillId?: string;
      prompt: string;
      saveAs?: string;
    }
  | { type: "condition"; if: string; then: WorkflowStep[]; else?: WorkflowStep[] }
  | { type: "wait"; durationMs: number }
  | { type: "create_channel"; name: string; description?: string; inviteAgents?: string[] }
  | { type: "post_to_channel"; channel: string; message: string }
  | { type: "form"; title: string; fields: FormField[]; submitToChannel?: string; saveAs?: string }
  | { type: "approval"; approver: string; message: string; saveAs?: string; onApprove?: WorkflowStep[]; onReject?: WorkflowStep[] }
  | { type: "dm_user"; user: string; message: string }
  | { type: "add_to_channel"; channel: string; user: string }
  | {
      // Write markdown content to a channel's canvas. Replaces existing
      // canvas content unless `append` is true.
      type: "write_canvas";
      channel: string;
      content: string;
      title?: string;
      append?: boolean;
      saveAs?: string;
    }
  | {
      /** Create a new per-article canvas and expose its ID via saveAs. */
      type: "create_canvas";
      channel: string;
      title: string;
      topic?: string;
      saveAs?: string;
    }
  | {
      /** Parse Damien's assignment response to extract reporter/manager IDs.
       *  Returns { reporter, manager, reporterKor, managerKor }. */
      type: "parse_assignment";
      input: string;
      saveAs: string;
    }
  | {
      /** Parse confirm response to extract approved/rejected verdict.
       *  Returns { approved: boolean }. */
      type: "parse_verdict";
      input: string;
      saveAs: string;
    }
  | {
      /** Repeat steps until a variable becomes truthy, with a safety cap. */
      type: "loop";
      until: string;
      steps: WorkflowStep[];
      maxIterations?: number;
      onMaxReached?: "continue" | "fail";
    };

export type WorkflowTrigger =
  | { type: "manual" }
  | { type: "schedule"; cron: string }
  | { type: "channel_message"; channel: string; pattern?: string }
  | { type: "channel_join"; channel: string }
  | { type: "mention"; agent: string }
  | { type: "slash_command"; command: string }
  | { type: "shortcut"; channel?: string; label: string };

export type PendingInput =
  | { type: "form"; stepIndex: number; expectedFrom: string }
  | { type: "approval"; stepIndex: number; expectedFrom: string };
