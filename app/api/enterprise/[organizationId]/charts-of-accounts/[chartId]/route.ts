import { z } from "zod";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { deleteEmptyDraftAccountingChart, updateAccountingChartMetadata } from "@/lib/enterprise/accounting/chart-lifecycle-service";
import { authorizeFinanceRequest, financeErrorResponse, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import { revisionSchema } from "@/lib/enterprise/accounting/schemas";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  code: z.string().trim().min(2).max(40),
  nameFr: z.string().trim().min(2).max(160),
  nameEn: z.string().trim().min(2).max(160),
  revision: revisionSchema,
});
const deleteSchema = z.object({ revision: revisionSchema });

type Params = { params: Promise<{ organizationId: string; chartId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, chartId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;

  const item = await prisma.enterpriseChartOfAccounts.findFirst({
    where: { id: chartId, organizationId },
    include: {
      groups: { orderBy: [{ sortOrder: "asc" }, { code: "asc" }] },
      accounts: {
        where: { archivedAt: null },
        orderBy: [{ code: "asc" }],
        include: {
          parent: { select: { id: true, code: true, nameFr: true, nameEn: true } },
          group: { select: { id: true, code: true, nameFr: true, nameEn: true } },
          _count: { select: { children: true, journalLines: true, accountMappings: true } },
        },
      },
    },
  });

  if (!item) {
    return NextResponse.json(
      { error: "CHART_OF_ACCOUNTS_NOT_FOUND", message: "Ce plan comptable n’existe pas dans votre entreprise." },
      { status: 404 },
    );
  }

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: auth.session.userId,
    startedAt,
    metadata: { organizationId, chartId, domain: "chart-of-accounts-detail", accountCount: item.accounts.length },
  });
  const canManage = Boolean(auth.access.capabilities.canManage);
  const projected = {
    ...item,
    capabilities: {
      canEdit: canManage,
      canDelete: canManage && item.status === "DRAFT" && !item.templateCode && item.groups.length === 0 && item.accounts.length === 0,
    },
  };
  return NextResponse.json({ item: projected });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, chartId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error, "CHART_OF_ACCOUNTS_INPUT_INVALID");
  try {
    const item = await updateAccountingChartMetadata(organizationId, chartId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_CHART_OF_ACCOUNTS_UPDATED", entity: "EnterpriseChartOfAccounts", entityId: item.id, request: req, metadata: { organizationId, code: item.code } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, chartId, domain: "chart-of-accounts-detail" } });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return financeErrorResponse(error, "CHART_OF_ACCOUNTS_UPDATE_FAILED");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, chartId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error, "CHART_OF_ACCOUNTS_REVISION_INVALID");
  try {
    const item = await deleteEmptyDraftAccountingChart(organizationId, chartId, auth.session.userId, parsed.data.revision);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_CHART_OF_ACCOUNTS_DELETED", entity: "EnterpriseChartOfAccounts", entityId: item.id, request: req, metadata: { organizationId, code: item.code } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, chartId, domain: "chart-of-accounts-detail" } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return financeErrorResponse(error, "CHART_OF_ACCOUNTS_DELETE_FAILED");
  }
}
