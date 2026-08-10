import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getActiveOrganizationId } from "@/lib/organizations";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  return NextResponse.json({
    activeContext: session.activeContext,
    organizationId: getActiveOrganizationId(session),
  });
}
