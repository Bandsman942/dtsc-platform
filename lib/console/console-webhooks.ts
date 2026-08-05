import { Prisma } from "@prisma/client";
import { activateSubscriptionFromPayment } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { maishaPayCallbackSchema } from "@/lib/validators";

const retryableStatuses = ["FAILED", "ERROR", "RETRY_REQUIRED", "UNMATCHED"];

export async function processStoredWebhookEvent(eventId: string, options: { manual?: boolean } = {}) {
  const event = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false as const, reasonCode: "NOT_FOUND" };
  if (event.appliedAt || event.status === "PROCESSED") return { ok: false as const, reasonCode: "WEBHOOK_ALREADY_APPLIED" };
  if (options.manual && !retryableStatuses.includes(event.status)) return { ok: false as const, reasonCode: "WEBHOOK_RETRY_NOT_ALLOWED" };
  if (event.attempts >= 5) return { ok: false as const, reasonCode: "WEBHOOK_RETRY_NOT_ALLOWED" };

  const claimed = await prisma.webhookEvent.updateMany({
    where: { id: event.id, appliedAt: null, attempts: event.attempts },
    data: { status: "PROCESSING", attempts: { increment: 1 }, lastAttemptAt: new Date(), lastError: null },
  });
  if (!claimed.count) return { ok: false as const, reasonCode: "WEBHOOK_RETRY_NOT_ALLOWED" };

  try {
    if (event.provider.toLowerCase() !== "maishapay" || event.eventType !== "payment-callback") {
      throw new Error("No reliable dispatcher is registered for this provider and event type.");
    }
    const payload = maishaPayCallbackSchema.safeParse(event.payload);
    if (!payload.success) throw new Error("Stored payload no longer matches the provider contract.");
    const reference = payload.data.transactionReference || payload.data.originatingTransactionId;
    if (!reference) throw new Error("Stored payment reference is missing.");
    const result = await activateSubscriptionFromPayment(reference, payload.data);
    if (!result.ok) {
      await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: "UNMATCHED", lastError: result.reason, processedAt: new Date(), nextRetryAt: new Date(Date.now() + 15 * 60 * 1000) } });
      return { ok: false as const, reasonCode: "PAYMENT_NOT_FOUND", reference };
    }
    const updated = await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", appliedAt: new Date(), processedAt: new Date(), nextRetryAt: null, lastError: null } });
    return { ok: true as const, reasonCode: "PROCESSED", event: updated, reference };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: "FAILED", lastError: message.slice(0, 2000), processedAt: new Date(), nextRetryAt: new Date(Date.now() + 30 * 60 * 1000) } });
    return { ok: false as const, reasonCode: "INTERNAL_ERROR", error: message };
  }
}

export function webhookPayloadForAudit(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
