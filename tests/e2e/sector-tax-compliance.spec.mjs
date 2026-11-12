import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
let originalCountry = null;
let customerId = null;
let firstTax = null;
let secondTax = null;

async function json(res) { return { status: res.status(), body: await res.json().catch(() => null) }; }
async function signIn(page) {
  const res = await page.context().request.post(`${base}/api/auth/sign-in`, {
    data: { email: adminEmail, password: adminPassword, organizationId, next: "/enterprise-modules/FINANCE_TAX" },
    headers: { origin: base, referer: `${base}/auth/sign-in` },
  });
  expect(res.ok(), JSON.stringify((await json(res)).body)).toBeTruthy();
}
async function post(page, route, data) {
  return json(await page.context().request.post(`${base}${route}`, {
    data, headers: { origin: base, referer: `${base}/enterprise-modules/FINANCE_TAX` },
  }));
}
async function get(page, route) { return json(await page.context().request.get(`${base}${route}`)); }

test.describe.serial("Sector tax #1124 — multi-tax, proofs and DGI readiness", () => {
  test.beforeAll(async () => {
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { country: true } });
    const admin = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
    const customer = await prisma.enterpriseBusinessParty.findFirst({
      where: { organizationId, status: "ACTIVE", archivedAt: null, roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE" } } },
    });
    if (!org || !admin || !customer) throw new Error("Tax #1124 E2E requires seeded organization, admin and CUSTOMER party.");
    originalCountry = org.country;
    customerId = customer.id;
    await prisma.organization.update({ where: { id: organizationId }, data: { country: "CD" } });
    for (const [code, category, rate] of [["E2E-1124-VAT", "VAT", "0.16"], ["E2E-1124-LEVY", "LOCAL_LEVY", "0.02"]]) {
      const existing = await prisma.enterpriseTaxCode.findFirst({ where: { organizationId, code } });
      const tax = existing || await prisma.enterpriseTaxCode.create({ data: {
        organizationId, code, nameFr: code, nameEn: code, category, jurisdiction: "CD", taxTreatment: "STANDARD",
        autoApply: false, isActive: true, rates: { create: {
          organizationId, rate, status: "ACTIVE", effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          createdByUserId: admin.id,
        } },
      } });
      if (code.endsWith("-VAT")) firstTax = tax.id;
      else secondTax = tax.id;
    }
  });
  test.afterAll(async () => {
    if (originalCountry !== null) await prisma.organization.update({
      where: { id: organizationId }, data: { country: originalCountry },
    }).catch(() => undefined);
    await prisma.$disconnect();
  });
  test("Anonymous finance rules and DGI checks are denied", async ({ request }) => {
    const a = await request.get(`${base}/api/enterprise/${organizationId}/taxes/rules`);
    const b = await request.get(`${base}/api/enterprise/${organizationId}/sales-invoices/unlisted/fiscalization-readiness`);
    expect([401, 403]).toContain(a.status());
    expect([401, 403]).toContain(b.status());
  });
  test("Authenticated: two tax lines, historic DRAFT isolation, proof checks, no fake DGI compliance", async ({ page }) => {
    await signIn(page);
    const prefix = `/api/enterprise/${organizationId}`;
    const rules = await get(page, `${prefix}/taxes/rules`);
    expect(rules.status, JSON.stringify(rules.body)).toBe(200);
    const draftRule = await post(page, `${prefix}/taxes/rules`, {
      taxCodeId: secondTax, sourceType: "SALES_INVOICE", calculationMode: "SEQUENTIAL",
      legalReference: "E2E documented rule, not real legal authority",
      evidenceReference: "E2E documented approval test", priority: 10,
    });
    expect(draftRule.status, JSON.stringify(draftRule.body)).toBe(201);
    const ownApproval = await page.context().request.patch(`${base}${prefix}/taxes/rules/${draftRule.body.rule.id}`, {
      data: { action: "APPROVE", reason: "E2E: independent authorization mandatory", revision: new Date(draftRule.body.rule.updatedAt).toISOString() },
      headers: { origin: base, referer: `${base}/enterprise-modules/FINANCE_TAX` },
    });
    expect(ownApproval.status()).toBe(403);
    const invoice = await post(page, `${prefix}/sales-invoices`, {
      businessPartyId: customerId, invoiceDate: "2026-11-12", currencyCode: "USD",
      items: [{ description: "E2E fiscal dual-tax", quantity: "1", unitPrice: "100",
        taxCodeId: firstTax, additionalTaxCodeIds: [secondTax] }],
    });
    expect(invoice.status, JSON.stringify(invoice.body)).toBe(201);
    expect(Number(invoice.body.invoice.grandTotal)).toBe(118);
    expect(Number(invoice.body.invoice.taxTotal)).toBe(18);
    const lines = await prisma.enterpriseSalesInvoiceItem.findMany({
      where: { organizationId, salesInvoiceId: invoice.body.invoice.id },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].taxBreakdownJson).toHaveLength(2);
    expect(await prisma.enterpriseTaxLine.count({ where: { organizationId, sourceEntityId: lines[0].id } })).toBe(0);
    const readiness = await get(page, `${prefix}/sales-invoices/${invoice.body.invoice.id}/fiscalization-readiness`);
    expect(readiness.status, JSON.stringify(readiness.body)).toBe(200);
    expect(readiness.body.report.certificationState).toBe("NOT_HOMOLOGATED");
    expect(readiness.body.report.canTransmit).toBe(false);
    expect(readiness.body.report.canClaimNormalizedInvoice).toBe(false);
    const undocumented = await post(page, `${prefix}/sales-invoices`, {
      businessPartyId: customerId, invoiceDate: "2026-11-12", currencyCode: "USD",
      items: [{ description: "E2E unsupported compound", quantity: "1", unitPrice: "100",
        taxCodeId: firstTax, additionalTaxCodeIds: [secondTax], taxCalculationMode: "SEQUENTIAL" }],
    });
    expect(undocumented.status).toBe(409);
  });
});
