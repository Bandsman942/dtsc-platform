import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import {
  identityLinkErrorResponse,
  requireIdentityLinkOrganizationAdmin,
} from "@/lib/enterprise/identity-links/http";
import { listOrganizationIdentityLinks } from "@/lib/enterprise/identity-links/service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const { organizationId } = await params;
    const { session } = await requireIdentityLinkOrganizationAdmin(req, organizationId);
    userId = session.userId;
    const links = await listOrganizationIdentityLinks(organizationId);
    await writeApiLog({ request: req, statusCode: 200, userId, startedAt });
    return NextResponse.json({ links });
  } catch (error) {
    const response = identityLinkErrorResponse(error);
    await writeApiLog({ request: req, statusCode: response.status, userId, startedAt });
    return response;
  }
}
