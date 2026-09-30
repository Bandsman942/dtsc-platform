import { NextResponse } from "next/server";
import { verifyScale7GitHubActionsOidc } from "@/lib/scalability/github-actions-oidc";
import { buildScale7SyntheticAuthPool } from "@/lib/scalability/scale7-auth-pool";

export const runtime = "nodejs";
export const maxDuration = 60;

const TARGETS = new Set([500, 1000, 2500, 5000]);

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  if (!token) return unauthorized();

  const claims = await verifyScale7GitHubActionsOidc(token).catch(() => null);
  if (!claims) return unauthorized();

  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }

  const body = await req.json().catch(() => null) as { targetVus?: unknown } | null;
  const targetVus = typeof body?.targetVus === "number" ? body.targetVus : Number(body?.targetVus);
  if (!Number.isInteger(targetVus) || !TARGETS.has(targetVus)) {
    return NextResponse.json({ error: "INVALID_TARGET" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const pool = await buildScale7SyntheticAuthPool(targetVus);
    return NextResponse.json(pool, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "X-SCALE7-Run": claims.run_id,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SCALE7_AUTH_POOL_FAILED";
    const known = code === "SCALE7_ENTERPRISE_PLAN_REQUIRED" || code === "SCALE7_TARGET_INVALID";
    return NextResponse.json(
      { error: known ? code : "SCALE7_AUTH_POOL_FAILED" },
      { status: known ? 409 : 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
