import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const redisUrl = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || "";

const orgCacheKey = `dtsc:read-cache:v1:retail-dashboard-org-retail_pos:org:${organizationId}`;
const periodCacheKey = `dtsc:read-cache:v1:retail-dashboard-period-retail_pos:org:${organizationId}`;

async function redisCommand(command) {
  if (!redisUrl || !redisToken) throw new Error("SCALE-5B runtime acceptance requires Redis REST configuration");
  const response = await fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) throw new Error(`Redis REST command failed: ${response.status} ${JSON.stringify(body)}`);
  return body?.result;
}

async function signIn(request) {
  const response = await request.post(`${baseUrl}/api/auth/sign-in`, {
    data: {
      email: adminEmail,
      password: adminPassword,
      organizationId,
      next: "/enterprise-modules/RETAIL_POS",
    },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `SCALE-5B sign-in failed: ${JSON.stringify(body)}`).toBeTruthy();
}

async function dashboardJson(request, query = "moduleCode=RETAIL_POS") {
  const response = await request.get(`${baseUrl}/api/enterprise/${organizationId}/retail/dashboard?${query}`);
  const body = await response.json().catch(() => null);
  expect(response.ok(), `Retail dashboard failed: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
  return body;
}

test.describe.serial("SCALE-5B Retail dashboard cache", () => {
  test.afterAll(async () => {
    await redisCommand(["DEL", orgCacheKey, periodCacheKey]).catch(() => null);
    await prisma.$disconnect();
  });

  test("default range caches shareable projections while custom range bypasses period cache", async ({ page }) => {
    const request = page.context().request;
    await signIn(request);

    const configuration = await prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId } });
    expect(configuration, "Retail configuration must exist in the canonical Shop 2 fixture").toBeTruthy();
    const originalRevision = configuration.revision;

    await redisCommand(["DEL", orgCacheKey, periodCacheKey]);

    try {
      const first = await dashboardJson(request);
      expect(first.configuration?.revision).toBe(originalRevision);

      const cachedOrg = await redisCommand(["GET", orgCacheKey]);
      const cachedPeriod = await redisCommand(["GET", periodCacheKey]);
      expect(typeof cachedOrg).toBe("string");
      expect(typeof cachedPeriod).toBe("string");
      expect(Number(await redisCommand(["TTL", orgCacheKey]))).toBeGreaterThan(0);
      expect(Number(await redisCommand(["TTL", periodCacheKey]))).toBeGreaterThan(0);

      await prisma.enterpriseRetailConfiguration.update({
        where: { organizationId },
        data: { revision: { increment: 1 } },
      });

      const second = await dashboardJson(request);
      expect(second.configuration?.revision, "Second default read must reuse the cached organization projection").toBe(originalRevision);

      await redisCommand(["DEL", periodCacheKey]);
      const now = new Date();
      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const custom = await dashboardJson(
        request,
        `moduleCode=RETAIL_POS&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(now.toISOString())}`,
      );
      expect(custom.range?.from).toBe(from.toISOString());
      expect(custom.range?.to).toBe(now.toISOString());
      expect(await redisCommand(["GET", periodCacheKey]), "Custom from/to reads must not create the shared default-period cache key").toBeNull();
    } finally {
      await prisma.enterpriseRetailConfiguration.update({
        where: { organizationId },
        data: { revision: originalRevision },
      }).catch(() => null);
      await redisCommand(["DEL", orgCacheKey, periodCacheKey]).catch(() => null);
    }
  });
});
