import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { retailProviderUpsertSchema } from "@/lib/enterprise/retail/schemas";
import { upsertRetailProvider } from "@/lib/enterprise/retail/service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "read");
  if (!auth.ok) return auth.response;
  const items = await prisma.enterpriseRetailProvider.findMany({ where: { organizationId }, orderBy: [{ isActive: "desc" }, { label: "asc" }] });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-providers" } });
  return NextResponse.json({ items });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "manage", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;
  const parsed = retailProviderUpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Opérateur invalide." }, { status: 400 });
  try {
    const provider = await upsertRetailProvider(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_PROVIDER_UPSERTED", entity: "EnterpriseRetailProvider", entityId: provider.id, request: req, metadata: { organizationId, providerCode: provider.providerCode, providerType: provider.providerType } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-providers", action: "upsert" } });
    return NextResponse.json({ ok: true, provider });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PROVIDER_UPSERT_FAILED");
  }
}
