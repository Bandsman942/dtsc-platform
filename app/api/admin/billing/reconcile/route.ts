import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { reconcilePaidSubscriptionIncomeTransactions } from "@/lib/hr-cfo-finance";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const schema = z.object({ reason: z.string().trim().min(3).max(500), limit: z.coerce.number().int().min(1).max(500).default(100) });

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden", reasonCode: "ORIGIN_FORBIDDEN" }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.RECONCILE_BILLING);
  if (access.response) return access.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid reconciliation request", reasonCode: "VALIDATION_ERROR" }, { status: 400 });
  const limited = await rateLimit(getRateLimitKey(req, `billing-reconcile:${access.session.userId}`), 4, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", reasonCode: "RATE_LIMITED" }, { status: 429 });

  const requestId = req.headers.get("x-request-id") || req.headers.get("x-vercel-id") || null;
  const job = await prisma.consoleOperationJob.create({ data: { operationType: "BILLING_RECONCILIATION", status: "RUNNING", actorUserId: access.session.userId, reason: parsed.data.reason, requestId, inputJson: { limit: parsed.data.limit }, startedAt: new Date() } });
  try {
    const result = await reconcilePaidSubscriptionIncomeTransactions({ limit: parsed.data.limit });
    const completed = await prisma.consoleOperationJob.update({ where: { id: job.id }, data: { status: "COMPLETED", resultJson: result as Prisma.InputJsonValue, completedAt: new Date() } });
    await writeAuditLog({ userId: access.session.userId, requestId, action: "CONSOLE_BILLING_RECONCILIATION_COMPLETED", entity: "ConsoleOperationJob", entityId: job.id, after: result as Prisma.InputJsonValue, reasonCode: access.reasonCode, riskLevel: "HIGH", metadata: { reason: parsed.data.reason }, request: req });
    return NextResponse.json({ ok: true, job: completed, result, reasonCode: access.reasonCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown reconciliation error";
    await prisma.consoleOperationJob.update({ where: { id: job.id }, data: { status: "FAILED", errorMessage: message.slice(0, 2000), completedAt: new Date() } });
    await writeAuditLog({ userId: access.session.userId, requestId, action: "CONSOLE_BILLING_RECONCILIATION_FAILED", entity: "ConsoleOperationJob", entityId: job.id, result: "FAILED", reasonCode: "PAYMENT_RECONCILIATION_REQUIRED", riskLevel: "HIGH", metadata: { reason: parsed.data.reason, error: message.slice(0, 500) }, request: req });
    return NextResponse.json({ error: "Reconciliation failed", reasonCode: "INTERNAL_ERROR", jobId: job.id }, { status: 500 });
  }
}
