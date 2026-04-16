export type WorkflowStep =
  | { type: "send_message"; channelId: string; message: string; saveAs?: string }
  | { type: "ask_agent"; agentId: string; skillId?: string; prompt: string; saveAs?: string }
  | { type: "condition"; if: string; then: WorkflowStep[]; else?: WorkflowStep[] }
  | { type: "wait"; durationMs: number }
  | { type: "create_channel"; name: string; description?: string; inviteAgents?: string[] }
  | { type: "post_to_channel"; channelId: string; message: string };

export type WorkflowTrigger =
  | { type: "manual" }
  | { type: "schedule"; cron: string }
  | { type: "channel_message"; channelId: string; pattern?: string }
  | { type: "channel_join"; channelId: string }
  | { type: "mention"; agentId: string };
