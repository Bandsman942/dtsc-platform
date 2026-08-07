import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { RETAIL_MODULE_CODES, type RetailModuleCode } from "@/lib/enterprise/retail/constants";
import { authorizeRetailRequest } from "@/lib/enterprise/retail/http";
import { getRetailDashboard } from "@/lib/enterprise/retail/service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const url = new URL(req.url);
  const requestedModule = url.searchParams.get("moduleCode")?.trim().toUpperCase();
  const moduleCode: RetailModuleCode = RETAIL_MODULE_CODES.includes(requestedModule as RetailModuleCode) ? requestedModule as RetailModuleCode : "RETAIL_POS";
  const auth = await authorizeRetailRequest(req, organizationId, moduleCode, "read");
  if (!auth.ok) return auth.response;
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from") as string) : undefined;
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to") as string) : undefined;
  const dashboard = await getRetailDashboard(organizationId, from && !Number.isNaN(from.getTime()) ? from : undefined, to && !Number.isNaN(to.getTime()) ? to : undefined);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-dashboard", moduleCode } });
  return NextResponse.json(dashboard);
}
