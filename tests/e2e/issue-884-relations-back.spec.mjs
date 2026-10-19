import { expect, test } from "@playwright/test";

const required = ["E2E_BASE_URL", "E2E_ORGANIZATION_ID", "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"];
const configured = required.every((name) => Boolean(process.env[name]));
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "";

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

  for (const width of [320, 360, 375, 390, 414, 768, 1024]) {
    test(`identity administration fits ${width}px and opens per-row details`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 850 } });
      const page = await context.newPage();
      await signIn(page);
      await page.goto("/enterprise-identity-admin");
      await expect(page.getByRole("heading", { name: /Identités et consentements|Identities and consents/i })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `Horizontal viewport overflow at ${width}px`).toBeLessThanOrEqual(2);
      await expect(page.locator("[data-contextual-module-back]")).toHaveCount(1);
      const first = page.locator("[data-business-list-item] button[aria-label]").first();
      if (await first.count()) {
        await first.click();
        await expect(page.locator("[data-dtsc-fullscreen-detail]")).toBeVisible();
        await expect(page.locator("[data-relationship-overview]")).toBeVisible();
        await page.getByRole("tab", { name: /Avantages|Benefits/i }).click();
        await expect(page.getByRole("tabpanel")).toBeVisible();
        await page.getByRole("tab", { name: /Historique|History/i }).click();
        await expect(page.getByRole("tabpanel")).toBeVisible();
      }
      await context.close();
    });
  }

  test("overview rejects unauthenticated and cross-company access to a guessed identity", async ({ request }) => {
    const result = await request.get(`/api/enterprise/${encodeURIComponent(organizationId)}/identity-links/not-a-real-link/overview`);
    expect([401, 403, 404]).toContain(result.status());
  });
});
