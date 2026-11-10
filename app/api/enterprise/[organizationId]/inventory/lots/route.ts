import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { retailInventoryVisibleSites, requireRetailWarehouseCapability } from "@/lib/enterprise/retail/site-access";
import { retailErrorResponse } from "@/lib/enterprise/retail/http";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
const fields = z.object({ inventoryItemId: z.string().min(1), warehouseId: z.string().min(1), lotNumber: z.string().trim().min(1).max(120), productionDate: z.iso.date().nullable(), expiryDate: z.iso.date().nullable(), notes: z.string().trim().max(1000).nullable() });
const createSchema = fields.strict();
const patchSchema = fields.partial().extend({ id: z.string().min(1), revision: z.number().int().positive(), status: z.enum(["AVAILABLE", "BLOCKED", "QUARANTINED"]).optional() }).strict();
const isoDate = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00.000Z`) : null;

export async function GET(req: Request, { params }: Params) {
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let scope: Awaited<ReturnType<typeof retailInventoryVisibleSites>>;
  try { scope = await retailInventoryVisibleSites(organizationId, session.userId); } catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED"); }
  const url = new URL(req.url);
  const page = Math.min(10000, Math.max(1, Number(url.searchParams.get("page") || 1) || 1));
  const pageSize = 25;
  const search = (url.searchParams.get("search") || "").trim().slice(0, 120);
  const warehouseId = url.searchParams.get("warehouseId") || "";
  const where: Prisma.EnterpriseStockLotWhereInput = {
    organizationId, archivedAt: null,
    ...(warehouseId ? { warehouseId } : {}),
    ...(scope.isolationEnabled ? { warehouse: { siteId: { in: scope.siteIds } } } : {}),
    ...(search ? { OR: [{ lotNumber: { contains: search, mode: "insensitive" } }, { inventoryItem: { catalogItem: { name: { contains: search, mode: "insensitive" } } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseStockLot.findMany({ where, orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { inventoryItem: { select: { catalogItem: { select: { name: true, code: true } } } }, balances: { select: { quantityOnHand: true, quantityReserved: true } } } }),
    prisma.enterpriseStockLot.count({ where }),
  ]);
  return NextResponse.json({ items: items.map((item) => ({ ...item,
    quantityOnHand: item.balances.reduce((sum, balance) => sum.plus(balance.quantityOnHand), new Prisma.Decimal(0)).toFixed(3),
    quantityReserved: item.balances.reduce((sum, balance) => sum.plus(balance.quantityReserved), new Prisma.Decimal(0)).toFixed(3),
    balances: undefined,
  })), pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "INVENTORY_LOT_INPUT_INVALID", req);
  const input = parsed.data;
  try { await requireRetailWarehouseCapability(organizationId, session.userId, input.warehouseId, "MANAGE_STOCK"); } catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED"); }
  const [item, warehouse] = await Promise.all([
    prisma.enterpriseInventoryItem.findFirst({ where: { id: input.inventoryItemId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, lotTracking: true, expiryTracking: true } }),
    prisma.enterpriseWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
  ]);
  if (!item || !warehouse) return NextResponse.json({ error: "INVENTORY_LOT_REFERENCES_INVALID", message: "Choisissez un article de stock et un dépôt actifs de votre entreprise." }, { status: 404 });
  if (!item.lotTracking) return NextResponse.json({ error: "INVENTORY_LOT_TRACKING_REQUIRED", message: "Activez d’abord le suivi des lots dans les règles de stock de cet article." }, { status: 409 });
  if (item.expiryTracking && !input.expiryDate) return NextResponse.json({ error: "INVENTORY_LOT_EXPIRY_REQUIRED", message: "La date de péremption est obligatoire pour cet article." }, { status: 400 });
  if (input.productionDate && input.expiryDate && input.productionDate > input.expiryDate) return NextResponse.json({ error: "INVENTORY_LOT_DATES_INVALID", message: "La péremption doit suivre la date de fabrication." }, { status: 400 });
  const existing = await prisma.enterpriseStockLot.findFirst({ where: { organizationId, inventoryItemId: item.id, warehouseId: warehouse.id, lotNumber: input.lotNumber }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "INVENTORY_LOT_ALREADY_EXISTS", message: "Ce numéro de lot existe déjà pour cet article dans ce dépôt." }, { status: 409 });
  const lot = await prisma.enterpriseStockLot.create({ data: { organizationId, inventoryItemId: item.id, warehouseId: warehouse.id, lotNumber: input.lotNumber, productionDate: isoDate(input.productionDate), expiryDate: isoDate(input.expiryDate), notes: input.notes, createdByUserId: session.userId } });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_STOCK_LOT_REGISTERED", entity: "EnterpriseStockLot", entityId: lot.id, request: req, metadata: { warehouseId: warehouse.id, inventoryItemId: item.id, lotNumber: lot.lotNumber } });
  await writeApiLog({ request: req, startedAt, statusCode: 201, userId: session.userId, metadata: { organizationId, domain: "inventory-lots" } });
  return NextResponse.json({ ok: true, lot, message: "Lot enregistré sans quantité. Utilisez une entrée de stock à approuver pour enregistrer la réception physique." }, { status: 201 });
}

export async function PATCH(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "INVENTORY_LOT_INPUT_INVALID", req);
  const input = parsed.data;
  const lot = await prisma.enterpriseStockLot.findFirst({ where: { id: input.id, organizationId, archivedAt: null }, select: { id: true, warehouseId: true, inventoryItemId: true, lotNumber: true, revision: true, expiryDate: true, productionDate: true, status: true } });
  if (!lot) return NextResponse.json({ error: "INVENTORY_LOT_NOT_FOUND" }, { status: 404 });
  try { await requireRetailWarehouseCapability(organizationId, session.userId, lot.warehouseId, "MANAGE_STOCK"); } catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED"); }
  if (lot.revision !== input.revision) return NextResponse.json({ error: "INVENTORY_LOT_CONFLICT", message: "Le lot a été modifié entre-temps. Actualisez avant d’enregistrer." }, { status: 409 });
  if ((input.warehouseId && input.warehouseId !== lot.warehouseId) || (input.inventoryItemId && input.inventoryItemId !== lot.inventoryItemId) || (input.lotNumber && input.lotNumber !== lot.lotNumber)) return NextResponse.json({ error: "INVENTORY_LOT_IDENTITY_IMMUTABLE", message: "Le dépôt, l’article et le numéro de lot ne peuvent pas être modifiés après création." }, { status: 409 });
  const item = await prisma.enterpriseInventoryItem.findFirst({ where: { organizationId, id: lot.inventoryItemId }, select: { expiryTracking: true } });
  const expiryDate = input.expiryDate === undefined ? lot.expiryDate : isoDate(input.expiryDate);
  const productionDate = input.productionDate === undefined ? lot.productionDate : isoDate(input.productionDate);
  if ((item?.expiryTracking && !expiryDate) || (productionDate && expiryDate && productionDate > expiryDate)) return NextResponse.json({ error: "INVENTORY_LOT_DATES_INVALID", message: "Vérifiez les dates de fabrication et de péremption obligatoires." }, { status: 400 });
  const result = await prisma.enterpriseStockLot.updateMany({ where: { organizationId, id: lot.id, revision: input.revision }, data: { ...(input.expiryDate !== undefined ? { expiryDate } : {}), ...(input.productionDate !== undefined ? { productionDate } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}), ...(input.status ? { status: input.status } : {}), revision: { increment: 1 } } });
  if (!result.count) return NextResponse.json({ error: "INVENTORY_LOT_CONFLICT" }, { status: 409 });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_STOCK_LOT_UPDATED", entity: "EnterpriseStockLot", entityId: lot.id, request: req, metadata: { revision: input.revision + 1, status: input.status || lot.status } });
  return NextResponse.json({ ok: true, revision: input.revision + 1 });
}
