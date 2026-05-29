import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { companyActivitySchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

function normalizeEmptyStrings<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === "" ? null : value])) as T;
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const organizationId = getActiveOrganizationId(session);
  const body = companyActivitySchema.safeParse(await req.json());
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid company activity" }, { status: 400 });
  }

  const existing = await prisma.companyActivity.findFirst({
    where: { id, userId: session.userId, organizationId },
    select: { id: true },
  });
  if (!existing) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  const activity = await prisma.companyActivity.update({
    where: { id },
    data: normalizeEmptyStrings(body.data),
  });

  await writeAuditLog({
    userId: session.userId,
    action: "COMPANY_ACTIVITY_UPDATED",
    entity: "CompanyActivity",
    entityId: activity.id,
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });

  return NextResponse.json({ ok: true, activity });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const organizationId = getActiveOrganizationId(session);
  const activity = await prisma.companyActivity.findFirst({
    where: { id, userId: session.userId, organizationId },
    select: { id: true, title: true },
  });

  if (!activity) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  await prisma.companyActivity.delete({ where: { id: activity.id } });
  await writeAuditLog({
    userId: session.userId,
    action: "COMPANY_ACTIVITY_DELETED",
    entity: "CompanyActivity",
    entityId: activity.id,
    metadata: { title: activity.title },
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });

  return NextResponse.json({ ok: true });
}
