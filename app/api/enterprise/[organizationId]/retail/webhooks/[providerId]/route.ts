import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { processRetailWebhookEvent } from "@/lib/enterprise/retail/customer-payments";
import { retailWebhookEventSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
import { retailErrorResponse } from "@/lib/enterprise/retail/http";
import { getRetailPaymentProviderAdapter } from "@/lib/enterprise/retail/payment-provider-adapter";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ organizationId: string; providerId: string }> };

export async function POST(req: Request, { params }: Params) {
  const { organizationId, providerId } = await params;
  const limited = await rateLimit(getRateLimitKey(req, `retail:webhook:${organizationId}:${providerId}`), 600, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const [provider, integration] = await Promise.all([
    prisma.enterpriseRetailProvider.findFirst({ where: { id: providerId, organizationId, isActive: true }, select: { id: true, providerCode: true, providerType: true } }),
    prisma.enterpriseRetailProviderIntegration.findFirst({ where: { providerId, organizationId, integrationMode: "CONNECTED", archivedAt: null } }),
  ]);
  if (!provider || !integration || !integration.adapterCode) return NextResponse.json({ error: "RETAIL_PROVIDER_WEBHOOK_NOT_CONFIGURED" }, { status: 404 });
  const adapter = getRetailPaymentProviderAdapter(integration.adapterCode);
  if (!adapter?.verifyWebhook) return NextResponse.json({ error: "RETAIL_PROVIDER_WEBHOOK_ADAPTER_UNAVAILABLE" }, { status: 501 });

  const rawBody = await req.text();
  const verification = await adapter.verifyWebhook({
    organizationId,
    providerId,
    providerCode: provider.providerCode,
    adapterCode: integration.adapterCode,
    credentialReference: integration.credentialReference,
    webhookSecretReference: integration.webhookSecretReference,
    settings: integration.settingsJson && typeof integration.settingsJson === "object" && !Array.isArray(integration.settingsJson) ? integration.settingsJson as Record<string, unknown> : {},
  }, req, rawBody);

  const parsed = retailWebhookEventSchema.safeParse({
    providerId,
    externalEventId: verification.externalEventId || `unverified-${createHash("sha256").update(rawBody).digest("hex").slice(0, 32)}`,
    eventType: verification.eventType || "UNVERIFIED",
    signatureVerified: verification.verified,
    payloadHash: createHash("sha256").update(rawBody).digest("hex"),
    safePayloadJson: verification.safePayload || null,
    providerOperationId: verification.providerOperationId || null,
    paymentTransactionId: verification.paymentTransactionId || null,
    providerOperationStatus: verification.providerOperationStatus || null,
    paymentStatus: verification.paymentStatus || null,
    providerReference: verification.externalReference || null,
  });
  if (!parsed.success) return NextResponse.json({ error: "RETAIL_PROVIDER_WEBHOOK_INVALID", message: parsed.error.issues[0]?.message || "Webhook invalide." }, { status: 400 });
  if (!verification.verified) {
    try {
      await processRetailWebhookEvent(organizationId, parsed.data);
    } catch {
      // Never leak verification internals to an untrusted webhook caller.
    }
    return NextResponse.json({ error: "RETAIL_PROVIDER_WEBHOOK_SIGNATURE_INVALID" }, { status: 401 });
  }

  try {
    const result = await processRetailWebhookEvent(organizationId, parsed.data);
    return NextResponse.json({ ok: true, idempotent: result.idempotent, applied: result.applied });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PROVIDER_WEBHOOK_FAILED");
  }
}
