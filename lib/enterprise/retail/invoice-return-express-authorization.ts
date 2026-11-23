import { Prisma } from "@prisma/client";
import { resolveExchangeRateDetails, snapshotExchangeRate } from "@/lib/enterprise/accounting/currency";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { assertRetailInvoiceReturnSettlementReadinessTx } from "@/lib/enterprise/retail/invoice-return-settlement-preflight";
import { readRetailInvoiceReturnPolicy, readRetailInvoiceReturnPolicySnapshot } from "@/lib/enterprise/retail/invoice-return-policy";
import { RETAIL_OWNER_ROLES, hasRetailSelfApprovalGrant, requireRetailSiteCapability, siteStaffCapabilities } from "@/lib/enterprise/retail/site-access";

export type RetailExpressRefundChoice = "NOW" | "LATER";
const conflict = (code: string, status = 409) => new EnterpriseRetailError(code, status);
const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

/** Refuses delegation after policy revocation, assignment revocation, or a
 * different designated approver. All checks execute under the caller's
 * SERIALIZABLE transaction, after locking the invoice and return. */
export async function assertRetailExpressReturnAuthorizationTx(
  tx: Prisma.TransactionClient, organizationId: string, invoiceId: string,
  requestId: string, actorUserId: string, choice: RetailExpressRefundChoice,
  allowZeroPayoutCreditOnly = false,
) {
  const request = await tx.enterpriseRetailInvoiceReturnRequest.findFirst({
    where: { organizationId, id: requestId, checkout: { salesInvoiceId: invoiceId } },
    include: { checkout: { select: { siteId: true, invoice: { select: { currencyCode: true } } } } },
  });
  if (!request || request.status !== "APPROVED" ||
      request.decidedByUserId !== actorUserId || request.approverUserId !== actorUserId ||
      request.salesCreditNoteId || request.refundPaymentId) {
    throw conflict("RETAIL_INVOICE_RETURN_FINANCE_CONFLICT");
  }
  const snapshot = readRetailInvoiceReturnPolicySnapshot(request.returnPolicySnapshot);
  const currentConfig = await tx.enterpriseRetailConfiguration.findUnique({
    where: { organizationId }, select: { settingsJson: true },
  });
  const live = readRetailInvoiceReturnPolicy(currentConfig?.settingsJson);
  if (snapshot.mode !== "SIMPLIFIED" || live.mode !== "SIMPLIFIED" ||
      !snapshot.autoPostCreditNote || !live.autoPostCreditNote ||
      !snapshot.promptImmediateRefund || !live.promptImmediateRefund ||
      !snapshot.allowDelegatedSelfApproval || !live.allowDelegatedSelfApproval) {
    throw conflict("RETAIL_RETURN_EXPRESS_POLICY_DISABLED", 403);
  }
  await requireRetailSiteCapability(organizationId, actorUserId, request.checkout.siteId,
    "APPROVE_INVOICE_RETURN", tx, { requireAssignment: true });
  await requireRetailSiteCapability(organizationId, actorUserId, request.checkout.siteId,
    "COLLECT_PAYMENT", tx, { requireAssignment: true });
  const member = await tx.organizationMember.findFirst({
    where: { organizationId, userId: actorUserId, status: "ACTIVE", removedAt: null },
    select: { role: true },
  });
  if (!member) throw conflict("RETAIL_SITE_ACCESS_DENIED", 403);
  if (!RETAIL_OWNER_ROLES.has(member.role)) {
    const assignment = await tx.enterpriseRetailSiteAssignment.findUnique({
      where: { organizationId_siteId_userId: { organizationId, siteId: request.checkout.siteId, userId: actorUserId } },
      select: { roleCode: true, isActive: true, permissionsJson: true },
    });
    const capabilities = assignment?.isActive ? siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson) : [];
    if (assignment?.roleCode !== "MANAGER" || !assignment.isActive ||
        !capabilities.includes("APPROVE_INVOICE_RETURN") || !capabilities.includes("COLLECT_PAYMENT") ||
        !await hasRetailSelfApprovalGrant(organizationId, actorUserId, request.checkout.siteId, "RETURN", tx)) {
      throw conflict("RETAIL_INVOICE_RETURN_APPROVER_INELIGIBLE", 403);
    }
  }
  const plan = await assertRetailInvoiceReturnSettlementReadinessTx(tx, organizationId, invoiceId, requestId);
  const payout = plan.payoutAmount ?? decimal(0);
  // Self-inspection records evidence but cannot silently grant stock-write
  // permissions. Real physical return movements require stock management.
  if (plan.stockSourcePlan.length > 0) {
    await requireRetailSiteCapability(organizationId, actorUserId, request.checkout.siteId,
      "MANAGE_STOCK", tx, { requireAssignment: true });
  }
  if (payout.lessThan(0) || (payout.isZero() && !allowZeroPayoutCreditOnly)) {
    throw conflict("RETAIL_RETURN_EXPRESS_ZERO_PAYOUT_USE_CREDIT_ONLY");
  }
  // A zero-payout, physically returned item has no foreign-currency
  // reimbursement to cap. It still needs canonical valuation, journal posting
  // and the currently authorized decision maker, but no cash/FX transaction.
  if (payout.isZero()) {
    return { request, plan, payout, cumulativeUSD: decimal(0), policy: live, choice };
  }
  // Limit is per invoice, across all non-rejected returns. Never split 100 USD
  // into multiple small requests, or compare CDF to USD as bare numbers.
  const prior = await tx.enterpriseRetailInvoiceReturnRequest.findMany({
    where: { organizationId, checkoutId: request.checkoutId, id: { not: request.id },
      status: { in: ["APPROVED", "FINANCE_PENDING", "REFUND_PENDING", "COMPLETED"] } },
    select: { refundPayoutAmount: true, refundAmount: true },
  });
  const reservedPayout = prior.reduce((total, row) => total.plus(row.refundPayoutAmount ?? row.refundAmount), decimal(0));
  const now = new Date();
  const rate = await resolveExchangeRateDetails(tx, {
    organizationId, sourceCurrencyCode: request.checkout.invoice.currencyCode,
    targetCurrencyCode: "USD", rateDate: now,
  });
  if (rate.direction !== "IDENTITY" && now.getTime() - rate.rateDate.getTime() > 7 * 86400000) {
    throw conflict("RETAIL_RETURN_EXPRESS_FX_RATE_STALE");
  }
  const effectiveLimit = decimal(snapshot.expressRefundLimitAmount).lt(live.expressRefundLimitAmount)
    ? decimal(snapshot.expressRefundLimitAmount) : decimal(live.expressRefundLimitAmount);
  const cumulativeUSD = reservedPayout.plus(payout).mul(rate.rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
  if (cumulativeUSD.greaterThan(effectiveLimit) || cumulativeUSD.greaterThan(100)) {
    throw conflict("RETAIL_RETURN_EXPRESS_LIMIT_EXCEEDED");
  }
  await snapshotExchangeRate(tx, {
    organizationId, sourceEntityType: "EnterpriseRetailInvoiceReturnRequest",
    sourceEntityId: request.id, sourceCurrencyCode: rate.sourceCurrencyCode,
    targetCurrencyCode: "USD", rateDate: rate.rateDate, rate: rate.rate,
    source: rate.direction === "IDENTITY" ? "IDENTITY" : `ENTERPRISE_RATE:${rate.direction}:${rate.rateId || "NONE"}:${rate.source}`,
  });
  // Do not represent external PSP authorisation or delivery of cash as
  // completed merely because a database transaction succeeded.
  const payments = await tx.enterprisePayment.findMany({
    where: { organizationId, id: { in: [...new Set(plan.financeSourcePlan.map(s => s.paymentId))] } },
    select: { id: true, methodType: true, status: true, financialAccountId: true },
  });
  if (payments.length !== new Set(plan.financeSourcePlan.map(s => s.paymentId)).size ||
      payments.some(p => !["CONFIRMED", "RECONCILED"].includes(p.status))) {
    throw conflict("RETAIL_INVOICE_RETURN_FINANCE_SOURCE_MISMATCH");
  }
  if (choice === "NOW" && payments.some(p => p.methodType !== "CASH")) {
    throw conflict("RETAIL_RETURN_EXPRESS_EXTERNAL_PAYMENT_PENDING");
  }
  return { request, plan, payout, cumulativeUSD, policy: live, choice };
}
