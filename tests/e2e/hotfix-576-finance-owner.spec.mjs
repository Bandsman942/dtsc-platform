import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const userEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const suffix = Date.now();

const ids = {
  customer: `e2e-576-customer-${suffix}`,
  supplierParty: `e2e-576-supplier-party-${suffix}`,
  supplier: `e2e-576-supplier-${suffix}`,
  supplierLink: `e2e-576-supplier-link-${suffix}`,
  salesInvoice: `e2e-576-sales-invoice-${suffix}`,
  receivable: `e2e-576-receivable-${suffix}`,
  supplierInvoice: `e2e-576-supplier-invoice-${suffix}`,
  payable: `e2e-576-payable-${suffix}`,
  pendingSupplierInvoice: `e2e-576-pending-supplier-invoice-${suffix}`,
  pendingSupplierApproval: `e2e-576-pending-supplier-approval-${suffix}`,
  payment: `e2e-576-payment-${suffix}`,
};

const labels = {
  customer: `Client OWNER E2E 576 ${suffix}`,
  supplier: `Fournisseur OWNER E2E 576 ${suffix}`,
  salesInvoice: `INV-E2E-576-${suffix}`,
  supplierInvoice: `SUPINV-E2E-576-${suffix}`,
  pendingSupplierInvoice: `SUPINV-E2E-576-PENDING-${suffix}`,
  payment: `PAY-E2E-576-${suffix}`,
};

let adminUserId = "";
let regularUserId = "";

async function enableModule(moduleCode, sortOrder) {
  await prisma.enterpriseModule.upsert({
    where: { organizationId_moduleCode: { organizationId, moduleCode } },
    update: { isEnabled: true, requiresPlanLevel: "BUSINESS" },
    create: {
      organizationId,
      moduleCode,
      labelFr: moduleCode,
      labelEn: moduleCode,
      moduleCategory: "E2E",
      isEnabled: true,
      isCore: moduleCode === "FINANCE_OVERVIEW",
      requiresPlanLevel: "BUSINESS",
      sortOrder,
    },
  });
}

async function signIn(page, next) {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email: adminEmail, password: adminPassword, organizationId, next },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function assertHealthyMobilePage(page, pageErrors) {
  await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    viewport.scrollWidth - viewport.clientWidth,
    `Débordement horizontal détecté à 390 px: ${JSON.stringify(viewport)}`,
  ).toBeLessThanOrEqual(2);
}

async function openAuthenticatedMobilePage(browser, path) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await signIn(page, path);
  return { context, page, pageErrors };
}

function apiResponse(page, pathname, predicate = () => true) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === pathname && response.request().method() === "GET" && predicate(url);
  });
}

