import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// Run after migrate deploy on the isolated CI DB. Fixture writes are rolled back.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; PostgreSQL verification cannot be skipped");
const target = new URL(process.env.DATABASE_URL);
if (process.env.QA_1228_DATABASE_FIXTURE !== "true" || !["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.endsWith("_test")) {
  throw new Error("An explicitly enabled local isolated *_test database is required for the rollback fixture");
}
const db = new PrismaClient();
class RollbackFixture extends Error {}
try {
  const expected = [
    ["EnterpriseInventoryBalance", "quantityOnHand", 21],
    ["EnterpriseInventoryBalance", "quantityReserved", 21],
    ["EnterpriseStockMovement", "quantity", 21],
    ["EnterpriseStockMovement", "balanceAfter", 21],
    ["EnterpriseInventoryReservation", "quantity", 21],
    ["EnterpriseStockTransferLine", "quantity", 21],
    ["EnterpriseQuoteItem", "quantity", 21],
    ["EnterpriseSalesOrderItem", "quantityOrdered", 21],
    ["EnterprisePurchaseItem", "quantity", 21],
    ["EnterpriseProductionOrder", "plannedQuantity", 21],
    ["EnterpriseInventoryCostLayer", "remainingQuantity", 21],
    ["EnterpriseInventoryTransferValuation", "quantity", 21],
    ["PharmacyStockMovement", "quantity", 17],
    ["HealthPharmacyStockMovement", "quantity", 17],
  ];
  const columns = await db.$queryRaw`SELECT table_name, column_name, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_schema=current_schema() AND data_type='numeric'`;
  for (const [table, field, precision] of expected) {
    const found = columns.find(row => row.table_name === table && row.column_name === field);
    assert.ok(found, `${table}.${field} must exist`);
    assert.equal(found.numeric_precision, precision, `${table}.${field} preserves integer capacity`);
    assert.equal(found.numeric_scale, 6, `${table}.${field} preserves micro-units`);
  }
  const [row] = await db.$queryRaw`SELECT
    '999999999999999.999999'::numeric(21,6)::text AS common_max,
    '99999999999.999999'::numeric(17,6)::text AS sector_max,
    (5::numeric(21,6)-0.123456::numeric(21,6))::text AS residual`;
  assert.equal(row.common_max, "999999999999999.999999");
  assert.equal(row.sector_max, "99999999999.999999");
  assert.equal(row.residual, "4.876544");
  const [constraint] = await db.$queryRaw`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='"EnterpriseInventoryTransferValuation"'::regclass AND conname='inv_transfer_value_amount_ck'`;
  assert.match(constraint.definition, /round\(quantity, 6\)/);
  assert.match(constraint.definition, /sourceQuantityBefore/);
  assert.match(constraint.definition, /sourceValueBefore/);
  const tenant = `qa-1228-${randomUUID()}`;
  const otherTenant = `${tenant}-other`;
  const actor = "qa-1228-actor";
  try {
    await db.$transaction(async tx => {
      const unit = await tx.enterpriseUnitOfMeasure.create({ data: { organizationId: tenant, code: "MICRO", name: "Micro-unit", decimalScale: 6 } });
      const otherUnit = await tx.enterpriseUnitOfMeasure.create({ data: { organizationId: otherTenant, code: "MICRO", name: "Other unit", decimalScale: 6 } });
      const catalogData = { code: "MICRO", name: "Micro article", normalizedName: "micro article", itemType: "PRODUCT", trackInventory: true, createdByUserId: actor };
      const item = await tx.enterpriseCatalogItem.create({ data: { ...catalogData, organizationId: tenant, unitOfMeasureId: unit.id } });
      const foreign = await tx.enterpriseCatalogItem.create({ data: { ...catalogData, organizationId: otherTenant, unitOfMeasureId: otherUnit.id } });
      await tx.$executeRawUnsafe("SAVEPOINT qa_1228_tenant");
      await assert.rejects(async () => tx.enterpriseInventoryItem.create({ data: { organizationId: tenant, catalogItemId: foreign.id, createdByUserId: actor } }), { code: "P2003" });
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT qa_1228_tenant");
      const site = await tx.enterpriseSite.create({ data: { organizationId: tenant, code: "SHOP", name: "QA shop", siteType: "STORE", createdByUserId: actor } });
      const warehouse = await tx.enterpriseWarehouse.create({ data: { organizationId: tenant, siteId: site.id, code: "WH", name: "QA warehouse", createdByUserId: actor } });
      const inventory = await tx.enterpriseInventoryItem.create({ data: { organizationId: tenant, catalogItemId: item.id, createdByUserId: actor } });
      const coordinates = { organizationId: tenant, inventoryItemId: inventory.id, warehouseId: warehouse.id };
      const balance = await tx.enterpriseInventoryBalance.create({ data: { ...coordinates, quantityOnHand: "999999999999999.999998" } });
      const updated = await tx.enterpriseInventoryBalance.update({ where: { id: balance.id }, data: { quantityOnHand: { increment: "0.000001" } } });
      assert.equal(updated.quantityOnHand.toFixed(), "999999999999999.999999", "Prisma round-trip and PostgreSQL increment retain the last micro-unit");
      const movement = await tx.enterpriseStockMovement.create({ data: { ...coordinates, movementType: "PURCHASE_RECEIPT", direction: "IN", quantity: "0.123456", balanceAfter: "999999999999999.999999", idempotencyKey: `${tenant}-movement`, createdByUserId: actor } });
      assert.equal(movement.quantity.toFixed(), "0.123456");
      assert.equal(movement.balanceAfter.toFixed(), "999999999999999.999999");
      const layer = await tx.enterpriseInventoryCostLayer.create({ data: { organizationId: tenant, inventoryItemId: inventory.id, warehouseId: warehouse.id, sourceMovementId: movement.id, valuationMethod: "WEIGHTED_AVERAGE", quantity: "0.123456", remainingQuantity: "0.123456", unitCost: "2.5", totalCost: "0.30864", currencyCode: "CDF", effectiveAt: new Date() } });
      assert.equal(layer.remainingQuantity.toFixed(), "0.123456");
      await tx.$executeRawUnsafe("SAVEPOINT qa_1228_idempotence");
      await assert.rejects(async () => tx.enterpriseStockMovement.create({ data: { ...coordinates, movementType: "PURCHASE_RECEIPT", direction: "IN", quantity: "0.123456", idempotencyKey: `${tenant}-movement`, createdByUserId: actor } }), { code: "P2002" });
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT qa_1228_idempotence");
      throw new RollbackFixture();
    }, { timeout: 30000 });
  } catch (error) {
    if (!(error instanceof RollbackFixture)) throw error;
  }
  assert.equal(await db.enterpriseCatalogItem.count({ where: { organizationId: { in: [tenant, otherTenant] } } }), 0, "No fixture data may remain");
  console.log("PASS #1228 PostgreSQL: deployed quantity types, preserved integer capacity, exact micro-unit subtraction and transfer conservation constraint");
} finally {
  await db.$disconnect();
}
