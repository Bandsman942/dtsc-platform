import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const customerId = "e2e-baseline-business-party";
const assetId = "e2e-gaming-asset-645";
const stationId = "e2e-gaming-station-645";
let adminUserId = "";
let page;
let context;

const requiredModules = [
  "AI_ASSISTANT",
  "ASSETS_MAINTENANCE",
  "REPORTS",
  "FINANCE_RECEIVABLES",
  "GAMING_STATIONS",
  "GAMING_SESSIONS",
  "GAMING_BOOKINGS",
  "GAMING_DASHBOARD",
  "GAMING_TOURNAMENTS",
  "GAMING_REPORTS",
];

async function enableModule(moduleCode, index) {
  await prisma.enterpriseModule.upsert({
    where: { organizationId_moduleCode: { organizationId, moduleCode } },
    update: { isEnabled: true, requiresPlanLevel: moduleCode === "AI_ASSISTANT" ? "STARTER" : "BUSINESS" },
    create: {
      organizationId,
      moduleCode,
      labelFr: moduleCode,
      labelEn: moduleCode,
      moduleCategory: "E2E",
      isEnabled: true,
      isCore: true,
      requiresPlanLevel: moduleCode === "AI_ASSISTANT" ? "STARTER" : "BUSINESS",
      sortOrder: 1200 + index,
    },
  });
}

async function configureGamingTenant() {
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) throw new Error("Issue #645 OWNER_E2E requires the canonical ERP authenticated seed.");
  adminUserId = admin.id;

  await prisma.organization.update({
    where: { id: organizationId },
    data: { sectorCode: "HOSPITALITY_EVENTS", status: "ACTIVE", deletedAt: null },
  });
  await prisma.enterpriseBusinessSubtypeSelection.upsert({
    where: { organizationId },
    update: { sectorCode: "HOSPITALITY_EVENTS", businessSubtypeCode: "GAMING_LOUNGE", selectedByUserId: admin.id, source: "OWNER_E2E_645" },
    create: { organizationId, sectorCode: "HOSPITALITY_EVENTS", businessSubtypeCode: "GAMING_LOUNGE", selectedByUserId: admin.id, source: "OWNER_E2E_645" },
  });

  for (const [index, moduleCode] of requiredModules.entries()) await enableModule(moduleCode, index);

  const customer = await prisma.enterpriseBusinessParty.findFirst({
    where: { id: customerId, organizationId, archivedAt: null, status: "ACTIVE", roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } } },
    select: { id: true },
  });
  if (!customer) throw new Error("Issue #645 OWNER_E2E requires the baseline canonical CRM customer.");

  await prisma.enterpriseAsset.upsert({
    where: { id: assetId },
    update: { organizationId, code: "E2E-GAME-645", name: "Poste Gaming OWNER E2E #645", status: "ACTIVE", condition: "GOOD", archivedAt: null, updatedByUserId: admin.id },
    create: { id: assetId, organizationId, code: "E2E-GAME-645", name: "Poste Gaming OWNER E2E #645", status: "ACTIVE", condition: "GOOD", createdByUserId: admin.id },
  });
  await prisma.enterpriseGamingStationProfile.upsert({
    where: { organizationId_assetId: { organizationId, assetId } },
    update: { stationCode: "E2E-GS-645", displayName: "PlayStation OWNER E2E", consoleFamily: "PlayStation", maxPlayers: 4, status: "AVAILABLE", archivedAt: null, updatedByUserId: admin.id },
    create: { id: stationId, organizationId, assetId, stationCode: "E2E-GS-645", displayName: "PlayStation OWNER E2E", consoleFamily: "PlayStation", maxPlayers: 4, status: "AVAILABLE", createdByUserId: admin.id },
  });
}

