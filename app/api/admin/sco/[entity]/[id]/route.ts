import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { scoSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string; id: string }> };
type ScoEntity = "materialItems" | "vendors" | "purchaseRequests" | "inventory" | "assets" | "logistics";

function isScoEntity(value: string): value is ScoEntity {
  return value === "materialItems" || value === "vendors" || value === "purchaseRequests" || value === "inventory" || value === "assets" || value === "logistics";
}

function parseScoPatch(entity: ScoEntity, body: unknown) {
  if (entity === "materialItems") {
    return scoSchemas.materialItems.partial().safeParse(body);
  }
  if (entity === "vendors") {
    return scoSchemas.vendors.partial().safeParse(body);
  }
  if (entity === "purchaseRequests") {
    return scoSchemas.purchaseRequests.partial().safeParse(body);
  }
  if (entity === "inventory") {
    return scoSchemas.inventory.partial().safeParse(body);
  }
  if (entity === "assets") {
    return scoSchemas.assets.partial().safeParse(body);
  }
  return scoSchemas.logistics.partial().safeParse(body);
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

  const body = parseScoPatch(entity, await req.json());
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid SCO update" }, { status: 400 });
  }

  try {
    const record = await updateRecord(entity, id, body.data as Record<string, unknown>);
    await writeAuditLog({
      userId: session.userId,
      action: `SCO_${entity.toUpperCase()}_UPDATED`,
      entity,
      entityId: id,
      metadata: JSON.parse(JSON.stringify(body.data)),
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity } });

    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mise à jour SCO impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, message } });
    return NextResponse.json({ error: "SCO_RULE_FAILED", message }, { status: 400 });
  }
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

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suppression SCO impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, message } });
    return NextResponse.json({ error: "SCO_RULE_FAILED", message }, { status: 400 });
  }
}

async function updateRecord(entity: ScoEntity, id: string, data: Record<string, unknown>) {
  if (entity === "materialItems") {
    return prisma.materialItem.update({ where: { id }, data: normalizeOptionalStrings(data, ["sku", "description"]) as never });
  }
  if (entity === "vendors") {
    return prisma.scoVendor.update({ where: { id }, data: data as never });
  }
  if (entity === "purchaseRequests") {
    await assertOptionalEmployeeName(data.requesterName, "Le demandeur doit être un collaborateur DTSC enregistré.");
    await assertVendorName(data.selectedVendorName);
    return prisma.scoPurchaseRequest.update({ where: { id }, data: data as never });
  }
  if (entity === "inventory") {
    await assertOptionalEmployeeName(data.ownerName, "Le responsable doit être un collaborateur DTSC enregistré.");
    const materialData = await getMaterialDefaults(data.materialItemId);
    return prisma.scoInventoryItem.update({ where: { id }, data: mergeMaterialDefaults(data, materialData) as never });
  }
  if (entity === "assets") {
    await assertOptionalEmployeeName(data.assignedTo, "La personne assignée doit être un collaborateur DTSC enregistré.");
    const materialData = await getMaterialDefaults(data.materialItemId);
    return prisma.scoAsset.update({ where: { id }, data: mergeMaterialDefaults(data, materialData) as never });
  }
  await assertOptionalEmployeeName(data.ownerName, "Le responsable doit être un collaborateur DTSC enregistré.");
  return prisma.scoLogisticsEvent.update({ where: { id }, data: data as never });
}

async function deleteRecord(entity: ScoEntity, id: string) {
  if (entity === "materialItems") {
    const linked = await prisma.materialItem.findUnique({
      where: { id },
      include: { _count: { select: { inventoryItems: true, assets: true } } },
    });
    if (linked && (linked._count.inventoryItems || linked._count.assets)) {
      throw new Error("Ce bien matériel est utilisé par le stock ou les actifs. Désactivez-le au lieu de le supprimer.");
    }
    return prisma.materialItem.delete({ where: { id } });
  }
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

function normalizeOptionalStrings(data: Record<string, unknown>, keys: string[]) {
  const normalized = { ...data };
  for (const key of keys) {
    if (normalized[key] === "") {
      normalized[key] = null;
    }
  }
  return normalized;
}

async function getMaterialDefaults(materialItemId: unknown) {
  if (!materialItemId) {
    return {};
  }
  const material = await prisma.materialItem.findUnique({ where: { id: String(materialItemId) } });
  if (!material) {
    return {};
  }
  return {
    name: material.name,
    sku: material.sku,
    category: material.category,
    unit: material.unit,
  };
}

function mergeMaterialDefaults(data: Record<string, unknown>, defaults: Record<string, unknown>) {
  const merged = { ...data };
  for (const [key, value] of Object.entries(defaults)) {
    if ((merged[key] == null || merged[key] === "") && value != null && value !== "") {
      merged[key] = value;
    }
  }
  return merged;
}

async function assertVendorName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) {
    return;
  }
  const vendor = await prisma.scoVendor.findFirst({
    where: { name, status: { in: ["ACTIVE", "WATCHLIST"] } },
    select: { id: true },
  });
  if (!vendor) {
    throw new Error("Le fournisseur retenu doit provenir du référentiel Fournisseurs actif.");
  }
}

async function assertOptionalEmployeeName(value: unknown, message: string) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) {
    return;
  }
  const employee = await prisma.hrcfoEmployee.findFirst({
    where: { fullName: name, status: { not: "EXITED" } },
    select: { id: true },
  });
  if (!employee) {
    throw new Error(message);
  }
}
