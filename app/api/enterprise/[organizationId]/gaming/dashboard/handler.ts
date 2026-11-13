import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getGamingDashboardSnapshot } from "@/lib/enterprise/gaming/analytics";
import { getEnterpriseGamingDashboardAccess } from "@/lib/enterprise/gaming/access";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const [access, assetAccess, financeAccess] = await Promise.all([
    getEnterpriseGamingDashboardAccess({ session, organizationId, action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "read" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "view" }),
  ]);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const periodDays = Math.min(366, Math.max(1, Number(new URL(req.url).searchParams.get("periodDays") || 30) || 30));
  const snapshot = await getGamingDashboardSnapshot(organizationId, {
    periodDays,
    includeAssets: Boolean(assetAccess),
    includeFinance: Boolean(financeAccess),
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-dashboard", periodDays } });
  return NextResponse.json({ ...snapshot, capabilities: { canReadAssets: Boolean(assetAccess), canReadFinance: Boolean(financeAccess) } });
}