async function seedOwnerFinanceFixtures() {
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  const regular = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!admin || !regular) throw new Error("Hotfix #576 OWNER_E2E requires the canonical ERP authenticated seed.");
  adminUserId = admin.id;
  regularUserId = regular.id;

  await enableModule("FINANCE_OVERVIEW", 950);
  await enableModule("FINANCE_RECEIVABLES", 951);
  await enableModule("FINANCE_PAYABLES", 952);
  await enableModule("FINANCE_TREASURY", 953);
  await enableModule("FINANCE_PAYMENTS", 954);

  await prisma.enterpriseBusinessParty.create({
    data: {
      id: ids.customer,
      organizationId,
      partyType: "ORGANIZATION",
      legalName: labels.customer,
      displayName: labels.customer,
      normalizedName: `client owner e2e 576 ${suffix}`,
      code: `E2E-576-C-${suffix}`,
      status: "ACTIVE",
      createdByUserId: admin.id,
      roles: { create: { roleCode: "CUSTOMER", status: "ACTIVE", createdByUserId: admin.id } },
    },
  });

  await prisma.enterpriseBusinessParty.create({
    data: {
      id: ids.supplierParty,
      organizationId,
      partyType: "ORGANIZATION",
      legalName: labels.supplier,
      displayName: labels.supplier,
      normalizedName: `fournisseur owner e2e 576 ${suffix}`,
      code: `E2E-576-S-${suffix}`,
      status: "ACTIVE",
      createdByUserId: admin.id,
      roles: { create: { roleCode: "SUPPLIER", status: "ACTIVE", createdByUserId: admin.id } },
    },
  });

  await prisma.enterpriseSupplier.create({
    data: {
      id: ids.supplier,
      organizationId,
      legalName: labels.supplier,
      displayName: labels.supplier,
      normalizedName: `fournisseur-procurement-owner-e2e-576-${suffix}`,
      status: "ACTIVE",
      createdByUserId: admin.id,
    },
  });

  await prisma.enterpriseSupplierPartyLink.create({
    data: {
      id: ids.supplierLink,
      organizationId,
      supplierId: ids.supplier,
      businessPartyId: ids.supplierParty,
      createdByUserId: admin.id,
    },
  });

  await prisma.enterpriseSalesInvoice.create({
    data: {
      id: ids.salesInvoice,
      organizationId,
      number: labels.salesInvoice,
      businessPartyId: ids.customer,
      status: "ISSUED",
      invoiceDate: new Date("2026-07-01T00:00:00.000Z"),
      dueDate: new Date("2026-07-31T00:00:00.000Z"),
      currencyCode: "USD",
      subtotal: 120,
      grandTotal: 120,
      outstandingAmount: 120,
      issuedAt: new Date("2026-07-01T00:00:00.000Z"),
      createdByUserId: admin.id,
    },
  });

  await prisma.enterpriseReceivable.create({
    data: {
      id: ids.receivable,
      organizationId,
      salesInvoiceId: ids.salesInvoice,
      businessPartyId: ids.customer,
      currencyCode: "USD",
      originalAmount: 120,
      outstandingAmount: 120,
      status: "OPEN",
      dueDate: new Date("2026-07-31T00:00:00.000Z"),
    },
  });

  await prisma.enterpriseSupplierInvoice.create({
    data: {
      id: ids.supplierInvoice,
      organizationId,
      number: labels.supplierInvoice,
      supplierId: ids.supplier,
      businessPartyId: ids.supplierParty,
      status: "POSTED",
      invoiceDate: new Date("2026-07-05T00:00:00.000Z"),
      dueDate: new Date("2026-08-05T00:00:00.000Z"),
      currencyCode: "USD",
      subtotal: 80,
      grandTotal: 80,
      outstandingAmount: 80,
      postedAt: new Date("2026-07-05T00:00:00.000Z"),
      createdByUserId: admin.id,
    },
  });

  await prisma.enterprisePayable.create({
    data: {
      id: ids.payable,
      organizationId,
      supplierInvoiceId: ids.supplierInvoice,
      supplierId: ids.supplier,
      businessPartyId: ids.supplierParty,
      currencyCode: "USD",
      originalAmount: 80,
      outstandingAmount: 80,
      status: "OPEN",
      dueDate: new Date("2026-08-05T00:00:00.000Z"),
    },
  });

  await prisma.enterpriseSupplierInvoice.create({
    data: {
      id: ids.pendingSupplierInvoice,
      organizationId,
      number: labels.pendingSupplierInvoice,
      supplierId: ids.supplier,
      businessPartyId: ids.supplierParty,
      status: "PENDING_REVIEW",
      invoiceDate: new Date("2026-09-01T00:00:00.000Z"),
      dueDate: new Date("2026-09-30T00:00:00.000Z"),
      currencyCode: "USD",
      subtotal: 55,
      grandTotal: 55,
      outstandingAmount: 55,
      createdByUserId: regular.id,
    },
  });

  await prisma.enterpriseApproval.create({
    data: {
      id: ids.pendingSupplierApproval,
      organizationId,
      targetEntityType: "EnterpriseSupplierInvoiceReview",
      targetEntityId: ids.pendingSupplierInvoice,
      requestedByUserId: regular.id,
      approverUserId: admin.id,
      status: "PENDING",
    },
  });

  await prisma.enterprisePayment.create({
    data: {
      id: ids.payment,
      organizationId,
      number: labels.payment,
      direction: "INBOUND",
      paymentType: "CUSTOMER_PAYMENT",
      methodType: "OTHER",
      businessPartyId: ids.customer,
      currencyCode: "USD",
      amount: 45,
      unallocatedAmount: 45,
      paymentDate: new Date("2026-09-02T00:00:00.000Z"),
      reference: `OWNER-E2E-576-${suffix}`,
      status: "CONFIRMED",
      initiatedByUserId: regular.id,
      confirmedByUserId: admin.id,
      confirmedAt: new Date("2026-09-02T00:00:00.000Z"),
    },
  });
}

