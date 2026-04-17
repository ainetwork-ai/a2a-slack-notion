import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    version: process.env.npm_package_version ?? "0.1.0",
    commit: process.env.GIT_SHA ?? "dev",
    builtAt: process.env.BUILD_TIME ?? new Date().toISOString(),
  });
}
