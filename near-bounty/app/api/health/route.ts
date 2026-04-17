import { NextResponse } from "next/server";
import { getDeploymentBaseUrl } from "@/lib/agent-card";
import { modelInfo } from "@/lib/near-ai";

export function GET() {
  return NextResponse.json({
    status: "ok",
    baseUrl: getDeploymentBaseUrl(),
    model: modelInfo(),
    nearApiKeyConfigured: Boolean(process.env.NEAR_AI_API_KEY),
  });
}
