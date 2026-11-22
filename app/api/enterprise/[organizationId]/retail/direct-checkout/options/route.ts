import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { readRetailOperatingSettings } from "@/lib/enterprise/retail/operating-settings";
import { requireRetailSiteCapability, hasRetailSelfApprovalGrant } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const parsed = z.string().trim().min(1).max(191).safeParse(new URL(req.url).searchParams.get("siteId"));
  if (!parsed.success) return NextResponse.json({ error: "RETAIL_SITE_REQUIRED" }, { status: 400 });
  try {
    const siteId = parsed.data;
    await requireRetailSiteCapability(organizationId, auth.session.userId, siteId, "PREPARE_INVOICE", prisma, { requireAssignment: true });
    const configuration = await prisma.enterpriseRetailConfiguration.findUnique({
      where: { organizationId }, select: { settingsJson: true, baseCurrencyCode: true },
    });
    if (!configuration) throw new EnterpriseRetailError("RETAIL_CONFIGURATION_REQUIRED", 409);
    const settings = readRetailOperatingSettings(configuration.settingsJson, siteId);
    const [accounts, invoiceGrant, paymentGrant] = await Promise.all([
      prisma.enterpriseFinancialAccount.findMany({
        where: { organizationId, siteId, status: "ACTIVE", archivedAt: null, accountType: "CASH" },
        select: { id: true, name: true, code: true, currencyCode: true }, take: 30, orderBy: { name: "asc" },
      }),
      hasRetailSelfApprovalGrant(organizationId, auth.session.userId, siteId, "INVOICE"),
      hasRetailSelfApprovalGrant(organizationId, auth.session.userId, siteId, "PAYMENT"),
    ]);
    const cashSessions = await prisma.enterpriseCashSession.findMany({
      where: { organizationId, siteId, status: "OPEN", cashierUserId: auth.session.userId,
        financialAccountId: { in: accounts.map((account) => account.id) } },
      select: { id: true, number: true, financialAccountId: true }, take: 30,
    });
    const flags = configuration.settingsJson;
    let directAllowed = settings.directCheckoutEnabled && invoiceGrant && paymentGrant &&
      Boolean(flags && typeof flags === "object" && !Array.isArray(flags) &&
        flags.invoiceCheckoutEnabled === true && flags.siteStaffIsolationEnabled === true);
    if (directAllowed) {
      for (const capability of ["ISSUE_INVOICE", "COLLECT_PAYMENT", "OPEN_CASH"] as const) {
        try { await requireRetailSiteCapability(organizationId, auth.session.userId, siteId, capability, prisma, { requireAssignment: true }); }
        catch { directAllowed = false; break; }
      }
    }
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId,
      metadata: { organizationId, siteId, domain: "retail-direct-checkout-options" } });
    return NextResponse.json({
      settings, directAllowed, accounts, cashSessions,
      currencyCode: configuration.baseCurrencyCode,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return retailErrorResponse(error, "RETAIL_DIRECT_CHECKOUT_OPTIONS_FAILED"); }
}
