import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { expireEnterpriseIdentityInvitations } from "@/lib/enterprise/identity-links/expiration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorize(request: NextRequest) {
  const acceptedSecrets = [process.env.CRON_SECRET, process.env.WORKFLOW_WORKER_SECRET].filter((value): value is string => Boolean(value));
  if (!acceptedSecrets.length) return false;
  const authorization = request.headers.get("authorization") || "";
  const presented = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return Boolean(presented && acceptedSecrets.some((secret) => safeEqual(presented, secret)));
}

async function handle(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Unauthorized" }, { status: process.env.CRON_SECRET || process.env.WORKFLOW_WORKER_SECRET ? 401 : 503 });
  const requestedBatch = Number(request.nextUrl.searchParams.get("batch") || 100);
  const batchSize = Number.isFinite(requestedBatch) ? Math.max(1, Math.min(Math.trunc(requestedBatch), 250)) : 100;
  const startedAt = Date.now();
  const result = await expireEnterpriseIdentityInvitations({ batchSize });
  console.info("enterprise_identity_expiration", { durationMs: Date.now() - startedAt, ...result });
  return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ...result });
}

export async function GET(request: NextRequest) { return handle(request); }
export async function POST(request: NextRequest) { return handle(request); }
