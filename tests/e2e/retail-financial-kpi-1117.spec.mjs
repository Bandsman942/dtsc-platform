import { expect, test } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const memberEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const memberPassword = process.env.E2E_USER_PASSWORD || "E2eUser2026!";

const metrics = [
  "financeCollections", "invoices", "outstanding", "overdue", "postedRevenue",
  "postedGrossMargin", "postedOperatingResult", "treasuryAvailable", "expenses",
  "mobileMoneyCommission", "telcoMargin", "posSales",
];

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function scopedUrl(metric, extra = {}) {
  const params = new URLSearchParams({
    metric, from: dateString(new Date(Date.now() - 3 * 86_400_000)),
    to: dateString(new Date(Date.now() + 86_400_000)), page: "1", pageSize: "100",
    ...extra,
  });
  return `${baseUrl}/api/enterprise/${organizationId}/retail/financial-drilldown?${params}`;
}

async function signIn(context, email, password) {
  const response = await context.request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email, password, organizationId, next: "/enterprise-modules/RETAIL_POS" },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.status(), `Login error for ${email}: ${await response.text()}`).toBe(200);
}

function authorized(metric, access) {
  if (metric.startsWith("posted")) return access.accounting;
  if (metric === "financeCollections") return access.financeReceivables && access.financePayments;
  if (["invoices", "outstanding", "overdue"].includes(metric)) return access.financeReceivables;
  if (metric === "treasuryAvailable") return access.treasury;
  if (metric === "expenses") return access.financeBudgets;
  if (metric === "mobileMoneyCommission") return access.agency;
  if (metric === "telcoMargin") return access.telco;
  return metric === "posSales";
}

test.describe.serial("Retail 12 financial KPI source evidence #1117", () => {
  test.afterAll(async () => { await prisma.$disconnect(); });

  test("anonymous and non-admin members are refused for the financial source drill-down", async ({ browser }) => {
    const anonymous = await browser.newContext({ baseURL: baseUrl });
    try {
      const unauthenticated = await anonymous.request.get(scopedUrl("posSales"));
      expect(unauthenticated.status()).toBe(401);
    } finally { await anonymous.close(); }

    const member = await browser.newContext({ baseURL: baseUrl });
    try {
      await signIn(member, memberEmail, memberPassword);
      const forbidden = await member.request.get(scopedUrl("posSales"));
      expect(forbidden.status()).toBe(403);
    } finally { await member.close(); }
  });

  test("all twelve metric sources enforce entitlements and reconcile paginated amounts", async ({ browser }) => {
    const owner = await browser.newContext({ baseURL: baseUrl });
    try {
      await signIn(owner, adminEmail, adminPassword);
      const overview = await owner.request.get(`${baseUrl}/api/enterprise/${organizationId}/retail/site-overview`);
      expect(overview.status(), await overview.text()).toBe(200);
      const summary = await overview.json();
      expect(summary.currencyPolicy).toBe("SEPARATE_PER_CURRENCY");
      expect(summary.sourceAvailability).toBeTruthy();
      expect(summary.items?.length).toBeGreaterThan(0);
      const access = summary.sourceAvailability;

      const before = {
        invoices: await prisma.enterpriseSalesInvoice.count({ where: { organizationId } }),
        payments: await prisma.enterprisePayment.count({ where: { organizationId } }),
        journals: await prisma.enterpriseJournalEntry.count({ where: { organizationId } }),
      };

      for (const metric of metrics) {
        const response = await owner.request.get(scopedUrl(metric));
        const canRead = authorized(metric, access);
        expect(response.status(), `${metric}: ${await response.text()}`).toBe(canRead ? 200 : 403);
        if (!canRead) continue;

        const result = await response.json();
        expect(result.metric).toBe(metric);
        expect(result.certification).toBe("PROVISIONAL_SOURCE_TRACE");
        expect(result.page).toBe(1);
        expect(result.pageSize).toBe(100);
        expect(result.totalLines).toBeGreaterThanOrEqual(result.lines.length);
        expect(result.buckets.reduce((sum, row) => sum + row.count, 0)).toBe(result.totalLines);
        const isBalance = ["outstanding", "overdue", "treasuryAvailable"].includes(metric);
        expect(result.timeBasis).toBe(isBalance ? "CURRENT_BALANCE" : "PERIOD_FLOW");
        for (const bucket of result.buckets) {
          expect(bucket.currencyCode).toMatch(/^[A-Z]{3}$/);
          if (bucket.missingAmounts > 0) expect(bucket.amount).toBeNull();
          if (bucket.amount !== null) expect(new Prisma.Decimal(bucket.amount).isFinite()).toBe(true);
        }
        if (result.totalLines <= result.pageSize) {
          for (const bucket of result.buckets) {
            const lines = result.lines.filter((row) => row.siteId === bucket.siteId && row.currencyCode === bucket.currencyCode);
            expect(lines.length, `${metric} source count for ${bucket.currencyCode}`).toBe(bucket.count);
            if (bucket.missingAmounts) continue;
            const total = lines.reduce((sum, row) => sum.plus(row.amount || 0), new Prisma.Decimal(0));
            expect(total.toFixed(6), `${metric} source sum for ${bucket.currencyCode}`).toBe(bucket.amount);
          }
        }
      }

      // Financial GETs may create API audit logs, never invoices, payments or posted books.
      expect(await prisma.enterpriseSalesInvoice.count({ where: { organizationId } })).toBe(before.invoices);
      expect(await prisma.enterprisePayment.count({ where: { organizationId } })).toBe(before.payments);
      expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId } })).toBe(before.journals);
    } finally { await owner.close(); }
  });

  test("site/currency boundaries, foreign tenant and invalid filters are enforced", async ({ browser }) => {
    const owner = await browser.newContext({ baseURL: baseUrl });
    try {
      await signIn(owner, adminEmail, adminPassword);
      const site = await prisma.enterpriseSite.findFirstOrThrow({
        where: { organizationId }, select: { id: true },
      });
      const filtered = await owner.request.get(scopedUrl("posSales", { siteId: site.id, currency: "USD" }));
      expect(filtered.status(), await filtered.text()).toBe(200);
      const evidence = await filtered.json();
      expect(evidence.lines.every((line) => line.siteId === site.id && line.currencyCode === "USD")).toBe(true);
      expect(evidence.buckets.every((bucket) => bucket.siteId === site.id && bucket.currencyCode === "USD")).toBe(true);

      const foreign = await prisma.enterpriseSite.findFirst({
        where: { organizationId: "shop2-e2e-foreign-org" }, select: { id: true },
      });
      expect(foreign, "Shop2 global acceptance should create a genuine foreign tenant store").toBeTruthy();
      const denied = await owner.request.get(scopedUrl("posSales", { siteId: foreign.id }));
      expect(denied.status()).toBe(404);

      const invalid = await owner.request.get(scopedUrl("posSales", { pageSize: "100000" }));
      expect(invalid.status()).toBe(400);
      const badMetric = await owner.request.get(scopedUrl("injectedMetric"));
      expect(badMetric.status()).toBe(400);
    } finally { await owner.close(); }
  });
});
