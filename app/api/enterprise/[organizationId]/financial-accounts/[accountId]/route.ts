import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import {
  archiveManagedFinancialAccount,
  updateManagedFinancialAccount,
} from "@/lib/enterprise/accounting/financial-account-service";
import {
  financialAccountArchiveSchema,
  financialAccountUpdateSchema,
} from "@/lib/enterprise/accounting/treasury-schemas";

type Params = { params: Promise<{ organizationId: string; accountId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, accountId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "update", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = financialAccountUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const account = await updateManagedFinancialAccount(organizationId, accountId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_FINANCIAL_ACCOUNT_UPDATED",
      entity: "EnterpriseFinancialAccount",
      entityId: account.id,
      request: req,
      metadata: { organizationId, status: account.status, revision: account.revision },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "financial-accounts", action: "update" } });
    return NextResponse.json({ ok: true, account });
  } catch (error) {
    return financeErrorResponse(error, "FINANCIAL_ACCOUNT_UPDATE_FAILED");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, accountId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = financialAccountArchiveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const account = await archiveManagedFinancialAccount(organizationId, accountId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_FINANCIAL_ACCOUNT_ARCHIVED",
      entity: "EnterpriseFinancialAccount",
      entityId: account.id,
      request: req,
      metadata: { organizationId, reason: parsed.data.reason },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "financial-accounts", action: "archive" } });
    return NextResponse.json({ ok: true, account });
  } catch (error) {
    return financeErrorResponse(error, "FINANCIAL_ACCOUNT_ARCHIVE_FAILED");
  }
}
