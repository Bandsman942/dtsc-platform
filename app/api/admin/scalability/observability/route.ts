import { NextResponse } from "next/server";
import { z } from "zod";
import { requireConsoleCapability } from "@/lib/admin-api";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { getProductionObservabilitySnapshot } from "@/lib/scalability/production-observability";
import { verifyScale7GitHubActionsOidc } from "@/lib/scalability/github-actions-oidc";

const querySchema = z.object({
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
});

function privateNoStore(status: number, error: string) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization, Origin" } },
  );
}

async function resolveObservabilityAccess(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    if (!authorization.startsWith("Bearer ")) return { response: privateNoStore(401, "UNAUTHORIZED"), reasonCode: null };
    const token = authorization.slice("Bearer ".length).trim();
    const claims = token ? await verifyScale7GitHubActionsOidc(token).catch(() => null) : null;
    if (!claims) return { response: privateNoStore(401, "UNAUTHORIZED"), reasonCode: null };

    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) {
      return { response: privateNoStore(403, "FORBIDDEN"), reasonCode: null };
    }
    return { response: null, reasonCode: "SCALE7_GITHUB_OIDC" };
  }

  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_READ);
  if (access.response) return { response: access.response, reasonCode: null };
  return { response: null, reasonCode: access.reasonCode };
}

export async function GET(request: Request) {
  const access = await resolveObservabilityAccess(request);
  if (access.response) return access.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ windowHours: url.searchParams.get("windowHours") || undefined });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid observability window", reasonCode: "VALIDATION_ERROR" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const snapshot = await getProductionObservabilitySnapshot(parsed.data.windowHours);
  return NextResponse.json(
    { snapshot, reasonCode: access.reasonCode },
    { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization, Origin" } },
  );
}
