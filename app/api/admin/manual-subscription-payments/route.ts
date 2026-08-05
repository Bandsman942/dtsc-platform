import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { requestManualSubscriptionPayment } from "@/lib/manual-subscription-payments";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const requestSchema = z.object({
  scope: z.enum(["PERSONAL", "ENTERPRISE"]),
  targetId: z.string().trim().min(1).max(160),
  planId: z.string().trim().min(1).max(160),
  paymentMethod: z.string().trim().min(2).max(80),
  paymentReference: z.string().trim().max(200).optional().or(z.literal("")),
  idempotencyKey: z.string().trim().min(8).max(220).optional(),
});

export async function GET() {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SUBSCRIPTIONS_READ);
  if (access.response) return access.response;
  if (!isDtscInternalSession(access.session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const requests = await prisma.subscriptionManualPayment.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
  return NextResponse.json({ requests: requests.map((item) => ({ ...item, amount: Number(item.amount) })) });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SUBSCRIPTIONS_MANAGE);
  if (access.response) return access.response;
  if (!isDtscInternalSession(access.session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `manual-subscription-payment:${access.session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Les informations du paiement manuel sont invalides." }, { status: 400 });
  const idempotencyKey = parsed.data.idempotencyKey || createHash("sha256").update([parsed.data.scope, parsed.data.targetId, parsed.data.planId, parsed.data.paymentReference || "", new Date().toISOString().slice(0, 13)].join(":"), "utf8").digest("hex");
  try {
    const manualPayment = await requestManualSubscriptionPayment({ ...parsed.data, requestedByUserId: access.session.userId, idempotencyKey });
    await writeAuditLog({ userId: access.session.userId, action: "MANUAL_SUBSCRIPTION_PAYMENT_REQUESTED", entity: "SubscriptionManualPayment", entityId: manualPayment.id, metadata: { scope: manualPayment.scope, userId: manualPayment.userId, organizationId: manualPayment.organizationId, planId: manualPayment.planId }, request: req });
    await writeApiLog({ request: req, statusCode: 201, userId: access.session.userId, startedAt, metadata: { manualPaymentId: manualPayment.id } });
    return NextResponse.json({ ok: true, manualPaymentId: manualPayment.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Manual payment request failed", message: error instanceof Error ? error.message : "Action impossible." }, { status: 409 });
  }
}
