import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const approverEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const customerId = "e2e-baseline-business-party";
const assetId = "e2e-gaming-asset-693";
const stationId = "e2e-gaming-station-693";
const unitId = "e2e-gaming-uom-693";
const serviceId = "e2e-gaming-service-693";
let adminUserId = "";
let approverUserId = "";
let context;

const requiredModules = [
  "CRM_CUSTOMERS",
  "CATALOG",
  "SITES_WAREHOUSES",
  "SUPPLIERS_PURCHASES",
  "ASSETS_MAINTENANCE",
  "FINANCE_OVERVIEW",
  "FINANCE_TREASURY",
  "FINANCE_PAYMENTS",
  "FINANCE_RECEIVABLES",
  "GAMING_STATIONS",
  "GAMING_SESSIONS",
  "GAMING_CHECKOUT",
];

async function prepareTenant() {
  const [admin, approver] = await Promise.all([
    prisma.user.findUnique({ where: { email: adminEmail } }),
    prisma.user.findUnique({ where: { email: approverEmail } }),
  ]);
  if (!admin || !approver) throw new Error("Issue #693 requires the canonical ERP authenticated seed.");
  adminUserId = admin.id;
  approverUserId = approver.id;

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      sectorCode: "HOSPITALITY_EVENTS",
      status: "ACTIVE",
      deletedAt: null,
      organizationType: "CLIENT",
      country: "CD",
      timezone: "Africa/Kinshasa",
    },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: approver.id } },
    update: { role: "MANAGER", status: "ACTIVE", removedAt: null, joinedAt: new Date() },
    create: {
      id: "e2e-gaming-approver-membership-693",
      organizationId,
      userId: approver.id,
      role: "MANAGER",
      status: "ACTIVE",
      joinedAt: new Date(),
    },
  });

  await prisma.enterpriseBusinessSubtypeSelection.upsert({
    where: { organizationId },
    update: {
      sectorCode: "HOSPITALITY_EVENTS",
      businessSubtypeCode: "GAMING_LOUNGE",
      selectedByUserId: admin.id,
      source: "OWNER_E2E_693",
    },
    create: {
      organizationId,
      sectorCode: "HOSPITALITY_EVENTS",
      businessSubtypeCode: "GAMING_LOUNGE",
      selectedByUserId: admin.id,
      source: "OWNER_E2E_693",
    },
  });

  for (const [index, moduleCode] of requiredModules.entries()) {
    await prisma.enterpriseModule.upsert({
      where: { organizationId_moduleCode: { organizationId, moduleCode } },
      update: { isEnabled: true, requiresPlanLevel: moduleCode === "CATALOG" || moduleCode === "CRM_CUSTOMERS" ? "STARTER" : "BUSINESS" },
      create: {
        organizationId,
        moduleCode,
        labelFr: moduleCode,
        labelEn: moduleCode,
        moduleCategory: "E2E",
        isEnabled: true,
        isCore: false,
        requiresPlanLevel: moduleCode === "CATALOG" || moduleCode === "CRM_CUSTOMERS" ? "STARTER" : "BUSINESS",
        sortOrder: 1600 + index,
      },
    });
  }

  await prisma.enterpriseUnitOfMeasure.upsert({
    where: { organizationId_code: { organizationId, code: "SESSION-693" } },
    update: { name: "Session Gaming QA #693", symbol: "session", status: "ACTIVE", archivedAt: null },
    create: {
      id: unitId,
      organizationId,
      code: "SESSION-693",
      name: "Session Gaming QA #693",
      symbol: "session",
      category: "SERVICE",
      decimalScale: 0,
      status: "ACTIVE",
      isSystem: false,
      createdByUserId: admin.id,
    },
  });

  await prisma.enterpriseCatalogItem.upsert({
    where: { organizationId_code: { organizationId, code: "GAMING-SERVICE-693" } },
    update: {
      name: "Session Gaming QA #693",
      normalizedName: "session gaming qa 693",
      itemType: "SERVICE",
      unitOfMeasureId: unitId,
      currency: "CDF",
      status: "ACTIVE",
      trackInventory: false,
      archivedAt: null,
      updatedByUserId: admin.id,
    },
    create: {
      id: serviceId,
      organizationId,
      code: "GAMING-SERVICE-693",
      name: "Session Gaming QA #693",
      normalizedName: "session gaming qa 693",
      itemType: "SERVICE",
      unitOfMeasureId: unitId,
      currency: "CDF",
      status: "ACTIVE",
      trackInventory: false,
      createdByUserId: admin.id,
    },
  });

  await prisma.enterpriseAsset.upsert({
    where: { id: assetId },
    update: {
      organizationId,
      code: "E2E-GAME-693",
      name: "Poste Gaming checkout #693",
      status: "ACTIVE",
      condition: "GOOD",
      archivedAt: null,
      updatedByUserId: admin.id,
    },
    create: {
      id: assetId,
      organizationId,
      code: "E2E-GAME-693",
      name: "Poste Gaming checkout #693",
      status: "ACTIVE",
      condition: "GOOD",
      createdByUserId: admin.id,
    },
  });

  await prisma.enterpriseGamingStationProfile.upsert({
    where: { organizationId_assetId: { organizationId, assetId } },
    update: {
      stationCode: "E2E-GS-693",
      displayName: "PS4 checkout #693",
      consoleFamily: "PlayStation",
      maxPlayers: 4,
      status: "AVAILABLE",
      archivedAt: null,
      updatedByUserId: admin.id,
    },
    create: {
      id: stationId,
      organizationId,
      assetId,
      stationCode: "E2E-GS-693",
      displayName: "PS4 checkout #693",
      consoleFamily: "PlayStation",
      maxPlayers: 4,
      status: "AVAILABLE",
      createdByUserId: admin.id,
    },
  });
}

