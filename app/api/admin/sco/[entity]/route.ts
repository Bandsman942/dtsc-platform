import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { scoSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string }> };
type ScoEntity = keyof typeof scoSchemas;

function isScoEntity(value: string): value is ScoEntity {
  return value === "vendors" || value === "purchaseRequests" || value === "inventory" || value === "assets" || value === "logistics";
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("sco");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { entity } = await params;
  if (!isScoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown SCO entity" }, { status: 404 });
  }

  const parsed = scoSchemas[entity].safeParse(await req.json());
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid SCO payload" }, { status: 400 });
  }

  const record = await createRecord(entity, { ...parsed.data, createdById: session.userId });
  await writeAuditLog({
    userId: session.userId,
    action: `SCO_${entity.toUpperCase()}_CREATED`,
    entity,
    entityId: record.id,
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { entity } });

  return NextResponse.json({ ok: true, record }, { status: 201 });
}

async function createRecord(entity: ScoEntity, data: Record<string, unknown>) {
  if (entity === "vendors") {
    return prisma.scoVendor.create({ data: data as never });
  }
  if (entity === "purchaseRequests") {
    return prisma.scoPurchaseRequest.create({ data: data as never });
  }
  if (entity === "inventory") {
    return prisma.scoInventoryItem.create({ data: data as never });
  }
  if (entity === "assets") {
    return prisma.scoAsset.create({ data: data as never });
  }
  return prisma.scoLogisticsEvent.create({ data: data as never });
}
