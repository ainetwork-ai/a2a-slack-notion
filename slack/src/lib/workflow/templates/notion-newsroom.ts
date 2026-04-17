/**
 * Notion Newsroom Pipeline — pre-built workflow template.
 *
 * Drives a full editorial pipeline as first-class workflow steps:
 *   1.  notion_create_page     — create the article page
 *   2a. notion_append_block    — heading_1 block
 *   2b. notion_append_block    — paragraph block (body placeholder)
 *   3.  notion_advance_status  — draft → edited
 *   4.  notion_notify          — notify editors
 *   5.  approval               — editor approval gate
 *   6.  notion_advance_status  — edited → fact-checked
 *   7.  notion_notify          — notify fact-checkers
 *   8.  approval               — fact-checker approval gate
 *   9.  notion_advance_status  — fact-checked → published
 *   10. send_message           — post page link to channel
 */

import type { WorkflowStep } from "@/lib/workflow/types";

export interface WorkflowDefinition {
  name: string;
  description: string;
  icon: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  steps: WorkflowStep[];
}

export const NEWSROOM_TEMPLATE: WorkflowDefinition = {
  name: "Notion newsroom pipeline",
  description:
    "Creates a Notion page for a new article, runs it through editor and fact-checker approval gates, advances pipeline status at each stage, and posts the final link to the channel.",
  icon: "📰",
  triggerType: "shortcut",
  triggerConfig: { label: "Publish news article (Notion)" },
  steps: [
    // ── 1. Create the article page ──────────────────────────────────────────
    {
      type: "notion_create_page",
      workspaceId: "{{trigger.workspaceId}}",
      title: "{{articleTitle}}",
      blockMarkdown: "# {{articleTitle}}\n\n{{articleBody}}",
      saveAs: "notionPage",
    },

    // ── 2a. Append heading block ─────────────────────────────────────────────
    {
      type: "notion_append_block",
      pageId: "{{notionPage.pageId}}",
      blockType: "heading_1",
      content: "{{articleTitle}}",
      saveAs: "headingBlock",
    },

    // ── 2b. Append body paragraph block ─────────────────────────────────────
    {
      type: "notion_append_block",
      pageId: "{{notionPage.pageId}}",
      blockType: "text",
      content: "{{articleBody}}",
      saveAs: "bodyBlock",
    },

    // ── 3. Advance status: draft → edited ────────────────────────────────────
    {
      type: "notion_advance_status",
      canvasId: "{{articleCanvasId}}",
      nextStatus: "edited",
    },

    // ── 4. Notify editors ────────────────────────────────────────────────────
    {
      type: "notion_notify",
      pageId: "{{notionPage.pageId}}",
      userIds: "{{editorUserIds}}",
      title: "Article ready for editing: {{articleTitle}}",
      body: "Please review and edit the article draft.",
    },

    // ── 5. Editor approval gate ──────────────────────────────────────────────
    {
      type: "approval",
      approver: "{{editorApprover}}",
      message:
        "Article **{{articleTitle}}** is ready for your editorial review.\n\nPage ID: {{notionPage.pageId}}\n\nApprove to advance to fact-checking.",
      saveAs: "editorApproval",
    },

    // ── 6. Advance status: edited → fact-checked ─────────────────────────────
    {
      type: "notion_advance_status",
      canvasId: "{{articleCanvasId}}",
      nextStatus: "fact-checked",
    },

    // ── 7. Notify fact-checkers ──────────────────────────────────────────────
    {
      type: "notion_notify",
      pageId: "{{notionPage.pageId}}",
      userIds: "{{factCheckerUserIds}}",
      title: "Article ready for fact-checking: {{articleTitle}}",
      body: "Please verify all facts in the article before publication.",
    },

    // ── 8. Fact-checker approval gate ────────────────────────────────────────
    {
      type: "approval",
      approver: "{{factCheckerApprover}}",
      message:
        "Article **{{articleTitle}}** has passed editorial review.\n\nPage ID: {{notionPage.pageId}}\n\nApprove to mark as fact-checked and publish.",
      saveAs: "factCheckerApproval",
    },

    // ── 9. Advance status: fact-checked → published ──────────────────────────
    {
      type: "notion_advance_status",
      canvasId: "{{articleCanvasId}}",
      nextStatus: "published",
    },

    // ── 10. Post page link to channel ────────────────────────────────────────
    {
      type: "send_message",
      channel: "",
      message:
        "**[PUBLISHED]** {{articleTitle}}\n\nNotion page: {{notionPage.pageId}}\n\nThe article has completed the full editorial pipeline and is now live.",
    },
  ],
};
