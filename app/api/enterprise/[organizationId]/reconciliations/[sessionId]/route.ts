import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; sessionId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, sessionId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECONCILIATION", "view");
  if (!auth.ok) return auth.response;

  const reconciliation = await prisma.enterpriseReconciliationSession.findFirst({
    where: { id: sessionId, organizationId },
    include: {
      financialAccount: {
        select: {
          id: true,
          code: true,
          name: true,
          currencyCode: true,
          maskedReference: true,
          operationalBalance: true,
          reconciledBalance: true,
        },
      },
      matches: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!reconciliation) return NextResponse.json({ error: "RECONCILIATION_NOT_FOUND", message: "Le rapprochement demandé est introuvable." }, { status: 404 });

  const [bankStatement, statementLines, pendingApproval] = await Promise.all([
    reconciliation.bankStatementId
      ? prisma.enterpriseBankStatement.findFirst({
          where: { id: reconciliation.bankStatementId, organizationId },
          select: { id: true, reference: true, statementDate: true, periodStart: true, periodEnd: true, currencyCode: true, openingBalance: true, closingBalance: true, status: true },
        })
      : Promise.resolve(null),
    reconciliation.bankStatementId
      ? prisma.enterpriseBankStatementLine.findMany({
          where: { organizationId, bankStatementId: reconciliation.bankStatementId },
          orderBy: [{ lineNumber: "asc" }, { transactionDate: "asc" }],
        })
      : Promise.resolve([]),
    prisma.enterpriseApproval.findFirst({
      where: { organizationId, targetEntityType: "EnterpriseReconciliationSession", targetEntityId: reconciliation.id, status: "PENDING", archivedAt: null },
      select: { approverUserId: true },
    }),
  ]);
  const assigned = pendingApproval?.approverUserId === auth.session.userId;
  const capabilities = auth.access.capabilities;

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "reconciliation-detail", reconciliationId: sessionId } });
  return NextResponse.json({
    reconciliation: {
      ...reconciliation,
      differenceAmount: reconciliation.reconciledDifference,
      bankStatement,
      statementLines,
      capabilities: {
        canMatch: Boolean(capabilities.canManage && ["DRAFT", "IN_PROGRESS"].includes(reconciliation.status)),
        canSubmit: Boolean(capabilities.canSubmit && ["DRAFT", "IN_PROGRESS"].includes(reconciliation.status) && reconciliation.preparedByUserId === auth.session.userId),
        canApprove: Boolean(capabilities.canApprove && reconciliation.status === "PENDING_VALIDATION" && assigned),
        canReject: Boolean(capabilities.canApprove && reconciliation.status === "PENDING_VALIDATION" && assigned),
      },
    },
  });
}
