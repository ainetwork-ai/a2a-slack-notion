import Anthropic from '@anthropic-ai/sdk';
import { dispatchTool, TOOLS } from './tools.js';
import type { Context } from 'hono';

const MAX_ITERATIONS = 10;
const TIMEOUT_MS = 60_000;

// Build Anthropic tool definitions from TOOLS array
function buildAnthropicTools(): Anthropic.Messages.Tool[] {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Messages.Tool.InputSchema,
  }));
}

// Run Claude SDK tool-calling loop, streaming SSE to response
export async function handleA2A(c: Context): Promise<Response> {
  // 1. Bearer auth check
  const authHeader = c.req.header('Authorization');
  const apiKey = process.env['NOTION_API_KEY'] ?? '';
  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // 2. Parse A2A JSON-RPC body
  let body: { params?: { message?: { parts?: Array<{ text?: string }> } } };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const userMessage =
    body?.params?.message?.parts
      ?.map((p: { text?: string }) => p.text ?? '')
      .join('') ?? '';

  // 3. Set up AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // 4. Stream SSE response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(streamController) {
      const sendSSE = (event: string, data: unknown) => {
        streamController.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        const anthropic = new Anthropic({
          apiKey: process.env['ANTHROPIC_API_KEY'],
        });
        const tools = buildAnthropicTools();
        const messages: Anthropic.Messages.MessageParam[] = [
          { role: 'user', content: userMessage },
        ];
        let iterations = 0;

        while (iterations < MAX_ITERATIONS) {
          if (controller.signal.aborted) {
            sendSSE('error', { message: 'Request timed out' });
            break;
          }

          iterations++;
          const response = await anthropic.messages.create({
            model: process.env['MODEL_ID'] ?? 'claude-sonnet-4-6',
            max_tokens: 4096,
            tools,
            messages,
          });

          if (response.stop_reason === 'end_turn') {
            const textContent = response.content
              .filter(
                (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
              )
              .map((b) => b.text)
              .join('');
            sendSSE('message', { text: textContent });
            break;
          }

          if (response.stop_reason === 'tool_use') {
            const toolUseBlocks = response.content.filter(
              (b): b is Anthropic.Messages.ToolUseBlock =>
                b.type === 'tool_use',
            );
            messages.push({ role: 'assistant', content: response.content });

            const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
            for (const toolUse of toolUseBlocks) {
              const result = await dispatchTool(
                toolUse.name,
                toolUse.input as Record<string, unknown>,
              );
              sendSSE('tool_use', { tool: toolUse.name, result });
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: result.content[0]?.text ?? '',
                is_error: result.isError,
              });
            }
            messages.push({ role: 'user', content: toolResults });
          }
        }

        if (iterations >= MAX_ITERATIONS) {
          sendSSE('error', { message: 'Max iterations reached' });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendSSE('error', { message: msg });
      } finally {
        clearTimeout(timeoutId);
        streamController.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
