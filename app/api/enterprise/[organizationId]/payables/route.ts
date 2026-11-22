import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { z } from "zod";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { isValidEnterpriseActivityCivilDate } from "@/lib/enterprise/enterprise-activity-civil-date";
import { reversePostedSupplierClaimCompensation } from "@/lib/enterprise/accounting/supplier-claim-compensation-inverse";
import { prepareSupplierClaimCompensation, cancelSupplierClaimCompensation, submitSupplierClaimCompensation, decideSupplierClaimCompensation, postSupplierClaimCompensation, readSupplierClaimCompensation, listSupplierClaimCompensations, supplierCompensationDraftProjection } from "@/lib/enterprise/accounting/supplier-claim-compensation-service";
import { authorizeFinanceRequest, financeBusinessDateRange, financeErrorResponse, financeListParams, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";
import { supplierReturnFinanceProjectionTx, supplierReturnPayableCapacity } from "@/lib/enterprise/accounting/supplier-return-credit-reconciliation";

type Params = { params: Promise<{ organizationId: string }> };

function startOfUtcDay(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  const copy = new Date(value);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function ageingWhere(value: string | null, overdue: boolean): Prisma.EnterprisePayableWhereInput {
  const today = startOfUtcDay();
  if (overdue) return { status: "OPEN", dueDate: { lt: today } };
  if (value === "TO_DUE") return { status: "OPEN", OR: [{ dueDate: null }, { dueDate: { gte: today } }] };
  if (value === "D1_30") return { status: "OPEN", dueDate: { gte: addUtcDays(today, -30), lt: today } };
  if (value === "D31_60") return { status: "OPEN", dueDate: { gte: addUtcDays(today, -60), lt: addUtcDays(today, -30) } };
  if (value === "D61_90") return { status: "OPEN", dueDate: { gte: addUtcDays(today, -90), lt: addUtcDays(today, -60) } };
  if (value === "D90_PLUS") return { status: "OPEN", dueDate: { lt: addUtcDays(today, -90) } };
  return {};
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYABLES", "view");
  if (!auth.ok) return auth.response;
  // EnterprisePayable has no canonical site coordinate. Do not accidentally
  // expose all branches' supplier liabilities to an isolated shop operator.
  const siteScope = await retailFinanceReadSiteScope(organizationId, auth.session.userId, "COLLECT_PAYMENT");
  if (siteScope !== null) return financeErrorResponse(new EnterpriseAccountingError("SUPPLIER_PAYABLES_SITE_SCOPE_REQUIRED", 403));
  const query = new URL(req.url).searchParams;
  const compensationId = query.get("compensationId");
  const claimCompensationsFor = query.get("claimCompensationsFor");
  if (compensationId !== null && claimCompensationsFor !== null)
    return financeErrorResponse(new EnterpriseAccountingError("FINANCE_INPUT_INVALID", 400));
  if (claimCompensationsFor !== null) {
    try {
      if (!claimCompensationsFor || claimCompensationsFor.length > 200 ||
          !await getEnterpriseAccountingAccess({ session: auth.session, organizationId,
            moduleCode: "FINANCE_PAYMENTS", action: "view" }))
        throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_ACCESS_FORBIDDEN", 403);
      const rawPage = query.get("page") || "1";
      if (!/^[1-9]\d{0,3}$/.test(rawPage)) throw new EnterpriseAccountingError("FINANCE_INPUT_INVALID",400);
      const status = query.get("compensationStatus") || undefined;
      if (status && !["DRAFT","PENDING_APPROVAL","APPROVED","POSTED","REVERSED","REJECTED","CANCELLED"].includes(status))
        throw new EnterpriseAccountingError("FINANCE_INPUT_INVALID",400);
      const history = await listSupplierClaimCompensations(
        organizationId, auth.session.userId, claimCompensationsFor, auth.access.canSeeAll, Number(rawPage), status);
      await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt,
        metadata: { organizationId, domain: "supplier-claim-compensation-history", claimId: claimCompensationsFor, page: Number(rawPage) } });
      return NextResponse.json(history, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) { return financeErrorResponse(error,"SUPPLIER_RETURN_COMPENSATION_DRAFT_CONFLICT"); }
  }
  if (compensationId !== null) {
    try {
      if (!await getEnterpriseAccountingAccess({ session: auth.session, organizationId, moduleCode: "FINANCE_PAYMENTS", action: "view" }))
        throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_ACCESS_FORBIDDEN", 403);
      const draft = await readSupplierClaimCompensation(organizationId, auth.session.userId, compensationId, auth.access.canSeeAll);
      await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "supplier-claim-compensation-draft", compensationId } });
      return NextResponse.json({ compensation: supplierCompensationDraftProjection(draft) }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) { return financeErrorResponse(error, "SUPPLIER_RETURN_COMPENSATION_DRAFT_CONFLICT"); }
  }
  const dates = financeBusinessDateRange(req);
  if (!dates.ok) return dates.response;

  const { page, pageSize, search, status } = financeListParams(req);
  const url = new URL(req.url);
  const overdue = url.searchParams.get("overdue") === "true";
  const ageBucket = url.searchParams.get("ageBucket");
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const supplierId = url.searchParams.get("supplierId")?.trim() || undefined;
  const businessPartyId = url.searchParams.get("businessPartyId")?.trim() || undefined;
  const currencyCode = url.searchParams.get("currencyCode")?.trim().toUpperCase() || undefined;
  const hasAgeFilter = overdue || Boolean(ageBucket);
  const ageFilter = ageingWhere(ageBucket, overdue);

  const where: Prisma.EnterprisePayableWhereInput = {
    organizationId,
    ...((dates.from || dates.to) ? { dueDate: { ...(dates.from ? { gte: dates.from } : {}), ...(dates.to ? { lte: dates.to } : {}) } } : {}),
    ...(recordId ? { id: recordId } : {}),
    ...(!hasAgeFilter && status ? { status } : {}),
    ...ageFilter,
    ...(supplierId ? { supplierId } : {}),
    ...(businessPartyId ? { businessPartyId } : {}),
    ...(currencyCode ? { currencyCode } : {}),
    ...(search ? { supplierInvoice: { number: { contains: search, mode: "insensitive" } } } : {}),
  };
  const today = startOfUtcDay();
  const {items,total,openByCurrency,overdueByCurrency} = await prisma.$transaction(async tx => {
  const [pageItems, total, openByCurrency, overdueByCurrency] = await Promise.all([
    tx.enterprisePayable.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { supplierInvoice: { include: { threeWayMatch: true } }, _count: { select: { paymentAllocations: true, allocations: true } } },
    }),
    tx.enterprisePayable.count({ where }),
    tx.enterprisePayable.groupBy({
      by: ["currencyCode"],
      where: { organizationId, status: "OPEN" },
      _sum: { outstandingAmount: true },
      _count: { _all: true },
    }),
    tx.enterprisePayable.groupBy({
      by: ["currencyCode"],
      where: { organizationId, status: "OPEN", dueDate: { lt: today } },
      _sum: { outstandingAmount: true },
      _count: { _all: true },
    }),
  ]);
  const returns=await supplierReturnFinanceProjectionTx(tx,organizationId,pageItems.map(row=>row.supplierInvoiceId));
  // The common Payables summary must display reservations made by the
  // non-cash settlement workflow; it is NOT another balance authority.
  const reservations=pageItems.length?await tx.enterpriseSupplierClaimCompensation.groupBy({
    by:["payableId","currencyCode"],
    where:{organizationId,payableId:{in:pageItems.map(row=>row.id)},status:{in:["PENDING_APPROVAL","APPROVED"]}},
    _sum:{amount:true},_count:{_all:true},
  }):[];
  const items=pageItems.map(row=>{
    const supplierReturn=returns.get(row.supplierInvoiceId)||null;
    const {reserved,available}=supplierReturnPayableCapacity(row,supplierReturn?.status==="DISPATCHED"?[supplierReturn]:[]);
    const offsetRows=reservations.filter(offset=>offset.payableId===row.id);
    if(offsetRows.some(offset=>offset.currencyCode!==row.currencyCode||offset._count._all>100))
      throw new EnterpriseAccountingError("SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED",409);
    const compensationReserved=offsetRows.reduce((sum,offset)=>sum.plus(offset._sum.amount||new Prisma.Decimal(0)),new Prisma.Decimal(0));
    if(!compensationReserved.isFinite()||compensationReserved.lt(0)||compensationReserved.gt(available))
      throw new EnterpriseAccountingError("SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED",409);
    const allocatable=available.minus(compensationReserved);
    return {...row,supplierReturn,supplierReturnReservedAmount:reserved.toFixed(),
      compensationReservedAmount:compensationReserved.toFixed(),
      supplierReturnAllocatableAmount:allocatable.toFixed(),payableAllocatableAmount:allocatable.toFixed()};
  });
  return {items,total,openByCurrency,overdueByCurrency};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "payables", page, overdue, ageBucket } });
  return NextResponse.json({
    items,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    metrics: { openByCurrency, overdueByCurrency },
  });
}

const compensationDraftMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("PREPARE_COMPENSATION"), claimId: z.string().trim().min(1).max(200),
    payableId: z.string().trim().min(1).max(200), amount: z.string().regex(/^\d{1,14}(\.\d{1,6})?$/),
    accountingDate: z.string().refine(isValidEnterpriseActivityCivilDate),
    supplierReference: z.string().trim().min(1).max(200), reason: z.string().trim().min(8).max(1000),
    idempotencyKey: z.string().trim().min(8).max(200) }).strict(),
  z.object({ action: z.literal("SUBMIT_COMPENSATION"), compensationId: z.string().trim().min(1).max(200),
    revision: z.number().int().positive(), approverUserId: z.string().trim().min(1).max(200) }).strict(),
  z.object({ action: z.enum(["APPROVE_COMPENSATION", "REJECT_COMPENSATION"]),
    compensationId: z.string().trim().min(1).max(200), revision: z.number().int().positive(),
    reason: z.string().trim().min(8).max(1000).optional() }).strict(),
  z.object({ action: z.literal("POST_COMPENSATION"), compensationId: z.string().trim().min(1).max(200),
    revision: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("REVERSE_COMPENSATION"), compensationId: z.string().trim().min(1).max(200),
    revision: z.number().int().positive(), reason: z.string().trim().min(8).max(1000),
    accountingDate: z.string().refine(isValidEnterpriseActivityCivilDate) }).strict(),
  z.object({ action: z.literal("CANCEL_COMPENSATION_DRAFT"), compensationId: z.string().trim().min(1).max(200),
    revision: z.number().int().positive(), reason: z.string().trim().min(8).max(1000) }).strict(),
]);

