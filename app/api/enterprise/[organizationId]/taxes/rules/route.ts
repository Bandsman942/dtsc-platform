import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { authorizeFinanceRequest, financeErrorResponse, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import { compoundTaxRuleDraftSchema } from "@/lib/enterprise/accounting/tax-rule-schemas";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TAX", "view");
  if (!auth.ok) return auth.response;
  const items = await prisma.enterpriseTaxRule.findMany({ where: { organizationId },
    orderBy: [{ createdAt: "desc" }], take: 100, include: { taxCode: { select: { code: true, nameFr: true, nameEn: true, category: true } } } });
  return NextResponse.json({ items, legalCertification: "NOT_HOMOLOGATED" });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TAX", "create", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = compoundTaxRuleDraftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error, "TAX_RULE_DRAFT_INVALID");
  try {
    const taxCode = await prisma.enterpriseTaxCode.findFirst({
      where: { organizationId, id: parsed.data.taxCodeId, isActive: true }, select: { category: true, taxTreatment: true, jurisdiction: true },
    });
    if (!taxCode || !["VAT", "GST", "SALES_TAX"].includes(taxCode.category) || taxCode.taxTreatment !== "STANDARD" || !taxCode.jurisdiction) {
      throw new EnterpriseAccountingError("TAX_RULE_SCOPE_INVALID", 409);
    }
    // Active tax calculation requires a DIFFERENT reviewer. No direct
    // activation by the author, regardless of administrative role.
    const rule = await prisma.enterpriseTaxRule.create({
      data: {
        organizationId, taxCodeId: parsed.data.taxCodeId, sourceType: parsed.data.sourceType,
        priority: parsed.data.priority, isActive: false,
        criteriaJson: {
          calculationMode: parsed.data.calculationMode,
          legalReference: parsed.data.legalReference, evidenceReference: parsed.data.evidenceReference,
          jurisdiction: taxCode.jurisdiction, proposedByUserId: auth.session.userId, approvalStatus: "DRAFT",
          proposedAt: new Date().toISOString(),
        },
      },
    });
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_TAX_COMPOUND_RULE_DRAFTED",
      entity: "EnterpriseTaxRule", entityId: rule.id, request: req,
      metadata: { organizationId, taxCodeId: rule.taxCodeId, priority: rule.priority } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "tax-rule" } });
    return NextResponse.json({ ok: true, rule }, { status: 201 });
  } catch (error) { return financeErrorResponse(error, "TAX_RULE_DRAFT_FAILED"); }
}
