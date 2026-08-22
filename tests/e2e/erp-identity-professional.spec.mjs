import { expect, test } from "@playwright/test";

const required = ["E2E_BASE_URL", "E2E_ORGANIZATION_ID", "E2E_ORGANIZATION_CODE", "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD", "E2E_USER_EMAIL", "E2E_USER_PASSWORD"];
const configured = required.every((name) => Boolean(process.env[name]));
const organizationId = process.env.E2E_ORGANIZATION_ID || "";
let invitedPartyName = "";

async function signIn(page, email, password, next = "/dashboard") {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  const emailInput = page.locator('input[name="email"]');
  await emailInput.fill(email);
  const organization = page.locator('select[name="organizationId"]');

  if (email === process.env.E2E_ADMIN_EMAIL) {
    const lookupPromise = page.waitForResponse((response) => response.url().endsWith("/api/auth/organizations") && response.request().method() === "POST");
    await emailInput.blur();
    const lookupResponse = await lookupPromise;
    expect(lookupResponse.ok(), `Organisation lookup failed with ${lookupResponse.status()}`).toBeTruthy();
    const lookupBody = await lookupResponse.json().catch(() => ({ organizations: [] }));
    expect(Array.isArray(lookupBody.organizations)).toBeTruthy();
    expect(lookupBody.organizations.some((item) => item.id === organizationId), `Organisation ${organizationId} is missing from authenticated login choices`).toBeTruthy();
    await expect(organization.locator(`option[value="${organizationId}"]`)).toHaveCount(1);
    await organization.selectOption(organizationId);
  } else {
    await emailInput.blur();
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

  test("administration entreprise #475 : configuration, départements, sécurité et mobile", async ({ browser }) => {
    const admin = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await signIn(admin, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD, "/enterprise-admin");
    await admin.goto("/enterprise-admin");
    await admin.waitForLoadState("networkidle");

    const navigation = admin.getByRole("navigation", { name: /sections administration entreprise/i });
    await expect(navigation).toBeVisible();
    await expect(admin.getByText("Configuration globale de l’entreprise", { exact: true })).toBeVisible();
    await expect(admin.getByText("Modules sectoriels", { exact: true })).toHaveCount(0);

    const viewport = await admin.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewport.scrollWidth - viewport.clientWidth, `Débordement horizontal détecté à 390 px: ${JSON.stringify(viewport)}`).toBeLessThanOrEqual(2);

    await navigation.getByRole("link", { name: "Départements", exact: true }).click();
    await expect(admin).toHaveURL(/\/enterprise-admin\?section=departments/);
    await admin.getByRole("button", { name: /nouveau département/i }).click();

    const departmentName = `Recette Administration ${Date.now()}`;
    const createDialog = admin.getByRole("dialog").last();
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel(/nom en français/i).fill(departmentName);
    await createDialog.getByLabel(/nom en anglais/i).fill(`E2E Department ${Date.now()}`);
    await createDialog.getByLabel(/^responsable$/i).selectOption({ index: 1 });
    await createDialog.getByLabel(/^description$/i).fill("Département éphémère utilisé uniquement pour la recette navigateur authentifiée du hotfix 475.");

    const createResponsePromise = admin.waitForResponse((response) =>
      response.url().includes(`/api/enterprise/${organizationId}/administration/departments`) &&
      response.request().method() === "POST",
    );
    await createDialog.getByRole("button", { name: /^enregistrer$/i }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.ok(), `Création département échouée avec ${createResponse.status()}`).toBeTruthy();
    await expect(admin.getByText(/département enregistré/i).first()).toBeVisible();

    const departmentCard = admin.getByRole("button", { name: new RegExp(departmentName, "i") }).first();
    await expect(departmentCard).toBeVisible();
    await departmentCard.click();
    const detailDialog = admin.getByRole("dialog").last();
    await expect(detailDialog.getByText(departmentName, { exact: true })).toBeVisible();
    await detailDialog.getByRole("button", { name: /^désactiver$/i }).click();

    const confirmationDialog = admin.getByRole("dialog").last();
    await expect(confirmationDialog.getByText(/son historique et ses anciens rattachements resteront conservés/i)).toBeVisible();
    const deactivateResponsePromise = admin.waitForResponse((response) =>
      response.url().includes(`/api/enterprise/${organizationId}/administration/departments/`) &&
      response.request().method() === "DELETE",
    );
    await confirmationDialog.getByRole("button", { name: /^désactiver$/i }).click();
    const deactivateResponse = await deactivateResponsePromise;
    expect(deactivateResponse.ok(), `Désactivation département échouée avec ${deactivateResponse.status()}`).toBeTruthy();
    await expect(admin.getByText(/département désactivé/i).first()).toBeVisible();

    await navigation.getByRole("link", { name: "Sécurité", exact: true }).click();
    await expect(admin).toHaveURL(/\/enterprise-admin\?section=security/);
    await admin.getByRole("button", { name: /configurer la sécurité de l’organisation/i }).click();
    const securityDialog = admin.getByRole("dialog").last();
    await expect(securityDialog).toBeVisible();
    await securityDialog.getByLabel(/durée de validité d’une invitation/i).selectOption("72");
    await securityDialog.getByLabel(/nombre maximal d’invitations en attente/i).selectOption("50");

    const securityResponsePromise = admin.waitForResponse((response) =>
      response.url().includes(`/api/enterprise/${organizationId}/administration/security`) &&
      response.request().method() === "PUT",
    );
    await securityDialog.getByRole("button", { name: /enregistrer la politique/i }).click();
    const securityResponse = await securityResponsePromise;
    expect(securityResponse.ok(), `Enregistrement sécurité échoué avec ${securityResponse.status()}`).toBeTruthy();
    await expect(admin.getByText(/politique de sécurité enregistrée/i).first()).toBeVisible();

    const finalViewport = await admin.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(finalViewport.scrollWidth - finalViewport.clientWidth, `Débordement horizontal après mutations: ${JSON.stringify(finalViewport)}`).toBeLessThanOrEqual(2);
  });

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