// Non-cash drafts belong to payables, never to the payment creation route.
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYABLES", "view", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = compensationDraftMutation.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error);
  try {
    if (!await getEnterpriseAccountingAccess({ session: auth.session, organizationId, moduleCode: "FINANCE_PAYMENTS", action: "view" }))
      throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_ACCESS_FORBIDDEN", 403);
    const data = parsed.data;
    // Approvers may have canApprove without canWrite. Apply the actual
    // mutation permission rather than requiring Payables update for everyone.
    const requiredAction = data.action === "SUBMIT_COMPENSATION" ? "submit"
      : data.action === "APPROVE_COMPENSATION" || data.action === "REJECT_COMPENSATION" ? "approve"
      : data.action === "POST_COMPENSATION" ? "pay"
      : data.action === "REVERSE_COMPENSATION" ? "reverse" : "update";
    if (!await getEnterpriseAccountingAccess({ session: auth.session, organizationId,
      moduleCode: "FINANCE_PAYABLES", action: requiredAction }))
      throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_ACCESS_FORBIDDEN", 403);
    if ((data.action === "POST_COMPENSATION" || data.action === "REVERSE_COMPENSATION") &&
        !await getEnterpriseAccountingAccess({ session: auth.session, organizationId,
          moduleCode: "FINANCE_ACCOUNTING", action: data.action === "POST_COMPENSATION" ? "create" : "reverse" }))
      throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_ACCESS_FORBIDDEN", 403);
    const draft = data.action === "PREPARE_COMPENSATION"
      ? await prepareSupplierClaimCompensation(organizationId, auth.session.userId, data)
      : data.action === "SUBMIT_COMPENSATION"
        ? await submitSupplierClaimCompensation(organizationId, auth.session.userId, data)
        : data.action === "APPROVE_COMPENSATION" || data.action === "REJECT_COMPENSATION"
          ? await decideSupplierClaimCompensation(organizationId, auth.session.userId, {
            compensationId: data.compensationId, revision: data.revision,
            action: data.action === "APPROVE_COMPENSATION" ? "APPROVE" : "REJECT", reason: data.reason })
          : data.action === "POST_COMPENSATION"
            ? await postSupplierClaimCompensation(organizationId, auth.session.userId, data)
            : data.action === "REVERSE_COMPENSATION"
              ? await reversePostedSupplierClaimCompensation(organizationId, auth.session.userId, data)
            : data.action === "CANCEL_COMPENSATION_DRAFT"
              ? await cancelSupplierClaimCompensation(organizationId, auth.session.userId, data)
              : (() => { throw new EnterpriseAccountingError("FINANCE_INPUT_INVALID", 400); })();
    const statusCode = data.action === "PREPARE_COMPENSATION" ? 201 : 200;
    await writeAuditLog({ userId: auth.session.userId, action: data.action === "PREPARE_COMPENSATION" ? "SUPPLIER_CLAIM_COMPENSATION_DRAFT_PREPARED"
        : data.action === "SUBMIT_COMPENSATION" ? "SUPPLIER_CLAIM_COMPENSATION_SUBMITTED"
        : data.action === "APPROVE_COMPENSATION" ? "SUPPLIER_CLAIM_COMPENSATION_APPROVED"
        : data.action === "REJECT_COMPENSATION" ? "SUPPLIER_CLAIM_COMPENSATION_REJECTED"
        : data.action === "POST_COMPENSATION" ? "SUPPLIER_CLAIM_COMPENSATION_POSTED"
        : data.action === "REVERSE_COMPENSATION" ? "SUPPLIER_CLAIM_COMPENSATION_REVERSED"
        : "SUPPLIER_CLAIM_COMPENSATION_DRAFT_CANCELLED",
      entity: "EnterpriseSupplierClaimCompensation", entityId: draft.id, request: req,
      metadata: { organizationId, claimId: draft.claimId, payableId: draft.payableId, status: draft.status } });
    await writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt,
      metadata: { organizationId, domain: "supplier-claim-compensation-draft", compensationId: draft.id } });
    return NextResponse.json({ ok: true, compensation: supplierCompensationDraftProjection(draft) }, { status: statusCode, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return financeErrorResponse(error, "SUPPLIER_RETURN_COMPENSATION_DRAFT_CONFLICT"); }
}
