import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";

async function readJson(response) {
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function post(page, path, data) {
  return readJson(await page.context().request.post(path, {
    data,
    headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/RETAIL_POS` },
  }));
}

async function del(page, path) {
  return readJson(await page.context().request.delete(path, {
    headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/RETAIL_POS` },
  }));
}

async function signIn(page) {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: {
      email: adminEmail,
      password: adminPassword,
      organizationId,
      next: "/enterprise-modules/RETAIL_POS",
    },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `Direct Shop customer-value sign-in failed: ${JSON.stringify(body)}`).toBeTruthy();
}

test.describe.serial("Shop 2.0 customer value and payment follow-up UI", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("shows loyalty, stored value and payment status without technical leakage at 390px", async ({ page }) => {
    await signIn(page);

    const customer = await prisma.enterpriseBusinessParty.findFirst({
      where: {
        organizationId,
        status: "ACTIVE",
        archivedAt: null,
        roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } },
      },
      orderBy: { createdAt: "asc" },
    });
    expect(customer, "Shop customer-value UI E2E requires a canonical customer").toBeTruthy();

    const selected = await post(page, `/api/enterprise/${organizationId}/retail/active-customer`, {
      customerBusinessPartyId: customer.id,
    });
    expect(selected.response.ok(), JSON.stringify(selected.body)).toBeTruthy();

    const program = await post(page, `/api/enterprise/${organizationId}/retail/loyalty/programs`, {
      code: "SHOP2-VALUE-UI",
      nameFr: "Avantages client E2E",
      nameEn: "Customer benefits E2E",
      currencyCode: "USD",
      earnPointsPerCurrencyUnit: 1,
      redeemValuePerPoint: 0.01,
      minimumRedeemPoints: 1,
      status: "ACTIVE",
      settingsJson: { autoEarn: false },
    });
    expect(program.response.ok(), JSON.stringify(program.body)).toBeTruthy();

    const earned = await post(page, `/api/enterprise/${organizationId}/retail/loyalty/earn`, {
      programId: program.body.program.id,
      customerBusinessPartyId: customer.id,
      points: 25,
      monetaryAmount: 25,
      currencyCode: "USD",
      reason: "Customer value UI acceptance",
      idempotencyKey: `shop2-value-ui-loyalty-${Date.now()}`,
    });
    expect(earned.response.ok(), JSON.stringify(earned.body)).toBeTruthy();

    const gift = await post(page, `/api/enterprise/${organizationId}/retail/stored-value`, {
      accountType: "GIFT_CARD",
      customerBusinessPartyId: customer.id,
      currencyCode: "USD",
      initialValue: 35,
      idempotencyKey: `shop2-value-ui-gift-${Date.now()}`,
    });
    expect(gift.response.status(), JSON.stringify(gift.body)).toBe(201);

    const clientReference = `VALUE-UI-${Date.now()}`;
    const payment = await post(page, `/api/enterprise/${organizationId}/retail/payments`, {
      methodType: "CARD",
      currencyCode: "USD",
      amount: 12,
      clientReference,
      idempotencyKey: `shop2-value-ui-payment-${Date.now()}`,
    });
    expect(payment.response.status(), JSON.stringify(payment.body)).toBe(201);

    const captured = await post(page, `/api/enterprise/${organizationId}/retail/payments/${payment.body.payment.id}`, {
      revision: payment.body.payment.revision,
      status: "CAPTURED",
      providerReference: "VALUE-UI-CAPTURED",
    });
    expect(captured.response.ok(), JSON.stringify(captured.body)).toBeTruthy();

    const refunded = await post(page, `/api/enterprise/${organizationId}/retail/payments/${payment.body.payment.id}`, {
      revision: captured.body.payment.revision,
      status: "REFUNDED",
      providerReference: "VALUE-UI-REFUNDED",
    });
    expect(refunded.response.ok(), JSON.stringify(refunded.body)).toBeTruthy();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/enterprise-modules/RETAIL_POS");
    await page.waitForURL((url) => url.pathname.includes("/enterprise-modules/RETAIL_POS"), { timeout: 30_000 });

    await expect(page.getByText(customer.displayName || customer.legalName, { exact: true })).toBeVisible();

    const benefits = page.locator("details").filter({ hasText: "Fidélité & avoirs client" }).first();
    await expect(benefits).toBeVisible();
    await benefits.locator("summary").click();
    await expect(benefits.getByText("Avantages client E2E", { exact: true })).toBeVisible();
    await expect(benefits.getByText("Carte-cadeau", { exact: true }).first()).toBeVisible();
    await expect(benefits.getByText(/25.*points disponibles/i).first()).toBeVisible();

    const paymentFollowup = page.locator("details").filter({ hasText: "Suivi des paiements" }).first();
    await expect(paymentFollowup).toBeVisible();
    await paymentFollowup.locator("summary").click();
    await expect(paymentFollowup.getByText(clientReference, { exact: true })).toBeVisible();
    await expect(paymentFollowup.getByText("Carte", { exact: true }).first()).toBeVisible();
    await expect(paymentFollowup.getByText("Remboursé", { exact: true }).first()).toBeVisible();

    for (const rawEnum of ["GIFT_CARD", "STORE_CREDIT", "INITIATED", "AUTHORIZED", "CAPTURED", "FAILED", "VOIDED", "REFUNDED"]) {
      await expect(page.getByText(rawEnum, { exact: true })).toHaveCount(0);
    }
    for (const technicalLabel of ["providerId", "providerReference", "failureCode", "failureMessage"]) {
      await expect(page.getByText(technicalLabel, { exact: true })).toHaveCount(0);
    }

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(hasHorizontalOverflow, "Customer value and payment follow-up must not overflow horizontally at 390px").toBe(false);

    const cleared = await del(page, `/api/enterprise/${organizationId}/retail/active-customer`);
    expect(cleared.response.ok()).toBeTruthy();
  });
});
