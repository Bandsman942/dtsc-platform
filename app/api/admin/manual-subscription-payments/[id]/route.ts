import { NextResponse } from "next/server";
import { z } from "zod";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { decideManualSubscriptionPayment } from "@/lib/manual-subscription-payments";
import { isDtscInternalSession } from "@/lib/organizations";
import { isSameOriginRequest } from "@/lib/request-security";

const decisionSchema = z.object({ action: z.enum(["VALIDATE", "REJECT"]), comment: z.string().trim().max(1000).optional().or(z.literal("")) });
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SUBSCRIPTIONS_MANAGE);
  if (access.response) return access.response;
  if (!isDtscInternalSession(access.session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = decisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const { id } = await params;
  try {
    const payment = await decideManualSubscriptionPayment({ id, action: parsed.data.action, validatorUserId: access.session.userId, comment: parsed.data.comment });
    await writeAuditLog({ userId: access.session.userId, action: parsed.data.action === "VALIDATE" ? "MANUAL_SUBSCRIPTION_PAYMENT_VALIDATED" : "MANUAL_SUBSCRIPTION_PAYMENT_REJECTED", entity: "SubscriptionManualPayment", entityId: payment.id, result: "SUCCESS", metadata: { scope: payment.scope, invoiceId: payment.invoiceId, revenueTransactionId: payment.revenueTransactionId }, request: req });
    await writeApiLog({ request: req, statusCode: 200, userId: access.session.userId, startedAt, metadata: { manualPaymentId: payment.id, status: payment.status } });
    return NextResponse.json({ ok: true, status: payment.status });
  } catch (error) {
    return NextResponse.json({ error: "Decision failed", message: error instanceof Error ? error.message : "Action impossible." }, { status: 409 });
  }
}
