import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { agentCard } from "./agent-card.js";
import { handleTaskSend, handleTaskGet } from "./task-handler.js";

const app = new Hono();

app.use("*", cors());

// Agent Card discovery
app.get("/.well-known/agent.json", (c) => {
  const baseUrl = `${c.req.header("x-forwarded-proto") || "http"}://${c.req.header("host")}`;
  return c.json(agentCard(baseUrl));
});

// JSON-RPC 2.0 endpoint
app.post("/", async (c) => {
  const body = await c.req.json();
  const { method, id, params } = body;

  try {
    let result: unknown;
    switch (method) {
      case "tasks/send":
        result = await handleTaskSend(params);
        break;
      case "tasks/get":
        result = await handleTaskGet(params);
        break;
      default:
        return c.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
    }
    return c.json({ jsonrpc: "2.0", id, result });
  } catch (err: any) {
    return c.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: err.message || "Internal error" },
    });
  }
});

const port = parseInt(process.env.PORT || "3100");
console.log(`A2A Agent "hello-world" running on http://localhost:${port}`);
console.log(`Agent card: http://localhost:${port}/.well-known/agent.json`);
serve({ fetch: app.fetch, port });
