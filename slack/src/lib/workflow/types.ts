export type FormField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "number";
  options?: string[];
  required?: boolean;
};

export type WorkflowStep =
  | { type: "send_message"; channelId: string; message: string; saveAs?: string }
  | { type: "ask_agent"; agentId: string; skillId?: string; prompt: string; saveAs?: string }
  | { type: "condition"; if: string; then: WorkflowStep[]; else?: WorkflowStep[] }
  | { type: "wait"; durationMs: number }
  | { type: "create_channel"; name: string; description?: string; inviteAgents?: string[] }
  | { type: "post_to_channel"; channelId: string; message: string }
  | { type: "form"; title: string; fields: FormField[]; submitToChannelId?: string; saveAs?: string }
  | { type: "approval"; approverUserId: string; message: string; saveAs?: string; onApprove?: WorkflowStep[]; onReject?: WorkflowStep[] }
  | { type: "dm_user"; userId: string; message: string }
  | { type: "add_to_channel"; channelId: string; userId: string };

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
