import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccessibleOrganizationsForEmail } from "@/lib/organizations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

const lookupSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
});

export async function POST(req: Request) {
  const limited = await rateLimit(getRateLimitKey(req, "auth:organization-lookup"), 30, 15 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json({ organizations: [] }, { status: 200 });
  }

  const parsed = lookupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ organizations: [] }, { status: 200 });
  }

  const memberships = await getAccessibleOrganizationsForEmail(parsed.data.email);
  return NextResponse.json({
    organizations: memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      logoUrl: membership.organization.logoUrl,
      role: membership.role,
      type: membership.organization.organizationType,
    })),
  });
}
