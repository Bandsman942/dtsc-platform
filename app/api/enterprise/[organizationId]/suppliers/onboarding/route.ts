import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { enterpriseSupplierOnboardingSchema, onboardEnterpriseSupplier } from "@/lib/enterprise/procurement/supplier-onboarding-service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-supplier-onboarding:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { organizationId } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = enterpriseSupplierOnboardingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: "INVALID_SUPPLIER_ONBOARDING",
      message: parsed.error.issues[0]?.message || "Les informations du fournisseur sont incomplètes ou invalides.",
    }, { status: 400 });
  }

  try {
    const result = await onboardEnterpriseSupplier(organizationId, session.userId, parsed.data);
    await writeAuditLog({
      userId: session.userId,
      action: "ENTERPRISE_SUPPLIER_CREATED",
      entity: "EnterpriseSupplier",
      entityId: result.supplier.id,
      request: req,
      metadata: { organizationId, businessPartyId: result.party.id, mode: parsed.data.mode, status: result.supplier.status },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "supplier-onboarding", mode: parsed.data.mode } });
    return NextResponse.json({ ok: true, supplier: result.supplier, party: result.party }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt, metadata: { organizationId, domain: "supplier-onboarding", error: "SUPPLIER_DUPLICATE" } });
      return NextResponse.json({ error: "SUPPLIER_DUPLICATE", message: "Cette identité est déjà utilisée par un fournisseur de cette entreprise. Ouvrez la fiche existante ou choisissez un autre tiers." }, { status: 409 });
    }
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "supplier-onboarding", error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
