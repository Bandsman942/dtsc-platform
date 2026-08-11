import { expect, test } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";

async function readJson(response) {
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function signIn(page) {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: {
      email: adminEmail,
      password: adminPassword,
      organizationId,
      next: "/enterprise-modules/RETAIL_DAILY_CLOSE",
    },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `Daily-close sign-in failed: ${JSON.stringify(body)}`).toBeTruthy();
}

test.describe.serial("Shop 2.0 daily close workspace", () => {
  test("uses a dedicated business-facing workspace without raw account types at 390px", async ({ page }) => {
    await signIn(page);

    const dashboard = await readJson(await page.context().request.get(
      `${baseUrl}/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_DAILY_CLOSE`,
      { headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/RETAIL_DAILY_CLOSE` } },
    ));
    expect(dashboard.response.ok(), JSON.stringify(dashboard.body)).toBeTruthy();

    const nonCashAccount = (dashboard.body.accounts || []).find((account) => ["MOBILE_MONEY", "CLEARING"].includes(account.accountType));
    let createdClose = null;
    if (nonCashAccount) {
      const created = await readJson(await page.context().request.post(
        `${baseUrl}/api/enterprise/${organizationId}/retail/daily-close`,
        {
          data: {
            businessDate: new Date().toISOString(),
            notes: "Acceptance interface clôture",
            idempotencyKey: `shop2-daily-close-ui-${Date.now()}`,
            lines: [{
              financialAccountId: nonCashAccount.id,
              accountType: nonCashAccount.accountType,
              declaredBalance: Number(nonCashAccount.operationalBalance || 0),
              varianceReason: null,
              denominations: [],
            }],
          },
          headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/RETAIL_DAILY_CLOSE` },
        },
      ));
      expect(created.response.ok(), JSON.stringify(created.body)).toBeTruthy();
      createdClose = created.body.close;
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/enterprise-modules/RETAIL_DAILY_CLOSE");
    await page.waitForURL((url) => url.pathname.includes("/enterprise-modules/RETAIL_DAILY_CLOSE"), { timeout: 30_000 });

    await expect(page.getByText("Caisse & passage vers Finance", { exact: true })).toBeVisible();
    await expect(page.getByText("Soldes à compter", { exact: true })).toBeVisible();
    await expect(page.getByText("Soumettre la clôture journalière", { exact: true })).toBeVisible();
    await expect(page.getByText("Historique des clôtures", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /^Caisse & passage vers Finance/ }).click();
    await expect(page.getByRole("link", { name: "Gestion de caisse" })).toHaveAttribute("href", "/enterprise-modules/FINANCE_CASH");
    await expect(page.getByRole("link", { name: "Trésorerie" })).toHaveAttribute("href", "/enterprise-modules/FINANCE_TREASURY");

    if (createdClose) {
      await expect(page.getByText(createdClose.number, { exact: true })).toBeVisible();
      await expect(page.getByText("Soumise", { exact: true }).first()).toBeVisible();
    }

    for (const rawAccountType of ["CASH", "MOBILE_MONEY", "CLEARING", "CARD_CLEARING"]) {
      await expect(page.getByText(rawAccountType, { exact: true })).toHaveCount(0);
    }

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(hasHorizontalOverflow, "Daily close workspace must not overflow horizontally at 390px").toBe(false);
  });
});
