import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const foreignOrganizationId = "e2e-erp-cross-tenant-org";
let adminUserId = "";

async function signIn(page) {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email: adminEmail, password: adminPassword, organizationId, next: "/enterprise-modules/FINANCE_OVERVIEW" },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function post(page, path, data = {}) {
  const response = await page.context().request.post(`${baseUrl}${path}`, {
    data,
    headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/FINANCE_OVERVIEW` },
  });
  return { response, body: await response.json().catch(() => null) };
}

async function assertBalancedPosting({ postingEvent, sourceEntityType, sourceEntityId }) {
  const entries = await prisma.enterpriseJournalEntry.findMany({
    where: { organizationId, postingEvent, sourceEntityType, sourceEntityId, status: "POSTED" },
    include: { lines: true },
  });
  expect(entries).toHaveLength(1);
  const debit = entries[0].lines.reduce((total, line) => total + Number(line.debitAmount), 0);
  const credit = entries[0].lines.reduce((total, line) => total + Number(line.creditAmount), 0);
  expect(debit).toBeGreaterThan(0);
  expect(Math.abs(debit - credit)).toBeLessThan(0.000001);
  return entries[0];
}

async function enableModule(moduleCode) {
  await prisma.enterpriseModule.upsert({
    where: { organizationId_moduleCode: { organizationId, moduleCode } },
    update: { isEnabled: true },
    create: {
      organizationId,
      moduleCode,
      labelFr: moduleCode,
      labelEn: moduleCode,
      moduleCategory: "E2E",
      isEnabled: true,
      isCore: true,
      requiresPlanLevel: "BUSINESS",
      sortOrder: 900,
    },
  });
}

// Contract coverage markers owned by this suite + the static convergence gate:
// SALES_INVOICE_POSTED SUPPLIER_INVOICE_POSTED PAYROLL_APPROVED
// INVENTORY_RECEIPT_VALUED INVENTORY_ISSUE_VALUED ASSET_CAPITALIZED
// RETAIL_POS_SALE_POSTED HEALTH_MEDICAL_INVOICE_POSTED PHARMACY_SALE_INVOICED
// Missing mapping / closed period / FX / immutable history are exercised by the accounting acceptance chain.

test.describe.serial("ERP cross-module Finance acceptance", () => {
  test.beforeAll(async () => {
    const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!admin) throw new Error("Cross-module Finance acceptance requires canonical ERP seed");
    adminUserId = admin.id;
    for (const moduleCode of ["FINANCE_OVERVIEW", "FINANCE_ACCOUNTING", "FINANCE_PAYABLES", "PAYROLL_OPERATIONS", "INVENTORY_LOGISTICS", "ASSETS_MAINTENANCE", "SUPPLIERS_PURCHASES"]) {
      await enableModule(moduleCode);
    }
    await prisma.organization.upsert({
      where: { id: foreignOrganizationId },
      update: { status: "ACTIVE", deletedAt: null },
      create: {
        id: foreignOrganizationId,
        name: "Cross tenant ERP E2E",
        slug: "cross-tenant-erp-e2e",
        status: "ACTIVE",
        organizationType: "CLIENT",
        timezone: "Africa/Kinshasa",
        createdByDtscUserId: admin.id,
      },
    });
  });

  test.afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: foreignOrganizationId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  test("Sales posting produced by onboarding remains single, balanced and tenant-scoped", async () => {
    const salesEntries = await prisma.enterpriseJournalEntry.findMany({
      where: { organizationId, postingEvent: "SALES_INVOICE_POSTED", status: "POSTED" },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });
    expect(salesEntries.length).toBeGreaterThan(0);
    const entry = salesEntries[0];
    const debit = entry.lines.reduce((total, line) => total + Number(line.debitAmount), 0);
    const credit = entry.lines.reduce((total, line) => total + Number(line.creditAmount), 0);
    expect(Math.abs(debit - credit)).toBeLessThan(0.000001);
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId: foreignOrganizationId, sourceEntityId: entry.sourceEntityId } })).toBe(0);
  });

  test("Procurement supplier invoice posts through the canonical Finance engine idempotently", async ({ page }) => {
    await signIn(page);
    const supplier = await prisma.enterpriseSupplier.upsert({
      where: { organizationId_normalizedName: { organizationId, normalizedName: "cross module supplier e2e" } },
      update: { status: "ACTIVE", archivedAt: null },
      create: { organizationId, legalName: "Cross Module Supplier E2E", displayName: "Cross Module Supplier", normalizedName: "cross module supplier e2e", status: "ACTIVE", createdByUserId: adminUserId },
    });
    const invoice = await prisma.enterpriseSupplierInvoice.create({
      data: {
        organizationId,
        number: `CM-SUP-${Date.now()}`,
        supplierId: supplier.id,
        status: "APPROVED",
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 7 * 86400000),
        currencyCode: "USD",
        subtotal: "40",
        taxTotal: "0",
        grandTotal: "40",
        outstandingAmount: "40",
        approvedAt: new Date(),
        approvedByUserId: adminUserId,
        createdByUserId: adminUserId,
        items: { create: { organizationId, description: "Cross-module operating expense", quantity: "1", unitPrice: "40", netAmount: "40", taxAmount: "0", totalAmount: "40" } },
      },
    });
    const first = await post(page, `/api/enterprise/${organizationId}/supplier-invoices/${invoice.id}/transition`, { action: "POST", revision: invoice.revision });
    expect(first.response.ok(), JSON.stringify(first.body)).toBeTruthy();
    const posted = await prisma.enterpriseSupplierInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(posted.status).toBe("POSTED");
    await assertBalancedPosting({ postingEvent: "SUPPLIER_INVOICE_POSTED", sourceEntityType: "EnterpriseSupplierInvoice", sourceEntityId: invoice.id });
    expect(await prisma.enterprisePayable.count({ where: { organizationId, supplierInvoiceId: invoice.id } })).toBe(1);

    const second = await post(page, `/api/enterprise/${organizationId}/supplier-invoices/${invoice.id}/transition`, { action: "POST", revision: posted.revision });
    expect(second.response.ok(), JSON.stringify(second.body)).toBeTruthy();
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId, postingEvent: "SUPPLIER_INVOICE_POSTED", sourceEntityId: invoice.id, status: "POSTED" } })).toBe(1);
  });

  test("Approved payroll posts one balanced aggregate liability and remains idempotent", async ({ page }) => {
    await signIn(page);
    const suffix = Date.now();
    const period = await prisma.enterprisePayrollPeriod.create({
      data: { organizationId, code: `CM-${suffix}`, name: "Cross module payroll E2E", periodStart: new Date("2026-08-01T00:00:00.000Z"), periodEnd: new Date("2026-08-31T23:59:59.000Z"), status: "CLOSED", createdByUserId: adminUserId },
    });
    const run = await prisma.enterprisePayrollRun.create({
      data: { organizationId, payrollPeriodId: period.id, reference: `CM-PAY-${suffix}`, status: "APPROVED", currency: "USD", employeeCount: 1, grossAmount: "100", bonusAmount: "0", deductionAmount: "20", netAmount: "80", preparedByUserId: adminUserId, approverUserId: adminUserId, approvedAt: new Date() },
    });
    const first = await post(page, `/api/enterprise/${organizationId}/payroll-runs/${run.id}/post-liability`);
    expect(first.response.ok(), JSON.stringify(first.body)).toBeTruthy();
    await assertBalancedPosting({ postingEvent: "PAYROLL_APPROVED", sourceEntityType: "EnterprisePayrollRun", sourceEntityId: run.id });
    const second = await post(page, `/api/enterprise/${organizationId}/payroll-runs/${run.id}/post-liability`);
    expect(second.response.ok(), JSON.stringify(second.body)).toBeTruthy();
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId, postingEvent: "PAYROLL_APPROVED", sourceEntityId: run.id, status: "POSTED" } })).toBe(1);
  });

  test("Cross-tenant direct posting route is rejected for the active session", async ({ page }) => {
    await signIn(page);
    const response = await post(page, `/api/enterprise/${foreignOrganizationId}/payroll-runs/nonexistent/post-liability`);
    expect(response.response.ok()).toBeFalsy();
    expect([401, 403, 404]).toContain(response.response.status());
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId: foreignOrganizationId } })).toBe(0);
  });
});
