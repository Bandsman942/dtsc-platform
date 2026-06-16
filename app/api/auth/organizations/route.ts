import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccessibleOrganizationsForEmail, getPendingOrganizationInvitationsForEmail } from "@/lib/organizations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

const lookupSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
});

export async function POST(req: Request) {
  const limited = await rateLimit(getRateLimitKey(req, "auth:organization-lookup"), 30, 15 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json({ organizations: [], pendingInvitations: [] }, { status: 200 });
  }

  const parsed = lookupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ organizations: [], pendingInvitations: [] }, { status: 200 });
  }

  const [memberships, pendingInvitations] = await Promise.all([
    getAccessibleOrganizationsForEmail(parsed.data.email),
    getPendingOrganizationInvitationsForEmail(parsed.data.email),
  ]);
  return NextResponse.json({
    organizations: memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      logoUrl: membership.organization.logoUrl,
      role: membership.role,
      status: "ACTIVE",
      type: membership.organization.organizationType,
    })),
    pendingInvitations: pendingInvitations.map((invitation) => ({
      id: invitation.id,
      organizationId: invitation.organization.id,
      name: invitation.organization.name,
      slug: invitation.organization.slug,
      logoUrl: invitation.organization.logoUrl,
      role: invitation.role,
      status: invitation.status,
    })),
  });
}
