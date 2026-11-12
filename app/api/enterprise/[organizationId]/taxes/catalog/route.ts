import { z } from "zod";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import { createTaxCode } from "@/lib/enterprise/accounting/master-service";
import { getDtscTaxTemplate, listDtscTaxTemplates } from "@/lib/enterprise/accounting/tax-catalog";
import { normalizeTaxCountryCode } from "@/lib/enterprise/accounting/tax-jurisdictions";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const adoptionSchema = z.object({
  code: z.string().trim().min(3).max(80),
  version: z.string().trim().min(1).max(32),
  applyAutomatically: z.boolean().default(false),
});

async function fiscalCountry(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { country: true },
  });
  return normalizeTaxCountryCode(organization?.country);
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TAX", "view");
  if (!auth.ok) return auth.response;
  const countryCode = await fiscalCountry(organizationId);
  const templates = countryCode ? listDtscTaxTemplates(countryCode) : [];
  const adopted = await prisma.enterpriseTaxCode.findMany({
    where: { organizationId, sourceTemplateCode: { in: templates.map((entry) => entry.code) } },
    select: { id: true, code: true, sourceTemplateCode: true, sourceTemplateVersion: true, autoApply: true, isActive: true },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "tax-catalog" } });
  return NextResponse.json({ countryCode, templates, adopted });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TAX", "create", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = adoptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error, "TAX_TEMPLATE_INPUT_INVALID");

  const template = getDtscTaxTemplate(parsed.data.code, parsed.data.version);
  const countryCode = await fiscalCountry(organizationId);
  if (!template || countryCode !== template.jurisdiction) {
    return NextResponse.json({ error: "TAX_TEMPLATE_JURISDICTION_MISMATCH", message: "Ce modèle fiscal n'est pas disponible pour le pays déclaré de cette entreprise." }, { status: 409 });
  }
  const existing = await prisma.enterpriseTaxCode.findFirst({
    where: { organizationId, OR: [{ code: template.code }, { sourceTemplateCode: template.code }] },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "TAX_TEMPLATE_ALREADY_ADOPTED", message: "Cette taxe existe déjà dans votre entreprise." }, { status: 409 });
  }
  try {
    const taxCode = await createTaxCode(organizationId, auth.session.userId, {
      code: template.code, nameFr: template.nameFr, nameEn: template.nameEn,
      category: template.category, jurisdiction: template.jurisdiction,
      roundingRule: "HALF_UP", rate: template.rate,
      effectiveFrom: new Date(template.effectiveFrom + "T00:00:00.000Z"),
      autoApply: parsed.data.applyAutomatically, taxTreatment: "STANDARD",
      sourceTemplateCode: template.code, sourceTemplateVersion: template.version,
    });
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_TAX_TEMPLATE_ADOPTED", entity: "EnterpriseTaxCode", entityId: taxCode.id, request: req, metadata: { organizationId, sourceTemplateCode: template.code, sourceTemplateVersion: template.version, autoApply: parsed.data.applyAutomatically } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "tax-catalog", sourceTemplateCode: template.code } });
    return NextResponse.json({ ok: true, taxCode }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "TAX_TEMPLATE_ACTIVATION_FAILED");
  }
}
