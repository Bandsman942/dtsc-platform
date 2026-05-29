import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { companyProfileSchema } from "@/lib/validators";

function normalizeEmptyStrings<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === "" ? null : value])) as T;
}

export async function PATCH(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = companyProfileSchema.safeParse(await req.json());
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid company profile" }, { status: 400 });
  }

  const data = normalizeEmptyStrings(body.data);
  const organizationId = getActiveOrganizationId(session);
  const existingProfile = await prisma.companyProfile.findFirst({
    where: { userId: session.userId, organizationId },
    select: { id: true },
  });
  const profile = existingProfile
    ? await prisma.companyProfile.update({ where: { id: existingProfile.id }, data })
    : await prisma.companyProfile.create({ data: { ...data, userId: session.userId, organizationId } });

  await writeAuditLog({
    userId: session.userId,
    action: "COMPANY_PROFILE_UPSERTED",
    entity: "CompanyProfile",
    entityId: profile.id,
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });

  return NextResponse.json({ ok: true, profile });
}

export async function DELETE(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = getActiveOrganizationId(session);
  await prisma.companyProfile.deleteMany({ where: { userId: session.userId, organizationId } });
  await writeAuditLog({
    userId: session.userId,
    action: "COMPANY_PROFILE_DELETED",
    entity: "CompanyProfile",
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });

  return NextResponse.json({ ok: true });
}
