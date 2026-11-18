import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { EnterpriseDomainError, EnterpriseDomainConflictError } from "@/lib/enterprise/common/errors";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import { lotExpiryDateKey } from "@/lib/enterprise/inventory/lot-allocation";
import { requireInventoryStockAuthorityTx } from "@/lib/enterprise/inventory/service";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { retailInventoryVisibleSites, requireRetailWarehouseCapability } from "@/lib/enterprise/retail/site-access";
import { retailErrorResponse } from "@/lib/enterprise/retail/http";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
const fields = z.object({ inventoryItemId: z.string().min(1), warehouseId: z.string().min(1), lotNumber: z.string().trim().min(1).max(120), productionDate: z.iso.date().nullable(), expiryDate: z.iso.date().nullable(), notes: z.string().trim().max(1000).nullable() });
const createSchema = fields.strict();
const patchSchema = fields.partial().extend({ id: z.string().min(1), revision: z.number().int().positive(), status: z.enum(["AVAILABLE", "BLOCKED", "QUARANTINED"]).optional(), qualityReason:z.string().trim().min(8).max(1000).optional(), recall:z.literal(true).optional() }).strict();
const isoDate = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00.000Z`) : null;

export async function GET(req: Request, { params }: Params) {
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let scope: Awaited<ReturnType<typeof retailInventoryVisibleSites>>;
  try { scope = await retailInventoryVisibleSites(organizationId, session.userId); } catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED"); }
  const url = new URL(req.url);
  const page = Math.min(10000, Math.max(1, Math.floor(Number(url.searchParams.get("page") || 1)) || 1));
  const pageSize = 25;
  const search = (url.searchParams.get("search") || "").trim().slice(0, 120);
  const warehouseId = url.searchParams.get("warehouseId") || "";
  const scoped = scope.isolationEnabled ? {warehouse:{siteId:{in:scope.siteIds}}} : {};
  const traceId=url.searchParams.get("lotId");
  if (url.searchParams.get("view")==="trace") {
    if(!traceId || traceId.length>191) return NextResponse.json({error:"INVENTORY_LOT_INPUT_INVALID"},{status:400});
    const lot=await prisma.enterpriseStockLot.findFirst({where:{organizationId,id:traceId,...scoped},select:{id:true,inventoryItemId:true,lotNumber:true,recallReference:true,qualityReason:true,qualityChangedAt:true}});
    if(!lot) return NextResponse.json({error:"INVENTORY_LOT_NOT_FOUND"},{status:404});
    const movementWhere:Prisma.EnterpriseStockMovementWhereInput={organizationId,...scoped,stockLot:{organizationId,inventoryItemId:lot.inventoryItemId,lotNumber:lot.lotNumber}};
    const [items,total]=await Promise.all([prisma.enterpriseStockMovement.findMany({where:movementWhere,orderBy:[{occurredAt:"desc"},{id:"desc"}],skip:(page-1)*pageSize,take:pageSize,select:{id:true,movementType:true,direction:true,quantity:true,occurredAt:true,sourceEntityType:true,sourceEntityId:true,sourceLineId:true,warehouse:{select:{name:true,code:true}},stockLot:{select:{lotNumber:true,status:true,recallReference:true}}}}),prisma.enterpriseStockMovement.count({where:movementWhere})]);
    return NextResponse.json({lot,items,pagination:{page,pageSize,total,pageCount:Math.max(1,Math.ceil(total/pageSize))}},{headers:{"Cache-Control":"private, no-store"}});
  }
  const status=url.searchParams.get("status");
  const where: Prisma.EnterpriseStockLotWhereInput = {
    organizationId, archivedAt: null,
    ...(status==="RECALLED"?{recallReference:{not:null}}:status && ["AVAILABLE","BLOCKED","QUARANTINED"].includes(status)?{status}:{}),
    ...(warehouseId ? { warehouseId } : {}),
    ...(scope.isolationEnabled ? { warehouse: { siteId: { in: scope.siteIds } } } : {}),
    ...(search ? { OR: [{ lotNumber: { contains: search, mode: "insensitive" } }, { inventoryItem: { catalogItem: { name: { contains: search, mode: "insensitive" } } } }] } : {}),
  };
  const [items, total, organization] = await Promise.all([
    prisma.enterpriseStockLot.findMany({ where, orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { inventoryItem: { select: { catalogItem: { select: { name: true, code: true } } } }, balances: { select: { quantityOnHand: true, quantityReserved: true } } } }),
    prisma.enterpriseStockLot.count({ where }),
    prisma.organization.findUniqueOrThrow({where:{id:organizationId},select:{timezone:true}}),
  ]);
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:organization.timezone||"UTC",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const today=["year","month","day"].map(type=>parts.find(part=>part.type===type)?.value).join("-");
  return NextResponse.json({ items: items.map((item) => ({ ...item,
    expired:Boolean(item.expiryDate && lotExpiryDateKey(item.expiryDate)<today),
    quantityOnHand: item.balances.reduce((sum, balance) => sum.plus(balance.quantityOnHand), new Prisma.Decimal(0)).toFixed(3),
    quantityReserved: item.balances.reduce((sum, balance) => sum.plus(balance.quantityReserved), new Prisma.Decimal(0)).toFixed(3),
    balances: undefined,
  })), pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, canManage: access.canManage, canRecall:access.canAdminister && !scope.isolationEnabled, currentUserId:session.userId },{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await rateLimit(`inventory-lot-write:${organizationId}:${session.userId}`, 60, 60_000)).ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "INVENTORY_LOT_INPUT_INVALID", req);
  const input = parsed.data;
  try { await requireRetailWarehouseCapability(organizationId, session.userId, input.warehouseId, "MANAGE_STOCK"); } catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED"); }
  const [item, warehouse] = await Promise.all([
    prisma.enterpriseInventoryItem.findFirst({ where: { id: input.inventoryItemId, organizationId, status: "ACTIVE", archivedAt: null, catalogItem: { organizationId, status: "ACTIVE", archivedAt: null, trackInventory: true } }, select: { id: true, lotTracking: true, expiryTracking: true } }),
    prisma.enterpriseWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
  ]);
  if (!item || !warehouse) return NextResponse.json({ error: "INVENTORY_LOT_REFERENCES_INVALID", message: "Choisissez un article de stock et un dépôt actifs de votre entreprise." }, { status: 404 });
  if (!item.lotTracking) return NextResponse.json({ error: "INVENTORY_LOT_TRACKING_REQUIRED", message: "Activez d’abord le suivi des lots dans les règles de stock de cet article." }, { status: 409 });
  if (item.expiryTracking && !input.expiryDate) return NextResponse.json({ error: "INVENTORY_LOT_EXPIRY_REQUIRED", message: "La date de péremption est obligatoire pour cet article." }, { status: 400 });
  if (input.productionDate && input.expiryDate && input.productionDate > input.expiryDate) return NextResponse.json({ error: "INVENTORY_LOT_DATES_INVALID", message: "La péremption doit suivre la date de fabrication." }, { status: 400 });
  const recalled = await prisma.enterpriseStockLot.findFirst({where:{organizationId,inventoryItemId:item.id,lotNumber:input.lotNumber,recallReference:{not:null}},select:{id:true}});
  if(recalled) return enterpriseDomainErrorResponse(new EnterpriseDomainError("INVENTORY_LOT_RECALLED",409),"INVENTORY_LOT_CREATE_FAILED",req);
  const existing = await prisma.enterpriseStockLot.findFirst({ where: { organizationId, inventoryItemId: item.id, warehouseId: warehouse.id, lotNumber: input.lotNumber }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "INVENTORY_LOT_ALREADY_EXISTS", message: "Ce numéro de lot existe déjà pour cet article dans ce dépôt." }, { status: 409 });
  let lot;
  try { lot=await prisma.$transaction(async tx=>{
    await requireInventoryStockAuthorityTx(tx,organizationId,session.userId,warehouse.id);
    const active=await tx.enterpriseInventoryItem.findFirst({where:{organizationId,id:item.id,status:"ACTIVE",archivedAt:null,lotTracking:true,catalogItem:{status:"ACTIVE",archivedAt:null,trackInventory:true}}});
    if(!active || (active.expiryTracking && !input.expiryDate)) throw new EnterpriseDomainError("INVENTORY_LOT_REFERENCES_INVALID",409);
    if(await tx.enterpriseStockLot.findFirst({where:{organizationId,inventoryItemId:item.id,lotNumber:input.lotNumber,recallReference:{not:null}},select:{id:true}})) throw new EnterpriseDomainError("INVENTORY_LOT_RECALLED",409);
    return tx.enterpriseStockLot.create({ data: { organizationId, inventoryItemId: item.id, warehouseId: warehouse.id, lotNumber: input.lotNumber, productionDate: isoDate(input.productionDate), expiryDate: isoDate(input.expiryDate), notes: input.notes, createdByUserId: session.userId } });
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}); }
  catch(error) { if(error instanceof Prisma.PrismaClientKnownRequestError && ["P2002","P2034","P2004"].includes(error.code)) return enterpriseDomainErrorResponse(new EnterpriseDomainConflictError("INVENTORY_LOT_CONFLICT"),"INVENTORY_LOT_CREATE_FAILED",req); return enterpriseDomainErrorResponse(error,"INVENTORY_LOT_CREATE_FAILED",req); }
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
  if (!(await rateLimit(`inventory-lot-write:${organizationId}:${session.userId}`, 60, 60_000)).ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "INVENTORY_LOT_INPUT_INVALID", req);
  const input = parsed.data;
  try {
    const result=await prisma.$transaction(async tx=>{
      const lot=await tx.enterpriseStockLot.findFirst({where:{organizationId,id:input.id,archivedAt:null},include:{inventoryItem:{select:{expiryTracking:true,catalogItemId:true}}}});
      if(!lot) throw new EnterpriseDomainError("INVENTORY_LOT_NOT_FOUND",404);
      await requireInventoryStockAuthorityTx(tx,organizationId,session.userId,lot.warehouseId);
      if(lot.revision!==input.revision) throw new EnterpriseDomainConflictError("INVENTORY_LOT_CONFLICT");
      if((input.warehouseId && input.warehouseId!==lot.warehouseId)||(input.inventoryItemId && input.inventoryItemId!==lot.inventoryItemId)||(input.lotNumber && input.lotNumber!==lot.lotNumber)) throw new EnterpriseDomainError("INVENTORY_LOT_IDENTITY_IMMUTABLE",409);
      const expiryDate=input.expiryDate===undefined?lot.expiryDate:isoDate(input.expiryDate);
      const productionDate=input.productionDate===undefined?lot.productionDate:isoDate(input.productionDate);
      if((lot.inventoryItem.expiryTracking&&!expiryDate)||(productionDate&&expiryDate&&productionDate>expiryDate)) throw new EnterpriseDomainError("INVENTORY_LOT_DATES_INVALID",400);
      const dateChanged=expiryDate?.getTime()!==lot.expiryDate?.getTime() || productionDate?.getTime()!==lot.productionDate?.getTime();
      const changeStatus=Boolean(input.status && input.status!==lot.status);
      if(lot.recallReference && (changeStatus || dateChanged || input.recall)) throw new EnterpriseDomainError("INVENTORY_LOT_RECALLED",409);
      if(dateChanged && await tx.enterpriseStockMovement.count({where:{organizationId,stockLotId:lot.id}})) throw new EnterpriseDomainError("INVENTORY_LOT_DATES_LOCKED",409);
      if(changeStatus || input.recall) {
        if(!input.qualityReason) throw new EnterpriseDomainError("INVENTORY_LOT_QUALITY_REASON_REQUIRED",400);
        const [pharmacy,sector]=await Promise.all([tx.pharmacyProductExtension.count({where:{organizationId,catalogItemId:lot.inventoryItem.catalogItemId}}),tx.enterpriseSectorInventoryEvent.count({where:{organizationId,catalogItemId:lot.inventoryItem.catalogItemId}})]);
        if(pharmacy||sector) throw new EnterpriseDomainError("STOCK_RECLASS_SECTOR_AUTHORITY",409);
      }
      if(input.recall) {
        if(!access.canAdminister || (await retailInventoryVisibleSites(organizationId,session.userId,tx)).isolationEnabled) throw new EnterpriseDomainError("INVENTORY_LOT_RECALL_FORBIDDEN",403);
        const other=await tx.enterpriseStockLot.findFirst({where:{organizationId,inventoryItemId:lot.inventoryItemId,lotNumber:lot.lotNumber,recallReference:{not:null}},select:{recallReference:true}});
        if(other) throw new EnterpriseDomainError("INVENTORY_LOT_RECALLED",409);
        const reference="RECALL-"+randomUUID().slice(0,12).toUpperCase();
        const changed=await tx.enterpriseStockLot.updateMany({where:{organizationId,inventoryItemId:lot.inventoryItemId,lotNumber:lot.lotNumber},data:{status:"QUARANTINED",recallReference:reference,qualityReason:input.qualityReason,qualityChangedAt:new Date(),qualityChangedByUserId:session.userId,revision:{increment:1}}});
        await publishEnterpriseEvent(tx,{organizationId,entityType:"EnterpriseStockLot",entityId:lot.id,eventType:"STOCK_LOT_RECALLED",summary:reference,actorUserId:session.userId,fromStatus:lot.status,toStatus:"QUARANTINED",metadataJson:{reference,lotNumber:lot.lotNumber,affectedLots:changed.count,reason:input.qualityReason||""}});
        return {revision:lot.revision+1,recallReference:reference,affectedLots:changed.count,status:"QUARANTINED"};
      }
      if(changeStatus && input.status==="AVAILABLE") {
        if(!access.canAdminister || lot.qualityChangedByUserId===session.userId || dateChanged) throw new EnterpriseDomainError("INVENTORY_LOT_RELEASE_FORBIDDEN",403);
        const org=await tx.organization.findUniqueOrThrow({where:{id:organizationId},select:{timezone:true}});
        const parts=new Intl.DateTimeFormat("en-CA",{timeZone:org.timezone||"UTC",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
        const today=["year","month","day"].map(type=>parts.find(part=>part.type===type)?.value).join("-");
        if(expiryDate&&lotExpiryDateKey(expiryDate)<today) throw new EnterpriseDomainError("STOCK_LOT_EXPIRED",409);
        if(await tx.enterpriseStockAdjustment.count({where:{organizationId,stockLotId:lot.id,status:"PENDING_APPROVAL",lossReason:{not:null}}})) throw new EnterpriseDomainError("INVENTORY_LOT_RELEASE_LOSS_PENDING",409);
      }
      const changed=await tx.enterpriseStockLot.updateMany({where:{organizationId,id:lot.id,revision:input.revision},data:{...(input.expiryDate!==undefined?{expiryDate}:{}),...(input.productionDate!==undefined?{productionDate}:{}),...(input.notes!==undefined?{notes:input.notes}:{}),...(changeStatus?{status:input.status,qualityReason:input.qualityReason,qualityChangedAt:new Date(),qualityChangedByUserId:session.userId}:{}),revision:{increment:1}}});
      if(changed.count!==1) throw new EnterpriseDomainConflictError("INVENTORY_LOT_CONFLICT");
      if(changeStatus) await publishEnterpriseEvent(tx,{organizationId,entityType:"EnterpriseStockLot",entityId:lot.id,eventType:"STOCK_LOT_QUALITY_CHANGED",summary:lot.lotNumber,actorUserId:session.userId,fromStatus:lot.status,toStatus:input.status,metadataJson:{reason:input.qualityReason||""}});
      return {revision:lot.revision+1,status:input.status||lot.status};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    await writeAuditLog({userId:session.userId,organizationId,action:input.recall?"ENTERPRISE_STOCK_LOT_RECALLED":"ENTERPRISE_STOCK_LOT_UPDATED",entity:"EnterpriseStockLot",entityId:input.id,request:req,metadata:{...result,reason:input.qualityReason||null}});
    return NextResponse.json({ok:true,...result});
  } catch(error) {
    if(error instanceof Prisma.PrismaClientKnownRequestError && ["P2034","P2002","P2004"].includes(error.code)) return enterpriseDomainErrorResponse(new EnterpriseDomainConflictError("INVENTORY_LOT_CONFLICT"),"INVENTORY_LOT_UPDATE_FAILED",req);
    return enterpriseDomainErrorResponse(error,"INVENTORY_LOT_UPDATE_FAILED",req);
  }
}
