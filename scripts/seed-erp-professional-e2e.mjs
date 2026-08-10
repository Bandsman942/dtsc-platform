import { createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const organizationCode = process.env.E2E_ORGANIZATION_CODE || "e2e-erp-professional";
const adminEmail = (process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test").toLowerCase();
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const userEmail = (process.env.E2E_USER_EMAIL || "erp-user@example.test").toLowerCase();
const userPassword = process.env.E2E_USER_PASSWORD || "E2eUser2026!";
const expiredToken = process.env.E2E_EXPIRED_INVITATION_TOKEN || "e2e-expired-invitation-token";

function hashPassword(password) {
  const iterations = 210_000;
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2:${iterations}:${salt}:${hash}`;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: "Admin ERP E2E", passwordHash: hashPassword(adminPassword), role: "CLIENT", status: "ACTIVE", locale: "fr", startPage: "/dashboard" },
    create: { id: "e2e-erp-admin-user", name: "Admin ERP E2E", email: adminEmail, passwordHash: hashPassword(adminPassword), role: "CLIENT", status: "ACTIVE", locale: "fr", startPage: "/dashboard" },
  });

  const user = await prisma.user.upsert({
    where: { email: userEmail },
    update: { name: "Utilisateur ERP E2E", passwordHash: hashPassword(userPassword), role: "CLIENT", status: "ACTIVE", locale: "fr", startPage: "/dashboard" },
    create: { id: "e2e-erp-global-user", name: "Utilisateur ERP E2E", email: userEmail, passwordHash: hashPassword(userPassword), role: "CLIENT", status: "ACTIVE", locale: "fr", startPage: "/dashboard" },
  });

  const organization = await prisma.organization.upsert({
    where: { id: organizationId },
    update: { name: "Entreprise ERP E2E", slug: organizationCode, status: "ACTIVE", organizationType: "CLIENT", sectorCode: null, createdByDtscUserId: admin.id, deletedAt: null },
    create: { id: organizationId, name: "Entreprise ERP E2E", slug: organizationCode, status: "ACTIVE", organizationType: "CLIENT", timezone: "Africa/Kinshasa", createdByDtscUserId: admin.id },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: admin.id } },
    update: { role: "OWNER", status: "ACTIVE", joinedAt: new Date(), removedAt: null },
    create: { id: "e2e-erp-owner-membership", organizationId, userId: admin.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
  });

  const plan = await prisma.billingPlan.upsert({
    where: { id: "e2e-enterprise-plan" },
    update: { name: "Enterprise E2E", slug: "enterprise", isActive: true },
    create: {
      id: "e2e-enterprise-plan",
      name: "Enterprise E2E",
      slug: "enterprise",
      description: "Plan éphémère utilisé uniquement par les tests navigateur authentifiés.",
      priceUsd: 0,
      dailyMessageLimit: 1000,
      dailyTokenLimit: 1_000_000,
      maxDocuments: 100,
      isActive: true,
      sortOrder: 999,
    },
  });

  await prisma.organizationSubscription.deleteMany({ where: { organizationId } });
  await prisma.organizationSubscription.create({
    data: {
      id: "e2e-erp-subscription",
      organizationId,
      planId: plan.id,
      status: "ACTIVE",
      startedAt: new Date(Date.now() - 86_400_000),
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      createdByDtscUserId: admin.id,
      updatedByDtscUserId: admin.id,
    },
  });

  for (const [index, moduleCode] of ["CRM_CUSTOMERS", "CATALOG", "SITES_WAREHOUSES", "CRM_PIPELINE", "CONTRACTS", "DOCUMENTS"].entries()) {
    await prisma.enterpriseModule.upsert({
      where: { organizationId_moduleCode: { organizationId, moduleCode } },
      update: { isEnabled: true, requiresPlanLevel: moduleCode === "CRM_CUSTOMERS" || moduleCode === "CATALOG" ? "STARTER" : "BUSINESS" },
      create: {
        organizationId,
        moduleCode,
        labelFr: moduleCode,
        labelEn: moduleCode,
        moduleCategory: "E2E",
        isEnabled: true,
        isCore: moduleCode === "CRM_CUSTOMERS",
        requiresPlanLevel: moduleCode === "CRM_CUSTOMERS" || moduleCode === "CATALOG" ? "STARTER" : "BUSINESS",
        sortOrder: index,
      },
    });
  }

  await prisma.enterpriseIdentityConsentRecord.deleteMany({ where: { organizationId } });
  await prisma.enterpriseIdentityLinkEvent.deleteMany({ where: { organizationId } });
  await prisma.enterpriseIdentityLink.deleteMany({ where: { organizationId } });
  await prisma.enterprisePersonBusinessReference.deleteMany({ where: { organizationId } });
  await prisma.enterprisePersonIdentity.deleteMany({ where: { organizationId } });
  await prisma.enterpriseBusinessPartyContact.deleteMany({ where: { organizationId } });
  await prisma.enterpriseBusinessPartyAddress.deleteMany({ where: { organizationId } });
  await prisma.enterpriseBusinessPartyRole.deleteMany({ where: { organizationId } });
  await prisma.enterpriseBusinessParty.deleteMany({ where: { organizationId } });
  await prisma.notification.deleteMany({ where: { userId: { in: [admin.id, user.id] } } });

  const baselineParty = await prisma.enterpriseBusinessParty.create({
    data: {
      id: "e2e-baseline-business-party",
      organizationId,
      partyType: "PERSON",
      legalName: "Fiche de référence E2E",
      displayName: "Fiche de référence E2E",
      normalizedName: "fiche de reference e2e",
      code: "E2E-REF-001",
      primaryEmail: user.email,
      status: "ACTIVE",
      createdByUserId: admin.id,
      roles: { create: { roleCode: "CUSTOMER", status: "ACTIVE", createdByUserId: admin.id } },
    },
  });

  const expiredPerson = await prisma.enterprisePersonIdentity.create({
    data: { id: "e2e-expired-person-identity", organizationId, displayName: "Invitation expirée E2E", primaryEmail: user.email, createdByUserId: admin.id },
  });
  await prisma.enterprisePersonBusinessReference.create({
    data: { id: "e2e-expired-business-reference", organizationId, personIdentityId: expiredPerson.id, businessPartyId: baselineParty.id, relationType: "PARTNER", status: "ACTIVE", createdByUserId: admin.id },
  });
  await prisma.enterpriseIdentityLink.create({
    data: {
      id: "e2e-expired-identity-link",
      organizationId,
      personIdentityId: expiredPerson.id,
      userId: user.id,
      origin: "ENTERPRISE",
      requestedRelationType: "PARTNER",
      status: "INVITATION_PENDING",
      initiatedByUserId: admin.id,
      purpose: "Vérifier automatiquement l’expiration périodique des invitations.",
      consentTextVersion: "enterprise-identity-consent-v1",
      invitationEmailDigest: digest(user.email),
      invitationTokenDigest: digest(expiredToken),
      invitationSentAt: new Date(Date.now() - 10 * 86_400_000),
      expiresAt: new Date(Date.now() - 86_400_000),
    },
  });

  console.log(JSON.stringify({ organizationId: organization.id, organizationCode: organization.slug, adminEmail, userEmail, expiredToken }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
