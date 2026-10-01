import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const runSuffix = process.env.GITHUB_RUN_ID || "local";
const organizationId = process.env.E2E_PHARMACY_REFUND_ORGANIZATION_ID || `e2e-pharmacy-refund-org-728-${runSuffix}`;
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const requesterEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const requesterPassword = process.env.E2E_USER_PASSWORD || "E2eUser2026!";
const settlerEmail = "erp-pharmacy-refund-settler@example.test";
const settlerPassword = requesterPassword;
const foreignOrganizationId = `e2e-pharmacy-refund-foreign-org-728-${runSuffix}`;

let adminUserId = "";
let requesterUserId = "";
let settlerUserId = "";
let cashAccountId = "";
let pharmacyCashSessionId = "";
let commonCashSessionId = "";
let currencyCode = "";
let requesterContext;
let validatorContext;
let settlerContext;

const modules = [
  "CRM_CUSTOMERS",
  "CATALOG",
  "SITES_WAREHOUSES",
  "CRM_PIPELINE",
  "CONTRACTS",
  "DOCUMENTS",
  "SALES_QUOTES_ORDERS",
  "SUPPLIERS_PURCHASES",
  "SALES_DISPENSATION",
  "CASH_INVOICES_PAYMENTS",
  "FINANCE_OVERVIEW",
  "FINANCE_PAYMENTS",
  "FINANCE_RECEIVABLES",
  "FINANCE_CASH",
  "FINANCE_TREASURY",
  "FINANCE_ACCOUNTING",
];

