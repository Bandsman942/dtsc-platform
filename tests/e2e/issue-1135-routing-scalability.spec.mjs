import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { apiRoutes, financeCodes, routeCase } from "../fixtures/routing-1135.mjs";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const headers = { origin: baseUrl, referer: baseUrl + "/auth/sign-in" };
const verbs = ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"];
const prisma = new PrismaClient();

test.beforeAll(() => {
  if (process.env.E2E_ROUTING_1135_ISOLATED !== "true" || !["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname)) {
    throw new Error("Routing acceptance requires the isolated local CI app and canonical ERP seed; never run against Production/HSL.");
  }
  const database = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
  if (!["localhost", "127.0.0.1"].includes(database.hostname) || database.pathname !== "/dtsc_gaming_646_acceptance") {
    throw new Error("Routing access tests may modify only the isolated dtsc_gaming_646_acceptance fixture database.");
  }
});
test.afterAll(async () => { await prisma.$disconnect(); });

for (const route of apiRoutes) {
  test(`historical HTTP contract: ${route.family}/${route.path}`, async ({ request }) => {
    const { url } = routeCase(route, organizationId);
    for (const method of verbs) {
      const response = await request.fetch(baseUrl + url, { method, headers, maxRedirects: 0 });
      const allowed = route.methods.includes(method) || method === "HEAD" && route.methods.includes("GET");
      // Console middleware protects all verbs before dispatch; ERP handlers own auth.
      const expected = route.family === "exports" ? 401 : method === "OPTIONS" ? 204 : allowed ? 401 : 405;
      expect(response.status(), `${method} ${url}: ${await response.text()}`).toBe(expected);
      if (method === "HEAD" || expected === 204) expect(await response.body()).toHaveLength(0);
      if (method === "OPTIONS" && route.family !== "exports") {
        expect(response.headers().allow.split(/,\s*/).sort()).toEqual([...route.methods, ...(route.methods.includes("GET") ? ["HEAD"] : []), "OPTIONS"].sort());
      }
    }
  });
}

test("unknown shapes and encoded HIRMS separators cannot select a handler", async ({ request }) => {
  for (const suffix of ["gaming/unknown", "gaming/sessions/id/extra", "gaming/tournaments/id/unknown", "insurance-connectors/unknown", "insurance-connectors/ocr/status/extra", "insurance-connectors/ocr%2Fstatus", "insurance-connectors/invoices%2Fstatus"]) {
    for (const method of ["GET", "POST", "OPTIONS"]) {
      const response = await request.fetch(`${baseUrl}/api/enterprise/${organizationId}/${suffix}`, { method, headers });
      expect(response.status(), `${method} ${suffix}`).toBe(404);
    }
  }
});

test("mutations remain same-origin protected before handler invocation", async ({ request }) => {
  for (const family of ["gaming/sessions", "insurance-connectors/verify"]) {
    const response = await request.post(`${baseUrl}/api/enterprise/${organizationId}/${family}`, { headers: { origin: "https://untrusted.example" }, data: {} });
    expect(response.status()).toBe(403);
    expect((await response.json()).error).toBe("Cross-origin request blocked");
  }
});

test.describe.serial("Authenticated Finance URLs and tenant boundaries", () => {
  let context;
  let page;
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();
    const response = await context.request.post(baseUrl + "/api/auth/sign-in", {
      headers, data: {
        email: process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test",
        password: process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!",
        organizationId, next: "/enterprise-modules/FINANCE_OVERVIEW",
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  });
  test.afterAll(async () => { await context?.close(); });

  for (const code of financeCodes) {
    test(`Finance deep link renders its original workspace: ${code}`, async () => {
      const response = await page.goto(`${baseUrl}/enterprise-modules/${code}`, { waitUntil: "networkidle" });
      expect(response.status()).toBe(200);
      await expect(page).toHaveURL(`${baseUrl}/enterprise-modules/${code}`);
      await expect(page.locator("[data-module-workspace]").first()).toBeVisible();
    });
  }
  for (const width of [320, 360, 375, 390, 414, 768, 1024]) {
    test(`Finance navigation retains bounded width at ${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseUrl}/enterprise-modules/FINANCE_OVERVIEW`, { waitUntil: "networkidle" });
      await expect(page.locator("[data-module-workspace]").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    });
  }
  test("organization owner gains neither Console export nor foreign tenant access", async () => {
    for (const dataset of ["audit", "organizations", "payments", "users"]) {
      expect((await context.request.get(`${baseUrl}/api/admin/exports/${dataset}`)).status()).toBe(403);
    }
    for (const suffix of ["gaming/dashboard", "insurance-connectors/invoices", "insurance-connectors/ocr"]) {
      const response = await context.request.get(`${baseUrl}/api/enterprise/routing-foreign-tenant/${suffix}`);
      expect(response.status(), suffix).toBe(403);
    }
    const verification = await context.request.post(`${baseUrl}/api/enterprise/routing-foreign-tenant/insurance-connectors/verify`, { headers, data: {} });
    expect(verification.status()).toBe(403);
  });
  test("disabled Finance module remains inaccessible through the dynamic page", async () => {
    const where = { organizationId_moduleCode: { organizationId, moduleCode: "FINANCE_ASSETS" } };
    const original = await prisma.enterpriseModule.findUniqueOrThrow({ where });
    try {
      await prisma.enterpriseModule.update({ where, data: { isEnabled: false } });
      const response = await page.goto(`${baseUrl}/enterprise-modules/FINANCE_ASSETS`, { waitUntil: "networkidle" });
      expect(response.status()).toBe(404);
    } finally {
      await prisma.enterpriseModule.update({ where, data: { isEnabled: original.isEnabled } });
    }
  });
  test("removed membership cannot reopen a Finance deep link", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test" } });
    const where = { organizationId_userId: { organizationId, userId: user.id } };
    const original = await prisma.organizationMember.findUniqueOrThrow({ where });
    try {
      await prisma.organizationMember.update({ where, data: { removedAt: new Date() } });
      const url = `${baseUrl}/enterprise-modules/FINANCE_OVERVIEW`;
      const response = await page.goto(url, { waitUntil: "networkidle" });
      expect(response.status() === 404 || page.url() !== url).toBeTruthy();
    } finally {
      await prisma.organizationMember.update({ where, data: { removedAt: original.removedAt } });
    }
  });
});
