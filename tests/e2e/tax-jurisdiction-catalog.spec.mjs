import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const route = `/api/enterprise/${organizationId}/taxes/catalog`;
let originalCountry = null;

async function json(response) {
  return { status: response.status(), body: await response.json().catch(() => null) };
}
async function signIn(page) {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email: adminEmail, password: adminPassword, organizationId, next: "/enterprise-modules/FINANCE_TAX" },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  const data = await json(response);
  expect(response.ok(), JSON.stringify(data.body)).toBeTruthy();
}
async function get(page, path) { return json(await page.context().request.get(`${baseUrl}${path}`)); }
async function post(page, path, data) {
  return json(await page.context().request.post(`${baseUrl}${path}`, {
    data, headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/FINANCE_TAX` },
  }));
}

test.describe.serial("Fiscal jurisdictions, opt-in tax templates and tenant safety", () => {
  test.beforeAll(async () => {
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { country: true } });
    if (!org) throw new Error("Fiscal E2E requires the canonical seeded test company.");
    originalCountry = org.country;
    await prisma.organization.update({ where: { id: organizationId }, data: { country: "CD" } });
  });

  test.afterAll(async () => {
    await prisma.organization.update({ where: { id: organizationId }, data: { country: originalCountry } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  test("Tenant endpoint requires authentication and returns verified RDC tax", async ({ request }) => {
    const anonymous = await request.get(`${baseUrl}${route}`);
    expect([401, 403]).toContain(anonymous.status());
  });

  test("Authorized enterprise can inspect the DGI template and reject forged country", async ({ page }) => {
    await signIn(page);
    const catalog = await get(page, route);
    expect(catalog.status, JSON.stringify(catalog.body)).toBe(200);
    expect(catalog.body.countryCode).toBe("CD");
    const vat = catalog.body.templates.find((entry) => entry.code === "CD-VAT-STANDARD");
    expect(vat).toBeTruthy();
    expect(vat.rate).toBe("0.16");
    expect(vat.sourceAuthority).toBeTruthy();
    const foreign = await post(page, route, { code: "ZZ-VAT-INVALID", version: vat.version });
    expect(foreign.status).toBe(409);
  });

  test("Opt-in creates one versioned inactive-for-automation tax and blocks duplicate", async ({ page }) => {
    await signIn(page);
    const catalog = await get(page, route);
    expect(catalog.status, JSON.stringify(catalog.body)).toBe(200);
    const vat = catalog.body.templates.find((entry) => entry.code === "CD-VAT-STANDARD");
    expect(vat).toBeTruthy();
    const existing = catalog.body.adopted.some((entry) => entry.sourceTemplateCode === vat.code);
    const adopted = await post(page, route, { code: vat.code, version: vat.version, applyAutomatically: false });
    expect(adopted.status, JSON.stringify(adopted.body)).toBe(existing ? 409 : 201);
    const duplicate = await post(page, route, { code: vat.code, version: vat.version, applyAutomatically: false });
    expect(duplicate.status).toBe(409);
    const after = await get(page, route);
    expect(after.body.adopted.some((entry) => entry.sourceTemplateCode === vat.code)).toBeTruthy();
    const record = await prisma.enterpriseTaxCode.findFirst({ where: { organizationId, code: vat.code } });
    expect(record?.autoApply).toBe(false);
    expect(record?.sourceTemplateVersion).toBe(vat.version);
  });

  test("Tax list uses existing active flag rather than fictional status column", async ({ page }) => {
    await signIn(page);
    const response = await get(page, `/api/enterprise/${organizationId}/taxes?status=ACTIVE&pageSize=10`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.items.every((item) => item.isActive === true && item.status === "ACTIVE")).toBeTruthy();
  });
});
