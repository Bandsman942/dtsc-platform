import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { upsertRetailProviderIntegration } from "@/lib/enterprise/retail/customer-payments";
import { retailProviderIntegrationUpsertSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";
import { listRetailPaymentProviderAdapters } from "@/lib/enterprise/retail/payment-provider-adapter";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canManageProviders && !permissions.canReconcileProviders) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [providers, integrations] = await Promise.all([
    prisma.enterpriseRetailProvider.findMany({ where: { organizationId, isActive: true }, orderBy: [{ providerType: "asc" }, { label: "asc" }], select: { id: true, providerCode: true, providerType: true, label: true } }),
    prisma.enterpriseRetailProviderIntegration.findMany({ where: { organizationId, archivedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, providerId: true, integrationMode: true, adapterCode: true, connectionStatus: true, settingsJson: true, lastHealthCheckAt: true, lastSuccessfulSyncAt: true, revision: true, createdAt: true, updatedAt: true } }),
  ]);
  const integrationByProvider = new Map(integrations.map((integration) => [integration.providerId, integration]));
  const items = providers.map((provider) => ({ ...provider, integration: integrationByProvider.get(provider.id) || null }));
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-providers", action: "list-integrations", count: items.length } });
  return NextResponse.json({ items, registeredAdapters: listRetailPaymentProviderAdapters() });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canManageProviders) return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas de configurer les providers Retail." }, { status: 403 });
  const parsed = retailProviderIntegrationUpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Configuration provider invalide." }, { status: 400 });
  try {
    const integration = await upsertRetailProviderIntegration(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_PROVIDER_INTEGRATION_UPSERTED", entity: "EnterpriseRetailProviderIntegration", entityId: integration.id, request: req, metadata: { organizationId, providerId: integration.providerId, integrationMode: integration.integrationMode, adapterCode: integration.adapterCode, connectionStatus: integration.connectionStatus } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-providers", action: "upsert-integration" } });
    return NextResponse.json({ ok: true, integration: { id: integration.id, providerId: integration.providerId, integrationMode: integration.integrationMode, adapterCode: integration.adapterCode, connectionStatus: integration.connectionStatus, settingsJson: integration.settingsJson, revision: integration.revision, updatedAt: integration.updatedAt } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PROVIDER_INTEGRATION_SAVE_FAILED");
  }
}
