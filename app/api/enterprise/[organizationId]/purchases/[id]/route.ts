import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { retailInventoryVisibleSites } from "@/lib/enterprise/retail/site-access";
import { retailErrorResponse } from "@/lib/enterprise/retail/http";
import { enterpriseDomainErrorResponse, enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { formatEnterpriseBusinessDate, getEnterpriseBusinessContext } from "@/lib/enterprise/business-context";
import { assertSupplierReturnAccess, inspectSupplierReturnTx } from "@/lib/enterprise/inventory/supplier-return-preflight";
import { withdrawApprovedSupplierReturn, supplierReturnWithdrawalSchema, dispatchSupplierReturn, supplierReturnDispatchSchema, requireSupplierReturnParticipantAccess, submitSupplierReturnRequest, supplierReturnApprovalCandidates, supplierReturnRequestSchema, SUPPLIER_RETURN_TARGET } from "@/lib/enterprise/inventory/supplier-return-request-service";
import { notifyUser } from "@/lib/notifications";
import { workCoordinationDeepLink } from "@/lib/standard-work-coordination/deep-links";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { enterprisePurchaseVisibilityWhere, getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { updateEnterprisePurchase } from "@/lib/enterprise/procurement/purchase-service";
import { enterprisePurchaseUpdateSchema } from "@/lib/enterprise/procurement/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params; const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "read" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const visible = enterprisePurchaseVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll });
  const purchase = await prisma.enterprisePurchase.findFirst({ where: { AND: [visible, { id }] }, include: { items: { orderBy: { sortOrder: "asc" } }, supplier: { include: { contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }], take: 5 } } }, budgetLine: { include: { budget: true } }, receipts: { orderBy: { receivedAt: "desc" }, include: { items: true } } } });
  if (!purchase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(req.url);
  if (url.searchParams.get("view") === "supplier-return-approvers") {
    const rate = await rateLimit(getRateLimitKey(req, `supplier-return-approvers:${organizationId}:${session.userId}`), 60, 60 * 60 * 1000);
    if (!rate.ok) return NextResponse.json({ error: "TOO_MANY_REQUESTS" }, { status: 429 });
    try { return NextResponse.json(await supplierReturnApprovalCandidates(organizationId, session.userId), { headers: { "Cache-Control": "private, no-store" } }); }
    catch (error) { return enterpriseDomainErrorResponse(error, "SUPPLIER_RETURN_PREFLIGHT_FAILED", req); }
  }
  if (url.searchParams.get("view") === "supplier-return-preflight") {
    const rate = await rateLimit(getRateLimitKey(req, `supplier-return-preflight:${organizationId}:${session.userId}`), 90, 60 * 60 * 1000);
    if (!rate.ok) return NextResponse.json({ error: "TOO_MANY_REQUESTS" }, { status: 429 });
    const movementId = (url.searchParams.get("movementId") || "").trim();
    const quantity = (url.searchParams.get("quantity") || "").trim();
    if (!movementId || movementId.length > 191 || !supplierReturnRequestSchema.shape.quantity.safeParse(quantity).success || !new Prisma.Decimal(quantity).gt(0)) {
      return enterpriseDomainErrorResponse(new EnterpriseDomainError("SUPPLIER_RETURN_QUANTITY_INVALID", 400), "SUPPLIER_RETURN_PREFLIGHT_FAILED", req);
    }
    try {
      await assertSupplierReturnAccess(organizationId, session.userId, false);
      const scope = await retailInventoryVisibleSites(organizationId, session.userId);
      const preview = await prisma.$transaction(async (tx) => {
        const origin = await tx.enterpriseStockMovement.findFirst({
          where: { organizationId, id: movementId, movementType: "PURCHASE_RECEIPT", direction: "IN",
            sourceEntityType: "EnterprisePurchaseReceipt", sourceEntityId: { in: purchase.receipts.map((receipt) => receipt.id) },
            sourceLineId: { in: purchase.receipts.flatMap((receipt) => receipt.items.map((item) => item.id)) },
            ...(scope.isolationEnabled ? { warehouse: { siteId: { in: scope.siteIds } } } : {}) },
          select: { id: true, inventoryItemId: true, warehouseId: true, storageLocationId: true, stockLotId: true },
        });
        if (!origin) throw new EnterpriseDomainError("SUPPLIER_RETURN_ORIGIN_INVALID", 404);
        const check = await inspectSupplierReturnTx(tx, organizationId, session.userId, { ...origin, supplierReturnSourceMovementId: origin.id, quantity });
        if (check.receipt.purchaseId !== id) throw new EnterpriseDomainError("SUPPLIER_RETURN_ORIGIN_INVALID", 404);
        return { eligible: true, readOnly: true, quantity, remaining: check.remaining.toFixed(),
          unitCost: check.unitCost.toFixed(), totalCost: check.totalCost.toFixed(), recoverableTaxAmount: check.recoverableTaxAmount.toFixed(), creditTotal: check.creditTotal.toFixed(), currencyCode: check.currencyCode,
          receiptReference: check.receipt.reference, invoiceReference: check.invoice.number };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "supplier-return-preflight", purchaseId: id } });
      const canSubmitRequest = await requireSupplierReturnParticipantAccess(organizationId, session.userId, false).then(() => true, () => false);
      return NextResponse.json({ ...preview, canSubmitRequest }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      const response = enterpriseDomainErrorResponse(error, "SUPPLIER_RETURN_PREFLIGHT_FAILED", req);
      await writeApiLog({ request: req, statusCode: response.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "supplier-return-preflight", purchaseId: id } });
      return response;
    }
  }
  if (url.searchParams.get("view") === "receipt-lots") {
    // Purchase visibility is necessary but not sufficient for inventory detail.
    const stockAccess = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "read", includeMutationCapabilities: false });
    if (!stockAccess) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    let scope: Awaited<ReturnType<typeof retailInventoryVisibleSites>>;
    try { scope = await retailInventoryVisibleSites(organizationId, session.userId); }
    catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED"); }
    const page = Math.min(10000, Math.max(1, Math.trunc(Number(url.searchParams.get("page")) || 1)));
    const pageSize = Math.min(50, Math.max(1, Math.trunc(Number(url.searchParams.get("pageSize")) || 20)));
    const search = (url.searchParams.get("search") || "").trim().slice(0, 120);
    const focusMovement = (url.searchParams.get("movementId") || "").trim().slice(0, 191);
    // Each physical movement is canonical, not the historical first-movement
    // receipt-line link. Include the original receipt, even for recalled lots.
    const receiptById = new Map(purchase.receipts.map((receipt) => [receipt.id, receipt]));
    const where: Prisma.EnterpriseStockMovementWhereInput = {
      organizationId, movementType: "PURCHASE_RECEIPT", direction: "IN",
      ...(focusMovement ? { id: focusMovement } : {}),
      sourceEntityType: "EnterprisePurchaseReceipt",
      sourceEntityId: { in: [...receiptById.keys()] },
      sourceLineId: { in: purchase.receipts.flatMap((receipt) => receipt.items.map((item) => item.id)) },
      ...(scope.isolationEnabled ? { warehouse: { siteId: { in: scope.siteIds } } } : {}),
      ...(search ? { OR: [
        { stockLot: { lotNumber: { contains: search, mode: "insensitive" } } },
        { inventoryItem: { catalogItem: { name: { contains: search, mode: "insensitive" } } } },
        { inventoryItem: { catalogItem: { code: { contains: search, mode: "insensitive" } } } },
        { inventoryItem: { catalogItem: { sku: { contains: search, mode: "insensitive" } } } },
        { sourceEntityId: { in: purchase.receipts.filter((receipt) => receipt.reference.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((receipt) => receipt.id) } },
      ] } : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.enterpriseStockMovement.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize, select: {
        id: true, sourceEntityId: true, sourceLineId: true, quantity: true, occurredAt: true,
        inventoryItem: { select: { catalogItem: { select: { name: true, code: true, sku: true, unitOfMeasure: { select: { symbol: true } } } } } },
        warehouse: { select: { name: true, code: true } },
        storageLocation: { select: { name: true, code: true } },
        stockLot: { select: { lotNumber: true, productionDate: true, expiryDate: true, status: true, recallReference: true } },
      } }),
      prisma.enterpriseStockMovement.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const items = rows.map((row) => ({
      ...row,
      receiptReference: receiptById.get(row.sourceEntityId || "")?.reference || null,
    }));
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "purchase-receipt-lots", purchaseId: id, page } });
    const canCheckSupplierReturn = access.canWrite && await assertSupplierReturnAccess(organizationId, session.userId, false).then(() => true, () => false);
    const canSubmitSupplierReturn = canCheckSupplierReturn && await requireSupplierReturnParticipantAccess(organizationId, session.userId, false).then(() => true, () => false);
    const canReviewSupplierReturn = canCheckSupplierReturn && await requireSupplierReturnParticipantAccess(organizationId, session.userId, true).then(() => true, () => false);
    const requests = (canSubmitSupplierReturn || canReviewSupplierReturn) && rows.length ? await prisma.enterpriseSupplierReturnRequest.findMany({
      where: { organizationId, purchaseId: id, sourceMovementId: { in: rows.map((row) => row.id) }, status: { in: ["PENDING_APPROVAL", "APPROVED", "DISPATCHED", "RECONCILED"] } },
      select: { id:true, sourceMovementId:true, reference:true, status:true, quantity:true, requestedByUserId:true, revision:true, dispatchReference:true, dispatchedAt:true, supplierCreditNoteId:true, supplierCreditReference:true, supplierInvoiceId:true, supplierInvoiceItemId:true, unitCost:true, totalCost:true, recoverableTaxAmount:true, currencyCode:true },
    }) : [];
    const requestApprovals = requests.length ? await prisma.enterpriseApproval.findMany({
      where: { organizationId, targetEntityType: SUPPLIER_RETURN_TARGET, targetEntityId: { in: requests.map((request) => request.id) }, OR: [...(canSubmitSupplierReturn ? [{ requestedByUserId: session.userId }] : []), ...(canReviewSupplierReturn ? [{ approverUserId: session.userId }] : [])], archivedAt: null },
      select: { id: true, targetEntityId: true },
    }) : [];
    const [financeInventory,financePayables] = requests.length ? await Promise.all([
      resolveEnterpriseModuleCapabilities({organizationId,userId:session.userId,moduleCode:"FINANCE_INVENTORY"}),
      resolveEnterpriseModuleCapabilities({organizationId,userId:session.userId,moduleCode:"FINANCE_PAYABLES"}),
    ]) : [null,null];
    const authorizedRequests = requests.filter(request=>requestApprovals.some(approval=>approval.targetEntityId===request.id));
    const creditIds=authorizedRequests.flatMap(request=>request.supplierCreditNoteId?[request.supplierCreditNoteId]:[]);
    const [currentCredits,creditReplacements]=creditIds.length?await Promise.all([
      prisma.enterpriseSupplierCreditNote.findMany({where:{organizationId,id:{in:creditIds}},select:{id:true,status:true,revision:true,createdByUserId:true,postedAt:true}}),
      prisma.enterpriseSupplierReturnCreditReplacement.findMany({where:{organizationId,replacementCreditNoteId:{in:creditIds}},select:{replacementCreditNoteId:true,previousCreditNoteId:true,previousSupplierReference:true}}),
    ]):[[],[]];
    const creditById=new Map(currentCredits.map(credit=>[credit.id,credit]));
    const replacementById=new Map(creditReplacements.map(proof=>[proof.replacementCreditNoteId,proof]));
    const businessContext = requests.some(request => request.dispatchedAt) ? await getEnterpriseBusinessContext(prisma, organizationId) : null;
    const requestByMovement = new Map(authorizedRequests.map((request) => {
      const credit=request.supplierCreditNoteId?creditById.get(request.supplierCreditNoteId):null;
      const replaced=request.supplierCreditNoteId?replacementById.get(request.supplierCreditNoteId):null;
      return [request.sourceMovementId, {
      id:request.id, reference:request.reference,status:request.status,quantity:request.quantity,revision:request.revision,unitCost:request.unitCost,totalCost:request.totalCost,recoverableTaxAmount:request.recoverableTaxAmount,creditTotal:request.totalCost.plus(request.recoverableTaxAmount),currencyCode:request.currencyCode,
      dispatchReference:request.dispatchReference,dispatchedAt:request.dispatchedAt,dispatchBusinessDate:request.dispatchedAt && businessContext ? formatEnterpriseBusinessDate(request.dispatchedAt,businessContext.timezone) : null,supplierCreditNoteId:request.supplierCreditNoteId,supplierCreditReference:request.supplierCreditReference,
      supplierInvoiceId:request.supplierInvoiceId,supplierInvoiceItemId:request.supplierInvoiceItemId,
      canWithdraw:canSubmitSupplierReturn && request.requestedByUserId===session.userId && request.status==="APPROVED",
      canDispatch:canSubmitSupplierReturn && financeInventory?.canManage === true && request.requestedByUserId === session.userId && request.status === "APPROVED",
      canCreateCredit:financePayables?.canCreate === true && request.status === "DISPATCHED" && !request.supplierCreditNoteId,
      canReplaceCredit:financePayables?.canCreate===true && request.status==="DISPATCHED" && credit?.status==="REJECTED" && !credit.postedAt && credit.createdByUserId===session.userId,
      supplierCreditStatus:credit?.status||null,supplierCreditRevision:credit?.revision||null,
      previousCreditNoteId:replaced?.previousCreditNoteId||null,previousSupplierCreditReference:replaced?.previousSupplierReference||null,
      approvalId:requestApprovals.find((approval) => approval.targetEntityId === request.id)?.id || null,
    }] as const;}));
    return NextResponse.json({ items: items.map((row) => ({ ...row, supplierReturnRequest: requestByMovement.get(row.id) || null })), canCheckSupplierReturn, canSubmitSupplierReturn, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
  }
  const itemIds = purchase.items.map((item) => item.id);
  const [requestRecord, approvals, links, events, comments, operationalLink, itemCatalogLinks] = await Promise.all([
    purchase.requestId ? prisma.enterpriseRequest.findFirst({ where: { id: purchase.requestId, organizationId }, select: { id: true, requestType: true, title: true, status: true, priority: true } }) : Promise.resolve(null),
    prisma.enterpriseApproval.findMany({ where: { organizationId, targetEntityType: "EnterprisePurchase", targetEntityId: id, archivedAt: null }, orderBy: { requestedAt: "desc" }, take: 20 }),
    prisma.enterpriseEntityLink.findMany({ where: { organizationId, OR: [{ sourceEntityType: "EnterprisePurchase", sourceEntityId: id }, { targetEntityType: "EnterprisePurchase", targetEntityId: id }] }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.enterpriseOperationalEvent.findMany({ where: { organizationId, entityType: "EnterprisePurchase", entityId: id }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.enterpriseOperationalComment.findMany({ where: { organizationId, entityType: "EnterprisePurchase", entityId: id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.enterprisePurchaseOperationalLink.findFirst({ where: { organizationId, purchaseId: id }, select: { id: true, siteId: true, destinationWarehouseId: true, expectedReceiptType: true } }),
    itemIds.length ? prisma.enterprisePurchaseItemCatalogLink.findMany({ where: { organizationId, purchaseItemId: { in: itemIds } }, select: { purchaseItemId: true, catalogItemId: true, unitOfMeasureId: true, expectedItemType: true } }) : Promise.resolve([]),
  ]);
  const catalogIds = [...new Set(itemCatalogLinks.flatMap((link) => link.catalogItemId ? [link.catalogItemId] : []))];
  const inventoryRules = catalogIds.length ? await prisma.enterpriseInventoryItem.findMany({ where: { organizationId, catalogItemId: { in: catalogIds }, status: "ACTIVE", archivedAt: null }, select: { catalogItemId: true, lotTracking: true, expiryTracking: true } }) : [];
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "purchases", purchaseId: id } });
  return NextResponse.json({ purchase, request: requestRecord, approvals, links, events, comments, operationalLink, itemCatalogLinks, inventoryRules, canManage: access.canManage, currentUserId: session.userId });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-purchase-update:${session.userId}`), 120, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params; const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "write" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const current = await prisma.enterprisePurchase.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!current || (!access.canManage && ![current.requestedByUserId, current.buyerUserId, current.createdByUserId].includes(session.userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterprisePurchaseUpdateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "PURCHASE_UPDATE_INPUT_INVALID", req);
  try {
    const purchase = await updateEnterprisePurchase(organizationId, id, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PURCHASE_UPDATED", entity: "EnterprisePurchase", entityId: id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "purchases", purchaseId: id } });
    return NextResponse.json({ ok: true, purchase });
  } catch (error) { const normalized = normalizeEnterpriseCoreV2Error(error); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId, id } = await params;
  const action = new URL(req.url).searchParams.get("action");
  if (!["submit-supplier-return","dispatch-supplier-return","withdraw-supplier-return"].includes(action || "")) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const limited = await rateLimit(getRateLimitKey(req, `supplier-return-submit:${organizationId}:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "TOO_MANY_REQUESTS" }, { status: 429 });
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "write" });
  if (!access) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (action === "withdraw-supplier-return") {
    const parsed=supplierReturnWithdrawalSchema.safeParse(await req.json().catch(()=>null));
    if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error,"SUPPLIER_RETURN_INPUT_INVALID",req);
    try {
      const result=await withdrawApprovedSupplierReturn(organizationId,id,session.userId,parsed.data);
      if (!result.idempotent) {
        await notifyUser({userId:result.approval.approverUserId,organizationId,type:"ENTERPRISE_APPROVAL",title:"Retour fournisseur annulé",body:"Le demandeur a annulé un retour approuvé avant expédition.",targetUrl:workCoordinationDeepLink("APPROVAL",result.approval.id)}).catch(()=>null);
        await writeAuditLog({userId:session.userId,action:"SUPPLIER_RETURN_APPROVED_WITHDRAWN",entity:SUPPLIER_RETURN_TARGET,entityId:result.request.id,request:req,metadata:{organizationId,approvalId:result.approval.id}});
      }
      await writeApiLog({request:req,statusCode:200,userId:session.userId,startedAt,metadata:{organizationId,domain:"supplier-return-withdrawal",purchaseId:id,idempotent:result.idempotent}});
      return NextResponse.json({ok:true,idempotent:result.idempotent,request:{id:result.request.id,reference:result.request.reference,status:result.request.status,revision:result.request.revision}},{headers:{"Cache-Control":"private, no-store"}});
    } catch(error) {
      const response=enterpriseDomainErrorResponse(error,"SUPPLIER_RETURN_WITHDRAWAL_FAILED",req);
      await writeApiLog({request:req,statusCode:response.status,userId:session.userId,startedAt,metadata:{organizationId,domain:"supplier-return-withdrawal",purchaseId:id}});
      return response;
    }
  }
  if (action === "dispatch-supplier-return") {
    const parsed = supplierReturnDispatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "SUPPLIER_RETURN_INPUT_INVALID", req);
    try {
      const result=await dispatchSupplierReturn(organizationId,id,session.userId,parsed.data);
      if (!result.idempotent) await writeAuditLog({userId:session.userId,action:"SUPPLIER_RETURN_DISPATCHED",entity:SUPPLIER_RETURN_TARGET,entityId:result.request.id,request:req,metadata:{organizationId,dispatchMovementId:result.request.dispatchMovementId}});
      await writeApiLog({request:req,statusCode:200,userId:session.userId,startedAt,metadata:{organizationId,domain:"supplier-return-dispatch",purchaseId:id,idempotent:result.idempotent}});
      return NextResponse.json({ok:true,idempotent:result.idempotent,request:{id:result.request.id,status:result.request.status,revision:result.request.revision,reference:result.request.reference}},{headers:{"Cache-Control":"private, no-store"}});
    } catch (error) {
      const domainError = error instanceof EnterpriseAccountingError ? new EnterpriseDomainError(error.code,error.status) : error;
      const response = enterpriseDomainErrorResponse(domainError,"SUPPLIER_RETURN_DISPATCH_FAILED",req);
      await writeApiLog({request:req,statusCode:response.status,userId:session.userId,startedAt,metadata:{organizationId,domain:"supplier-return-dispatch",purchaseId:id}});
      return response;
    }
  }
  const parsed = supplierReturnRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "SUPPLIER_RETURN_INPUT_INVALID", req);
  try {
    const result = await submitSupplierReturnRequest(organizationId, id, session.userId, parsed.data);
    if (!result.idempotent) {
      await notifyUser({ userId: result.approval.approverUserId, organizationId, type: "ENTERPRISE_APPROVAL", title: "Validation requise", body: "Une demande de retour fournisseur attend votre décision.", targetUrl: workCoordinationDeepLink("APPROVAL", result.approval.id) }).catch(() => null);
      await writeAuditLog({ userId: session.userId, action: "SUPPLIER_RETURN_REQUESTED", entity: SUPPLIER_RETURN_TARGET, entityId: result.request.id, request: req, metadata: { organizationId, approvalId: result.approval.id } });
    }
    const status = result.idempotent ? 200 : 201;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { organizationId, domain: "supplier-return-submit", purchaseId: id, idempotent: result.idempotent } });
    return NextResponse.json({ ok: true, idempotent: result.idempotent, request: { id: result.request.id, reference: result.request.reference, status: result.request.status, quantity: result.request.quantity }, approvalId: result.approval.id }, { status, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = enterpriseDomainErrorResponse(error, "SUPPLIER_RETURN_SUBMIT_FAILED", req);
    await writeApiLog({ request: req, statusCode: response.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "supplier-return-submit", purchaseId: id } });
    return response;
  }
}