async function ensureCurrentFiscalPeriod(actorUserId) {
  const now = new Date();
  const current = await prisma.enterpriseFiscalPeriod.findFirst({
    where: {
      organizationId,
      status: "OPEN",
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: { id: true },
  });
  if (current) return current.id;

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthCode = String(month + 1).padStart(2, "0");
  const fiscalYearCode = `FY${year}-PH728`;
  const periodCode = `${year}-${monthCode}-PH728`;
  const fiscalYearStart = new Date(Date.UTC(year, 0, 1));
  const fiscalYearEnd = new Date(Date.UTC(year + 1, 0, 1) - 1);
  const periodStart = new Date(Date.UTC(year, month, 1));
  const periodEnd = new Date(Date.UTC(year, month + 1, 1) - 1);

  const fiscalYear = await prisma.enterpriseFiscalYear.upsert({
    where: { organizationId_code: { organizationId, code: fiscalYearCode } },
    update: { startDate: fiscalYearStart, endDate: fiscalYearEnd, status: "OPEN" },
    create: {
      organizationId,
      code: fiscalYearCode,
      startDate: fiscalYearStart,
      endDate: fiscalYearEnd,
      status: "OPEN",
      createdByUserId: actorUserId,
      openedAt: fiscalYearStart,
    },
  });
  const period = await prisma.enterpriseFiscalPeriod.upsert({
    where: { organizationId_code: { organizationId, code: periodCode } },
    update: { fiscalYearId: fiscalYear.id, startDate: periodStart, endDate: periodEnd, status: "OPEN" },
    create: {
      organizationId,
      fiscalYearId: fiscalYear.id,
      code: periodCode,
      startDate: periodStart,
      endDate: periodEnd,
      status: "OPEN",
      createdByUserId: actorUserId,
    },
  });
  return period.id;
}

async function signInAs(context, email, password) {
  const response = await context.request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email, password, organizationId, next: "/enterprise-modules/CASH_INVOICES_PAYMENTS" },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function post(context, path, data, referer = "/enterprise-modules/FINANCE_PAYMENTS") {
  const response = await context.request.post(`${baseUrl}${path}`, {
    data,
    headers: { origin: baseUrl, referer: `${baseUrl}${referer}` },
  });
  return { response, body: await response.json().catch(() => null) };
}

async function patch(context, path, data, referer = "/enterprise-modules/FINANCE_PAYMENTS") {
  const response = await context.request.patch(`${baseUrl}${path}`, {
    data,
    headers: { origin: baseUrl, referer: `${baseUrl}${referer}` },
  });
  return { response, body: await response.json().catch(() => null) };
}

async function prepareTenant(browser) {
  const [admin, requester] = await Promise.all([
    prisma.user.findUnique({ where: { email: adminEmail } }),
    prisma.user.findUnique({ where: { email: requesterEmail } }),
  ]);
  if (!admin || !requester) throw new Error("#728 requires canonical ERP E2E users");
  adminUserId = admin.id;
  requesterUserId = requester.id;
  await ensureCurrentFiscalPeriod(adminUserId);

  const settler = await prisma.user.upsert({
    where: { email: settlerEmail },
    update: {
      name: "Payeur Pharmacy #728",
      passwordHash: requester.passwordHash,
      role: "CLIENT",
      status: "ACTIVE",
      locale: "fr",
      startPage: "/dashboard",
    },
    create: {
      id: "e2e-pharmacy-refund-settler-728",
      name: "Payeur Pharmacy #728",
      email: settlerEmail,
      passwordHash: requester.passwordHash,
      role: "CLIENT",
      status: "ACTIVE",
      locale: "fr",
      startPage: "/dashboard",
    },
  });
  settlerUserId = settler.id;

  await prisma.organization.upsert({
    where: { id: organizationId },
    update: {
      name: "Pharmacy Refund E2E #728",
      slug: `pharmacy-refund-e2e-728-${runSuffix}`,
      sectorCode: "PHARMACY",
      status: "ACTIVE",
      deletedAt: null,
      organizationType: "CLIENT",
      country: "CD",
      timezone: "Africa/Kinshasa",
      createdByDtscUserId: adminUserId,
    },
    create: {
      id: organizationId,
      name: "Pharmacy Refund E2E #728",
      slug: `pharmacy-refund-e2e-728-${runSuffix}`,
      sectorCode: "PHARMACY",
      status: "ACTIVE",
      organizationType: "CLIENT",
      country: "CD",
      timezone: "Africa/Kinshasa",
      createdByDtscUserId: adminUserId,
    },
  });
  for (const [userId, role, id] of [
    [adminUserId, "OWNER", `e2e-pharmacy-refund-owner-728-${runSuffix}`],
    [requesterUserId, "ADMIN_ENTERPRISE", `e2e-pharmacy-requester-member-728-${runSuffix}`],
    [settlerUserId, "ADMIN_ENTERPRISE", `e2e-pharmacy-settler-member-728-${runSuffix}`],
  ]) {
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      update: { role, status: "ACTIVE", removedAt: null, joinedAt: new Date() },
      create: { id, organizationId, userId, role, status: "ACTIVE", joinedAt: new Date() },
    });
  }

  const plan = await prisma.billingPlan.upsert({
    where: { id: "e2e-enterprise-plan" },
    update: { name: "Enterprise E2E", slug: "enterprise", isActive: true },
    create: {
      id: "e2e-enterprise-plan",
      name: "Enterprise E2E",
      slug: "enterprise",
      description: "Plan éphémère utilisé uniquement par les tests navigateur authentifiés.",
      priceUsd: 0,
      dailyMessageLimit: 1000,
      dailyTokenLimit: 1_000_000,
      maxDocuments: 100,
      isActive: true,
      sortOrder: 999,
    },
  });
  await prisma.organizationSubscription.deleteMany({ where: { organizationId } });
  await prisma.organizationSubscription.create({
    data: {
      id: `e2e-pharmacy-refund-subscription-728-${runSuffix}`,
      organizationId,
      planId: plan.id,
      status: "ACTIVE",
      startedAt: new Date(Date.now() - 86_400_000),
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      createdByDtscUserId: adminUserId,
      updatedByDtscUserId: adminUserId,
    },
  });

  for (const [index, moduleCode] of modules.entries()) {
    const starter = moduleCode === "CRM_CUSTOMERS" || moduleCode === "CATALOG";
    await prisma.enterpriseModule.upsert({
      where: { organizationId_moduleCode: { organizationId, moduleCode } },
      update: { isEnabled: true, requiresPlanLevel: starter ? "STARTER" : "BUSINESS" },
      create: {
        organizationId,
        moduleCode,
        labelFr: moduleCode,
        labelEn: moduleCode,
        moduleCategory: "E2E",
        isEnabled: true,
        isCore: moduleCode === "CRM_CUSTOMERS",
        requiresPlanLevel: starter ? "STARTER" : "BUSINESS",
        sortOrder: 2200 + index,
      },
    });
  }
  currencyCode = "CDF";
  await prisma.enterpriseCurrency.upsert({
    where: { organizationId_code: { organizationId, code: currencyCode } },
    update: { isActive: true },
    create: { organizationId, code: currencyCode, name: `Devise E2E ${currencyCode}`, symbol: currencyCode, precision: 2, isActive: true },
  });

  requesterContext = await browser.newContext();
  validatorContext = await browser.newContext();
  settlerContext = await browser.newContext();
  await signInAs(requesterContext, requesterEmail, requesterPassword);
  await signInAs(validatorContext, adminEmail, adminPassword);
  await signInAs(settlerContext, settlerEmail, settlerPassword);

  const configuration = await patch(validatorContext, `/api/enterprise/${organizationId}/finance/configuration`, {
    functionalCurrencyCode: currencyCode,
    presentationCurrencyCode: currencyCode,
    inventoryValuationMethod: "WEIGHTED_AVERAGE",
    reconciliationTolerance: "0.01",
    automaticPostingEnabled: true,
  }, "/enterprise-modules/FINANCE_OVERVIEW");
  expect(configuration.response.ok(), JSON.stringify(configuration.body)).toBeTruthy();

  const ledger = await prisma.enterpriseLedgerAccount.findFirst({
    where: { organizationId, isActive: true, archivedAt: null, accountSubtype: "CASH" },
    select: { id: true },
  });
  if (!ledger) throw new Error("#728 requires an active CASH ledger account");
  const account = await prisma.enterpriseFinancialAccount.create({
    data: {
      organizationId,
      code: `PH-RF-728-${Date.now().toString(36).toUpperCase()}`,
      name: "Pharmacy refund cash #728",
      accountType: "CASH",
      currencyCode,
      openingBalance: 0,
      operationalBalance: 0,
      reconciledBalance: 0,
      availableBalance: 0,
      ledgerAccountId: ledger.id,
      responsibleUserId: requesterUserId,
      status: "ACTIVE",
    },
  });
  cashAccountId = account.id;

  const commonCash = await prisma.enterpriseCashSession.create({
    data: {
      organizationId,
      number: `PH-RF-CASH-728-${Date.now().toString(36).toUpperCase()}`,
      financialAccountId: cashAccountId,
      cashierUserId: requesterUserId,
      status: "OPEN",
      openedAt: new Date(),
      openingAmount: 0,
    },
  });
  commonCashSessionId = commonCash.id;
  const pharmacyCash = await prisma.pharmacyCashSession.create({
    data: {
      organizationId,
      cashSessionNumber: `PH-RF-LEGACY-728-${Date.now().toString(36).toUpperCase()}`,
      cashPointName: "E2E #728",
      cashPointType: "MAIN_COUNTER",
      cashierId: requesterUserId,
      financialAccountId: cashAccountId,
      openedAt: new Date(),
      openingAmount: 0,
      currency: currencyCode,
      status: "OPEN",
      createdById: requesterUserId,
    },
  });
  pharmacyCashSessionId = pharmacyCash.id;
  await prisma.pharmacyCashExtension.create({
    data: { organizationId, pharmacyCashSessionId, cashSessionId: commonCashSessionId, cutoverAt: new Date() },
  });

  await prisma.organization.upsert({
    where: { id: foreignOrganizationId },
    update: { status: "ACTIVE", deletedAt: null, sectorCode: "PHARMACY" },
    create: {
      id: foreignOrganizationId,
      name: "Foreign Pharmacy #728",
      slug: "foreign-pharmacy-728",
      status: "ACTIVE",
      organizationType: "CLIENT",
      sectorCode: "PHARMACY",
      timezone: "Africa/Kinshasa",
      createdByDtscUserId: adminUserId,
    },
  });
}

