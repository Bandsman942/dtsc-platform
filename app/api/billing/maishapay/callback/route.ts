import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { authorizeMaishaPayCallback } from "@/lib/maishapay-callback-auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { processStoredWebhookEvent } from "@/lib/console/console-webhooks";
import { prisma } from "@/lib/prisma";
import { maishaPayCallbackSchema } from "@/lib/validators";

function isPaidStatus(value: unknown) {
  const normalized = String(value || "").toLowerCase();
  return ["200", "success", "successful", "paid", "completed", "confirmed"].includes(normalized);
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const requestId = req.headers.get("x-request-id") || req.headers.get("x-vercel-id") || null;
  // Production must fail closed without even consuming the payload when no
  // webhook secret is configured. Do not log secrets or raw callback bodies.
  if (process.env.NODE_ENV === "production" && !env.MAISHAPAY_CALLBACK_SECRET?.trim()) {
    await writeApiLog({ request: req, statusCode: 503, startedAt });
    return NextResponse.json({ error: "MaishaPay callback authentication unavailable" }, { status: 503 });
  }

  // Authenticate the EXACT raw UTF-8 body against the provider's
  // X-MaishaPay-Signature HMAC. Legacy shared-token transport is retained
  // only as a fallback when a provider signature header is absent.
  const rawBody = await req.text().catch(() => "");
  const secret = req.headers.get("x-dtsc-webhook-secret") || new URL(req.url).searchParams.get("secret");
  const auth = authorizeMaishaPayCallback({
    expectedSecret: env.MAISHAPAY_CALLBACK_SECRET,
    suppliedSecret: secret,
    signature: req.headers.get("x-maishapay-signature"),
    rawBody,
    production: process.env.NODE_ENV === "production",
  });
  if (!auth.ok) {
    const status = auth.reason === "CONFIGURATION_MISSING" ? 503 : 401;
    // Never expose or log the supplied token, the expected token or the query.
    await writeApiLog({ request: req, statusCode: status, startedAt });
    return NextResponse.json({ error: "MaishaPay callback authentication unavailable" }, { status });
  }

  const rawPayload = (() => { try { return JSON.parse(rawBody); } catch { return null; } })();
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

  const paid = isPaidStatus(payload.data.statusCode) || isPaidStatus(payload.data.status);
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
