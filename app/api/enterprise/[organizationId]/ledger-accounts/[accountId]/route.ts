import { z } from "zod";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import { deactivateCustomLedgerAccount, updateCustomLedgerAccount } from "@/lib/enterprise/accounting/chart-lifecycle-service";
import { ACCOUNT_TYPES } from "@/lib/enterprise/accounting/constants";
import { revisionSchema } from "@/lib/enterprise/accounting/schemas";
import { getChartTemplate } from "@/lib/enterprise/accounting/chart-template-registry";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  nameFr: z.string().trim().min(2).max(160),
  nameEn: z.string().trim().min(2).max(160),
  accountType: z.enum(ACCOUNT_TYPES),
  currencyCode: z.string().trim().max(10).nullish(),
  allowDirectPosting: z.boolean(),
  revision: revisionSchema,
});
const deleteSchema = z.object({ revision: revisionSchema });

type Params = { params: Promise<{ organizationId: string; accountId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, accountId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;
  const item = await prisma.enterpriseLedgerAccount.findFirst({
    where: { id: accountId, organizationId },
    include: {
      chart: true,
      parent: { select: { id: true, code: true, nameFr: true, nameEn: true } },
      group: { select: { id: true, code: true, nameFr: true, nameEn: true } },
      _count: { select: { children: true, journalLines: true, accountMappings: true, financialAccounts: true } },
    },
  });
  if (!item) return NextResponse.json({ error: "LEDGER_ACCOUNT_NOT_FOUND", message: "Ce compte comptable n’existe pas dans votre entreprise." }, { status: 404 });
  const template = item.chart.templateCode ? getChartTemplate(item.chart.templateCode) : undefined;
  const templateManaged = Boolean(template?.accounts.some((source) => source.code === item.code));
  const canManage = Boolean(auth.access.capabilities.canManage);
  const projected = {
    ...item,
    templateManaged,
    capabilities: {
      canEdit: canManage && !item.isSystemAccount && !templateManaged && !item.archivedAt,
      canDeactivate: canManage && !item.isSystemAccount && !templateManaged && item.isActive && !item.archivedAt,
    },
  };
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, accountId, domain: "ledger-account-detail" } });
  return NextResponse.json({ item: projected });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, accountId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error, "LEDGER_ACCOUNT_INPUT_INVALID");
  try {
    const account = await updateCustomLedgerAccount(organizationId, accountId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_LEDGER_ACCOUNT_UPDATED", entity: "EnterpriseLedgerAccount", entityId: account.id, request: req, metadata: { organizationId, code: account.code } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, accountId, domain: "ledger-account-detail" } });
    return NextResponse.json({ ok: true, item: account });
  } catch (error) {
    return financeErrorResponse(error, "LEDGER_ACCOUNT_UPDATE_FAILED");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, accountId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error, "LEDGER_ACCOUNT_REVISION_INVALID");
  try {
    const account = await deactivateCustomLedgerAccount(organizationId, accountId, auth.session.userId, parsed.data.revision);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_LEDGER_ACCOUNT_DEACTIVATED", entity: "EnterpriseLedgerAccount", entityId: account.id, request: req, metadata: { organizationId, code: account.code } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, accountId, domain: "ledger-account-detail" } });
    return NextResponse.json({ ok: true, item: account });
  } catch (error) {
    return financeErrorResponse(error, "LEDGER_ACCOUNT_DEACTIVATE_FAILED");
  }
}
