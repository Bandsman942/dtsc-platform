import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import {
  decideJournalEntryAssignedApproval,
  submitJournalEntryForAssignedApproval,
} from "@/lib/enterprise/accounting/accounting-human-approval-orchestration";
import { assignedJournalTransitionSchema } from "@/lib/enterprise/accounting/accounting-approval-schemas";
import { transitionJournalEntry } from "@/lib/enterprise/accounting/journal-service";

type Params = { params: Promise<{ organizationId: string; entryId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, entryId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = assignedJournalTransitionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  const action = parsed.data.action === "APPROVE"
    ? "approve"
    : parsed.data.action === "POST"
      ? "post"
      : parsed.data.action === "REJECT"
        ? "review"
        : "submit";
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", action, { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;

  try {
    const entry = parsed.data.action === "SUBMIT"
      ? await submitJournalEntryForAssignedApproval(organizationId, entryId, auth.session.userId, parsed.data)
      : parsed.data.action === "APPROVE" || parsed.data.action === "REJECT"
        ? await decideJournalEntryAssignedApproval(organizationId, entryId, auth.session.userId, parsed.data)
        : await transitionJournalEntry(organizationId, entryId, auth.session.userId, parsed.data);

    await writeAuditLog({
      userId: auth.session.userId,
      action: `ENTERPRISE_JOURNAL_ENTRY_${parsed.data.action}`,
      entity: "EnterpriseJournalEntry",
      entityId: entryId,
      request: req,
      metadata: {
        organizationId,
        reason: parsed.data.reason,
        approverUserId: parsed.data.action === "SUBMIT" ? parsed.data.approverUserId : undefined,
      },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "journal-entries", action: parsed.data.action },
    });
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    return financeErrorResponse(error, "JOURNAL_ENTRY_TRANSITION_FAILED");
  }
}