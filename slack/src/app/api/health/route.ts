import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

const MEILI_HOST = process.env.MEILI_HOST ?? "http://localhost:7700";
const HOCUSPOCUS_PORT = process.env.HOCUSPOCUS_PORT ?? "1234";

type CheckStatus = "ok" | "error";

interface CheckResult {
  status: CheckStatus;
  latencyMs: number;
  error?: string;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await promise;
  } finally {
    clearTimeout(timer);
  }
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await withTimeout(db.execute(sql`SELECT 1`), 1000);
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkMeilisearch(): Promise<CheckResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch(`${MEILI_HOST}/health`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkHocuspocus(): Promise<CheckResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch(`http://localhost:${HOCUSPOCUS_PORT}/`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const [dbResult, meiliResult, hocuspocusResult] = await Promise.allSettled([
    checkDatabase(),
    checkMeilisearch(),
    checkHocuspocus(),
  ]);

  const checks = {
    database: dbResult.status === "fulfilled" ? dbResult.value : { status: "error" as CheckStatus, latencyMs: 0, error: String(dbResult.reason) },
    meilisearch: meiliResult.status === "fulfilled" ? meiliResult.value : { status: "error" as CheckStatus, latencyMs: 0, error: String(meiliResult.reason) },
    hocuspocus: hocuspocusResult.status === "fulfilled" ? hocuspocusResult.value : { status: "error" as CheckStatus, latencyMs: 0, error: String(hocuspocusResult.reason) },
  };

  let status: "ok" | "degraded" | "unhealthy";
  if (checks.database.status === "error") {
    status = "unhealthy";
  } else if (checks.meilisearch.status === "error" || checks.hocuspocus.status === "error") {
    status = "degraded";
  } else {
    status = "ok";
  }

  const httpStatus = status === "unhealthy" ? 503 : 200;

  return NextResponse.json(
    {
      status,
      checks,
      version: process.env.GIT_SHA ?? "dev",
    },
    { status: httpStatus }
  );
}
