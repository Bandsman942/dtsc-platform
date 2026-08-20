import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processPendingCrossModuleProjections } from "@/lib/enterprise/cross-module/projection-service";
import { CROSS_MODULE_PROJECTION_LIMITS, getCrossModuleProjectionQueueSnapshot } from "@/lib/enterprise/cross-module/projection-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorize(request: NextRequest) {
  const acceptedSecrets = [process.env.CRON_SECRET, process.env.CROSS_MODULE_PROJECTION_WORKER_SECRET].filter((value): value is string => Boolean(value));
  if (!acceptedSecrets.length) return { ok: false, status: 503, message: "Projection worker is not configured." };
  const authorization = request.headers.get("authorization") || "";
  const presented = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!presented || !acceptedSecrets.some((secret) => safeEqual(presented, secret))) return { ok: false, status: 401, message: "Unauthorized." };
  return { ok: true, status: 200, message: "OK" };
}

async function handle(request: NextRequest) {
  const auth = authorize(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const requestedBatch = Number(request.nextUrl.searchParams.get("batch") || CROSS_MODULE_PROJECTION_LIMITS.workerBatchSize);
  const batchSize = Number.isFinite(requestedBatch)
    ? Math.max(1, Math.min(Math.trunc(requestedBatch), CROSS_MODULE_PROJECTION_LIMITS.workerBatchSize))
    : CROSS_MODULE_PROJECTION_LIMITS.workerBatchSize;
  const startedAt = Date.now();
  const queueBefore = await getCrossModuleProjectionQueueSnapshot();
  const result = await processPendingCrossModuleProjections(batchSize);
  const processed = result.results.filter((item) => !item.skipped).length;
  const queueAfter = await getCrossModuleProjectionQueueSnapshot();
  const saturated = processed === batchSize && queueAfter.available && (queueAfter.ready || 0) > 0;

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    processed,
    failures: result.failures,
    queueBefore,
    queueAfter,
    saturated,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
