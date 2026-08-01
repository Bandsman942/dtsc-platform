import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import {
  identityLinkErrorResponse,
  requireIdentityLinkSession,
} from "@/lib/enterprise/identity-links/http";
import { listUserIdentityLinks } from "@/lib/enterprise/identity-links/service";

export async function GET(req: Request) {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const session = await requireIdentityLinkSession(req);
    userId = session.userId;
    const links = await listUserIdentityLinks(session.userId);
    await writeApiLog({ request: req, statusCode: 200, userId, startedAt });
    return NextResponse.json({ links });
  } catch (error) {
    const response = identityLinkErrorResponse(error);
    await writeApiLog({ request: req, statusCode: response.status, userId, startedAt });
    return response;
  }
}
