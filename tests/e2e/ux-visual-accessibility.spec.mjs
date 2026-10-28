import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const email = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const password = process.env.E2E_USER_PASSWORD;
const maximumNavigationMs = Number(process.env.UX_MAX_NAVIGATION_MS || 20_000);
const widths = [320, 360, 375, 390, 414, 768, 1024, 1440];

async function signIn(page) {
  if (!password) throw new Error("UX-06 requires the isolated ERP E2E user and E2E_USER_PASSWORD, not a Production session.");
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email, password, organizationId, next: "/enterprise-modules" },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.ok(), "UX-06 synthetic ERP E2E account must authenticate").toBeTruthy();
}

async function auditPage(page, testInfo, screen) {
  const startedAt = Date.now();
  await page.goto(`${baseUrl}/enterprise-modules`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-workspace-module-header]").first()).toBeVisible();
  const interactiveMs = Date.now() - startedAt;
  expect(interactiveMs, `${screen}: navigation exceeded ${maximumNavigationMs}ms`).toBeLessThanOrEqual(maximumNavigationMs);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${screen}: root overflow must stay below 2px`).toBeLessThanOrEqual(2);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    accessibility.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map((node) => node.target) })),
    `${screen}: WCAG violations require remediation, not suppression`,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`${screen}-erp-hub.png`), fullPage: true });
}

test.describe("UX-06 visual and accessible ERP acceptance", () => {
  for (const width of widths) {
    test(`authenticated ERP hub at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 850 });
      await signIn(page);
      await auditPage(page, testInfo, `${width}px`);
    });
  }

  test("an authorized ERP module opens without horizontal overflow", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto(`${baseUrl}/enterprise-modules`, { waitUntil: "domcontentloaded" });
    // ERP hub cards expose accessible links, not a data-enterprise-module-code attribute.
    const moduleLink = page.getByRole("link", { name: /^(Ouvrir|Open) / }).first();
    await expect(moduleLink).toBeVisible();
    const destination = await moduleLink.getAttribute("href");
    expect(destination, "Authorized ERP cards must have a real destination").toBeTruthy();
    await moduleLink.click();
    expect(page.url()).toContain(destination);
    await expect(page.locator("main")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: testInfo.outputPath("390px-erp-module.png"), fullPage: true });
    await page.goBack();
    await expect(page.locator("[data-workspace-module-header]").first()).toBeVisible();
  });
});
