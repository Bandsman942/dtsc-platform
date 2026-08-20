import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { WEB_PUSH_QUEUE_LIMITS } from "@/lib/push/constants";
import { processPendingWebPushJobs } from "@/lib/push/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorize(request: NextRequest) {
  const acceptedSecrets = [process.env.CRON_SECRET, process.env.WEB_PUSH_WORKER_SECRET].filter((value): value is string => Boolean(value));
  if (!acceptedSecrets.length) return { ok: false, status: 503, message: "Web Push worker is not configured." };
  const authorization = request.headers.get("authorization") || "";
  const presented = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!presented || !acceptedSecrets.some((secret) => safeEqual(presented, secret))) {
    return { ok: false, status: 401, message: "Unauthorized." };
  }
  return { ok: true, status: 200, message: "OK" };
}

async function handle(request: NextRequest) {
  const auth = authorize(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const requestedBatch = Number(request.nextUrl.searchParams.get("batch") || WEB_PUSH_QUEUE_LIMITS.workerBatchSize);
  const batchSize = Number.isFinite(requestedBatch)
    ? Math.max(1, Math.min(Math.trunc(requestedBatch), WEB_PUSH_QUEUE_LIMITS.workerBatchSize))
    : WEB_PUSH_QUEUE_LIMITS.workerBatchSize;
  const startedAt = Date.now();
  const result = await processPendingWebPushJobs({ batchSize });

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    claimed: result.claimed,
    processed: result.processed,
    delivered: result.delivered,
    skipped: result.skipped,
    failed: result.failed,
    dead: result.dead,
    recovered: result.recovered,
    queueBefore: result.queueBefore,
    queueAfter: result.queueAfter,
    saturated: result.saturated,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
