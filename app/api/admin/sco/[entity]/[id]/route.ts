import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { operationPatchSchema } from "@/lib/validators";

type Params = { params: Promise<{ entity: string; id: string }> };
type ScoEntity = "vendors" | "purchaseRequests" | "inventory" | "assets" | "logistics";

function isScoEntity(value: string): value is ScoEntity {
  return value === "vendors" || value === "purchaseRequests" || value === "inventory" || value === "assets" || value === "logistics";
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("sco");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { entity, id } = await params;
  if (!isScoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown SCO entity" }, { status: 404 });
  }

  const body = operationPatchSchema.safeParse(await req.json());
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid SCO update" }, { status: 400 });
  }

  const record = await updateRecord(entity, id, body.data);
  await writeAuditLog({
    userId: session.userId,
    action: `SCO_${entity.toUpperCase()}_UPDATED`,
    entity,
    entityId: id,
    metadata: body.data,
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity } });

  return NextResponse.json({ ok: true, record });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("sco");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { entity, id } = await params;
  if (!isScoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown SCO entity" }, { status: 404 });
  }

  await deleteRecord(entity, id);
  await writeAuditLog({
    userId: session.userId,
    action: `SCO_${entity.toUpperCase()}_DELETED`,
    entity,
    entityId: id,
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity } });

  return NextResponse.json({ ok: true });
}

async function updateRecord(entity: ScoEntity, id: string, data: { status?: string; notes?: string }) {
  if (entity === "vendors") {
    return prisma.scoVendor.update({ where: { id }, data });
  }
  if (entity === "purchaseRequests") {
    return prisma.scoPurchaseRequest.update({ where: { id }, data });
  }
  if (entity === "inventory") {
    return prisma.scoInventoryItem.update({ where: { id }, data });
  }
  if (entity === "assets") {
    return prisma.scoAsset.update({ where: { id }, data });
  }
  return prisma.scoLogisticsEvent.update({ where: { id }, data });
}

async function deleteRecord(entity: ScoEntity, id: string) {
  if (entity === "vendors") {
    return prisma.scoVendor.delete({ where: { id } });
  }
  if (entity === "purchaseRequests") {
    return prisma.scoPurchaseRequest.delete({ where: { id } });
  }
  if (entity === "inventory") {
    return prisma.scoInventoryItem.delete({ where: { id } });
  }
  if (entity === "assets") {
    return prisma.scoAsset.delete({ where: { id } });
  }
  return prisma.scoLogisticsEvent.delete({ where: { id } });
}