async function createScenario(total, refundAmount, suffix) {
  const party = await prisma.enterpriseBusinessParty.create({
    data: {
      organizationId,
      partyType: "PERSON",
      legalName: `Client Pharmacy #728 ${suffix}`,
      displayName: `Client Pharmacy #728 ${suffix}`,
      normalizedName: `client pharmacy 728 ${suffix}`,
      code: `PH728-${suffix}`.slice(0, 80),
      status: "ACTIVE",
      createdByUserId: requesterUserId,
      roles: { create: { roleCode: "CUSTOMER", createdByUserId: requesterUserId } },
    },
  });

  const invoice = await prisma.enterpriseSalesInvoice.create({
    data: {
      organizationId,
      number: `PH728-INV-${suffix}`,
      businessPartyId: party.id,
      status: "ISSUED",
      invoiceDate: new Date(),
      currencyCode,
      subtotal: String(total),
      discountTotal: "0",
      taxTotal: "0",
      grandTotal: String(total),
      amountPaid: "0",
      amountCredited: "0",
      outstandingAmount: String(total),
      issuedAt: new Date(),
      postedAt: new Date(),
      createdByUserId: requesterUserId,
      items: { create: { description: `Produit test #728 ${suffix}`, quantity: "1", unitPrice: String(total), netAmount: String(total), taxAmount: "0", totalAmount: String(total) } },
    },
  });
  const receivable = await prisma.enterpriseReceivable.create({
    data: {
      organizationId,
      salesInvoiceId: invoice.id,
      businessPartyId: party.id,
      currencyCode,
      originalAmount: String(total),
      allocatedAmount: "0",
      creditedAmount: "0",
      writtenOffAmount: "0",
      outstandingAmount: String(total),
      status: "OPEN",
    },
  });

  const sale = await prisma.pharmacySale.create({
    data: {
      organizationId,
      saleNumber: `PH728-SALE-${suffix}`,
      saleType: "OTC",
      customerName: party.displayName,
      cashierId: requesterUserId,
      cashSessionId: pharmacyCashSessionId,
      saleDate: new Date(),
      subtotal: String(total),
      currency: currencyCode,
      baseCurrency: currencyCode,
      exchangeRateToBase: "1",
      subtotalBase: String(total),
      totalAmount: String(total),
      totalAmountBase: String(total),
      paidAmount: String(total),
      paidAmountBase: String(total),
      remainingAmount: "0",
      remainingAmountBase: "0",
      paymentMethod: "CASH",
      paymentStatus: "PAID",
      status: "COMPLETED",
      createdById: requesterUserId,
    },
  });
  await prisma.pharmacySalesExtension.create({
    data: { organizationId, pharmacySaleId: sale.id, salesInvoiceId: invoice.id, businessPartyId: party.id, cutoverAt: new Date(), createdByUserId: requesterUserId },
  });

  const created = await post(requesterContext, `/api/enterprise/${organizationId}/payments`, {
    direction: "INBOUND",
    paymentType: "CUSTOMER_PAYMENT",
    methodType: "CASH",
    financialAccountId: cashAccountId,
    businessPartyId: party.id,
    currencyCode,
    amount: String(total),
    paymentDate: new Date().toISOString(),
    reference: `PH728-ORIG-${suffix}`,
    idempotencyKey: `e2e-728-original-${suffix}`,
  });
  expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
  let payment = created.body.payment;
  const submitted = await post(requesterContext, `/api/enterprise/${organizationId}/payments/${payment.id}/transition`, { action: "SUBMIT", revision: payment.revision, approverUserId: adminUserId });
  expect(submitted.response.ok(), JSON.stringify(submitted.body)).toBeTruthy();
  payment = submitted.body.payment;
  const approved = await post(validatorContext, `/api/enterprise/${organizationId}/payments/${payment.id}/transition`, { action: "APPROVE", revision: payment.revision });
  expect(approved.response.ok(), JSON.stringify(approved.body)).toBeTruthy();
  payment = approved.body.payment;
  const confirmed = await post(settlerContext, `/api/enterprise/${organizationId}/payments/${payment.id}/transition`, { action: "CONFIRM", revision: payment.revision });
  expect(confirmed.response.ok(), JSON.stringify(confirmed.body)).toBeTruthy();
  payment = confirmed.body.payment;

  const allocation = await post(validatorContext, `/api/enterprise/${organizationId}/payments/${payment.id}/allocations`, {
    receivableId: receivable.id,
    amount: String(total),
  });
  expect(allocation.response.status(), JSON.stringify(allocation.body)).toBe(201);

  const pharmacyPayment = await prisma.pharmacyPayment.create({
    data: {
      organizationId,
      paymentNumber: `PH728-PAY-${suffix}`,
      saleId: sale.id,
      cashSessionId: pharmacyCashSessionId,
      cashierId: requesterUserId,
      paymentMethod: "CASH",
      amount: String(total),
      currency: currencyCode,
      paymentReference: `PH728-ORIG-${suffix}`,
      paymentDate: new Date(),
      status: "PAID",
      createdById: requesterUserId,
    },
  });
  await prisma.pharmacyPaymentExtension.create({
    data: { organizationId, pharmacyPaymentId: pharmacyPayment.id, paymentId: payment.id, pharmacySaleId: sale.id, cutoverAt: new Date() },
  });

  const refundCreate = await post(requesterContext, `/api/enterprise/${organizationId}/pharmacy/cash`, {
    entityType: "refund",
    saleId: sale.id,
    paymentId: pharmacyPayment.id,
    cashSessionId: pharmacyCashSessionId,
    refundType: refundAmount === total ? "TOTAL" : "PARTIAL",
    amount: String(refundAmount),
    currency: currencyCode,
    reason: `Remboursement #728 ${suffix}`,
    restockItems: false,
    notes: "E2E #728",
  }, "/enterprise-modules/CASH_INVOICES_PAYMENTS");
  expect(refundCreate.response.status(), JSON.stringify(refundCreate.body)).toBe(201);
  const refund = await prisma.pharmacyRefund.findFirstOrThrow({
    where: { organizationId, saleId: sale.id, paymentId: pharmacyPayment.id, status: "SUBMITTED" },
    orderBy: { createdAt: "desc" },
  });

  return { party, invoice, receivable, sale, payment, pharmacyPayment, refund, total, refundAmount };
}

