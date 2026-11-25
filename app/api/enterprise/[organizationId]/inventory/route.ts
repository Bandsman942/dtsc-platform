import { exactInventoryQuantity } from "@/lib/enterprise/inventory/quantity-policy";
import { Prisma } from "@prisma/client";
import { formatInventoryQuantity } from "@/lib/enterprise/inventory/quantity-display";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { retailErrorResponse } from "@/lib/enterprise/retail/http";
import { requireRetailWarehouseCapability, retailInventoryVisibleSites } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";
import { planReservationLotAllocations } from "@/lib/enterprise/inventory/lot-allocation";
import { readActiveRetailInvoiceStockHoldsTx } from "@/lib/enterprise/retail/invoice-stock-holds";
import { businessDateKey } from "@/lib/enterprise/retail/inventory-policy";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let scope: Awaited<ReturnType<typeof retailInventoryVisibleSites>>;
  try { scope = await retailInventoryVisibleSites(organizationId, session.userId); }
  catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED"); }
  const url = new URL(req.url);
  if (url.searchParams.get("view") === "lot-options") {
    // A first batch does not require a pre-existing warehouse balance. Return
    // only shared catalogue identity and traceability flags, never other-site quantities.
    if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const warehouseId = url.searchParams.get("warehouseId")?.trim() || "";
    if (!warehouseId) return NextResponse.json({ error: "INVENTORY_WAREHOUSE_REQUIRED", message: "Choisissez un dépôt actif." }, { status: 400 });
    const warehouse = await prisma.enterpriseWarehouse.findFirst({ where: { id: warehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
    if (!warehouse) return NextResponse.json({ error: "INVENTORY_WAREHOUSE_NOT_FOUND" }, { status: 404 });
    try { await requireRetailWarehouseCapability(organizationId, session.userId, warehouseId, "MANAGE_STOCK"); }
    catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED"); }
    const requestedPage = Number(url.searchParams.get("page") || 1);
    const page = Number.isSafeInteger(requestedPage) ? Math.max(1, Math.min(10000, requestedPage)) : 1;
    const pageSize = 25;
    const search = (url.searchParams.get("search") || "").trim().slice(0, 120);
    // Sector projections are not a second batch register. Apply exclusion
    // before pagination/count (indexed, tenant-scoped anti-joins).
    const matching = search ? Prisma.sql`AND (strpos(lower(c.name),lower(${search}))>0 OR strpos(lower(c.code),lower(${search}))>0 OR strpos(lower(c.sku),lower(${search}))>0)` : Prisma.empty;
    const eligible = Prisma.sql`
      FROM "EnterpriseInventoryItem" i
      JOIN "EnterpriseCatalogItem" c ON c.id=i."catalogItemId" AND c."organizationId"=i."organizationId"
      WHERE i."organizationId"=${organizationId} AND i.status='ACTIVE' AND i."archivedAt" IS NULL
        AND i."lotTracking"=true AND c.status='ACTIVE' AND c."archivedAt" IS NULL AND c."trackInventory"=true
        AND NOT EXISTS (SELECT 1 FROM "PharmacyProductExtension" p WHERE p."organizationId"=i."organizationId" AND p."catalogItemId"=c.id)
        AND NOT EXISTS (SELECT 1 FROM "EnterpriseSectorInventoryEvent" e WHERE e."organizationId"=i."organizationId" AND e."catalogItemId"=c.id)
        ${matching}`;
    const [rows, counts] = await prisma.$transaction(async tx => Promise.all([
      tx.$queryRaw<Array<{ id:string; expiryTracking:boolean; name:string; code:string }>>(Prisma.sql`SELECT i.id,i."expiryTracking",c.name,c.code ${eligible} ORDER BY c.name ASC,i.id ASC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`),
      tx.$queryRaw<Array<{ total:bigint }>>(Prisma.sql`SELECT COUNT(*) AS total ${eligible}`),
    ]), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const items = rows.map(row=>({id:row.id,expiryTracking:row.expiryTracking,catalogItem:{name:row.name,code:row.code}}));
    const total = Number(counts[0]?.total || 0);
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "inventory-lot-options", page } });
    return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const page = Math.max(1, Math.min(10000, Math.floor(Number(url.searchParams.get("page") || 1)) || 1));
  const pageSize = Math.min(50, Math.max(5, Math.floor(Number(url.searchParams.get("pageSize") || 20)) || 20));
  const search = (url.searchParams.get("search")?.trim() || "").slice(0,120);
  const warehouseId = url.searchParams.get("warehouseId")?.trim() || "";
  const lowStock = url.searchParams.get("lowStock") === "true";
  const balancesScope: Prisma.EnterpriseInventoryBalanceWhereInput = {
    ...(warehouseId ? { warehouseId } : {}),
    ...(scope.isolationEnabled ? { warehouse: { siteId: { in: scope.siteIds } } } : {}),
  };
  const where: Prisma.EnterpriseInventoryItemWhereInput = {
    organizationId,
    archivedAt: null,
    status: "ACTIVE",
    ...(search ? { catalogItem: { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }] } } : {}),
    ...(warehouseId || scope.isolationEnabled ? { balances: { some: balancesScope } } : {}),
  };
  // The minimum threshold is a physical replenishment threshold, distinct
  // from the net sellable balance. Aggregate the complete scoped dataset
  // before pagination, rather than filtering only the current page.
  const warehouseClause=warehouseId?Prisma.sql`AND b."warehouseId"=${warehouseId}`:Prisma.empty;
  const siteClause=scope.isolationEnabled?(scope.siteIds.length?Prisma.sql`AND w."siteId" IN (${Prisma.join(scope.siteIds)})`:Prisma.sql`AND FALSE`):Prisma.empty;
  const matchingSearch=search?Prisma.sql`AND (c.name ILIKE ${"%"+search+"%"} OR c.code ILIKE ${"%"+search+"%"} OR c.sku ILIKE ${"%"+search+"%"})`:Prisma.empty;
  const balanceRequired=warehouseId||scope.isolationEnabled?Prisma.sql`AND b."inventoryItemId" IS NOT NULL`:Prisma.empty;
  const scopedItemsQuery=Prisma.sql`
    WITH scoped_balances AS (
      SELECT b."inventoryItemId", SUM(b."quantityOnHand") AS on_hand
      FROM "EnterpriseInventoryBalance" b
      JOIN "EnterpriseWarehouse" w ON w.id=b."warehouseId" AND w."organizationId"=b."organizationId"
      WHERE b."organizationId"=${organizationId} ${warehouseClause} ${siteClause}
      GROUP BY b."inventoryItemId"
    )
    SELECT i.id,c.name,c."unitOfMeasureId",COALESCE(b.on_hand,0) AS on_hand,i."minimumQuantity" FROM "EnterpriseInventoryItem" i
    JOIN "EnterpriseCatalogItem" c ON c.id=i."catalogItemId" AND c."organizationId"=i."organizationId"
    LEFT JOIN scoped_balances b ON b."inventoryItemId"=i.id
    WHERE i."organizationId"=${organizationId} AND i."archivedAt" IS NULL AND i.status='ACTIVE'
      ${matchingSearch} ${balanceRequired}`;
  const lowStockQuery=Prisma.sql`SELECT id,name FROM (${scopedItemsQuery}) scoped WHERE "minimumQuantity" IS NOT NULL AND on_hand<="minimumQuantity"`;
  const selectedScope=lowStock ? Prisma.sql`WHERE scoped."minimumQuantity" IS NOT NULL AND scoped.on_hand<=scoped."minimumQuantity"` : Prisma.empty;
  // Physical stock only: sellable and reserved include separate FEFO/hold sources,
  // so do not derive them from the physical total.
  const physicalTotalsQuery=Prisma.sql`
    SELECT u.id AS "unitId",u.name AS "unitName",u.symbol AS "unitSymbol",u."decimalScale",SUM(scoped.on_hand) AS quantity
    FROM (SELECT scoped.* FROM (${scopedItemsQuery}) scoped ${selectedScope}) scoped
    JOIN "EnterpriseUnitOfMeasure" u ON u.id=scoped."unitOfMeasureId" AND u."organizationId"=${organizationId}
    GROUP BY u.id,u.name,u.symbol,u."decimalScale" ORDER BY u.name,u.id`;
  const [lowCount, lowPage, physicalTotals]=await Promise.all([
    prisma.$queryRaw<Array<{total:bigint}>>(Prisma.sql`SELECT COUNT(*) AS total FROM (${lowStockQuery}) l`),
    lowStock?prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM (${lowStockQuery}) l ORDER BY name ASC,id ASC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`):Promise.resolve([]),
    prisma.$queryRaw<Array<{unitId:string;unitName:string;unitSymbol:string|null;decimalScale:number;quantity:Prisma.Decimal}>>(physicalTotalsQuery),
  ]);
  const lowStockCount=Number(lowCount[0]?.total||0);
  const itemWhere:Prisma.EnterpriseInventoryItemWhereInput=lowStock?{AND:[where,{id:{in:lowPage.map(row=>row.id)}}]}:where;
  const [items,total,movementCount,warehouseCount,organization]=await Promise.all([
    prisma.enterpriseInventoryItem.findMany({where:itemWhere,orderBy:[{catalogItem:{name:"asc"}},{id:"asc"}],skip:lowStock?0:(page-1)*pageSize,take:pageSize,include:{catalogItem:{include:{unitOfMeasure:true,category:true}},balances:{where:warehouseId||scope.isolationEnabled?balancesScope:undefined,include:{warehouse:{select:{id:true,code:true,name:true,status:true,archivedAt:true}},storageLocation:{select:{id:true,code:true,name:true,status:true,archivedAt:true}},stockLot:{select:{id:true,lotNumber:true,expiryDate:true,status:true,archivedAt:true}}},orderBy:{updatedAt:"desc"}}}}),
    lowStock?Promise.resolve(lowStockCount):prisma.enterpriseInventoryItem.count({where}),
    prisma.enterpriseStockMovement.count({where:{organizationId,...(scope.isolationEnabled?{warehouse:{siteId:{in:scope.siteIds}}}:{})}}),
    prisma.enterpriseWarehouse.count({
      where: {
        organizationId,
        status: "ACTIVE",
        archivedAt: null,
        ...(scope.isolationEnabled ? { siteId: { in: scope.siteIds } } : {}),
      },
    }),
    prisma.organization.findUniqueOrThrow({where:{id:organizationId},select:{timezone:true}}),
  ]);
  // One bounded read per promise source for the page; use the same FEFO
  // planner as reservation creation and retail availability, not onHand alone.
  const itemIds=items.map(item=>item.id);
  const pageWarehouseIds=[...new Set(items.flatMap(item=>item.balances.map(row=>row.warehouseId)))];
  const [reservations,holds]=await Promise.all([
    prisma.enterpriseInventoryReservation.findMany({where:{organizationId,inventoryItemId:{in:itemIds},status:"ACTIVE",OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}],warehouseId:{in:pageWarehouseIds}},select:{inventoryItemId:true,warehouseId:true,quantity:true,fulfilledQuantity:true,lotAllocations:true,storageLocationId:true}}),
    readActiveRetailInvoiceStockHoldsTx(prisma,{organizationId,inventoryItemIds:itemIds,...(warehouseId?{warehouseId}:{})}),
  ]);
  const pageCatalogIds=[...new Set(items.map(item=>item.catalogItemId))];
  const [pharmacyItems,sectorItems]=await Promise.all([
    prisma.pharmacyProductExtension.findMany({where:{organizationId,catalogItemId:{in:pageCatalogIds}},select:{catalogItemId:true}}),
    prisma.enterpriseSectorInventoryEvent.groupBy({by:["catalogItemId"],where:{organizationId,catalogItemId:{in:pageCatalogIds}}}),
  ]);
  const sectorManaged=new Set([...pharmacyItems,...sectorItems].map(row=>row.catalogItemId));
  const zero=()=>exactInventoryQuantity(0);
  const today=businessDateKey(new Date(),organization.timezone||"UTC");
  const normalizedItems=items.map(item=>{
    const physical=item.balances.reduce((sum,row)=>sum.plus(row.quantityOnHand),zero());
    const legacy=item.balances.reduce((sum,row)=>sum.plus(row.quantityReserved),zero());
    const authorizedWarehouseIds=new Set(item.balances.map(row=>row.warehouseId));
    const activeReservations=reservations.filter(row=>row.inventoryItemId===item.id&&authorizedWarehouseIds.has(row.warehouseId));
    const activeHolds=holds.filter(row=>row.inventoryItemId===item.id&&authorizedWarehouseIds.has(row.warehouseId));
    const orderReserved=activeReservations.reduce((sum,row)=>sum.plus(exactInventoryQuantity(row.quantity).minus(row.fulfilledQuantity)),zero());
    const invoiceHeld=activeHolds.reduce((sum,row)=>sum.plus(row.quantity),zero());
    let available=zero();
    for(const warehouseId of authorizedWarehouseIds){
      const rows=item.balances.filter(row=>row.warehouseId===warehouseId&&row.warehouse.status==="ACTIVE"&&!row.warehouse.archivedAt&&(!row.storageLocationId||(row.storageLocation?.status==="ACTIVE"&&!row.storageLocation.archivedAt)));
      const promised=activeReservations.filter(row=>row.warehouseId===warehouseId);
      const held=activeHolds.filter(row=>row.warehouseId===warehouseId);
      const tracked=item.lotTracking||item.expiryTracking;
      if(tracked){
        const positive=rows.filter(row=>row.quantityOnHand.gt(0));
        const demand=positive.reduce((sum,row)=>sum.plus(row.quantityOnHand),zero());
        if(demand.gt(0)){
          const plan=planReservationLotAllocations({balances:positive,reservations:promised,holds:held,quantity:demand,businessDate:today,requireExpiry:item.expiryTracking});
          available=available.plus(plan.allocations.reduce((sum,row)=>sum.plus(row.quantity),zero()));
        }
      }else{
        const local=rows.reduce((sum,row)=>sum.plus(exactInventoryQuantity(row.quantityOnHand).minus(row.quantityReserved)),zero())
          .minus(promised.reduce((sum,row)=>sum.plus(exactInventoryQuantity(row.quantity).minus(row.fulfilledQuantity)),zero()))
          .minus(held.reduce((sum,row)=>sum.plus(row.quantity),zero()));
        if(local.gt(0))available=available.plus(local);
      }
    }
    return {...item,quantityOnHandExact:physical.toFixed(),quantityReservedExact:legacy.plus(orderReserved).plus(invoiceHeld).toFixed(),quantityAvailableExact:available.toFixed(),sectorManaged:sectorManaged.has(item.catalogItemId),quantityOnHand:Number(physical),quantityReserved:Number(legacy.plus(orderReserved).plus(invoiceHeld)),legacyQuantityReserved:Number(legacy),orderReservedQuantity:Number(orderReserved),invoiceHeldQuantity:Number(invoiceHeld),quantityAvailable:Number(available),isLowStock:item.minimumQuantity!==null&&physical.lte(item.minimumQuantity)};
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "inventory", page } });
  return NextResponse.json({ items: normalizedItems, physicalTotals:physicalTotals.map(row=>({unitId:row.unitId,unit:row.unitSymbol||row.unitName,decimalScale:row.decimalScale,...formatInventoryQuantity(row.quantity,row.decimalScale)})), pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { lowStockCount, movementCount, warehouseCount }, canManage: access.canManage && !scope.isolationEnabled, canAdminister: access.canAdminister && !scope.isolationEnabled });
}
