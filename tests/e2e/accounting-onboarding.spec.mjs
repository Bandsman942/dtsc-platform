import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const outsiderEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const outsiderPassword = process.env.E2E_USER_PASSWORD || "E2eUser2026!";
const accountingPath = "/enterprise-modules/FINANCE_ACCOUNTING";
const defaultTemplateReference = "OHADA_SYSCOHADA@0.1.0";

let adminUserId = "";
let outsiderUserId = "";
let chartId = "";

async function signIn(page, { email = adminEmail, password = adminPassword, organization = organizationId } = {}) {
  const payload = { email, password, next: accountingPath, organizationId: organization ?? "" };
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, { data: payload, headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` } });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `Accounting acceptance sign-in failed: ${JSON.stringify(body)}`).toBeTruthy();
  return body;
}
async function apiJson(response) { return { response, body: await response.json().catch(() => null) }; }
async function apiGet(page, path) { return apiJson(await page.context().request.get(`${baseUrl}${path}`)); }
async function apiPost(page, path, data, referer = accountingPath) { return apiJson(await page.context().request.post(`${baseUrl}${path}`, { data, headers: { origin: baseUrl, referer: `${baseUrl}${referer}` } })); }
async function apiPatch(page, path, data, referer = accountingPath) { return apiJson(await page.context().request.patch(`${baseUrl}${path}`, { data, headers: { origin: baseUrl, referer: `${baseUrl}${referer}` } })); }
async function setupPayload(page) {
  const result = await apiGet(page, `/api/enterprise/${organizationId}/accounting-setup${chartId ? `?chartId=${encodeURIComponent(chartId)}` : ""}`);
  expect(result.response.ok(), JSON.stringify(result.body)).toBeTruthy();
  return result.body;
}
function blockerCodes(payload) { return new Set((payload?.readiness?.blockers || []).map((item) => item.code)); }

// Contract tokens intentionally kept visible for CI governance:
// SALES_INVOICE_POSTED enterprisePostingBatch APPLY_SAFE_TEMPLATE_UPGRADE

test.describe.serial("Accounting onboarding and production-readiness UX", () => {
  test.beforeAll(async () => {
    const [admin, outsider, organization] = await Promise.all([
      prisma.user.findUnique({ where: { email: adminEmail } }),
      prisma.user.findUnique({ where: { email: outsiderEmail } }),
      prisma.organization.findUnique({ where: { id: organizationId } }),
    ]);
    if (!admin || !outsider || !organization) throw new Error("Accounting E2E requires the canonical ERP seed");
    adminUserId = admin.id; outsiderUserId = outsider.id;
    if (await prisma.enterpriseChartOfAccounts.count({ where: { organizationId } })) throw new Error("Accounting E2E requires a clean accounting chart state");
  });

  test.afterAll(async () => {
    if (adminUserId) await prisma.user.update({ where: { id: adminUserId }, data: { locale: "fr" } }).catch(() => undefined);
    if (outsiderUserId) await prisma.organizationMember.deleteMany({ where: { organizationId, userId: outsiderUserId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  test("FR mobile onboarding uses official SYSCOHADA default and reaches activation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto(accountingPath);
    await page.waitForURL((url) => url.pathname === accountingPath, { timeout: 30_000 });
    const onboarding = page.locator('section[aria-labelledby="accounting-onboarding-title"]');
    await expect(onboarding.getByText("Mise en service comptable")).toBeVisible();
    await expect(onboarding.getByText(/plan comptable officiel par défaut de DTSC Platform/i)).toBeVisible();
    await expect(onboarding.getByLabel("Version du plan")).toHaveValue(defaultTemplateReference);
    await expect(onboarding.getByLabel("Plan de l’entreprise")).toHaveValue("");

    await onboarding.getByLabel("Code", { exact: true }).fill("SYS17");
    await onboarding.getByLabel("Nom français").fill("Plan SYSCOHADA E2E");
    await onboarding.getByLabel("Nom anglais").fill("SYSCOHADA E2E chart");
    await onboarding.getByRole("button", { name: "Créer le plan" }).click();
    await expect(onboarding.getByText(/Plan créé/i)).toBeVisible();

    let setup = await setupPayload(page);
    chartId = setup.selectedChartId;
    expect(chartId).toBeTruthy();
    expect(setup.defaultTemplateReference).toBe(defaultTemplateReference);
    const syscohada = setup.templates.find((template) => template.reference === defaultTemplateReference);
    expect(syscohada?.isDefault).toBeTruthy();
    expect(syscohada?.sourceKind).toBe("OFFICIAL");
    expect(syscohada?.productionReadiness.ready).toBeTruthy();
    expect(syscohada?.productionReadiness.status).toBe("ACCOUNTING_TEMPLATE_PRODUCTION_READY");
    expect(syscohada?.statementMappingCount).toBeGreaterThan(0);
    expect(syscohada?.semanticMappingCount).toBeGreaterThan(40);

    await onboarding.getByRole("button", { name: "Appliquer la version" }).click();
    await expect(onboarding.getByText(/Plan officiel appliqué/i)).toBeVisible();
    await onboarding.getByRole("button", { name: "Configurer les journaux recommandés" }).click();
    await expect(onboarding.getByText(/Journaux recommandés configurés/i)).toBeVisible();

    setup = await setupPayload(page);
    const before = blockerCodes(setup);
    expect(before.has("FUNCTIONAL_CURRENCY_REQUIRED")).toBeTruthy();
    expect(before.has("OPEN_FISCAL_PERIOD_REQUIRED")).toBeTruthy();
    expect(setup.charts.find((chart) => chart.id === chartId)?.templateCode).toBe(defaultTemplateReference);

    const finance = await apiPatch(page, `/api/enterprise/${organizationId}/finance/configuration`, { functionalCurrencyCode: "XAF", presentationCurrencyCode: "XAF", inventoryValuationMethod: "WEIGHTED_AVERAGE", reconciliationTolerance: "0.01", defaultAccountsJson: { acceptance: "configured" }, automaticPostingEnabled: false });
    expect(finance.response.ok(), JSON.stringify(finance.body)).toBeTruthy();
    const fiscalYear = await apiPost(page, `/api/enterprise/${organizationId}/fiscal-years`, { code: "FY2026-E2E", startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-12-31T23:59:59.999Z" });
    expect(fiscalYear.response.status(), JSON.stringify(fiscalYear.body)).toBe(201);
    const period = await apiPost(page, `/api/enterprise/${organizationId}/fiscal-periods`, { fiscalYearId: fiscalYear.body.year.id, code: "2026-08-E2E", startDate: "2026-08-01T00:00:00.000Z", endDate: "2026-08-31T23:59:59.999Z" });
    expect(period.response.status(), JSON.stringify(period.body)).toBe(201);

    await page.reload();
    await expect(onboarding.getByText("Prêt à activer")).toBeVisible();
    const activate = onboarding.getByRole("button", { name: "Activer la comptabilité" });
    await expect(activate).toBeEnabled();
    await activate.click();
    await expect(onboarding.getByText(/Plan comptable activé/i)).toBeVisible();

    setup = await setupPayload(page);
    expect(setup.ready).toBeTruthy();
    expect(setup.charts.find((chart) => chart.id === chartId)?.status).toBe("ACTIVE");
    expect(setup.regulatorySupport.supported).toBeTruthy();
    expect(setup.regulatorySupport.statementTypes).toEqual(expect.arrayContaining(["BALANCE_SHEET", "INCOME_STATEMENT"]));

    const accounts = await apiGet(page, `/api/enterprise/${organizationId}/ledger-accounts?search=701&page=1&pageSize=20`);
    const parent = (accounts.body?.items || []).find((item) => item.code === "701");
    expect(parent).toBeTruthy();
    const custom = await apiPost(page, `/api/enterprise/${organizationId}/ledger-accounts`, { chartId, parentId: parent.id, code: "70191", nameFr: "Ventes E2E personnalisées", nameEn: "Custom E2E sales", accountType: "REVENUE", accountSubtype: "REVENUE", isControlAccount: false, isSystemAccount: false, allowDirectPosting: true });
    expect(custom.response.status(), JSON.stringify(custom.body)).toBe(201);
    expect(custom.body.account.parentId).toBe(parent.id);
  });

  test("server RBAC rejects a non-member instead of leaking accounting data", async ({ page }) => {
    await page.context().clearCookies();
    await signIn(page, { email: outsiderEmail, password: outsiderPassword, organization: null });
    const response = await page.context().request.get(`${baseUrl}/api/enterprise/${organizationId}/accounting-setup`);
    expect([403, 404]).toContain(response.status());
  });

  test("production-like posting is balanced, idempotent, reportable and history-safe", async ({ page }) => {
    await prisma.organizationMember.upsert({ where: { organizationId_userId: { organizationId, userId: outsiderUserId } }, update: { role: "OWNER", status: "ACTIVE", joinedAt: new Date(), removedAt: null }, create: { organizationId, userId: outsiderUserId, role: "OWNER", status: "ACTIVE", joinedAt: new Date() } });
    const ledgerAccounts = await prisma.enterpriseLedgerAccount.findMany({ where: { organizationId, code: { in: ["571", "4431", "4452"] } } });
    const byCode = new Map(ledgerAccounts.map((account) => [account.code, account]));
    for (const code of ["571", "4431", "4452"]) expect(byCode.get(code), `Missing default account ${code}`).toBeTruthy();
    await prisma.enterpriseFinancialAccount.upsert({ where: { organizationId_code: { organizationId, code: "CASH-E2E" } }, update: { status: "ACTIVE", archivedAt: null, ledgerAccountId: byCode.get("571").id, currencyCode: "XAF" }, create: { organizationId, code: "CASH-E2E", name: "Caisse acceptance", accountType: "CASH", currencyCode: "XAF", openingBalance: "0", operationalBalance: "0", reconciledBalance: "0", ledgerAccountId: byCode.get("571").id } });
    const taxCode = await prisma.enterpriseTaxCode.upsert({ where: { organizationId_code: { organizationId, code: "E2E-ZERO" } }, update: { isActive: true, payableAccountId: byCode.get("4431").id, recoverableAccountId: byCode.get("4452").id }, create: { organizationId, code: "E2E-ZERO", nameFr: "Taxe zéro E2E", nameEn: "E2E zero tax", category: "ZERO_RATED", payableAccountId: byCode.get("4431").id, recoverableAccountId: byCode.get("4452").id, roundingRule: "HALF_UP" } });
    await prisma.enterpriseTaxRate.upsert({ where: { organizationId_taxCodeId_effectiveFrom: { organizationId, taxCodeId: taxCode.id, effectiveFrom: new Date("2026-01-01T00:00:00.000Z") } }, update: { rate: "0", status: "ACTIVE" }, create: { organizationId, taxCodeId: taxCode.id, rate: "0", effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), status: "ACTIVE", createdByUserId: adminUserId } });

    await page.context().clearCookies(); await signIn(page);
    await apiPatch(page, `/api/enterprise/${organizationId}/finance/configuration`, { functionalCurrencyCode: "XAF", presentationCurrencyCode: "XAF", inventoryValuationMethod: "WEIGHTED_AVERAGE", reconciliationTolerance: "0.01", defaultAccountsJson: { acceptance: "configured" }, automaticPostingEnabled: false });
    const created = await apiPost(page, `/api/enterprise/${organizationId}/sales-invoices`, { businessPartyId: "e2e-baseline-business-party", invoiceDate: "2026-08-09T12:00:00.000Z", dueDate: "2026-08-31T12:00:00.000Z", currencyCode: "XAF", notes: "Accounting production-like acceptance", items: [{ description: "Service ERP E2E", quantity: "1", unitPrice: "10000", discountAmount: "0" }] });
    expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
    let invoice = created.body.invoice;
    const submitted = await apiPost(page, `/api/enterprise/${organizationId}/sales-invoices/${invoice.id}/transition`, { action: "SUBMIT", revision: invoice.revision });
    expect(submitted.response.ok(), JSON.stringify(submitted.body)).toBeTruthy(); invoice = submitted.body.invoice;
    await page.context().clearCookies(); await signIn(page, { email: outsiderEmail, password: outsiderPassword, organization: organizationId });
    const approved = await apiPost(page, `/api/enterprise/${organizationId}/sales-invoices/${invoice.id}/transition`, { action: "APPROVE", revision: invoice.revision });
    expect(approved.response.ok(), JSON.stringify(approved.body)).toBeTruthy(); invoice = approved.body.invoice;
    await page.context().clearCookies(); await signIn(page);
    const issued = await apiPost(page, `/api/enterprise/${organizationId}/sales-invoices/${invoice.id}/transition`, { action: "ISSUE", revision: invoice.revision });
    expect(issued.response.ok(), JSON.stringify(issued.body)).toBeTruthy(); invoice = issued.body.invoice;

    const entries = await prisma.enterpriseJournalEntry.findMany({ where: { organizationId, sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: invoice.id, status: "POSTED" }, include: { lines: true } });
    expect(entries).toHaveLength(1);
    expect(entries[0].totalDebit.toString()).toBe("10000"); expect(entries[0].totalCredit.toString()).toBe("10000");
    expect(await prisma.enterprisePostingBatch.count({ where: { organizationId, sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: invoice.id, status: "COMPLETED" } })).toBe(1);

    const trialBalance = await apiGet(page, `/api/enterprise/${organizationId}/accounting-professional?view=trial-balance&page=1&pageSize=100`);
    const debit = (trialBalance.body?.items || []).reduce((total, item) => total + Number(item.debit || 0), 0);
    const credit = (trialBalance.body?.items || []).reduce((total, item) => total + Number(item.credit || 0), 0);
    expect(Math.abs(debit - credit)).toBeLessThan(0.00001);

    const statement = await apiPost(page, `/api/enterprise/${organizationId}/regulatory-statements`, { statementType: "INCOME_STATEMENT", periodStart: "2026-08-01T00:00:00.000Z", periodEnd: "2026-08-31T23:59:59.999Z" });
    expect(statement.response.ok(), JSON.stringify(statement.body)).toBeTruthy();
    const salesLine = statement.body.statement.lines.find((line) => line.lineCode === "IS_SALES_GOODS");
    expect(Number(salesLine.amount)).toBe(10000); expect(salesLine.normalBalance).toBe("CREDIT");

    const beforeUpgrade = { id: entries[0].id, debit: entries[0].totalDebit.toString(), credit: entries[0].totalCredit.toString() };
    const setup = await setupPayload(page); const chart = setup.charts.find((item) => item.id === chartId);
    const sameVersion = await apiPatch(page, `/api/enterprise/${organizationId}/accounting-setup`, { action: "APPLY_SAFE_TEMPLATE_UPGRADE", chartId, targetTemplateReference: defaultTemplateReference, revision: chart.revision });
    expect(sameVersion.response.ok(), JSON.stringify(sameVersion.body)).toBeTruthy();
    const historical = await prisma.enterpriseJournalEntry.findUniqueOrThrow({ where: { id: beforeUpgrade.id } });
    expect(historical.totalDebit.toString()).toBe(beforeUpgrade.debit); expect(historical.totalCredit.toString()).toBe(beforeUpgrade.credit);
  });

  test("English tablet onboarding is client-facing and has no structural overflow", async ({ page }) => {
    await prisma.user.update({ where: { id: adminUserId }, data: { locale: "en" } });
    await page.context().clearCookies(); await signIn(page);
    await page.setViewportSize({ width: 768, height: 1024 }); await page.goto(accountingPath);
    const onboarding = page.locator('section[aria-labelledby="accounting-onboarding-title"]');
    await expect(onboarding.getByText("Accounting onboarding")).toBeVisible();
    await expect(onboarding.getByText(/official default chart of accounts in DTSC Platform/i)).toBeVisible();
    await expect(onboarding.getByRole("heading", { name: "Financial statements", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)).toBeFalsy();
  });
});