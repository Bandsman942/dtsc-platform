import { prisma } from "@/lib/prisma";
import { hasRecentStepUp } from "@/lib/auth/step-up";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import {
  decideReconciliationAssignedValidation,
  submitReconciliationForAssignedValidation,
} from "@/lib/enterprise/accounting/accounting-operations-approval-orchestration";
import { assignedReconciliationTransitionSchema } from "@/lib/enterprise/accounting/accounting-approval-schemas";

type Params = { params: Promise<{ organizationId: string; sessionId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, sessionId } = await params;
  const parsed = assignedReconciliationTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error);

  const permissionAction = parsed.data.action === "SUBMIT" ? "submit" : parsed.data.action === "APPROVE" ? "approve" : "review";
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECONCILIATION", permissionAction, { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;

  try {
    const current = await prisma.enterpriseReconciliationSession.findFirst({where:{id:sessionId,organizationId},select:{physicalEvidenceJson:true}});
    if (current?.physicalEvidenceJson) {
      if (!await getEnterpriseAccountingAccess({session:auth.session,organizationId,moduleCode:"FINANCE_CASH",action:"view"})) return NextResponse.json({error:"Forbidden"},{status:403});
      if (parsed.data.action === "APPROVE" && !await hasRecentStepUp(auth.session)) return NextResponse.json({error:"STEP_UP_REQUIRED",message:"Vérification de sécurité récente obligatoire."},{status:428});
    }
    const session = parsed.data.action === "SUBMIT"
      ? await submitReconciliationForAssignedValidation(organizationId, sessionId, auth.session.userId, parsed.data)
      : await decideReconciliationAssignedValidation(organizationId, sessionId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: `ENTERPRISE_RECONCILIATION_${parsed.data.action}`,
      entity: "EnterpriseReconciliationSession",
      entityId: sessionId,
      request: req,
      metadata: {
        organizationId,
        reason: parsed.data.reason,
        approverUserId: parsed.data.action === "SUBMIT" ? parsed.data.approverUserId : undefined,
        difference: session.reconciledDifference.toFixed(),
      },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "reconciliations", action: parsed.data.action.toLowerCase() },
    });
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    return financeErrorResponse(error, "RECONCILIATION_VALIDATION_FAILED");
  }
}