async function cleanupOwnerFinanceFixtures() {
  await prisma.enterpriseApproval.deleteMany({ where: { organizationId, id: ids.pendingSupplierApproval } }).catch(() => undefined);
  await prisma.enterprisePaymentAllocation.deleteMany({ where: { organizationId, paymentId: ids.payment } }).catch(() => undefined);
  await prisma.enterprisePaymentEvent.deleteMany({ where: { organizationId, paymentId: ids.payment } }).catch(() => undefined);
  await prisma.enterpriseTreasuryTransaction.deleteMany({ where: { organizationId, paymentId: ids.payment } }).catch(() => undefined);
  await prisma.enterprisePayment.deleteMany({ where: { organizationId, id: ids.payment } }).catch(() => undefined);
  await prisma.enterprisePayable.deleteMany({ where: { organizationId, id: ids.payable } }).catch(() => undefined);
  await prisma.enterpriseReceivable.deleteMany({ where: { organizationId, id: ids.receivable } }).catch(() => undefined);
  await prisma.enterpriseSupplierInvoice.deleteMany({ where: { organizationId, id: { in: [ids.pendingSupplierInvoice, ids.supplierInvoice] } } }).catch(() => undefined);
  await prisma.enterpriseSalesInvoice.deleteMany({ where: { organizationId, id: ids.salesInvoice } }).catch(() => undefined);
  await prisma.enterpriseSupplierPartyLink.deleteMany({ where: { organizationId, id: ids.supplierLink } }).catch(() => undefined);
  await prisma.enterpriseSupplier.deleteMany({ where: { organizationId, id: ids.supplier } }).catch(() => undefined);
  await prisma.enterpriseBusinessPartyRole.deleteMany({ where: { organizationId, businessPartyId: { in: [ids.customer, ids.supplierParty] } } }).catch(() => undefined);
  await prisma.enterpriseBusinessParty.deleteMany({ where: { organizationId, id: { in: [ids.customer, ids.supplierParty] } } }).catch(() => undefined);
}

