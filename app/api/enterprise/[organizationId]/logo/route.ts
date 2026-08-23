import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  downloadOrganizationLogoFromSupabase,
  resolveOrganizationLogoStoragePath,
} from "@/lib/enterprise/organization-logo-storage";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { organizationId } = await params;
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    select: { logoUrl: true, updatedAt: true },
  });
  if (!organization?.logoUrl) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const storagePath = resolveOrganizationLogoStoragePath({ organizationId, logoUrl: organization.logoUrl });
  if (!storagePath) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    const logo = await downloadOrganizationLogoFromSupabase({ organizationId, storagePath });
    return new Response(logo, {
      headers: {
        "Content-Type": logo.type || "image/webp",
        "Cache-Control": "private, max-age=3600",
        "X-DTSC-Organization-Logo-Version": organization.updatedAt.toISOString(),
      },
    });
  } catch {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
}
