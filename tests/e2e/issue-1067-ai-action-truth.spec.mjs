import { expect, test } from "@playwright/test";

// Read-only synthetic acceptance: never send real mail or create real tickets
// from an automated test. Mutations are covered through explicit owner E2E
// with isolated transport and a synthetic organization.
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const email = process.env.E2E_DTSC_USER_EMAIL || process.env.E2E_USER_EMAIL;
const password = process.env.E2E_DTSC_USER_PASSWORD || process.env.E2E_USER_PASSWORD;
const organizationId = process.env.E2E_ORGANIZATION_ID;

test("action evidence and confirmation APIs deny anonymous use", async ({ request }) => {
  const history = await request.get(`${baseUrl}/api/ai/tools/history`);
  expect([401,403]).toContain(history.status());
  const confirm = await request.post(`${baseUrl}/api/ai/tools/confirm`, {
    data: { confirmationId: "00000000-0000-4000-8000-000000000001" },
    headers: { origin: baseUrl, referer: `${baseUrl}/chat` },
  });
  expect([401,403]).toContain(confirm.status());
});

test("verified history is scoped to current user and contains no raw tool arguments", async ({ page }) => {
  test.skip(!email || !password, "Requires isolated authenticated user, never a Production session");
  const login = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email, password, organizationId, next: "/chat" },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(login.ok(), await login.text()).toBeTruthy();

  const response = await page.context().request.get(`${baseUrl}/api/ai/tools/history`, {
    headers: { origin: baseUrl, referer: `${baseUrl}/chat` },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const result = await response.json();
  expect(Array.isArray(result.actions)).toBe(true);
  for (const item of result.actions) {
    expect(["SUPPORT_TICKET_CREATE", "DTSC_CONTACT_EMAIL_SEND"]).toContain(item.toolCode);
    expect(["SUCCEEDED", "FAILED", "STARTED", "DENIED", "UNVERIFIED"]).toContain(item.status);
    expect(item).not.toHaveProperty("argumentsJson");
    if (item.status === "SUCCEEDED") {
      expect(item.ticketId || item.contactMessageId).toBeTruthy();
    }
  }

  await page.goto(`${baseUrl}/chat`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-assistant-immersive-variant="chatbot"]')).toBeVisible();
  await expect(page.locator('[data-immersive-conversation="true"]')).toBeVisible();
});
