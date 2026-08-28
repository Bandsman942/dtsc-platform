import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assignedDocumentTransitionSchema } from "@/lib/enterprise/accounting/accounting-approval-schemas";
import {
  decideSalesCreditNoteAssignedApproval,
  submitSalesCreditNoteForAssignedApproval,
} from "@/lib/enterprise/accounting/accounting-document-approval-orchestration";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";

type Params = { params: Promise<{ organizationId: string; creditNoteId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, creditNoteId } = await params;
  const parsed = assignedDocumentTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  const permissionAction = parsed.data.action === "SUBMIT" ? "submit" : "approve";
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECEIVABLES", permissionAction, { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  try {
    const creditNote = parsed.data.action === "SUBMIT"
      ? await submitSalesCreditNoteForAssignedApproval(organizationId, creditNoteId, auth.session.userId, parsed.data)
      : await decideSalesCreditNoteAssignedApproval(organizationId, creditNoteId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: `ENTERPRISE_SALES_CREDIT_NOTE_${parsed.data.action}`,
      entity: "EnterpriseSalesCreditNote",
      entityId: creditNoteId,
      request: req,
      metadata: { organizationId, approverUserId: parsed.data.action === "SUBMIT" ? parsed.data.approverUserId : undefined, reason: parsed.data.reason },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sales-credit-notes", action: parsed.data.action } });
    return NextResponse.json({ ok: true, creditNote });
  } catch (error) {
    return financeErrorResponse(error, "SALES_CREDIT_NOTE_TRANSITION_FAILED");
  }
}
