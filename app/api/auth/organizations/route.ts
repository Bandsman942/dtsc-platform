import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccessibleOrganizationsForEmail, getPendingOrganizationInvitationsForEmail } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { verifyPassword } from "@/lib/security";

const lookupSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(256),
});
const empty = { organizations: [], pendingInvitations: [] };

export async function POST(req: Request) {
  const limited = await rateLimit(getRateLimitKey(req, "auth:organization-lookup"), 8, 15 * 60 * 1000);
  if (!limited.ok) return NextResponse.json(empty);

  const parsed = lookupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(empty);

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { passwordHash: true, status: true } });
  if (!user || user.status !== "ACTIVE" || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return NextResponse.json(empty);
  }

  const [memberships, pendingInvitations] = await Promise.all([
    getAccessibleOrganizationsForEmail(parsed.data.email),
    getPendingOrganizationInvitationsForEmail(parsed.data.email),
  ]);
  return NextResponse.json({
    organizations: memberships.map((membership) => ({ id: membership.organization.id, name: membership.organization.name, role: membership.role })),
    pendingInvitations: pendingInvitations.map((invitation) => ({ id: invitation.id, organizationId: invitation.organization.id, name: invitation.organization.name, role: invitation.role })),
  });
}
