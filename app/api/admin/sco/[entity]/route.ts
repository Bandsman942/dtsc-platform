import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { scoSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string }> };
type ScoEntity = keyof typeof scoSchemas;

function isScoEntity(value: string): value is ScoEntity {
  return value === "materialItems" || value === "vendors" || value === "purchaseRequests" || value === "inventory" || value === "assets" || value === "logistics";
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

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Création SCO impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, message } });
    return NextResponse.json({ error: "SCO_RULE_FAILED", message }, { status: 400 });
  }
}

async function createRecord(entity: ScoEntity, data: Record<string, unknown>) {
  if (entity === "materialItems") {
    return prisma.materialItem.create({ data: normalizeOptionalStrings(data, ["sku", "description"]) as never });
  }
  if (entity === "vendors") {
    return prisma.scoVendor.create({ data: data as never });
  }
  if (entity === "purchaseRequests") {
    await assertEmployeeName(data.requesterName, "Le demandeur doit être un collaborateur DTSC enregistré.");
    await assertVendorName(data.selectedVendorName);
    return prisma.scoPurchaseRequest.create({ data: data as never });
  }
  if (entity === "inventory") {
    await assertOptionalEmployeeName(data.ownerName, "Le responsable doit être un collaborateur DTSC enregistré.");
    const materialData = await getMaterialDefaults(data.materialItemId);
    return prisma.scoInventoryItem.create({ data: mergeMaterialDefaults(data, materialData) as never });
  }
  if (entity === "assets") {
    await assertOptionalEmployeeName(data.assignedTo, "La personne assignée doit être un collaborateur DTSC enregistré.");
    const materialData = await getMaterialDefaults(data.materialItemId);
    return prisma.scoAsset.create({ data: mergeMaterialDefaults(data, materialData) as never });
  }
  await assertEmployeeName(data.ownerName, "Le responsable doit être un collaborateur DTSC enregistré.");
  return prisma.scoLogisticsEvent.create({ data: data as never });
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
  await assertEmployeeName(name, message);
}

async function assertEmployeeName(value: unknown, message: string) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) {
    throw new Error(message);
  }
  const employee = await prisma.hrcfoEmployee.findFirst({
    where: { fullName: name, status: { not: "EXITED" } },
    select: { id: true },
  });
  if (!employee) {
    throw new Error(message);
  }
}
