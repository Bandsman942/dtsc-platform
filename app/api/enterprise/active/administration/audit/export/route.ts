import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { GET as exportAuditForOrganization } from "@/app/api/enterprise/[organizationId]/administration/audit/export/route";

export async function GET(req: Request) {
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) return NextResponse.json({ error: "ORGANIZATION_CONTEXT_REQUIRED" }, { status: 409 });
  return exportAuditForOrganization(req, { params: Promise.resolve({ organizationId }) });
}
