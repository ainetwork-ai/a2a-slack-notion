import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "agents.json");

interface SavedAgent {
  url: string;
  card: Record<string, unknown>;
  fetchedAt: string;
  updatedAt: string;
}

function readDB(): SavedAgent[] {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeDB(data: SavedAgent[]) {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// GET: list all saved agents
export async function GET() {
  const agents = readDB();
  return NextResponse.json(agents);
}

// POST: add or update an agent (dedup by url)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { url, card } = body;

  if (!url || !card) {
    return NextResponse.json(
      { error: "url and card are required" },
      { status: 400 }
    );
  }

  const agents = readDB();
  const now = new Date().toISOString();
  const existing = agents.findIndex((a) => a.url === url);

  if (existing >= 0) {
    agents[existing] = { ...agents[existing]!, card, updatedAt: now };
  } else {
    agents.push({ url, card, fetchedAt: now, updatedAt: now });
  }

  writeDB(agents);
  return NextResponse.json({ ok: true, count: agents.length });
}

// DELETE: remove an agent by url
export async function DELETE(request: NextRequest) {
  const { url } = await request.json();

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const agents = readDB();
  const filtered = agents.filter((a) => a.url !== url);
  writeDB(filtered);
  return NextResponse.json({ ok: true, count: filtered.length });
}
