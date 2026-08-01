import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { findEnterpriseBusinessPartyDuplicates } from "@/lib/enterprise/master-data/service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_CUSTOMERS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const legalName = url.searchParams.get("legalName")?.trim() || "";
  if (legalName.length < 2) return NextResponse.json({ items: [] });
  const items = await findEnterpriseBusinessPartyDuplicates(organizationId, {
    legalName,
    primaryEmail: url.searchParams.get("primaryEmail"),
    primaryPhone: url.searchParams.get("primaryPhone"),
  });
  return NextResponse.json({ items });
}
