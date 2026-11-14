import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { processStoredWebhookEvent } from "@/lib/console/console-webhooks";
import { prisma } from "@/lib/prisma";
import { maishaPayCallbackSchema } from "@/lib/validators";
import { isAuthorizedMaishaPayCallback, isConfirmedMaishaPayStatus } from "@/lib/payments/maishapay-callback-validation";

export async function POST(req: Request) {
  const startedAt = Date.now();
  const requestId = req.headers.get("x-request-id") || req.headers.get("x-vercel-id") || null;
  // Reject *all* callback data if the verifier is not provisioned; otherwise
  // an unauthenticated webhook could mark a subscription payment as PAID.
  if (!env.MAISHAPAY_CALLBACK_SECRET) {
    await writeApiLog({ request: req, statusCode: 503, startedAt, metadata: { reasonCode: "MAISHAPAY_WEBHOOK_UNCONFIGURED" } });
    return NextResponse.json({ error: "Payment verification unavailable" }, { status: 503 });
  }
  // The query fallback remains solely for pre-existing provider integrations.
  // New MaishaPay callbacks must send the secret in x-dtsc-webhook-secret.
  const secret = req.headers.get("x-dtsc-webhook-secret") || new URL(req.url).searchParams.get("secret");
  if (!isAuthorizedMaishaPayCallback(env.MAISHAPAY_CALLBACK_SECRET, secret)) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawPayload = await req.json().catch(() => null);
  const payload = maishaPayCallbackSchema.safeParse(rawPayload);
  if (!payload.success) {
    await writeApiLog({ request: req, statusCode: 400, startedAt });
    return NextResponse.json({ error: "Invalid callback payload" }, { status: 400 });
  }
  const reference = payload.data.transactionReference || payload.data.originatingTransactionId;
  if (!reference) {
    await writeApiLog({ request: req, statusCode: 400, startedAt });
    return NextResponse.json({ error: "Missing payment reference" }, { status: 400 });
  }

  const idempotencyKey = `payment-callback:${reference}`;
  const event = await prisma.webhookEvent.upsert({
    where: { provider_idempotencyKey: { provider: "maishapay", idempotencyKey } },
    update: { payload: JSON.parse(JSON.stringify(payload.data)), requestId: requestId || undefined },
    create: { provider: "maishapay", eventType: "payment-callback", payload: JSON.parse(JSON.stringify(payload.data)), status: "RECEIVED", requestId, idempotencyKey },
  });
  if (event.appliedAt || event.status === "PROCESSED") {
    await writeApiLog({ request: req, statusCode: 200, startedAt, metadata: { eventId: event.id, reference, duplicate: true } });
    return NextResponse.json({ ok: true, eventId: event.id, status: "ALREADY_PROCESSED" });
  }

  const paid = isConfirmedMaishaPayStatus(payload.data);
  if (!paid) {
    await prisma.$transaction([
      prisma.payment.updateMany({ where: { reference }, data: { callbackPayload: JSON.parse(JSON.stringify(payload.data)) } }),
      prisma.webhookEvent.update({ where: { id: event.id }, data: { status: "RECEIVED_NOT_PAID", processedAt: new Date(), lastAttemptAt: new Date(), attempts: { increment: 1 } } }),
    ]);
    await writeApiLog({ request: req, statusCode: 200, startedAt, metadata: { eventId: event.id, reference, paid: false } });
    return NextResponse.json({ ok: true, eventId: event.id, status: "RECEIVED_NOT_PAID" });
  }

  const result = await processStoredWebhookEvent(event.id);
  await writeAuditLog({ action: result.ok ? "MAISHAPAY_PAYMENT_CONFIRMED" : "MAISHAPAY_PAYMENT_CALLBACK_FAILED", entity: "Payment", entityId: reference, result: result.ok ? "SUCCESS" : "FAILED", reasonCode: result.reasonCode, metadata: { eventId: event.id }, request: req });
  await writeApiLog({ request: req, statusCode: result.ok ? 200 : 422, startedAt, metadata: { eventId: event.id, reference, paid: true, reasonCode: result.reasonCode } });
  return NextResponse.json({ ok: result.ok, eventId: event.id, reasonCode: result.reasonCode }, { status: result.ok ? 200 : 422 });
}