test.describe.serial("Hotfix #576 — OWNER_E2E Finance receivables, payables and payments", () => {
  test.beforeAll(async () => {
    await cleanupOwnerFinanceFixtures();
    await seedOwnerFinanceFixtures();
  });

  test.afterAll(async () => {
    await cleanupOwnerFinanceFixtures();
    await prisma.$disconnect();
  });

  test("FINANCE_RECEIVABLES filters overdue before pagination and resolves a deep-linked invoice", async ({ browser }) => {
    const overduePath = "/enterprise-modules/FINANCE_RECEIVABLES?tab=overdue";
    const { context, page, pageErrors } = await openAuthenticatedMobilePage(browser, overduePath);
    try {
      const overduePromise = apiResponse(
        page,
        `/api/enterprise/${organizationId}/receivables`,
        (url) => url.searchParams.get("overdue") === "true",
      );
      await page.goto(`${baseUrl}${overduePath}`);
      const overdueResponse = await overduePromise;
      expect(overdueResponse.ok(), await overdueResponse.text()).toBeTruthy();
      const overdue = await overdueResponse.json();
      expect(overdue.items.some((item) => item.id === ids.receivable), JSON.stringify(overdue)).toBeTruthy();
      const usdMetric = overdue.metrics?.overdueByCurrency?.find((item) => item.currencyCode === "USD");
      expect(Number(usdMetric?._count?._all || 0)).toBeGreaterThanOrEqual(1);
      await expect(page.getByText(/Ventes & créances|Sales & receivables/i).first()).toBeVisible();
      await assertHealthyMobilePage(page, pageErrors);

      const deepLinkPromise = apiResponse(
        page,
        `/api/enterprise/${organizationId}/sales-invoices`,
        (url) => url.searchParams.get("recordId") === ids.salesInvoice,
      );
      await page.goto(`${baseUrl}/enterprise-modules/FINANCE_RECEIVABLES?invoiceId=${encodeURIComponent(ids.salesInvoice)}`);
      const deepLinkResponse = await deepLinkPromise;
      expect(deepLinkResponse.ok(), await deepLinkResponse.text()).toBeTruthy();
      const deepLink = await deepLinkResponse.json();
      expect(deepLink.items?.[0]?.id).toBe(ids.salesInvoice);
      await expect(page.getByText(labels.salesInvoice, { exact: false }).first()).toBeVisible();
      await assertHealthyMobilePage(page, pageErrors);
    } finally {
      await context.close();
    }
  });

  test("FINANCE_PAYABLES keeps PENDING_REVIEW in the assigned decision queue and filters overdue server-side", async ({ browser }) => {
    const queuePath = "/enterprise-modules/FINANCE_PAYABLES?tab=to-approve";
    const { context, page, pageErrors } = await openAuthenticatedMobilePage(browser, queuePath);
    try {
      const queuePromise = apiResponse(
        page,
        `/api/enterprise/${organizationId}/supplier-invoices`,
        (url) => url.searchParams.get("workflowPending") === "true",
      );
      await page.goto(`${baseUrl}${queuePath}`);
      const queueResponse = await queuePromise;
      expect(queueResponse.ok(), await queueResponse.text()).toBeTruthy();
      const queue = await queueResponse.json();
      const pending = queue.items.find((item) => item.id === ids.pendingSupplierInvoice);
      expect(pending, JSON.stringify(queue)).toBeTruthy();
      expect(pending.status).toBe("PENDING_REVIEW");
      expect(pending.capabilities?.canReview).toBeTruthy();
      await expect(page.getByText(labels.pendingSupplierInvoice, { exact: false }).first()).toBeVisible();
      await assertHealthyMobilePage(page, pageErrors);

      const overduePromise = apiResponse(
        page,
        `/api/enterprise/${organizationId}/payables`,
        (url) => url.searchParams.get("overdue") === "true",
      );
      await page.goto(`${baseUrl}/enterprise-modules/FINANCE_PAYABLES?tab=overdue`);
      const overdueResponse = await overduePromise;
      expect(overdueResponse.ok(), await overdueResponse.text()).toBeTruthy();
      const overdue = await overdueResponse.json();
      expect(overdue.items.some((item) => item.id === ids.payable), JSON.stringify(overdue)).toBeTruthy();
      const usdMetric = overdue.metrics?.overdueByCurrency?.find((item) => item.currencyCode === "USD");
      expect(Number(usdMetric?._count?._all || 0)).toBeGreaterThanOrEqual(1);
      await assertHealthyMobilePage(page, pageErrors);
    } finally {
      await context.close();
    }
  });

  test("FINANCE_PAYMENTS filters unallocated payments before pagination, preserves currency metrics and resolves references", async ({ browser }) => {
    const unallocatedPath = "/enterprise-modules/FINANCE_PAYMENTS?tab=unallocated";
    const { context, page, pageErrors } = await openAuthenticatedMobilePage(browser, unallocatedPath);
    try {
      const listPromise = apiResponse(
        page,
        `/api/enterprise/${organizationId}/payments`,
        (url) => url.searchParams.get("unallocated") === "true",
      );
      await page.goto(`${baseUrl}${unallocatedPath}`);
      const listResponse = await listPromise;
      expect(listResponse.ok(), await listResponse.text()).toBeTruthy();
      const list = await listResponse.json();
      const payment = list.items.find((item) => item.id === ids.payment);
      expect(payment, JSON.stringify(list)).toBeTruthy();
      expect(Number(payment.unallocatedAmount)).toBe(45);
      const usdMetric = list.metrics?.unallocatedByCurrency?.find((item) => item.currencyCode === "USD");
      expect(Number(usdMetric?._sum?.unallocatedAmount || 0)).toBeGreaterThanOrEqual(45);
      await expect(page.getByText(/Paiements|Payments/i).first()).toBeVisible();
      await assertHealthyMobilePage(page, pageErrors);

      const deepLinkPromise = apiResponse(
        page,
        `/api/enterprise/${organizationId}/payments`,
        (url) => url.searchParams.get("recordId") === ids.payment,
      );
      await page.goto(`${baseUrl}/enterprise-modules/FINANCE_PAYMENTS?paymentId=${encodeURIComponent(ids.payment)}`);
      const deepLinkResponse = await deepLinkPromise;
      expect(deepLinkResponse.ok(), await deepLinkResponse.text()).toBeTruthy();
      const deepLink = await deepLinkResponse.json();
      expect(deepLink.items?.[0]?.id).toBe(ids.payment);
      await expect(page.getByText(labels.payment, { exact: false }).first()).toBeVisible();

      const supplierLookup = await context.request.get(
        `${baseUrl}/api/enterprise/${organizationId}/finance/reference-options?module=FINANCE_PAYABLES&kind=supplier&search=${encodeURIComponent(labels.supplier)}`,
      );
      expect(supplierLookup.ok(), await supplierLookup.text()).toBeTruthy();
      const lookupBody = await supplierLookup.json();
      const supplier = lookupBody.items?.find((item) => item.id === ids.supplier);
      expect(supplier?.businessPartyId).toBe(ids.supplierParty);
      await assertHealthyMobilePage(page, pageErrors);
    } finally {
      await context.close();
    }
  });
});
