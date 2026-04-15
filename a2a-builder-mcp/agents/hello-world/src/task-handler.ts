import OpenAI from "openai";

const llm = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || "http://localhost:8100/v1",
  apiKey: "not-needed",
});

const MODEL = process.env.LLM_MODEL || "gemma-4-31B-it";

interface Task {
  id: string;
  status: { state: string; message?: { role: string; parts: { type: string; text: string }[] } };
  artifacts?: { parts: { type: string; text: string }[] }[];
}

const tasks = new Map<string, Task>();

export async function handleTaskSend(params: any): Promise<Task> {
  const taskId = params.id || crypto.randomUUID();
  const userMessage = params.message?.parts
    ?.filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join("\n") || "";

  const task: Task = {
    id: taskId,
    status: { state: "working" },
  };
  tasks.set(taskId, task);

  try {
    const response = await llm.chat.completions.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [
        { role: "system", content: "You are hello-world. A simple test agent that greets users. Respond helpfully and concisely." },
        { role: "user", content: userMessage },
      ],
    });

    const text = response.choices[0]?.message?.content || "";

    task.status = {
      state: "completed",
      message: {
        role: "agent",
        parts: [{ type: "text", text }],
      },
    };
    task.artifacts = [{ parts: [{ type: "text", text }] }];
    tasks.set(taskId, task);
    return task;
  } catch (err: any) {
    task.status = {
      state: "failed",
      message: {
        role: "agent",
        parts: [{ type: "text", text: `Error: ${err.message}` }],
      },
    };
    tasks.set(taskId, task);
    return task;
  }
}

export async function handleTaskGet(params: any): Promise<Task> {
  const task = tasks.get(params.id);
  if (!task) {
    throw new Error(`Task not found: ${params.id}`);
  }
  return task;
}
