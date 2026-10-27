import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const reviewerEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const reviewerPassword = process.env.E2E_USER_PASSWORD || "E2eUser2026!";
const runId = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
const scope = `E2E910_${runId}`;
const state = {};

const creditApi = `/api/enterprise/${organizationId}/relationship-benefits/credits`;
const benefitApi = `/api/enterprise/${organizationId}/relationship-benefits`;
const readNumber = (v) => Number(v?.toString?.() ?? v ?? 0);

async function signIn(browser, email, password, next = "/enterprise-relationship-benefits") {
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email, password, organizationId, next },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in`, "x-forwarded-for": "203.0.113.91" },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.goto(next);
  return { page, context };
}
async function post(page, path, data) {
  const response = await page.context().request.post(path, {
    data, headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-relationship-benefits` },
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}
async function patch(page, path, data) {
  const response = await page.context().request.patch(path, {
    data, headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-relationship-benefits` },
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}
test.describe.serial("#910 manual Retail credit uses the canonical ledger and independent Finance approval", () => {
  test.beforeAll(async () => {
    const [admin, reviewer] = await Promise.all([
      prisma.user.findUnique({ where: { email: adminEmail } }),
      prisma.user.findUnique({ where: { email: reviewerEmail } }),
    ]);
    expect(admin && reviewer).toBeTruthy();
    state.adminId = admin.id;
    state.reviewerId = reviewer.id;
    const reviewerMember = await prisma.organizationMember.findFirst({
      where: { organizationId, userId: reviewer.id, status: "ACTIVE", role: "OWNER" },
    });
    expect(reviewerMember, "Shop 2 commercial seed must create an independent OWNER reviewer").toBeTruthy();

    const customer = await prisma.enterpriseBusinessParty.create({
      data: {
        organizationId, code: scope, partyType: "PERSON",
        legalName: "Client Crédit Relationnel E2E #910",
        normalizedName: scope.toLowerCase(), status: "ACTIVE", createdByUserId: admin.id,
        roles: { create: { organizationId, roleCode: "CUSTOMER", status: "ACTIVE", createdByUserId: admin.id } },
      },
    });
    state.customerId = customer.id;
    const person = await prisma.enterprisePersonIdentity.create({
      data: { organizationId, displayName: "Client lien #910", status: "ACTIVE", createdByUserId: admin.id },
    });
    state.personId = person.id;
    const reference = await prisma.enterprisePersonBusinessReference.create({
      data: { organizationId, businessPartyId: customer.id, personIdentityId: person.id,
        relationType: "CUSTOMER", status: "ACTIVE", createdByUserId: admin.id },
    });
    state.referenceId = reference.id;
    const link = await prisma.enterpriseIdentityLink.create({
      data: { organizationId, personIdentityId: person.id, userId: reviewer.id,
        origin: "ENTERPRISE", requestedRelationType: "CUSTOMER", status: "ACTIVE",
        initiatedByUserId: admin.id, reviewedByUserId: admin.id, purpose: "Recette #910",
        consentTextVersion: "enterprise-identity-consent-v1", userDecisionAt: new Date(),
        organizationDecisionAt: new Date(), activatedAt: new Date() },
    });
    state.linkId = link.id;
    const document = await prisma.enterpriseDocument.create({
      data: { organizationId, title: "Justificatif crédit E2E #910",
        documentType: "OTHER", status: "ACTIVE", visibility: "ORGANIZATION",
        currentVersion: 1, createdByUserId: admin.id,
        versions: { create: { organizationId, versionNumber: 1,
          fileName: "justificatif-credit-e2e.pdf", mimeType: "application/pdf",
          sizeBytes: 64, storageBucket: "e2e-fixtures",
          storagePath: `e2e/${runId}/justificatif.pdf`, uploadedByUserId: admin.id } } },
    });
    state.documentId = document.id;
  });

  test.afterAll(async () => {
    // This workflow uses a throwaway PostgreSQL tenant; clean identifiers
    // without rewriting any issued immutable Finance entries.
    await prisma.$disconnect();
  });

  test("rejects self-approval and double replay, credits once, then posts a compensating reversal", async ({ browser }) => {
    const maker = await signIn(browser, adminEmail, adminPassword);
    const checker = await signIn(browser, reviewerEmail, reviewerPassword);
    try {
      const rule = await post(maker.page, benefitApi, {
        code: scope, nameFr: "Crédit manuel contrôlé #910", nameEn: "Controlled manual credit #910",
        descriptionFr: "Un crédit fixe contrôlé exige un justificatif et un autre valideur.",
        descriptionEn: "A fixed grant requires evidence and an independent approver.",
        benefitType: "CREDIT", assignmentMode: "MANUAL", relationTypes: ["CUSTOMER"],
        identityLinkIds: [state.linkId], valueType: "AMOUNT", valueDecimal: 12,
        currencyCode: "USD", actionCode: "NONE", targetModuleCode: "RETAIL_POS",
        stackable: false, status: "ACTIVE", usageLimitTotal: 1,
      });
      expect(rule.status, JSON.stringify(rule.body)).toBe(201);
      const benefitId = rule.body.benefit.id;
      const key = randomUUID();
      const requestData = {
        benefitId, identityLinkId: state.linkId, businessPartyId: state.customerId,
        documentId: state.documentId, reason: "Geste commercial explicite avec pièce justificative E2E",
        idempotencyKey: key,
      };
      const request = await post(maker.page, creditApi, requestData);
      expect(request.status, JSON.stringify(request.body)).toBe(201);
      expect(request.body.usage.status).toBe("REQUESTED");
      const usageId = request.body.usage.id;
      const once = await post(maker.page, creditApi, requestData);
      expect(once.body.usage.id).toBe(usageId);
      const differentCustomerReplay = await post(maker.page, creditApi, { ...requestData, businessPartyId: "another-customer" });
      expect(differentCustomerReplay.status).toBe(409);
      const preEarn = await prisma.enterpriseRetailStoredValueEntry.count({
        where: { organizationId, idempotencyKey: `credit:relationship:usage:${usageId}` },
      });
      expect(preEarn).toBe(0);

      const ownDecision = await patch(maker.page, `${creditApi}/${usageId}`, {
        revision: 1, decision: "APPROVE", reason: "Tentative interdite d'auto-approbation",
      });
      expect(ownDecision.status, JSON.stringify(ownDecision.body)).toBe(403);
      const approved = await patch(checker.page, `${creditApi}/${usageId}`, {
        revision: 1, decision: "APPROVE", reason: "Justificatif contrôlé, attribution autorisée par Finance",
      });
      expect(approved.status, JSON.stringify(approved.body)).toBe(200);
      expect(approved.body.usage.status).toBe("CONSUMED");

      const credit = await prisma.enterpriseRetailStoredValueEntry.findFirst({
        where: { organizationId, idempotencyKey: `credit:relationship:usage:${usageId}`, entryType: "EARN" },
      });
      expect(credit).toBeTruthy();
      expect(readNumber(credit.amount)).toBe(12);
      const account = await prisma.enterpriseRetailStoredValueAccount.findUniqueOrThrow({ where: { id: credit.accountId } });
      expect(account.customerBusinessPartyId).toBe(state.customerId);
      expect(account.currencyCode).toBe("USD");
      expect(readNumber(account.balance)).toBe(12);
      const posting = await prisma.enterpriseJournalEntry.findFirst({
        where: { organizationId, sourceEntityType: "EnterpriseRelationshipBenefitUsage", sourceEntityId: usageId,
          postingEvent: "RETAIL_RELATIONSHIP_CREDIT_GRANTED", status: "POSTED" },
      });
      expect(posting).toBeTruthy();
      expect(readNumber(posting.totalDebit)).toBe(12);
      expect(readNumber(posting.totalCredit)).toBe(12);
      const duplicate = await patch(checker.page, `${creditApi}/${usageId}`, {
        revision: 1, decision: "APPROVE", reason: "Deuxième attribution interdite",
      });
      expect(duplicate.status).toBe(409);
      expect(await prisma.enterpriseRetailStoredValueEntry.count({
        where: { organizationId, idempotencyKey: `credit:relationship:usage:${usageId}` },
      })).toBe(1);

      const reversed = await patch(checker.page, `${creditApi}/${usageId}`, {
        revision: approved.body.usage.revision, decision: "REVERSE",
        reason: "Reprise compensatoire avec piste d'audit pour E2E",
      });
      expect(reversed.status, JSON.stringify(reversed.body)).toBe(200);
      expect(reversed.body.usage.status).toBe("CANCELLED");
      const balance = await prisma.enterpriseRetailStoredValueAccount.findUniqueOrThrow({ where: { id: account.id } });
      expect(readNumber(balance.balance)).toBe(0);
      expect(await prisma.enterpriseRetailStoredValueEntry.count({
        where: { organizationId, idempotencyKey: `credit:relationship:reversal:${usageId}`, entryType: "REVERSAL" },
      })).toBe(1);
      const reversalPosting = await prisma.enterpriseJournalEntry.findFirst({
        where: { organizationId, sourceEntityType: "EnterpriseRelationshipBenefitUsage", sourceEntityId: usageId,
          postingEvent: "RETAIL_RELATIONSHIP_CREDIT_REVERSED", status: "POSTED" },
      });
      expect(reversalPosting).toBeTruthy();
      expect(readNumber(reversalPosting.totalCredit)).toBe(12);
      expect(readNumber(reversalPosting.totalDebit)).toBe(12);
    } finally {
      await maker.context.close();
      await checker.context.close();
    }
  });
});
