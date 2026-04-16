export type FormField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "number";
  options?: string[];
  required?: boolean;
};

export type WorkflowStep =
  | { type: "send_message"; channelId: string; message: string; saveAs?: string }
  | {
      // A2A skill invocation — preferred. The agent's A2A card defines what
      // the skill does (name, description, instruction). Callers just pass
      // inputs and save the result. No free-form prompt needed.
      //
      // `agent` is the agent's display name (e.g. "Reporter") or a2aId —
      // UUIDs are discouraged since agents are discoverable by name in the
      // workspace.
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
      agentId: string;
      skillId?: string;
      prompt: string;
      saveAs?: string;
    }
  | { type: "condition"; if: string; then: WorkflowStep[]; else?: WorkflowStep[] }
  | { type: "wait"; durationMs: number }
  | { type: "create_channel"; name: string; description?: string; inviteAgents?: string[] }
  | { type: "post_to_channel"; channelId: string; message: string }
  | { type: "form"; title: string; fields: FormField[]; submitToChannelId?: string; saveAs?: string }
  | { type: "approval"; approverUserId: string; message: string; saveAs?: string; onApprove?: WorkflowStep[]; onReject?: WorkflowStep[] }
  | { type: "dm_user"; userId: string; message: string }
  | { type: "add_to_channel"; channelId: string; userId: string }
  | {
      // Write markdown content to a channel's canvas. Replaces existing
      // canvas content unless `append` is true.
      type: "write_canvas";
      channel: string; // channel name or UUID
      content: string; // markdown, supports {{variables}}
      title?: string;
      append?: boolean;
      saveAs?: string;
    };

export type WorkflowTrigger =
  | { type: "manual" }
  | { type: "schedule"; cron: string }
  | { type: "channel_message"; channelId: string; pattern?: string }
  | { type: "channel_join"; channelId: string }
  | { type: "mention"; agentId: string }
  | { type: "slash_command"; command: string }
  | { type: "shortcut"; channelId?: string; label: string };

export type PendingInput =
  | { type: "form"; stepIndex: number; expectedFrom: string }
  | { type: "approval"; stepIndex: number; expectedFrom: string };
