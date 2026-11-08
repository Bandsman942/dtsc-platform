import { expect, test } from "@playwright/test";

// Execute only against a synthetic RETAIL fixture; no production credentials or
// real retail transactions should ever be reused for this test.
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const genericOrganizationId = process.env.E2E_RETAIL_GENERIC_ORGANIZATION_ID;
const legacyShopOrganizationId = process.env.E2E_RETAIL_SHOP_ORGANIZATION_ID;
const loginEmail = process.env.E2E_DTSC_USER_EMAIL;
const loginPassword = process.env.E2E_DTSC_USER_PASSWORD;
const mutationsEnabled = process.env.E2E_RETAIL_MUTATIONS === "1";

async function signIn(page) {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email: loginEmail, password: loginPassword, next: "/admin" },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test.describe("#1064 RETAIL Core and specialized pack governance", () => {
  test("unauthenticated requests cannot access tenant pack administration", async ({ request }) => {
    const result = await request.get(`${baseUrl}/api/admin/client-organizations/synthetic-tenant/retail-extensions`);
    expect([401, 403]).toContain(result.status());
  });

  test("general Retail is not Shop and retains optional packs OFF", async ({ page }) => {
    test.skip(!genericOrganizationId || !loginEmail || !loginPassword, "Requires prepared synthetic general Retail fixture");
    await signIn(page);
    const result = await page.context().request.get(
      `${baseUrl}/api/admin/client-organizations/${genericOrganizationId}/retail-extensions`,
    );
    expect(result.status()).toBe(200);
    const body = await result.json();
    expect(body.businessSubtypeCode).toBeNull();
    expect(body.modules.map((item) => item.moduleCode).sort()).toEqual(["MOBILE_MONEY_AGENCY", "TELCO_TOPUPS"]);
    expect(body.modules.every((item) => item.configured === false && item.choice === false)).toBe(true);
    expect(body.planned.length).toBeGreaterThanOrEqual(9);
    expect(body.planned.every((item) => !Object.hasOwn(item, "enabled"))).toBe(true);
    expect(body.planCode).toBeTruthy();
  });

  test("legacy Shop classification remains visible without losing modules", async ({ page }) => {
    test.skip(!legacyShopOrganizationId || !loginEmail || !loginPassword, "Requires an isolated legacy Shop fixture");
    await signIn(page);
    const result = await page.context().request.get(
      `${baseUrl}/api/admin/client-organizations/${legacyShopOrganizationId}/retail-extensions`,
    );
    expect(result.status()).toBe(200);
    const body = await result.json();
    expect(body.businessSubtypeCode).toBe("SHOP");
    expect(body.modules).toHaveLength(2);
  });

  test("mutations require fresh step-up and do not bypass the subscription", async ({ page }) => {
    test.skip(!mutationsEnabled || !genericOrganizationId || !loginEmail || !loginPassword,
      "Mutations are forbidden without an explicitly authorized synthetic test tenant");
    await signIn(page);
    const url = `${baseUrl}/api/admin/client-organizations/${genericOrganizationId}/retail-extensions`;
    const response = await page.context().request.patch(url, {
      data: { operation: "extension", moduleCode: "TELCO_TOPUPS", enabled: true,
        reason: "Isolated E2E checking of unverified second-factor guard" },
      headers: { origin: baseUrl, referer: `${baseUrl}/admin` },
    });
    expect(response.status()).toBe(428);
    const body = await response.json();
    expect(body.reasonCode).toBe("STEP_UP_REQUIRED");
  });
});
