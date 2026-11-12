import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { authorizeFinanceRequest, financeErrorResponse, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import { compoundTaxRuleApprovalSchema } from "@/lib/enterprise/accounting/tax-rule-schemas";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

type Params = { params: Promise<{ organizationId: string; ruleId: string }> };
export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, ruleId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TAX", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = compoundTaxRuleApprovalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error, "TAX_RULE_APPROVAL_INVALID");
  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseTaxRule" WHERE id = ${ruleId} AND "organizationId" = ${organizationId} FOR UPDATE`);
      const rule = await tx.enterpriseTaxRule.findFirst({
        where: { id: ruleId, organizationId }, include: { taxCode: { select: { isActive: true, jurisdiction: true } } },
      });
      if (!rule) throw new EnterpriseAccountingError("TAX_RULE_NOT_FOUND", 404);
      const current = rule.criteriaJson;
      if (!current || typeof current !== "object" || Array.isArray(current) || current.approvalStatus !== "DRAFT") {
        throw new EnterpriseAccountingError("TAX_RULE_NOT_PENDING", 409);
      }
      if (current.proposedByUserId === auth.session.userId) throw new EnterpriseAccountingError("TAX_RULE_SELF_APPROVAL_FORBIDDEN", 403);
      if (!rule.taxCode.isActive || !rule.taxCode.jurisdiction) throw new EnterpriseAccountingError("TAX_RULE_TAX_CODE_INACTIVE", 409);
      const revision = rule.updatedAt.toISOString();
      if (parsed.data.revision !== revision) throw new EnterpriseAccountingError("TAX_RULE_REVISION_CONFLICT", 409);
      const approved = parsed.data.action === "APPROVE";
      return tx.enterpriseTaxRule.update({
        where: { id: ruleId }, data: {
          isActive: approved,
          criteriaJson: {
            ...current,
            approvalStatus: approved ? "APPROVED" : "REJECTED",
            reviewerUserId: auth.session.userId, reviewReason: parsed.data.reason, reviewedAt: new Date().toISOString(),
          } as Prisma.InputJsonObject,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await writeAuditLog({ userId: auth.session.userId, action: `ENTERPRISE_TAX_RULE_${parsed.data.action}`,
      entity: "EnterpriseTaxRule", entityId: updated.id, request: req,
      metadata: { organizationId, reviewerId: auth.session.userId, status: updated.isActive ? "ACTIVE" : "REJECTED" } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt,
      metadata: { organizationId, domain: "tax-rule", action: parsed.data.action } });
    return NextResponse.json({ ok: true, rule: updated });
  } catch (error) { return financeErrorResponse(error, "TAX_RULE_APPROVAL_FAILED"); }
}
