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
  const [currentConfig, financeConfiguration] = await Promise.all([
    tx.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } }),
    tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId }, select: { functionalCurrencyCode: true } }),
  ]);
  const live = readRetailInvoiceReturnPolicy(currentConfig?.settingsJson);
  if (live.version === 2 &&
      (!financeConfiguration?.functionalCurrencyCode || live.expressRefundLimitCurrency !== financeConfiguration.functionalCurrencyCode)) {
    throw conflict("RETAIL_RETURN_POLICY_CURRENCY_MISMATCH", 409);
  }
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
    return { request, plan, payout, cumulativeLimitValue: decimal(0), policy: live, choice };
  }
  // The owner sets the live V2 limit in Finance functional currency. We
  // ALSO enforce the frozen per-request policy (V1 USD if historical) so
  // changing the company's settings never elevates an existing return.
  // No hard-coded USD 100 ceiling applies to newly created V2 returns.
  const prior = await tx.enterpriseRetailInvoiceReturnRequest.findMany({
    where: { organizationId, checkoutId: request.checkoutId, id: { not: request.id },
      status: { in: ["APPROVED", "FINANCE_PENDING", "REFUND_PENDING", "COMPLETED"] } },
    select: { refundPayoutAmount: true, refundAmount: true },
  });
  const reservedPayout = prior.reduce((total, row) => total.plus(row.refundPayoutAmount ?? row.refundAmount), decimal(0));
  const cumulativePayout = reservedPayout.plus(payout);
  const now = new Date();
  const limits = [snapshot, live];
  const byCurrency = new Map<string, { amount: Prisma.Decimal; rate: Awaited<ReturnType<typeof resolveExchangeRateDetails>> }>();
  for (const policy of limits) {
    if (byCurrency.has(policy.expressRefundLimitCurrency)) continue;
    const rate = await resolveExchangeRateDetails(tx, {
      organizationId, sourceCurrencyCode: request.checkout.invoice.currencyCode,
      targetCurrencyCode: policy.expressRefundLimitCurrency, rateDate: now,
    });
    if (rate.direction !== "IDENTITY" && now.getTime() - rate.rateDate.getTime() > 7 * 86400000) {
      throw conflict("RETAIL_RETURN_EXPRESS_FX_RATE_STALE");
    }
    byCurrency.set(policy.expressRefundLimitCurrency, {
      amount: cumulativePayout.mul(rate.rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_UP),
      rate,
    });
  }
  for (const policy of limits) {
    const converted = byCurrency.get(policy.expressRefundLimitCurrency);
    if (!converted) throw conflict("RETAIL_RETURN_EXPRESS_FX_RATE_STALE");
    if (converted.amount.greaterThan(decimal(policy.expressRefundLimitAmount))) {
      throw new EnterpriseRetailError("RETAIL_RETURN_EXPRESS_LIMIT_EXCEEDED", 409, {
        limitAmount: String(policy.expressRefundLimitAmount), limitCurrency: policy.expressRefundLimitCurrency,
        policyVersion: policy.version,
      });
    }
  }
  for (const [currency, converted] of byCurrency) {
    await snapshotExchangeRate(tx, {
      organizationId, sourceEntityType: "EnterpriseRetailInvoiceReturnRequest",
      sourceEntityId: request.id, sourceCurrencyCode: converted.rate.sourceCurrencyCode,
      targetCurrencyCode: currency, rateDate: converted.rate.rateDate, rate: converted.rate.rate,
      source: converted.rate.direction === "IDENTITY" ? "IDENTITY" :
        `ENTERPRISE_RATE:${converted.rate.direction}:${converted.rate.rateId || "NONE"}:${converted.rate.source}`,
    });
  }
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
  return { request, plan, payout, cumulativeLimitValue: byCurrency.get(live.expressRefundLimitCurrency)!.amount, policy: live, choice };
}