async function refundAction(context, refundId, action) {
  return patch(
    context,
    `/api/enterprise/${organizationId}/pharmacy/cash/refund/${refundId}`,
    { action },
    "/enterprise-modules/CASH_INVOICES_PAYMENTS",
  );
}

test.describe.serial("Hotfix #728 Pharmacy refund Finance convergence", () => {
  test.beforeAll(async ({ browser }) => {
    await prepareTenant(browser);
  });

  test.afterAll(async () => {
    await requesterContext?.close();
    await validatorContext?.close();
    await settlerContext?.close();
    await prisma.organization.deleteMany({ where: { id: foreignOrganizationId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  test("partial refund is bounded, independently validated and settled once", async () => {
    const scenario = await createScenario(100, 40, `PART-${Date.now()}`);

    const selfValidation = await refundAction(requesterContext, scenario.refund.id, "validate-refund");
    expect(selfValidation.response.status(), JSON.stringify(selfValidation.body)).toBe(409);
    expect(selfValidation.body?.error).toBe("PHARMACY_REFUND_SELF_VALIDATION_FORBIDDEN");

    const validation = await refundAction(validatorContext, scenario.refund.id, "validate-refund");
    expect(validation.response.ok(), JSON.stringify(validation.body)).toBeTruthy();
    const validated = await prisma.pharmacyRefund.findUniqueOrThrow({ where: { id: scenario.refund.id } });
    expect(validated.status).toBe("VALIDATED");
    expect(validated.validatedById).toBe(adminUserId);

    const mapping = await prisma.pharmacyRefundExtension.findFirstOrThrow({ where: { organizationId, pharmacyRefundId: scenario.refund.id } });
    const preparedPayment = await prisma.enterprisePayment.findUniqueOrThrow({ where: { id: mapping.paymentId } });
    expect(preparedPayment.paymentType).toBe("REFUND");
    expect(preparedPayment.direction).toBe("OUTBOUND");
    expect(preparedPayment.status).toBe("APPROVED");
    expect(preparedPayment.cashSessionId).toBe(commonCashSessionId);
    expect(Number(preparedPayment.amount)).toBe(40);
    const preparedCredit = await prisma.enterpriseSalesCreditNote.findUniqueOrThrow({ where: { id: mapping.salesCreditNoteId } });
    expect(preparedCredit.status).toBe("APPROVED");
    expect(Number(preparedCredit.grandTotal)).toBe(40);
    expect(Number((await prisma.pharmacySale.findUniqueOrThrow({ where: { id: scenario.sale.id } })).refundedAmount || 0)).toBe(0);

    const prematureFinanceConfirmation = await post(
      settlerContext,
      `/api/enterprise/${organizationId}/payments/${preparedPayment.id}/transition`,
      { action: "CONFIRM", revision: preparedPayment.revision, reason: "Tentative avant inverse #728" },
    );
    expect(prematureFinanceConfirmation.response.status(), JSON.stringify(prematureFinanceConfirmation.body)).toBe(409);
    expect(prematureFinanceConfirmation.body?.error).toBe("REFUND_FINANCIAL_INVERSE_NOT_READY");
    expect((await prisma.enterprisePayment.findUniqueOrThrow({ where: { id: preparedPayment.id } })).status).toBe("APPROVED");
    expect(await prisma.enterpriseTreasuryTransaction.count({ where: { organizationId, paymentId: preparedPayment.id } })).toBe(0);

    const validatorSettlement = await refundAction(validatorContext, scenario.refund.id, "mark-refund-paid");
    expect(validatorSettlement.response.status(), JSON.stringify(validatorSettlement.body)).toBe(409);
    expect(validatorSettlement.body?.error).toBe("PHARMACY_REFUND_SELF_SETTLEMENT_FORBIDDEN");

    const settlement = await refundAction(settlerContext, scenario.refund.id, "mark-refund-paid");
    expect(settlement.response.ok(), JSON.stringify(settlement.body)).toBeTruthy();

    const [paidRefund, paidSale, commonRefund, credit, allocation, receivable, invoice] = await Promise.all([
      prisma.pharmacyRefund.findUniqueOrThrow({ where: { id: scenario.refund.id } }),
      prisma.pharmacySale.findUniqueOrThrow({ where: { id: scenario.sale.id } }),
      prisma.enterprisePayment.findUniqueOrThrow({ where: { id: mapping.paymentId } }),
      prisma.enterpriseSalesCreditNote.findUniqueOrThrow({ where: { id: mapping.salesCreditNoteId } }),
      prisma.enterprisePaymentAllocation.findFirstOrThrow({ where: { organizationId, paymentId: scenario.payment.id, receivableId: scenario.receivable.id } }),
      prisma.enterpriseReceivable.findUniqueOrThrow({ where: { id: scenario.receivable.id } }),
      prisma.enterpriseSalesInvoice.findUniqueOrThrow({ where: { id: scenario.invoice.id } }),
    ]);
    expect(paidRefund.status).toBe("PAID");
    expect(Number(paidSale.refundedAmount)).toBe(40);
    expect(paidSale.status).not.toBe("REFUNDED");
    expect(commonRefund.status).toBe("CONFIRMED");
    expect(commonRefund.confirmedByUserId).toBe(settlerUserId);
    expect(credit.status).toBe("POSTED");
    expect(Number(allocation.amount)).toBe(60);
    expect(allocation.status).toBe("CONFIRMED");
    expect(Number(receivable.allocatedAmount)).toBe(60);
    expect(Number(receivable.creditedAmount)).toBe(40);
    expect(Number(receivable.outstandingAmount)).toBe(0);
    expect(Number(invoice.amountPaid)).toBe(60);
    expect(Number(invoice.amountCredited)).toBe(40);
    expect(Number(invoice.outstandingAmount)).toBe(0);

    expect(await prisma.enterpriseTreasuryTransaction.count({ where: { organizationId, paymentId: commonRefund.id, direction: "OUTBOUND", status: "CONFIRMED" } })).toBe(1);
    expect(await prisma.enterpriseCashMovement.count({ where: { organizationId, paymentId: commonRefund.id, direction: "OUTBOUND" } })).toBe(1);
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId, postingEvent: "CUSTOMER_REFUND_CONFIRMED", sourceEntityId: commonRefund.id, status: "POSTED" } })).toBe(1);
    const sourcePaymentAfterRefund = await prisma.enterprisePayment.findUniqueOrThrow({ where: { id: scenario.payment.id } });
    expect(Number(sourcePaymentAfterRefund.unallocatedAmount)).toBe(0);

    const secondReceivable = await prisma.enterpriseReceivable.create({
      data: {
        organizationId,
        salesInvoiceId: (await prisma.enterpriseSalesInvoice.create({
          data: {
            organizationId,
            number: `PH728-REALLOC-${Date.now()}`,
            businessPartyId: scenario.party.id,
            status: "ISSUED",
            invoiceDate: new Date(),
            currencyCode,
            subtotal: "10",
            grandTotal: "10",
            outstandingAmount: "10",
            issuedAt: new Date(),
            postedAt: new Date(),
            createdByUserId: requesterUserId,
            items: { create: { description: "Reallocation guard #728", quantity: "1", unitPrice: "10", netAmount: "10", totalAmount: "10" } },
          },
        })).id,
        businessPartyId: scenario.party.id,
        currencyCode,
        originalAmount: "10",
        allocatedAmount: "0",
        creditedAmount: "0",
        writtenOffAmount: "0",
        outstandingAmount: "10",
        status: "OPEN",
      },
    });
    const reallocation = await post(validatorContext, `/api/enterprise/${organizationId}/payments/${scenario.payment.id}/allocations`, {
      receivableId: secondReceivable.id,
      amount: "10",
    });
    expect(reallocation.response.status(), JSON.stringify(reallocation.body)).toBe(409);
    expect(reallocation.body?.error).toBe("PAYMENT_ALLOCATION_EXCEEDS_UNALLOCATED");

    const retry = await refundAction(settlerContext, scenario.refund.id, "mark-refund-paid");
    expect(retry.response.ok(), JSON.stringify(retry.body)).toBeTruthy();
    expect(Number((await prisma.pharmacySale.findUniqueOrThrow({ where: { id: scenario.sale.id } })).refundedAmount)).toBe(40);
    expect(await prisma.enterpriseTreasuryTransaction.count({ where: { organizationId, paymentId: commonRefund.id, direction: "OUTBOUND", status: "CONFIRMED" } })).toBe(1);
  });

  test("total refund fully reverses the allocation and posts an exact credit", async () => {
    const scenario = await createScenario(75, 75, `TOTAL-${Date.now()}`);
    const validation = await refundAction(validatorContext, scenario.refund.id, "validate-refund");
    expect(validation.response.ok(), JSON.stringify(validation.body)).toBeTruthy();
    const settlement = await refundAction(settlerContext, scenario.refund.id, "mark-refund-paid");
    expect(settlement.response.ok(), JSON.stringify(settlement.body)).toBeTruthy();

    const mapping = await prisma.pharmacyRefundExtension.findFirstOrThrow({ where: { organizationId, pharmacyRefundId: scenario.refund.id } });
    const [sale, allocation, receivable, invoice, credit] = await Promise.all([
      prisma.pharmacySale.findUniqueOrThrow({ where: { id: scenario.sale.id } }),
      prisma.enterprisePaymentAllocation.findFirstOrThrow({ where: { organizationId, paymentId: scenario.payment.id, receivableId: scenario.receivable.id } }),
      prisma.enterpriseReceivable.findUniqueOrThrow({ where: { id: scenario.receivable.id } }),
      prisma.enterpriseSalesInvoice.findUniqueOrThrow({ where: { id: scenario.invoice.id } }),
      prisma.enterpriseSalesCreditNote.findUniqueOrThrow({ where: { id: mapping.salesCreditNoteId } }),
    ]);
    expect(sale.status).toBe("REFUNDED");
    expect(Number(sale.refundedAmount)).toBe(75);
    expect(allocation.status).toBe("REVERSED");
    expect(Number(receivable.allocatedAmount)).toBe(0);
    expect(Number(receivable.creditedAmount)).toBe(75);
    expect(Number(receivable.outstandingAmount)).toBe(0);
    expect(Number(invoice.amountPaid)).toBe(0);
    expect(Number(invoice.amountCredited)).toBe(75);
    expect(credit.status).toBe("POSTED");
    expect(Number(credit.grandTotal)).toBe(75);
    const originalItem = await prisma.enterpriseSalesInvoiceItem.findFirstOrThrow({ where: { organizationId, salesInvoiceId: scenario.invoice.id } });
    const creditItem = await prisma.enterpriseSalesCreditNoteItem.findFirstOrThrow({ where: { organizationId, salesCreditNoteId: credit.id } });
    expect(Number(creditItem.totalAmount)).toBe(Number(originalItem.totalAmount));
  });

  test("closed mapped Cash session fails before Pharmacy can become PAID", async () => {
    const scenario = await createScenario(50, 20, `FAIL-${Date.now()}`);
    await prisma.enterpriseCashSession.update({ where: { id: commonCashSessionId }, data: { status: "CLOSED" } });
    const validation = await refundAction(validatorContext, scenario.refund.id, "validate-refund");
    expect(validation.response.status(), JSON.stringify(validation.body)).toBe(409);
    expect(validation.body?.error).toBe("PHARMACY_REFUND_COMMON_CASH_SESSION_NOT_OPEN");
    const unchanged = await prisma.pharmacyRefund.findUniqueOrThrow({ where: { id: scenario.refund.id } });
    expect(unchanged.status).toBe("SUBMITTED");
    expect(await prisma.pharmacyRefundExtension.count({ where: { organizationId, pharmacyRefundId: scenario.refund.id } })).toBe(0);
    await prisma.enterpriseCashSession.update({ where: { id: commonCashSessionId }, data: { status: "OPEN" } });
  });

  test("active tenant cannot mutate a foreign Pharmacy refund", async () => {
    const response = await patch(
      settlerContext,
      `/api/enterprise/${foreignOrganizationId}/pharmacy/cash/refund/nonexistent-728`,
      { action: "mark-refund-paid" },
      "/enterprise-modules/CASH_INVOICES_PAYMENTS",
    );
    expect([403, 404]).toContain(response.response.status());
    expect(await prisma.pharmacyRefundExtension.count({ where: { organizationId: foreignOrganizationId } })).toBe(0);
  });
});
