import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeBusinessDateRange, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createEnterprisePayment, inspectEnterprisePaymentConfirmation, paymentCashSessionConfirmationBlocker, paymentCashSessionConfirmationNotice } from "@/lib/enterprise/accounting/payments-service";
import { paymentCreateSchema } from "@/lib/enterprise/accounting/schemas";
import { prisma } from "@/lib/prisma";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYMENTS", "view");
  if (!auth.ok) return auth.response;
  const claimQuery = new URL(req.url).searchParams;
  const claimId = claimQuery.get("supplierReturnClaimId")?.trim();
  const compensationPayableId = claimQuery.get("compensationPayableId")?.trim();
  const compensationAmount = claimQuery.get("compensationAmount");
  const compensationDate = claimQuery.get("compensationDate");
  if ((compensationPayableId && !claimId) ||
      ((compensationAmount !== null || compensationDate !== null) &&
        (!claimId || !compensationPayableId || !compensationAmount || !compensationDate))) {
    return financeErrorResponse(new EnterpriseAccountingError("SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED", 409));
  }
  const compensationIntent = compensationAmount && compensationDate
    ? { amount: compensationAmount, accountingDate: compensationDate } : undefined;
  if (claimId) {
    try {
      if (!await getEnterpriseAccountingAccess({session:auth.session,organizationId,moduleCode:"FINANCE_PAYABLES",action:"view"})) throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_ACCESS_FORBIDDEN",403);
      const { readSupplierClaimRefundEvidenceTx, readSupplierClaimCompensationTargetTx } = await import("@/lib/enterprise/accounting/supplier-return-claim-refunds");
      const summary=await prisma.$transaction(async tx=>{
        const scope=await retailFinanceReadSiteScope(organizationId,auth.session.userId,"COLLECT_PAYMENT",tx);
        // A supplier invoice has no canonical site dimension yet. Do not infer
        // a target site from the claim or expose its debt to a scoped operator.
        if (compensationPayableId && scope !== null) throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_ACCESS_FORBIDDEN", 403);
        if(scope!==null){
          const linked=await tx.enterpriseSupplierReturnRequest.findFirst({where:{organizationId,id:claimId},select:{sourceMovementId:true,warehouseId:true}});
          const source=linked?await tx.enterpriseStockMovement.findFirst({where:{organizationId,id:linked.sourceMovementId,warehouseId:linked.warehouseId},select:{warehouse:{select:{siteId:true}}}}):null;
          if(!source?.warehouse.siteId||!scope.includes(source.warehouse.siteId))throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_CLAIM_NOT_FOUND",404);
        }
        const proof=await readSupplierClaimRefundEvidenceTx(tx,organizationId,claimId);
        const compensation = compensationPayableId
          ? await readSupplierClaimCompensationTargetTx(tx, organizationId, proof, compensationPayableId, compensationIntent)
          : undefined;
        return {id:proof.claim.id,reference:proof.claim.reference,invoiceReference:proof.invoice.number,businessPartyId:proof.invoice.businessPartyId,currencyCode:proof.claim.currencyCode,creditDate:proof.credit.creditDate,original:proof.claim.settlementClaimAmount,refunded:proof.refunded,reserved:proof.reserved,remaining:proof.remaining,available:proof.available,canCreate:auth.access.capabilities.canCreate&&proof.available.gt(0), ...(compensation ? { compensation } : {})};
      },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
      await writeApiLog({request:req,statusCode:200,userId:auth.session.userId,startedAt,metadata:{organizationId,domain:compensationPayableId?"supplier-claim-compensation-preflight":"supplier-claim-refund-preflight",claimId}});
      return NextResponse.json({claim:summary},{headers:{"Cache-Control":"private, no-store"}});
    }catch(error){return financeErrorResponse(error,"SUPPLIER_RETURN_REFUND_EVIDENCE_REQUIRED");}
  }
  const dates = financeBusinessDateRange(req);
  if (!dates.ok) return dates.response;

  const { page, pageSize, search, status } = financeListParams(req);
  const retailScope = await retailFinanceReadSiteScope(organizationId, auth.session.userId, "COLLECT_PAYMENT");
  // An assigned shop operator must not see payments of other stores through
  // Finance's direct list or global summary metrics. Finance-only users keep
  // their preexisting scope. Archived accounts remain visible for history.
  const accountIds = retailScope === null ? null : (await prisma.enterpriseFinancialAccount.findMany({
    where: { organizationId, siteId: { in: retailScope } }, select: { id: true },
  })).map((account) => account.id);
  const sitePaymentScope: Prisma.EnterprisePaymentWhereInput | null = retailScope === null ? null : {
    financialAccountId: { in: accountIds || [] },
    OR: [
      { retailInvoiceProposals: { none: {} } },
      { retailInvoiceProposals: { some: { checkout: { siteId: { in: retailScope } } } } },
    ],
  };
  const url = new URL(req.url);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const directionRaw = url.searchParams.get("direction")?.trim();
  const direction = directionRaw === "INBOUND" || directionRaw === "OUTBOUND" ? directionRaw : undefined;
  const unallocatedOnly = url.searchParams.get("unallocated") === "true";
  const workflowPending = url.searchParams.get("workflowPending") === "true";
  const businessPartyId = url.searchParams.get("businessPartyId")?.trim() || undefined;
  const currencyCode = url.searchParams.get("currencyCode")?.trim().toUpperCase() || undefined;

  const where: Prisma.EnterprisePaymentWhereInput = {
    organizationId,
    ...((dates.from || dates.to) ? { paymentDate: { ...(dates.from ? { gte: dates.from } : {}), ...(dates.to ? { lte: dates.to } : {}) } } : {}),
    ...(sitePaymentScope ? { AND: [sitePaymentScope] } : {}),
    ...(recordId ? { id: recordId } : {}),
    ...(workflowPending ? { status: "PENDING_APPROVAL" } : status ? { status } : {}),
    ...(direction ? { direction } : {}),
    ...(unallocatedOnly ? { status: { in: ["CONFIRMED", "RECONCILED"] }, unallocatedAmount: { gt: 0 } } : {}),
    ...(businessPartyId ? { businessPartyId } : {}),
    ...(currencyCode ? { currencyCode } : {}),
    ...(search ? { OR: [
      { number: { contains: search, mode: "insensitive" } },
      { reference: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };

  const [items, total, inboundByCurrency, outboundByCurrency, unallocatedByCurrency] = await Promise.all([
    prisma.enterprisePayment.findMany({
      where,
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { cashSession: { select: { status: true, financialAccountId: true } }, _count: { select: { allocations: true, events: true } } },
    }),
    prisma.enterprisePayment.count({ where }),
    prisma.enterprisePayment.groupBy({
      by: ["currencyCode"],
      where: { organizationId, ...(sitePaymentScope ? { AND: [sitePaymentScope] } : {}), status: { in: ["CONFIRMED", "RECONCILED"] }, direction: "INBOUND" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.enterprisePayment.groupBy({
      by: ["currencyCode"],
      where: { organizationId, ...(sitePaymentScope ? { AND: [sitePaymentScope] } : {}), status: { in: ["CONFIRMED", "RECONCILED"] }, direction: "OUTBOUND" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.enterprisePayment.groupBy({
      by: ["currencyCode"],
      where: { organizationId, ...(sitePaymentScope ? { AND: [sitePaymentScope] } : {}), status: { in: ["CONFIRMED", "RECONCILED"] }, unallocatedAmount: { gt: 0 } },
      _sum: { unallocatedAmount: true },
      _count: { _all: true },
    }),
  ]);

  // Invoice identity originates from the canonical Retail intent or confirmed
  // receivable allocations; a payment without an invoice is not a fake invoice.
  const paymentIds = items.map((item) => item.id);
  const [retailProposals, customerAllocations] = paymentIds.length ? await Promise.all([
    prisma.enterpriseRetailInvoicePaymentProposal.findMany({
      where: { organizationId, paymentId: { in: paymentIds } },
      select: { paymentId: true, checkout: { select: { salesInvoiceId: true } } },
    }),
    prisma.enterprisePaymentAllocation.findMany({
      where: { organizationId, paymentId: { in: paymentIds }, status: { in: ["CONFIRMED", "REVERSED"] }, receivableId: { not: null } },
      select: { paymentId: true, receivableId: true },
    }),
  ]) : [[], []];
  const invoiceByPayment = new Map(retailProposals.map((proposal) => [proposal.paymentId, proposal.checkout.salesInvoiceId]));
  const receivableIds = [...new Set(customerAllocations.map((allocation) => allocation.receivableId).filter((id): id is string => Boolean(id)))];
  const receivables = receivableIds.length ? await prisma.enterpriseReceivable.findMany({
    where: { organizationId, id: { in: receivableIds } },
    select: { id: true, salesInvoiceId: true },
  }) : [];
  const invoiceByReceivable = new Map(receivables.map((receivable) => [receivable.id, receivable.salesInvoiceId]));
  for (const allocation of customerAllocations) {
    const salesInvoiceId = allocation.receivableId && invoiceByReceivable.get(allocation.receivableId);
    if (salesInvoiceId && !invoiceByPayment.has(allocation.paymentId)) invoiceByPayment.set(allocation.paymentId, salesInvoiceId);
  }

  const assignedApprovals = items.length ? await prisma.enterpriseApproval.findMany({
    where: {
      organizationId,
      targetEntityType: "EnterprisePayment",
      targetEntityId: { in: paymentIds },
      approverUserId: auth.session.userId,
      status: "PENDING",
      archivedAt: null,
    },
    select: { targetEntityId: true },
  }) : [];
  const assignedIds = new Set(assignedApprovals.map((approval) => approval.targetEntityId));
  const capabilities = auth.access.capabilities;
  // Strip the cash-session relation before any API projection. Only a
  // server-derived blocker/notice may be returned, never the session object.
  const paymentRows = items.map(({ cashSession, ...item }) => ({ cashSession, item }));
  const resultItems = await Promise.all(paymentRows.map(async ({ cashSession, item }) => {
    const actorBlocker = item.status === "APPROVED"
      && (item.initiatedByUserId === auth.session.userId || item.approvedByUserId === auth.session.userId)
      ? item.paymentType === "REFUND"
        ? "REFUND_PAYMENT_SELF_CONFIRMATION_FORBIDDEN"
        : "PAYMENT_SELF_CONFIRMATION_FORBIDDEN"
      : null;
    const cashBlocker = item.status === "APPROVED"
      ? paymentCashSessionConfirmationBlocker({ ...item, cashSession })
      : null;
    // The expensive read-only preflight runs only for an explicitly opened
    // record. List pagination never performs N accounting/inventory round trips.
    const preflight = recordId && recordId === item.id && item.status === "APPROVED" && !actorBlocker && !cashBlocker
      ? await inspectEnterprisePaymentConfirmation(organizationId, item.id, auth.session.userId)
      : null;
    const confirmationBlocker = actorBlocker || cashBlocker || preflight?.blockerCode || null;
    const confirmationNotice = item.status === "APPROVED" && !confirmationBlocker
      ? paymentCashSessionConfirmationNotice({ ...item, cashSession })
        || (!preflight ? "PAYMENT_CONFIRMATION_PREFLIGHT_REQUIRED" : null)
      : null;
    const canConfirm = capabilities.canWrite && Boolean(item.status === "APPROVED" && preflight?.ready && !confirmationBlocker);

    return {
      ...item,
      linkedSalesInvoiceId: invoiceByPayment.get(item.id) || null,
      capabilities: {
        canSubmit: capabilities.canSubmit && item.status === "DRAFT" && item.initiatedByUserId === auth.session.userId,
        canApprove: capabilities.canApprove && item.status === "PENDING_APPROVAL" && assignedIds.has(item.id),
        canCancel: capabilities.canSubmit && ["DRAFT", "PENDING_APPROVAL"].includes(item.status) && item.initiatedByUserId === auth.session.userId,
        canConfirm,
        canReconcile: capabilities.canManage && item.status === "CONFIRMED",
        canReverse: capabilities.canManage && item.paymentType !== "SUPPLIER_RETURN_REFUND" && ["CONFIRMED", "RECONCILED"].includes(item.status),
        canAllocate: capabilities.canWrite && ["CONFIRMED", "RECONCILED"].includes(item.status) && item.unallocatedAmount.gt(0),
      },
      confirmation: {
        ready: canConfirm,
        blockerCode: confirmationBlocker,
        blockerItems: preflight?.blockerItems || [],
        noticeCode: confirmationNotice,
      },
    };
  }));

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "payments", page, direction, unallocatedOnly, workflowPending, recordId: Boolean(recordId) } });
  return NextResponse.json({
    items: resultItems,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    metrics: { inboundByCurrency, outboundByCurrency, unallocatedByCurrency },
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYMENTS", "create", { mutation: true, limit: 100 });
  if (!auth.ok) return auth.response;
  const parsed = paymentCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message }, { status: 400 });

  if (parsed.data.paymentType === "CUSTOMER_PAYMENT" || parsed.data.paymentType === "SUPPLIER_PAYMENT") {
    const expectedDirection = parsed.data.paymentType === "CUSTOMER_PAYMENT" ? "INBOUND" : "OUTBOUND";
    const expectedRole = parsed.data.paymentType === "CUSTOMER_PAYMENT" ? "CUSTOMER" : "SUPPLIER";
    if (parsed.data.direction !== expectedDirection || !parsed.data.businessPartyId || parsed.data.employeeId || parsed.data.payrollRunId) {
      return NextResponse.json({ error: "PAYMENT_COUNTERPARTY_INVALID", message: parsed.data.paymentType === "CUSTOMER_PAYMENT" ? "Un encaissement client doit cibler un client actif et être entrant." : "Un paiement fournisseur doit cibler un fournisseur actif et être sortant." }, { status: 409 });
    }
    const party = await prisma.enterpriseBusinessParty.findFirst({
      where: {
        id: parsed.data.businessPartyId,
        organizationId,
        status: "ACTIVE",
        archivedAt: null,
        roles: { some: { roleCode: expectedRole, status: "ACTIVE", archivedAt: null } },
      },
      select: { id: true },
    });
    if (!party) return NextResponse.json({ error: "PAYMENT_COUNTERPARTY_INVALID", message: "Le tiers sélectionné ne correspond pas au type de paiement dans cette entreprise." }, { status: 409 });
  }

  try {
    if(parsed.data.paymentType==="SUPPLIER_RETURN_REFUND"&&!await getEnterpriseAccountingAccess({session:auth.session,organizationId,moduleCode:"FINANCE_PAYABLES",action:"view"})) throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_ACCESS_FORBIDDEN",403);
    const payment = await createEnterprisePayment(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_PAYMENT_CREATED", entity: "EnterprisePayment", entityId: payment.id, request: req, metadata: { organizationId, number: payment.number, amount: payment.amount.toFixed(), currency: payment.currencyCode, direction: payment.direction, paymentType: payment.paymentType } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "payments" } });
    return NextResponse.json({ ok: true, payment }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "PAYMENT_CREATE_FAILED");
  }
}