async function signIn() {
  const response = await context.request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email: adminEmail, password: adminPassword, organizationId, next: "/enterprise-modules/GAMING_CHECKOUT" },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function createEndedSession({ businessPartyId, suffix }) {
  const now = new Date();
  return prisma.enterpriseGamingSession.create({
    data: {
      organizationId,
      reference: `GS-E2E-693-${suffix}`,
      stationId,
      businessPartyId,
      serviceCatalogItemId: serviceId,
      status: "TO_CHECKOUT",
      startedAt: new Date(now.getTime() - 10 * 60 * 1000),
      endedAt: now,
      billableSeconds: 600,
      pricingSnapshotJson: { serviceName: "Session Gaming QA #693" },
      currency: "CDF",
      quotedAmount: 500,
      finalAmount: 500,
      idempotencyKey: `e2e-693-session-${suffix}`,
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
    },
  });
}

async function checkout(sessionId, suffix) {
  const response = await context.request.post(`${baseUrl}/api/enterprise/${organizationId}/gaming/checkouts`, {
    data: {
      sessionId,
      invoiceApproverUserId: approverUserId,
      idempotencyKey: `e2e-693-checkout-${suffix}`,
      extraItems: [],
    },
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/enterprise-modules/GAMING_CHECKOUT`,
    },
  });
  const body = await response.json().catch(() => null);
  expect(response.status(), JSON.stringify(body)).toBe(201);
  expect(body?.checkout?.status).toBe("INVOICE_PENDING");
  expect(body?.invoice?.status).toBe("PENDING_APPROVAL");
  expect(body?.invoice?.items).toHaveLength(1);
  expect(body?.invoice?.items?.[0]?.organizationId).toBe(organizationId);
  expect(body?.invoice?.items?.[0]?.catalogItemId).toBe(serviceId);
  return body;
}

test.describe.serial("Issue #693 Gaming checkout invoice nested write", () => {
  test.beforeAll(async ({ browser }) => {
    await prepareTenant();
    context = await browser.newContext();
    await signIn();
  });

  test.afterAll(async () => {
    await context?.close();
    await prisma.$disconnect();
  });

  test("walk-in checkout creates Finance invoice and propagates tenant to invoice line", async () => {
    const suffix = `walkin-${Date.now()}`;
    const session = await createEndedSession({ businessPartyId: null, suffix });
    const result = await checkout(session.id, suffix);

    const walkIn = await prisma.enterpriseBusinessParty.findUnique({
      where: {
        organizationId_migrationKey: {
          organizationId,
          migrationKey: "SYSTEM:GAMING:WALK_IN_CUSTOMER",
        },
      },
      select: { id: true },
    });
    expect(walkIn?.id).toBeTruthy();
    expect(result.invoice.businessPartyId).toBe(walkIn?.id);
  });

  test("CRM customer checkout creates Finance invoice without nested organizationId payload", async () => {
    const customer = await prisma.enterpriseBusinessParty.findFirst({
      where: {
        id: customerId,
        organizationId,
        status: "ACTIVE",
        archivedAt: null,
        roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } },
      },
      select: { id: true },
    });
    expect(customer?.id).toBe(customerId);

    const suffix = `crm-${Date.now()}`;
    const session = await createEndedSession({ businessPartyId: customerId, suffix });
    const result = await checkout(session.id, suffix);
    expect(result.invoice.businessPartyId).toBe(customerId);
  });
});
