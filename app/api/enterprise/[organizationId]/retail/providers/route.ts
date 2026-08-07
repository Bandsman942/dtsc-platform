import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import type { RetailModuleCode } from "@/lib/enterprise/retail/constants";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { retailProviderUpsertSchema } from "@/lib/enterprise/retail/schemas";
import { upsertRetailProvider } from "@/lib/enterprise/retail/service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

function providerModule(req: Request): RetailModuleCode {
  return new URL(req.url).searchParams.get("moduleCode")?.toUpperCase() === "TELCO_TOPUPS" ? "TELCO_TOPUPS" : "MOBILE_MONEY_AGENCY";
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const moduleCode = providerModule(req);
  const auth = await authorizeRetailRequest(req, organizationId, moduleCode, "read");
  if (!auth.ok) return auth.response;
  const items = await prisma.enterpriseRetailProvider.findMany({ where: { organizationId }, orderBy: [{ isActive: "desc" }, { label: "asc" }] });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-providers", moduleCode } });
  return NextResponse.json({ items, canManage: auth.access.canAdminister });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const moduleCode = providerModule(req);
  const auth = await authorizeRetailRequest(req, organizationId, moduleCode, "manage", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;
  const parsed = retailProviderUpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Opérateur invalide." }, { status: 400 });
  try {
    const provider = await upsertRetailProvider(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_PROVIDER_UPSERTED", entity: "EnterpriseRetailProvider", entityId: provider.id, request: req, metadata: { organizationId, providerCode: provider.providerCode, providerType: provider.providerType, moduleCode } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-providers", action: "upsert", moduleCode } });
    return NextResponse.json({ ok: true, provider });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PROVIDER_UPSERT_FAILED");
  }
}
