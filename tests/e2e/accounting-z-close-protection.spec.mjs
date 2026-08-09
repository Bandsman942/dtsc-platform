import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const reviewerEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const reviewerPassword = process.env.E2E_USER_PASSWORD || "E2eUser2026!";
const accountingPath = "/enterprise-modules/FINANCE_ACCOUNTING";

async function signIn(page, { email = adminEmail, password = adminPassword } = {}) {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email, password, organizationId, next: accountingPath },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `Accounting close sign-in failed: ${JSON.stringify(body)}`).toBeTruthy();
  return body;
}

async function apiPost(page, path, data) {
  const response = await page.context().request.post(`${baseUrl}${path}`, {
    data,
    headers: { origin: baseUrl, referer: `${baseUrl}${accountingPath}` },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

test.describe.serial("Accounting period close and historical protection", () => {
  test.afterAll(async () => {
    const reviewer = await prisma.user.findUnique({ where: { email: reviewerEmail } });
    if (reviewer) await prisma.organizationMember.deleteMany({ where: { organizationId, userId: reviewer.id } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  test("closes August then rejects a new posting without rewriting the historical entry", async ({ page }) => {
    const [admin, reviewer, period, chart, originalEntry] = await Promise.all([
      prisma.user.findUnique({ where: { email: adminEmail } }),
      prisma.user.findUnique({ where: { email: reviewerEmail } }),
      prisma.enterpriseFiscalPeriod.findFirst({ where: { organizationId, code: "2026-08-E2E" } }),
      prisma.enterpriseChartOfAccounts.findFirst({ where: { organizationId, status: "ACTIVE" } }),
      prisma.enterpriseJournalEntry.findFirst({
        where: { organizationId, sourceEntityType: "EnterpriseSalesInvoice", status: "POSTED" },
        orderBy: { postedAt: "asc" },
        include: { lines: { orderBy: { lineNumber: "asc" } } },
      }),
    ]);
    expect(admin).toBeTruthy();
    expect(reviewer).toBeTruthy();
    expect(period).toBeTruthy();
    expect(chart?.templateCode).toBe("OHADA_SYSCOHADA@0.1.0");
    expect(originalEntry).toBeTruthy();
    expect(originalEntry.fiscalPeriodId).toBe(period.id);

    const originalSnapshot = {
      id: originalEntry.id,
      status: originalEntry.status,
      totalDebit: originalEntry.totalDebit.toString(),
      totalCredit: originalEntry.totalCredit.toString(),
      lines: originalEntry.lines.map((line) => ({ id: line.id, ledgerAccountId: line.ledgerAccountId, debit: line.debit.toString(), credit: line.credit.toString() })),
    };

    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId: reviewer.id } },
      update: { role: "OWNER", status: "ACTIVE", joinedAt: new Date(), removedAt: null },
      create: { organizationId, userId: reviewer.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
    });

    await signIn(page);
    const prepared = await apiPost(page, `/api/enterprise/${organizationId}/financial-close`, { fiscalPeriodId: period.id });
    expect(prepared.response.status(), JSON.stringify(prepared.body)).toBe(201);
    let close = prepared.body.close;
    expect(close.status).toBe("DRAFT");

    const submitted = await apiPost(page, `/api/enterprise/${organizationId}/financial-close/${close.id}/transition`, { action: "SUBMIT", revision: close.revision });
    expect(submitted.response.ok(), JSON.stringify(submitted.body)).toBeTruthy();
    close = submitted.body.close;
    expect(close.status).toBe("PENDING_APPROVAL");
    expect((await prisma.enterpriseFiscalPeriod.findUniqueOrThrow({ where: { id: period.id } })).status).toBe("SOFT_CLOSED");

    await page.context().clearCookies();
    await signIn(page, { email: reviewerEmail, password: reviewerPassword });
    const approved = await apiPost(page, `/api/enterprise/${organizationId}/financial-close/${close.id}/transition`, { action: "APPROVE", revision: close.revision });
    expect(approved.response.ok(), JSON.stringify(approved.body)).toBeTruthy();
    close = approved.body.close;
    expect(close.status).toBe("APPROVED");

    const closed = await apiPost(page, `/api/enterprise/${organizationId}/financial-close/${close.id}/transition`, { action: "CLOSE", revision: close.revision });
    expect(closed.response.ok(), JSON.stringify(closed.body)).toBeTruthy();
    close = closed.body.close;
    expect(close.status).toBe("CLOSED");
    const closedPeriod = await prisma.enterpriseFiscalPeriod.findUniqueOrThrow({ where: { id: period.id } });
    expect(closedPeriod.status).toBe("CLOSED");
    expect(closedPeriod.closedAt).toBeTruthy();

    await page.context().clearCookies();
    await signIn(page);
    const created = await apiPost(page, `/api/enterprise/${organizationId}/sales-invoices`, {
      businessPartyId: "e2e-baseline-business-party",
      invoiceDate: "2026-08-10T12:00:00.000Z",
      dueDate: "2026-08-31T12:00:00.000Z",
      currencyCode: "XAF",
      notes: "Must not post into the closed acceptance period",
      items: [{ description: "Closed-period service", quantity: "1", unitPrice: "5000", discountAmount: "0" }],
    });
    expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
    let blockedInvoice = created.body.invoice;

    const submittedInvoice = await apiPost(page, `/api/enterprise/${organizationId}/sales-invoices/${blockedInvoice.id}/transition`, { action: "SUBMIT", revision: blockedInvoice.revision });
    expect(submittedInvoice.response.ok(), JSON.stringify(submittedInvoice.body)).toBeTruthy();
    blockedInvoice = submittedInvoice.body.invoice;

    await page.context().clearCookies();
    await signIn(page, { email: reviewerEmail, password: reviewerPassword });
    const approvedInvoice = await apiPost(page, `/api/enterprise/${organizationId}/sales-invoices/${blockedInvoice.id}/transition`, { action: "APPROVE", revision: blockedInvoice.revision });
    expect(approvedInvoice.response.ok(), JSON.stringify(approvedInvoice.body)).toBeTruthy();
    blockedInvoice = approvedInvoice.body.invoice;

    await page.context().clearCookies();
    await signIn(page);
    const rejectedIssue = await apiPost(page, `/api/enterprise/${organizationId}/sales-invoices/${blockedInvoice.id}/transition`, { action: "ISSUE", revision: blockedInvoice.revision });
    expect(rejectedIssue.response.status()).toBe(409);
    expect(JSON.stringify(rejectedIssue.body)).toContain("FINANCE_PERIOD_CLOSED");

    const blockedEntryCount = await prisma.enterpriseJournalEntry.count({ where: { organizationId, sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: blockedInvoice.id, status: "POSTED" } });
    expect(blockedEntryCount).toBe(0);

    const historical = await prisma.enterpriseJournalEntry.findUniqueOrThrow({ where: { id: originalSnapshot.id }, include: { lines: { orderBy: { lineNumber: "asc" } } } });
    expect(historical.status).toBe(originalSnapshot.status);
    expect(historical.totalDebit.toString()).toBe(originalSnapshot.totalDebit);
    expect(historical.totalCredit.toString()).toBe(originalSnapshot.totalCredit);
    expect(historical.lines.map((line) => ({ id: line.id, ledgerAccountId: line.ledgerAccountId, debit: line.debit.toString(), credit: line.credit.toString() }))).toEqual(originalSnapshot.lines);

    const completedClose = await prisma.enterpriseFinancialClose.findUniqueOrThrow({ where: { id: close.id } });
    expect(completedClose.status).toBe("CLOSED");
    expect(completedClose.requestedByUserId).toBe(admin.id);
    expect(completedClose.approvedByUserId).toBe(reviewer.id);
    expect(completedClose.closedByUserId).toBe(reviewer.id);
  });
});
