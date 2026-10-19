import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const required = ["E2E_BASE_URL", "E2E_ORGANIZATION_ID", "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"];
const configured = required.every((name) => Boolean(process.env[name]));
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "";
const prisma = new PrismaClient();
const browserIdentityId = "e2e-884-browser-person";
const browserLinkId = "e2e-884-browser-link";

async function signIn(page) {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: {
      email: process.env.E2E_ADMIN_EMAIL,
      password: process.env.E2E_ADMIN_PASSWORD,
      organizationId,
      next: "/enterprise-identity-admin",
    },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.ok(), `#884 login failed: ${response.status()}`).toBeTruthy();
}

test.describe("#884 DTSC relationships, benefits and contextual return", () => {
  test.skip(!configured, "Requires authenticated E2E organization credentials.");

  test.beforeAll(async () => {
    if (!configured) return;
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: process.env.E2E_ADMIN_EMAIL } });
    await prisma.enterpriseIdentityLink.deleteMany({ where: { id: browserLinkId, organizationId } });
    await prisma.enterprisePersonIdentity.deleteMany({ where: { id: browserIdentityId, organizationId } });
    await prisma.enterprisePersonIdentity.create({
      data: {
        id: browserIdentityId, organizationId,
        displayName: "Personne E2E relation #884",
        primaryEmail: "relationship-884@example.test", status: "ACTIVE",
        createdByUserId: admin.id,
      },
    });
    await prisma.enterpriseIdentityLink.create({
      data: {
        id: browserLinkId, organizationId, personIdentityId: browserIdentityId,
        origin: "ENTERPRISE", requestedRelationType: "CUSTOMER", status: "ORGANIZATION_APPROVAL_REQUIRED",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        initiatedByUserId: admin.id, purpose: "Contrôle cliquable plein écran #884",
        consentTextVersion: "enterprise-identity-consent-v1",
      },
    });
  });

  test.afterAll(async () => {
    if (configured) {
      await prisma.enterpriseIdentityLink.deleteMany({ where: { id: browserLinkId, organizationId } });
      await prisma.enterprisePersonIdentity.deleteMany({ where: { id: browserIdentityId, organizationId } });
    }
    await prisma.$disconnect();
  });

  for (const width of [320, 360, 375, 390, 414, 768, 1024]) {
    test(`identity administration fits ${width}px and opens per-row details`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 850 } });
      const page = await context.newPage();
      await signIn(page);
      await page.goto(`${baseUrl}/enterprise-identity-admin`);
      await expect(page.getByRole("heading", { name: /Identités et consentements|Identities and consents/i })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `Horizontal viewport overflow at ${width}px`).toBeLessThanOrEqual(2);
      await expect(page.locator("[data-contextual-module-back]:visible")).toHaveCount(1);
      const row = page.locator("[data-business-list-item]").filter({ hasText: "Personne E2E relation #884" }).first();
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: /Ouvrir les détails|Open relationship details/i }).click();
        await expect(page.locator("[data-dtsc-fullscreen-detail]")).toBeVisible();
        await expect(page.locator("[data-relationship-overview]")).toBeVisible();
        await page.getByRole("tab", { name: /Avantages|Benefits/i }).click();
        await expect(page.getByRole("tabpanel")).toBeVisible();
        await page.getByRole("tab", { name: /Historique|History/i }).click();
        await expect(page.getByRole("tabpanel")).toBeVisible();
        await expect(page.getByRole("button", { name: /Approuver|Approve/i })).toBeDisabled();
      await page.goBack();
      await expect(page.locator("[data-dtsc-fullscreen-detail]")).toHaveCount(0);
      await expect(row).toBeVisible();

      await context.close();
    });
  }

  test("overview rejects unauthenticated access and forged tenant scope", async ({ request, browser }) => {
    const result = await request.get(`/api/enterprise/${encodeURIComponent(organizationId)}/identity-links/not-a-real-link/overview`);
    expect([401, 403, 404]).toContain(result.status());
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page);
    const forged = await context.request.get(
      `${baseUrl}/api/enterprise/not-this-tenant/identity-links/${browserLinkId}/overview`,
    );
    expect([403, 404]).toContain(forged.status());
    await context.close();
  });
});