async function signIn() {
  const response = await context.request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email: adminEmail, password: adminPassword, organizationId, next: "/enterprise-modules/GAMING_DASHBOARD" },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function post(path, data) {
  const response = await context.request.post(`${baseUrl}${path}`, {
    data,
    headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/GAMING_DASHBOARD` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body;
}

async function patch(path, data) {
  const response = await context.request.patch(`${baseUrl}${path}`, {
    data,
    headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/GAMING_TOURNAMENTS` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body;
}

async function get(path) {
  const response = await context.request.get(`${baseUrl}${path}`, {
    headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/GAMING_DASHBOARD` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body;
}

async function expectResponsiveModule(path) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  await expect(page.locator("[data-module-workspace]")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe.serial("Issue #645 Gaming OWNER_E2E", () => {
  test.beforeAll(async ({ browser }) => {
    await configureGamingTenant();
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    page = await context.newPage();
    await signIn();
  });

  test.afterAll(async () => {
    await context?.close();
    await prisma.$disconnect();
  });

  test("tournoi gratuit, participant CRM et poste canonique", async () => {
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    const created = await post(`/api/enterprise/${organizationId}/gaming/tournaments`, {
      title: "OWNER E2E #645 Tournament",
      tournamentFormat: "SINGLE_ELIMINATION",
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      maxParticipants: 8,
      idempotencyKey: `owner-e2e-645-tournament-${Date.now()}`,
    });
    expect(created.tournament?.id).toBeTruthy();
    expect(created.tournament?.status).toBe("DRAFT");

    const opened = await patch(`/api/enterprise/${organizationId}/gaming/tournaments/${created.tournament.id}`, {
      action: "OPEN_REGISTRATION",
      revision: created.tournament.revision,
    });
    expect(opened.result?.tournament?.status).toBe("REGISTRATION_OPEN");

    const registered = await post(`/api/enterprise/${organizationId}/gaming/tournaments/${created.tournament.id}/registrations`, {
      businessPartyId: customerId,
      seedNumber: 1,
      idempotencyKey: `owner-e2e-645-registration-${Date.now()}`,
    });
    expect(registered.registration?.businessPartyId).toBe(customerId);

    const assignment = await post(`/api/enterprise/${organizationId}/gaming/tournaments/${created.tournament.id}/stations`, {
      stationId,
      slotStartAt: start.toISOString(),
      slotEndAt: end.toISOString(),
      label: "Finale OWNER E2E",
    });
    expect(assignment.assignment?.stationId).toBe(stationId);

    const detail = await get(`/api/enterprise/${organizationId}/gaming/tournaments/${created.tournament.id}`);
    expect(detail.registrations?.some((item) => item.businessPartyId === customerId && item.paymentStatus === "FREE")).toBeTruthy();
    expect(detail.stations?.some((item) => item.stationId === stationId && item.asset?.id === assetId)).toBeTruthy();
  });

  test("incident Actif remonte au dashboard sans référentiel Gaming parallèle", async () => {
    const incident = await post(`/api/enterprise/${organizationId}/assets/${assetId}/incidents`, {
      incidentType: "DAMAGE",
      title: "OWNER E2E #645 incident Gaming",
      description: "Incident créé dans le domaine Actifs pour valider l’intégration Gaming.",
      severity: "HIGH",
    });
    expect(incident.incident?.assetId).toBe(assetId);

    const dashboard = await get(`/api/enterprise/${organizationId}/gaming/dashboard?periodDays=30`);
    expect(dashboard.operational?.stationCount).toBeGreaterThanOrEqual(1);
    expect(dashboard.assetSignals?.incidentsOpen).toBeGreaterThanOrEqual(1);
    expect(dashboard.stations?.some((item) => item.assetId === assetId && String(item.assetDeepLink).includes(assetId))).toBeTruthy();
  });

  test("deep-link Actifs ouvre directement l’actif Gaming ciblé", async () => {
    await page.goto(`${baseUrl}/enterprise-modules/ASSETS_MAINTENANCE?assetId=${encodeURIComponent(assetId)}`, { waitUntil: "networkidle" });
    const assetDialog = page.getByRole("dialog");
    await expect(assetDialog).toBeVisible();
    await expect(assetDialog.getByRole("heading", { name: "E2E-GAME-645 · Poste Gaming OWNER E2E #645", exact: true })).toBeVisible();
    await expect(assetDialog.getByText("OWNER E2E #645 incident Gaming", { exact: false })).toBeVisible();
  });

  test("rapport canonique EnterpriseReport et exportable", async () => {
    const generated = await post(`/api/enterprise/${organizationId}/gaming/reports`, {
      reportType: "GAMING_STATION_UTILIZATION",
      periodDays: 30,
      idempotencyKey: `owner-e2e-645-report-${Date.now()}`,
    });
    expect(generated.report?.id).toBeTruthy();
    expect(generated.report?.sourceModule).toBe("GAMING_REPORTS");
    const persisted = await prisma.enterpriseReport.findFirst({ where: { id: generated.report.id, organizationId } });
    expect(persisted?.sourcePolicyCode).toBe("GAMING_CANONICAL_V1");

    const list = await get(`/api/enterprise/${organizationId}/gaming/reports?page=1&pageSize=20`);
    expect(list.items?.some((item) => item.id === generated.report.id)).toBeTruthy();
  });

  test("workspaces #645 restent utilisables à 390 px", async () => {
    await expectResponsiveModule("/enterprise-modules/GAMING_DASHBOARD");
    await expectResponsiveModule("/enterprise-modules/GAMING_TOURNAMENTS");
    await expectResponsiveModule("/enterprise-modules/GAMING_REPORTS");
  });
});
