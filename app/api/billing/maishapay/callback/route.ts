import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { processStoredWebhookEvent } from "@/lib/console/console-webhooks";
import { prisma } from "@/lib/prisma";
import { maishaPayCallbackSchema } from "@/lib/validators";
import { isAuthorizedMaishaPayCallback, isConfirmedMaishaPayStatus, normalizeMaishaPayWebhook } from "@/lib/payments/maishapay-callback-validation";

export async function POST(req: Request) {
  const startedAt = Date.now();
  const requestId = req.headers.get("x-request-id") || req.headers.get("x-vercel-id") || null;
  // Reject *all* callback data if the verifier is not provisioned; otherwise
  // an unauthenticated webhook could mark a subscription payment as PAID.
  if (!env.MAISHAPAY_CALLBACK_SECRET) {
    await writeApiLog({ request: req, statusCode: 503, startedAt, metadata: { reasonCode: "MAISHAPAY_WEBHOOK_UNCONFIGURED" } });
    return NextResponse.json({ error: "Payment verification unavailable" }, { status: 503 });
  }
  // Verify the MaishaPay-native HMAC on the ORIGINAL bytes, before JSON parsing
  // or persisting an event. URL-secret and x-dtsc-webhook-secret are not trusted.
  const signature = req.headers.get("x-maishapay-signature");
  const rawBody = Buffer.from(await req.arrayBuffer());
  if (rawBody.length > 256 * 1024) {
    await writeApiLog({ request: req, statusCode: 413, startedAt });
    return NextResponse.json({ error: "Callback payload too large" }, { status: 413 });
  }
  if (!isAuthorizedMaishaPayCallback(env.MAISHAPAY_CALLBACK_SECRET, rawBody, signature)) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Invalid MaishaPay signature" }, { status: 401 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    await writeApiLog({ request: req, statusCode: 400, startedAt });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const normalized = normalizeMaishaPayWebhook(rawPayload);
  const payload = maishaPayCallbackSchema.safeParse(normalized);
  if (!normalized || !payload.success) {
    await writeApiLog({ request: req, statusCode: 400, startedAt });
    return NextResponse.json({ error: "Invalid callback payload" }, { status: 400 });
  }
  const reference = payload.data.transactionReference || payload.data.originatingTransactionId;
  if (!reference) {
    await writeApiLog({ request: req, statusCode: 400, startedAt });
    return NextResponse.json({ error: "Missing payment reference" }, { status: 400 });
  }

  // Each separately signed body (including pending -> paid updates) is an
  // immutable event. The same signed retry uses the same event idempotently.
  const bodyDigest = createHash("sha256").update(rawBody).digest("hex");
  const idempotencyKey = `payment-callback-hmac:${bodyDigest}`;
  const signedEvidence = { bodyBase64: rawBody.toString("base64"), signature };
  const event = await prisma.webhookEvent.upsert({
    where: { provider_idempotencyKey: { provider: "maishapay", idempotencyKey } },
    update: { requestId: requestId || undefined },
    create: { provider: "maishapay", eventType: "payment-callback", payload: signedEvidence, status: "RECEIVED", requestId, idempotencyKey },
  });
  if (event.appliedAt || event.status === "PROCESSED") {
    await writeApiLog({ request: req, statusCode: 200, startedAt, metadata: { eventId: event.id, reference, duplicate: true } });
    return NextResponse.json({ ok: true, eventId: event.id, status: "ALREADY_PROCESSED" });
  }

  const paid = isConfirmedMaishaPayStatus(payload.data);
  if (!paid) {
    // Non-paid events are acknowledged, but never modify Payment or Invoice.
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: "RECEIVED_NOT_PAID", processedAt: new Date(), lastAttemptAt: new Date(), attempts: { increment: 1 } },
    });
    await writeApiLog({ request: req, statusCode: 200, startedAt, metadata: { eventId: event.id, reference, paid: false } });
    return NextResponse.json({ ok: true, eventId: event.id, status: "RECEIVED_NOT_PAID" });
  }

  const result = await processStoredWebhookEvent(event.id);
  await writeAuditLog({ action: result.ok ? "MAISHAPAY_PAYMENT_CONFIRMED" : "MAISHAPAY_PAYMENT_CALLBACK_FAILED", entity: "Payment", entityId: reference, result: result.ok ? "SUCCESS" : "FAILED", reasonCode: result.reasonCode, metadata: { eventId: event.id }, request: req });
  await writeApiLog({ request: req, statusCode: result.ok ? 200 : 422, startedAt, metadata: { eventId: event.id, reference, paid: true, reasonCode: result.reasonCode } });
  return NextResponse.json({ ok: result.ok, eventId: event.id, reasonCode: result.reasonCode }, { status: result.ok ? 200 : 422 });
}
