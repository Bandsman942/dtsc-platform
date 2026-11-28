import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeBusinessDateRange, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { openCashSession } from "@/lib/enterprise/accounting/treasury-service";
import { cashSessionOpenSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { prisma } from "@/lib/prisma";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";
import { enterpriseApprovalTargetDeepLink } from "@/lib/enterprise/approval-targets";
import { cashClosingVarianceTotals, cashFlowTotals, cashSessionBalance, cashSessionCounts, cashSessionSummaries } from "@/lib/enterprise/accounting/cash-session-analytics";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CASH", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, search, status } = financeListParams(req);
  const dates = financeBusinessDateRange(req);
  if (!dates.ok) return dates.response;
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const { rawItems, movementsBySession, total, analytics } = await prisma.$transaction(async (tx) => {
    const siteScope = await retailFinanceReadSiteScope(organizationId, auth.session.userId, "CLOSE_CASH", tx);
    const authorizedScope = { organizationId, ...(siteScope !== null ? { siteId: { in: siteScope } } : {}) };
    const where: Prisma.EnterpriseCashSessionWhereInput = {
      ...authorizedScope,
      ...(dates.from || dates.to ? { openedAt: { ...(dates.from ? { gte: dates.from } : {}), ...(dates.to ? { lte: dates.to } : {}) } } : {}),
      ...(recordId ? { id: recordId } : {}),
      ...(status ? { status } : {}),
      ...(search ? {
        OR: [
          { number: { contains: search, mode: "insensitive" } },
          { financialAccount: { code: { contains: search, mode: "insensitive" } } },
          { financialAccount: { name: { contains: search, mode: "insensitive" } } },
          { financialAccount: { currencyCode: { contains: search, mode: "insensitive" } } },
        ],
      } : {}),
    };
    const general = recordId ? null : cashSessionSummaries(tx, organizationId, authorizedScope);
    const filtered = recordId || !(dates.from || dates.to || status || search)
      ? general : cashSessionSummaries(tx, organizationId, where);
    const [rawItems, filteredResult, generalResult, recordCount] = await Promise.all([
      tx.enterpriseCashSession.findMany({
        where,
        orderBy: [{ openedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          financialAccount: { select: { id: true, code: true, name: true, currencyCode: true } },
          discrepancies: { where: { status: { in: ["PENDING_QUALIFICATION","APPROVED","POSTED","RESOLVED_COUNT_ERROR","LEGACY_REVERSED","REAL_REVERSED","RESOLVED_CANONICAL"] } }, select: { id: true, status: true, amount: true, reason: true, journalEntryId: true, createdByUserId:true,approvedByUserId:true,canonicalTreasuryTransaction:{select:{fundingOperationId:true,paymentId:true,transferId:true}}, updatedAt: true }, orderBy: { createdAt: "desc" } },
          _count: { select: { movements: true, counts: true, discrepancies: true } },
        },
      }),
      filtered,
      general,
      recordId ? tx.enterpriseCashSession.count({ where }) : null,
    ]);
    const pageIds = rawItems.map(item => item.id);
    const pageMovements = pageIds.length ? await tx.enterpriseCashMovement.groupBy({
      by: ["cashSessionId", "currencyCode", "direction"],
      where: { organizationId, cashSessionId: { in: pageIds } },
      _sum: { amount: true },
    }) : [];
    const movementsBySession = new Map<string, typeof pageMovements>();
    for (const movement of pageMovements) {
      const existing = movementsBySession.get(movement.cashSessionId);
      if (existing) existing.push(movement);
      else movementsBySession.set(movement.cashSessionId, [movement]);
    }
    const analytics = filteredResult && generalResult ? {
      metrics: { ...filteredResult.metrics, general: generalResult.metrics,
        page: cashSessionCounts(rawItems.map(item => ({ status: item.status, count: 1 }))) },
      filteredTotals: filteredResult.totals,
      generalTotals: generalResult.totals,
      pageTotals: [
        ...cashFlowTotals(pageMovements),
        ...cashClosingVarianceTotals(rawItems.filter(item => item.status === "CLOSED").map(item => ({
          currencyCode: item.financialAccount.currencyCode, amount: item.discrepancyAmount,
        }))),
      ],
    } : {};
    return { rawItems, movementsBySession, total: filteredResult?.metrics.total ?? recordCount ?? 0, analytics };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const ids = rawItems.map((item) => item.id);
  const approvals = ids.length ? await prisma.enterpriseApproval.findMany({
    where: {
      organizationId,
      targetEntityType: "EnterpriseCashSession",
      targetEntityId: { in: ids },
      status: { in: ["PENDING", "QUEUED"] },
      archivedAt: null,
    },
    select: { id: true, targetEntityId: true, approverUserId: true, requestedByUserId: true, status: true },
  }) : [];
  const approvalBySessionId = new Map(approvals.map((approval) => [approval.targetEntityId, approval]));
  const approverUserIds = [...new Set(approvals.map((approval) => approval.approverUserId))];
  const operatorIds = [...new Set(rawItems.flatMap((item) => [item.cashierUserId, item.validatedByUserId].filter((id): id is string => Boolean(id))))];
  const operators = operatorIds.length ? await prisma.organizationMember.findMany({
    where: { organizationId, userId: { in: operatorIds } },
    select: { userId: true, user: { select: { name: true, email: true } } },
  }) : [];
  const operatorNames = new Map(operators.map((member) => [member.userId, member.user.name || member.user.email || "—"]));
  const approverMembers = approverUserIds.length ? await prisma.organizationMember.findMany({
    where: { organizationId, userId: { in: approverUserIds }, status: "ACTIVE", removedAt: null },
    select: { userId: true, positionTitle: true, user: { select: { name: true, email: true } } },
  }) : [];
  const approverLabelByUserId = new Map(approverMembers.map((member) => [
    member.userId,
    member.positionTitle
      ? `${member.user.name || member.user.email} · ${member.positionTitle}`
      : member.user.name || member.user.email,
  ]));
  const capabilities = auth.access.capabilities;
  const accountingReview = capabilities.canApprove && rawItems.some(item => item.discrepancies.some(d => ["PENDING_QUALIFICATION","APPROVED","POSTED","RESOLVED_CANONICAL"].includes(d.status))) ? await getEnterpriseAccountingAccess({ session: auth.session, organizationId, moduleCode: "FINANCE_ACCOUNTING", action: "manage" }) : null;
  const canonicalAccess=rawItems.some(item=>item.discrepancies.some(d=>["PENDING_QUALIFICATION","RESOLVED_CANONICAL"].includes(d.status)))?await Promise.all([
    getEnterpriseAccountingAccess({session:auth.session,organizationId,moduleCode:"FINANCE_TREASURY",action:"view"}),
    getEnterpriseAccountingAccess({session:auth.session,organizationId,moduleCode:"FINANCE_PAYMENTS",action:"view"}),
  ]):[null,null];
  const canViewCanonicalSource=canonicalAccess.every(Boolean);
  const items = rawItems.map(({ discrepancies, ...item }) => {
    const balance = cashSessionBalance(item.openingAmount, item.financialAccount.currencyCode, movementsBySession.get(item.id) ?? []);
    const approval = approvalBySessionId.get(item.id);
    const assignedToCurrentUser = approval?.status === "PENDING" && approval.approverUserId === auth.session.userId;
    return {
      ...item,
      canViewHandover:item.cashierUserId===auth.session.userId,
      varianceQualificationPending: discrepancies.some(d => d.status === "PENDING_QUALIFICATION"),
      canLinkCanonical:canViewCanonicalSource,
      varianceReviews: discrepancies.map(({canonicalTreasuryTransaction:source,createdByUserId,approvedByUserId,...discrepancy})=>({
        ...discrepancy,
        canReview:Boolean(accountingReview&&item.status==="CLOSED"&&![item.cashierUserId,item.validatedByUserId,createdByUserId,approvedByUserId].includes(auth.session.userId)),
        canonicalSourceHref:canViewCanonicalSource&&source ? source.fundingOperationId?enterpriseApprovalTargetDeepLink("EnterpriseFundingOperation",source.fundingOperationId):source.paymentId?enterpriseApprovalTargetDeepLink("EnterprisePayment",source.paymentId):source.transferId?enterpriseApprovalTargetDeepLink("EnterpriseAccountTransfer",source.transferId):null:null,
      })),
      canReviewVariance: Boolean(accountingReview && item.status === "CLOSED" && item.cashierUserId !== auth.session.userId && item.validatedByUserId !== auth.session.userId),
      openedByLabel: operatorNames.get(item.cashierUserId) || "—",
      submittedByLabel: item.submittedAt ? operatorNames.get(item.cashierUserId) || "—" : null,
      closedByLabel: item.validatedAt ? operatorNames.get(item.validatedByUserId || "") || "—" : null,
      closedAt: item.validatedAt || null,
      currencyCode: item.financialAccount.currencyCode,
      openingAmount: item.openingAmount.toFixed(),
      countedClosingAmount: item.countedClosingAmount?.toFixed() ?? null,
      discrepancyAmount: item.discrepancyAmount?.toFixed() ?? null,
      ...balance,
      theoreticalClosingAmount: item.expectedClosingAmount?.toFixed() ?? balance.expectedCurrentAmount,
      approval: approval ? {
        assigned: true,
        status: approval.status,
        approverLabel: approverLabelByUserId.get(approval.approverUserId) || null,
      } : {
        assigned: false,
        status: null,
        approverLabel: null,
      },
      capabilities: {
        canClose: capabilities.canManage && item.cashierUserId === auth.session.userId && item.status === "OPEN",
        canAssignApprover: capabilities.canManage && item.status === "PENDING_VALIDATION" && !approval,
        canApprove: capabilities.canApprove && item.status === "PENDING_VALIDATION" && assignedToCurrentUser,
        canReject: capabilities.canApprove && item.status === "PENDING_VALIDATION" && assignedToCurrentUser,
      },
    };
  });

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "cash-sessions", hasSearch: Boolean(search), recordId: recordId || null } });
  return NextResponse.json(
    { items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, ...analytics },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CASH", "create", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = cashSessionOpenSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    const session = await openCashSession(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_CASH_SESSION_OPENED",
      entity: "EnterpriseCashSession",
      entityId: session.id,
      request: req,
      metadata: { organizationId, financialAccountId: session.financialAccountId, openingAmount: session.openingAmount.toFixed() },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "cash-sessions" } });
    return NextResponse.json({ ok: true, session }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "CASH_SESSION_OPEN_FAILED");
  }
}
