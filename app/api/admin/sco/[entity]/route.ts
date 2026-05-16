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
    await notifyScoFlow(entity, record.id, session.userId);
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
    await assertOptionalEmployeeName(data.currentOwnerName, "Le responsable actuel doit être un collaborateur DTSC enregistré.");
    return prisma.materialItem.create({ data: await enrichScoData(normalizeOptionalStrings(data, ["sku", "description", "condition", "location", "currentOwnerName", "vendorName", "comments"])) as never });
  }
  if (entity === "vendors") {
    return prisma.scoVendor.create({ data: normalizeOptionalStrings(data, ["vendorType", "address", "productsServices", "serviceQuality", "documentUrl", "criticality", "notes"]) as never });
  }
  if (entity === "purchaseRequests") {
    await assertEmployeeName(data.requesterName, "Le demandeur doit être un collaborateur DTSC enregistré.");
    await assertVendorName(data.selectedVendorName);
    await assertVendorName(data.proposedVendorName);
    return prisma.scoPurchaseRequest.create({ data: await enrichScoData(data) as never });
  }
  if (entity === "inventory") {
    await assertOptionalEmployeeName(data.ownerName, "Le responsable doit être un collaborateur DTSC enregistré.");
    await assertVendorName(data.usualVendorName);
    const materialData = await getMaterialDefaults(data.materialItemId);
    return prisma.scoInventoryItem.create({ data: await enrichScoData(mergeMaterialDefaults(data, materialData)) as never });
  }
  if (entity === "assets") {
    await assertOptionalEmployeeName(data.assignedTo, "La personne assignée doit être un collaborateur DTSC enregistré.");
    await assertVendorName(data.vendorName);
    const materialData = await getMaterialDefaults(data.materialItemId);
    return prisma.scoAsset.create({ data: await enrichScoData(mergeMaterialDefaults(data, materialData)) as never });
  }
  await assertEmployeeName(data.ownerName, "Le responsable doit être un collaborateur DTSC enregistré.");
  await assertOptionalEmployeeName(data.requesterName, "Le demandeur doit être un collaborateur DTSC enregistré.");
  return prisma.scoLogisticsEvent.create({ data: await enrichScoData(data) as never });
}

async function enrichScoData(data: Record<string, unknown>) {
  const enriched = normalizeOptionalStrings(data, ["requesterDepartmentId", "departmentId", "relatedProjectId", "relatedTechnicalProjectId", "relatedBudgetId", "relatedAssetId", "relatedTaskId", "relatedMissionId", "sourceItemId", "destinationSection", "destinationItemId"]);
  if ("requesterDepartmentId" in enriched) {
    enriched.requesterDepartmentName = await departmentName(enriched.requesterDepartmentId);
  }
  if ("departmentId" in enriched) {
    enriched.departmentName = await departmentName(enriched.departmentId);
  }
  return enriched;
}

async function departmentName(id: unknown) {
  const value = typeof id === "string" ? id.trim() : "";
  if (!value) {
    return null;
  }
  const department = await prisma.department.findUnique({ where: { id: value }, select: { name: true, status: true } });
  if (!department || department.status !== "ACTIVE") {
    throw new Error("Le département sélectionné est inactif ou introuvable.");
  }
  return department.name;
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

async function notifyScoFlow(entity: ScoEntity, recordId: string, senderId: string) {
  if (entity === "purchaseRequests") {
    const request = await prisma.scoPurchaseRequest.findUnique({ where: { id: recordId } });
    if (!request) {
      return;
    }
    await notifyPosition("SCO", senderId, "Nouvelle demande d'achat", request.title, "SCO_PURCHASE_REQUEST");
    if (request.sourceSection === "CTO") {
      await notifyPosition("CTO", senderId, "Demande matérielle transmise au SCO", request.title, "SCO_CTO_REQUEST");
    }
    if (request.sourceSection === "MPO") {
      await notifyPosition("MPO", senderId, "Demande matérielle transmise au SCO", request.title, "SCO_MPO_REQUEST");
    }
    if (request.urgency === "CRITICAL" || request.status === "WAITING_CEO_VALIDATION") {
      await notifyPosition("CEO", senderId, "Achat critique à arbitrer", request.title, "SCO_CRITICAL");
    }
    return;
  }
  if (entity === "inventory") {
    const item = await prisma.scoInventoryItem.findUnique({ where: { id: recordId } });
    if (item && (item.status === "LOW_STOCK" || item.status === "OUT_OF_STOCK" || item.quantity <= item.minimumQuantity)) {
      await notifyPosition("SCO", senderId, "Alerte stock", `${item.name}: ${item.quantity} ${item.unit}`, "SCO_STOCK_ALERT");
      if (item.status === "OUT_OF_STOCK") {
        await notifyPosition("CEO", senderId, "Rupture critique de stock", item.name, "SCO_STOCK_CRITICAL");
      }
    }
    return;
  }
  if (entity === "assets") {
    const asset = await prisma.scoAsset.findUnique({ where: { id: recordId } });
    if (asset && (asset.status === "DAMAGED" || asset.status === "LOST" || asset.condition === "DAMAGED")) {
      await notifyPosition("SCO", senderId, "Actif à traiter", `${asset.tag} · ${asset.name}`, "SCO_ASSET_ALERT");
      await notifyPosition("COO", senderId, "Blocage matériel potentiel", `${asset.tag} · ${asset.name}`, "SCO_ASSET_BLOCKER");
    }
    return;
  }
  if (entity === "logistics") {
    const mission = await prisma.scoLogisticsEvent.findUnique({ where: { id: recordId } });
    if (mission && (mission.status === "WAITING_BUDGET" || mission.status === "WAITING_MATERIAL")) {
      await notifyPosition("COO", senderId, "Mission logistique à coordonner", mission.title, "SCO_LOGISTICS");
    }
  }
}

async function notifyPosition(positionCode: string, senderId: string, title: string, body: string, type: string) {
  const employees = await prisma.hrcfoEmployee.findMany({
    where: { positionCode, status: { not: "EXITED" } },
    select: { userId: true },
  });
  const recipients = [...new Set(employees.map((employee) => employee.userId).filter((id): id is string => Boolean(id) && id !== senderId))];
  for (const userId of recipients) {
    await prisma.notification.create({
      data: {
        userId,
        title,
        body: body.slice(0, 220),
        type,
        targetUrl: "/activities",
      },
    });
  }
}
