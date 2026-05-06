import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { activateSubscriptionFromPayment } from "@/lib/billing";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { maishaPayCallbackSchema } from "@/lib/validators";

function isPaidStatus(value: unknown) {
  const normalized = String(value || "").toLowerCase();
  return ["200", "success", "successful", "paid", "completed", "confirmed"].includes(normalized);
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const secret = new URL(req.url).searchParams.get("secret") || req.headers.get("x-dtsc-webhook-secret");
  if (env.MAISHAPAY_CALLBACK_SECRET && secret !== env.MAISHAPAY_CALLBACK_SECRET) {
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

  const event = await prisma.webhookEvent.create({
    data: {
      provider: "maishapay",
      eventType: "payment-callback",
      payload: JSON.parse(JSON.stringify(payload.data)),
      status: "RECEIVED",
    },
  });

  const paid = isPaidStatus(payload.data.statusCode) || isPaidStatus(payload.data.status);
  if (!paid) {
    await prisma.payment.updateMany({
      where: { reference },
      data: {
        callbackPayload: JSON.parse(JSON.stringify(payload.data)),
      },
    });
    await writeApiLog({ request: req, statusCode: 200, startedAt, metadata: { eventId: event.id, reference, paid: false } });
    return NextResponse.json({ ok: true, eventId: event.id, status: "RECEIVED_NOT_PAID" });
  }

  const result = await activateSubscriptionFromPayment(reference, payload.data);
  await writeAuditLog({
    action: result.ok ? "MAISHAPAY_PAYMENT_CONFIRMED" : "MAISHAPAY_PAYMENT_CALLBACK_UNMATCHED",
    entity: "Payment",
    entityId: reference,
    metadata: { eventId: event.id },
    request: req,
  });

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: {
      status: result.ok ? "PROCESSED" : "UNMATCHED",
      processedAt: new Date(),
    },
  });

  await writeApiLog({ request: req, statusCode: 200, startedAt, metadata: { eventId: event.id, reference, paid: true } });
  return NextResponse.json({ ok: result.ok, eventId: event.id });
}
