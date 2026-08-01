import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { resolveEnterpriseIdentityRelationshipAccess } from "@/lib/enterprise/identity-links/access";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const linkId = new URL(req.url).searchParams.get("linkId");
  const decision = await resolveEnterpriseIdentityRelationshipAccess({ userId: session.userId, organizationId, identityLinkId: linkId });
  return NextResponse.json(decision, { status: decision.allowed ? 200 : decision.code === "RELATIONSHIP_NOT_FOUND" ? 404 : 403 });
}
