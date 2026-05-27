import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canManageClientOrganizations } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const updateOrganizationSchema = z.object({
  action: z.enum(["update", "set_status", "grant_admin", "revoke_admin"]),
  name: z.string().trim().min(2).max(160).optional(),
  industry: z.string().max(160).optional().or(z.literal("")),
  country: z.string().max(120).optional().or(z.literal("")),
  city: z.string().max(120).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(60).optional().or(z.literal("")),
  address: z.string().max(240).optional().or(z.literal("")),
  timezone: z.string().max(80).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "SUSPENDED", "ARCHIVED"]).optional(),
  userId: z.string().optional().or(z.literal("")),
  reason: z.string().max(500).optional().or(z.literal("")),
});

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageClientOrganizations(session.role)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Seul DTSC peut gérer les entreprises clientes." }, { status: 403 });
  }

  const { id } = await params;
  const parsed = updateOrganizationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const organization = await prisma.organization.findFirst({ where: { id, deletedAt: null } });
  if (!organization || organization.organizationType === "DTSC_INTERNAL") {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = parsed.data;
  if (data.action === "grant_admin") {
    if (!data.userId) {
      return NextResponse.json({ error: "Missing user" }, { status: 400 });
    }
    const targetUserId = data.userId;
    const targetUser = await prisma.user.findFirst({ where: { id: targetUserId, status: "ACTIVE" }, select: { id: true } });
    if (!targetUser) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid user", message: "L'utilisateur sélectionné est introuvable ou inactif." }, { status: 400 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: id, userId: targetUserId } },
        update: { role: "ADMIN_ENTREPRISE", status: "ACTIVE", removedAt: null, joinedAt: new Date() },
        create: {
          organizationId: id,
          userId: targetUserId,
          role: "ADMIN_ENTREPRISE",
          status: "ACTIVE",
          invitedBy: session.userId,
          joinedAt: new Date(),
        },
      });
      await tx.organizationAdminGrant.create({
        data: {
          organizationId: id,
          userId: targetUserId,
          grantedByDtscUserId: session.userId,
          status: "ACTIVE",
          reason: data.reason || "Attribution par DTSC",
        },
      });
    });
    await writeAuditLog({ userId: session.userId, action: "CLIENT_ORGANIZATION_ADMIN_GRANTED", entity: "Organization", entityId: id, request: req, metadata: { userId: targetUserId } });
  } else if (data.action === "revoke_admin") {
    if (!data.userId) {
      return NextResponse.json({ error: "Missing user" }, { status: 400 });
    }
    const targetUserId = data.userId;
    await prisma.$transaction(async (tx) => {
      await tx.organizationAdminGrant.updateMany({
        where: { organizationId: id, userId: targetUserId, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: new Date(), reason: data.reason || "Retrait par DTSC" },
      });
      await tx.organizationMember.updateMany({
        where: { organizationId: id, userId: targetUserId, role: "ADMIN_ENTREPRISE" },
        data: { role: "MEMBER" },
      });
    });
    await writeAuditLog({ userId: session.userId, action: "CLIENT_ORGANIZATION_ADMIN_REVOKED", entity: "Organization", entityId: id, request: req, metadata: { userId: targetUserId } });
  } else {
    await prisma.organization.update({
      where: { id },
      data: data.action === "set_status"
        ? { status: data.status || organization.status }
        : {
            name: data.name || organization.name,
            sector: data.industry ?? organization.sector,
            industry: data.industry ?? organization.industry,
            country: data.country ?? organization.country,
            city: data.city ?? organization.city,
            email: data.email ?? organization.email,
            phone: data.phone ?? organization.phone,
            address: data.address ?? organization.address,
            timezone: data.timezone || organization.timezone,
          },
    });
    await writeAuditLog({ userId: session.userId, action: data.action === "set_status" ? "CLIENT_ORGANIZATION_STATUS_CHANGED" : "CLIENT_ORGANIZATION_UPDATED", entity: "Organization", entityId: id, request: req, metadata: { status: data.status } });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
