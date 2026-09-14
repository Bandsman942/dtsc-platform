import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingStationAccess } from "@/lib/enterprise/gaming/access";
import { listGamingStationCandidates } from "@/lib/enterprise/gaming/stations";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const [gamingAccess, assetAccess] = await Promise.all([
    getEnterpriseGamingStationAccess({ session, organizationId, action: "submit" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "read" }),
  ]);
  if (!gamingAccess || !assetAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Number(url.searchParams.get("pageSize") || 20);
  const search = url.searchParams.get("search") || "";
  const result = await listGamingStationCandidates({ organizationId, page, pageSize, search });

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, domain: "gaming-station-candidates", page: result.pagination.page },
  });
  return NextResponse.json(result);
}
