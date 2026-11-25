import { inventoryQuantityMetrics, inventoryQuantityTotals, readInventoryQuantityTotalsTx } from "@/lib/enterprise/inventory/availability-analytics";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { retailErrorResponse } from "@/lib/enterprise/retail/http";
import { requireRetailWarehouseCapability, retailInventoryVisibleSites } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";
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
  return prisma.$transaction(async tx => {
  const page = Math.max(1, Math.min(10000, Math.floor(Number(url.searchParams.get("page") || 1)) || 1));
  const pageSize = Math.min(50, Math.max(5, Math.floor(Number(url.searchParams.get("pageSize") || 20)) || 20));
  const search = (url.searchParams.get("search")?.trim() || "").slice(0,120);
  const warehouseId = url.searchParams.get("warehouseId")?.trim() || "";
  const lowStock = url.searchParams.get("lowStock") === "true";
  const asOf = new Date();
  const balancesScope: Prisma.EnterpriseInventoryBalanceWhereInput = {
    organizationId,
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
  const selectedIds=Prisma.sql`SELECT scoped.id FROM (${scopedItemsQuery}) scoped ${selectedScope}`;
  const [lowCount, pageIds, selectedCount]=await Promise.all([
    tx.$queryRaw<Array<{total:bigint}>>(Prisma.sql`SELECT COUNT(*) AS total FROM (${lowStockQuery}) l`),
    tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT scoped.id FROM (${scopedItemsQuery}) scoped ${selectedScope} ORDER BY scoped.name ASC,scoped.id ASC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`),
    lowStock?Promise.resolve([]):tx.$queryRaw<Array<{total:bigint}>>(Prisma.sql`SELECT COUNT(*) AS total FROM (${selectedIds}) selected`),
  ]);
  const lowStockCount=Number(lowCount[0]?.total||0);
  const total=lowStock?lowStockCount:Number(selectedCount[0]?.total||0);
  // Pagination and count reuse the authorized SQL selection. Fetch only those
  // keys instead of repeating expensive relation predicates for a tiny page.
  const itemWhere:Prisma.EnterpriseInventoryItemWhereInput={organizationId,id:{in:pageIds.map(row=>row.id)}};
  const filteredMovementCountQuery=Prisma.sql`WITH selected AS MATERIALIZED (${selectedIds}) SELECT COUNT(*) AS total FROM "EnterpriseStockMovement" b JOIN "EnterpriseWarehouse" w ON w.id=b."warehouseId" AND w."organizationId"=b."organizationId" WHERE b."organizationId"=${organizationId} ${warehouseClause} ${siteClause} AND b."inventoryItemId" IN (SELECT id FROM selected)`;
  const filteredWarehouseCountQuery=Prisma.sql`WITH selected AS MATERIALIZED (${selectedIds}) SELECT COUNT(DISTINCT w.id) AS total FROM "EnterpriseInventoryBalance" b JOIN "EnterpriseWarehouse" w ON w.id=b."warehouseId" AND w."organizationId"=b."organizationId" WHERE b."organizationId"=${organizationId} ${warehouseClause} ${siteClause} AND w.status='ACTIVE' AND w."archivedAt" IS NULL AND b."inventoryItemId" IN (SELECT id FROM selected)`;
  const [items,generalMovementCount,generalWarehouseCount,organization,filteredMovementCounts,filteredWarehouseCounts]=await Promise.all([
    tx.enterpriseInventoryItem.findMany({where:itemWhere,orderBy:[{catalogItem:{name:"asc"}},{id:"asc"}],take:pageSize,include:{catalogItem:{include:{unitOfMeasure:true,category:true}},balances:{where:warehouseId||scope.isolationEnabled?balancesScope:undefined,include:{warehouse:{select:{id:true,code:true,name:true,status:true,archivedAt:true}},storageLocation:{select:{id:true,code:true,name:true,status:true,archivedAt:true}},stockLot:{select:{id:true,lotNumber:true,expiryDate:true,status:true,archivedAt:true}}},orderBy:{updatedAt:"desc"}}}}),
    tx.enterpriseStockMovement.count({where:{organizationId,...(scope.isolationEnabled?{warehouse:{siteId:{in:scope.siteIds}}}:{})}}),
    tx.enterpriseWarehouse.count({
      where: {
        organizationId,
        status: "ACTIVE",
        archivedAt: null,
        ...(scope.isolationEnabled ? { siteId: { in: scope.siteIds } } : {}),
      },
    }),
    tx.organization.findUniqueOrThrow({where:{id:organizationId},select:{timezone:true}}),
    tx.$queryRaw<Array<{total:bigint}>>(filteredMovementCountQuery),
    tx.$queryRaw<Array<{total:bigint}>>(filteredWarehouseCountQuery),
  ]);
  // One bounded read per promise source for the page; use the same FEFO
  // planner as reservation creation and retail availability, not onHand alone.
  const itemIds=items.map(item=>item.id);
  const pageWarehouseIds=[...new Set(items.flatMap(item=>item.balances.map(row=>row.warehouseId)))];
  const [reservations,holds]=await Promise.all([
    tx.enterpriseInventoryReservation.findMany({where:{organizationId,inventoryItemId:{in:itemIds},status:"ACTIVE",OR:[{expiresAt:null},{expiresAt:{gt:asOf}}],warehouseId:{in:pageWarehouseIds}},select:{inventoryItemId:true,warehouseId:true,quantity:true,fulfilledQuantity:true,lotAllocations:true,storageLocationId:true}}),
    readActiveRetailInvoiceStockHoldsTx(tx,{organizationId,inventoryItemIds:itemIds,warehouseIds:pageWarehouseIds,...(warehouseId?{warehouseId}:{})}),
  ]);
  const pageCatalogIds=[...new Set(items.map(item=>item.catalogItemId))];
  const [pharmacyItems,sectorItems]=await Promise.all([
    tx.pharmacyProductExtension.findMany({where:{organizationId,catalogItemId:{in:pageCatalogIds}},select:{catalogItemId:true}}),
    tx.enterpriseSectorInventoryEvent.groupBy({by:["catalogItemId"],where:{organizationId,catalogItemId:{in:pageCatalogIds}}}),
  ]);
  const sectorManaged=new Set([...pharmacyItems,...sectorItems].map(row=>row.catalogItemId));
  const today=businessDateKey(asOf,organization.timezone||"UTC");
  const rowMetrics=new Map(items.map(item=>[item.id,inventoryQuantityMetrics(item,reservations,holds,today)]));
  const normalizedItems=items.map(item=>{
    const values=rowMetrics.get(item.id)!;
    return {...item,quantityOnHandExact:values.onHand.toFixed(),quantityReservedExact:values.reserved.toFixed(),quantityAvailableExact:values.sellable.toFixed(),sectorManaged:sectorManaged.has(item.catalogItemId),quantityOnHand:Number(values.onHand),quantityReserved:Number(values.reserved),legacyQuantityReserved:Number(values.legacy),orderReservedQuantity:Number(values.orderReserved),invoiceHeldQuantity:Number(values.invoiceHeld),quantityAvailable:Number(values.sellable),isLowStock:item.minimumQuantity!==null&&values.onHand.lte(item.minimumQuantity)};
  });
  const totalsInput={organizationId,where,balancesWhere:balancesScope,lowStock,businessDate:today,asOf};
  const quantityTotals=await readInventoryQuantityTotalsTx(tx,totalsInput);
  const generalBalancesScope:Prisma.EnterpriseInventoryBalanceWhereInput={organizationId,...(scope.isolationEnabled?{warehouse:{siteId:{in:scope.siteIds}}}:{})};
  const generalWhere:Prisma.EnterpriseInventoryItemWhereInput={organizationId,status:"ACTIVE",archivedAt:null,...(scope.isolationEnabled?{balances:{some:generalBalancesScope}}:{})};
  const generalQuantityTotals=!search&&!warehouseId&&!lowStock?quantityTotals:await readInventoryQuantityTotalsTx(tx,{...totalsInput,where:generalWhere,balancesWhere:generalBalancesScope,lowStock:false});
  const pageQuantityTotals=inventoryQuantityTotals(items.map(item=>({unit:item.catalogItem.unitOfMeasure,metrics:rowMetrics.get(item.id)!})));
  const physicalTotals=quantityTotals.filter(row=>row.metric==="onHand");
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "inventory", page } });
  return NextResponse.json({ items: normalizedItems, physicalTotals, quantityTotals, generalQuantityTotals, pageQuantityTotals, analyticsAsOf:asOf.toISOString(), pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { lowStockCount, movementCount:Number(filteredMovementCounts[0]?.total||0), warehouseCount:Number(filteredWarehouseCounts[0]?.total||0) }, generalMetrics:{movementCount:generalMovementCount,warehouseCount:generalWarehouseCount}, canManage: access.canManage && !scope.isolationEnabled, canAdminister: access.canAdminister && !scope.isolationEnabled },{headers:{"Cache-Control":"private, no-store"}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:30000});
}
