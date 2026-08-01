import { expect, test } from "@playwright/test";

const required = ["E2E_BASE_URL", "E2E_ORGANIZATION_ID", "E2E_ORGANIZATION_CODE", "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD", "E2E_USER_EMAIL", "E2E_USER_PASSWORD"];
const configured = required.every((name) => Boolean(process.env[name]));
const organizationId = process.env.E2E_ORGANIZATION_ID || "";
let invitedPartyName = "";

async function signIn(page, email, password, next = "/dashboard") {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="email"]').blur();
  const organization = page.locator('select[name="organizationId"]');
  if (email === process.env.E2E_ADMIN_EMAIL) {
    await organization.waitFor({ state: "visible", timeout: 10_000 });
    await organization.selectOption(organizationId);
  }
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /connexion|se connecter/i }).click();
  await page.waitForLoadState("networkidle");
}

async function api(page, method, path, data) {
  const response = await page.request.fetch(path, { method, data, headers: { "content-type": "application/json" } });
  const body = await response.json().catch(() => ({}));
  expect(response.ok(), `${method} ${path}: ${JSON.stringify(body)}`).toBeTruthy();
  return body;
}

test.describe("ERP professionnel et identité relationnelle", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!configured, "Secrets E2E authentifiés non configurés dans GitHub/Production.");

  test("entreprise → utilisateur : fiche, invitation, consentement et relation ACTIVE", async ({ browser }) => {
    const admin = await browser.newPage();
    await signIn(admin, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD, "/enterprise-modules/CRM_CUSTOMERS");
    invitedPartyName = `Recette Invitation ${Date.now()}`;
    const party = await api(admin, "POST", `/api/enterprise/${organizationId}/business-parties`, { partyType: "PERSON", legalName: invitedPartyName, primaryEmail: process.env.E2E_USER_EMAIL, roles: ["PROSPECT"], contacts: [], addresses: [] });
    const invite = await api(admin, "POST", `/api/enterprise/${organizationId}/identity-link-invitations`, { email: process.env.E2E_USER_EMAIL, displayName: party.party.legalName, businessPartyId: party.party.id, relationType: "PROSPECT", purpose: "Recette navigateur authentifiée du consentement ERP" });
    expect(invite.accepted).toBeTruthy();
    expect(invite).not.toHaveProperty("token");

    const user = await browser.newPage();
    await signIn(user, process.env.E2E_USER_EMAIL, process.env.E2E_USER_PASSWORD, "/notifications");
    await user.goto("/notifications");
    const invitationNotification = user.getByRole("button", { name: /invitation à relier votre compte dtsc/i }).first();
    await expect(invitationNotification).toBeVisible();
    await invitationNotification.click();
    await expect(user).toHaveURL(/\/enterprise-links\?token=/);
    await expect(user.getByText(/recette navigateur authentifiée du consentement erp/i)).toBeVisible();
    await user.getByRole("button", { name: /^accepter$/i }).click();
    await user.waitForURL(/\/enterprise-links(?:\?|$)/);

    const access = await api(user, "GET", `/api/account/enterprise-relationships/${organizationId}`);
    expect(access.decision.allowed).toBeTruthy();
    expect(access.decision.code).toBe("ACTIVE_RELATIONSHIP");

    await admin.goto(`/enterprise-modules/CRM_CUSTOMERS?party=${encodeURIComponent(party.party.id)}&section=relation-dtsc`);
    await expect(admin.getByText(/relation dtsc active/i)).toBeVisible();
  });

  test("utilisateur → entreprise : demande, sélection ergonomique et approbation", async ({ browser }) => {
    const user = await browser.newPage();
    await signIn(user, process.env.E2E_USER_EMAIL, process.env.E2E_USER_PASSWORD, "/enterprise-links");
    const request = await api(user, "POST", "/api/account/identity-link-requests", { organizationCode: process.env.E2E_ORGANIZATION_CODE, relationType: "CUSTOMER", purpose: "Accéder aux services client autorisés" });

    const admin = await browser.newPage();
    await signIn(admin, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD, "/enterprise-identity-admin");
    await admin.goto(`/enterprise-identity-admin?link=${encodeURIComponent(request.linkId)}&section=relations`);
    await expect(admin.getByLabel(/rechercher une fiche/i)).toBeVisible();
    const targetSelect = admin.getByLabel(/^fiche métier$/i);
    await expect(targetSelect).toBeVisible();
    await targetSelect.selectOption({ index: 1 });
    await admin.getByRole("button", { name: /^approuver$/i }).first().click();
    await expect(admin.getByText(/relation active|approbation enregistrée|action a été enregistrée/i).first()).toBeVisible();

    await user.goto("/enterprise-links");
    await expect(user.getByText(/relation dtsc active|relation active/i).first()).toBeVisible();
  });

  test("utilisateur → entreprise : refus audité sans création automatique", async ({ browser }) => {
    const user = await browser.newPage();
    await signIn(user, process.env.E2E_USER_EMAIL, process.env.E2E_USER_PASSWORD, "/enterprise-links");
    const purpose = `Recette refus ${Date.now()}`;
    const request = await api(user, "POST", "/api/account/identity-link-requests", { organizationCode: process.env.E2E_ORGANIZATION_CODE, relationType: "OTHER", purpose });

    const admin = await browser.newPage();
    await signIn(admin, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD, "/enterprise-identity-admin");
    await admin.goto(`/enterprise-identity-admin?link=${encodeURIComponent(request.linkId)}&section=relations`);
    const row = admin.getByText(purpose).locator("xpath=ancestor::li | ancestor::article").first();
    const refuse = row.getByRole("button", { name: /^refuser$/i });
    if (await refuse.count()) await refuse.click();
    else await admin.getByRole("button", { name: /^refuser$/i }).first().click();
    await expect(admin.getByText(/relation refusée|action a été enregistrée/i).first()).toBeVisible();

    await user.goto("/enterprise-links");
    await expect(user.getByText(/relation refusée/i).first()).toBeVisible();
  });

  test("révocation : retrait des capacités et conservation de la fiche", async ({ browser }) => {
    const user = await browser.newPage();
    await signIn(user, process.env.E2E_USER_EMAIL, process.env.E2E_USER_PASSWORD, "/enterprise-links");
    await user.goto("/enterprise-links");
    let revoke = user.getByRole("button", { name: /révoquer|retirer l’autorisation/i }).first();
    test.skip(!(await revoke.count()), "Aucune relation ACTIVE de recette disponible à révoquer.");
    while (await revoke.count()) {
      await revoke.click();
      await user.waitForLoadState("networkidle");
      revoke = user.getByRole("button", { name: /révoquer|retirer l’autorisation/i }).first();
    }
    await expect(user.getByText(/relation révoquée/i).first()).toBeVisible();
    const decision = await api(user, "GET", `/api/account/enterprise-relationships/${organizationId}`);
    expect(decision.decision.allowed).toBeFalsy();

    const admin = await browser.newPage();
    await signIn(admin, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD, "/enterprise-modules/CRM_CUSTOMERS");
    const retained = await api(admin, "GET", `/api/enterprise/${organizationId}/business-parties?search=${encodeURIComponent(invitedPartyName)}&page=1&pageSize=20`);
    expect(retained.items.some((item) => item.legalName === invitedPartyName)).toBeTruthy();
  });

  test("expiration : le worker rend le token inutilisable", async ({ browser }) => {
    test.skip(!process.env.E2E_CRON_SECRET || !process.env.E2E_EXPIRED_INVITATION_TOKEN, "Fixture expirée ou secret du worker non configuré.");
    const admin = await browser.newPage();
    await signIn(admin, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD, "/enterprise-identity-admin");
    const response = await admin.request.post("/api/internal/identity-links/expire", { headers: { authorization: `Bearer ${process.env.E2E_CRON_SECRET}` }, data: { batchSize: 50 } });
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    expect(result).toHaveProperty("expired");

    const user = await browser.newPage();
    await signIn(user, process.env.E2E_USER_EMAIL, process.env.E2E_USER_PASSWORD, "/enterprise-links");
    await user.goto(`/enterprise-links?token=${encodeURIComponent(process.env.E2E_EXPIRED_INVITATION_TOKEN)}`);
    await expect(user.getByText(/expirée|inutilisable|déjà utilisée/i).first()).toBeVisible();
    await expect(user.getByRole("button", { name: /^accepter$/i })).toHaveCount(0);
  });
});
