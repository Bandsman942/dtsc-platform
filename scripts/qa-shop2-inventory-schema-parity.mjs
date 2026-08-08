import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const expected = new Map([
  ["EnterpriseInventoryItem_organizationId_catalogItemId_key", { table: "EnterpriseInventoryItem", nullsNotDistinct: false }],
  ["EnterpriseStockLot_organizationId_id_key", { table: "EnterpriseStockLot", nullsNotDistinct: false }],
  ["EnterpriseStockLot_organizationId_inventoryItemId_lotNumber_key", { table: "EnterpriseStockLot", nullsNotDistinct: false }],
  ["EnterpriseInventoryBalance_organizationId_inventoryItemId_warehouseId_storageLocationId_stockLotId_key", { table: "EnterpriseInventoryBalance", nullsNotDistinct: true }],
  ["EnterpriseStockMovement_organizationId_id_key", { table: "EnterpriseStockMovement", nullsNotDistinct: false }],
  ["EnterpriseStockMovement_organizationId_idempotencyKey_key", { table: "EnterpriseStockMovement", nullsNotDistinct: false }],
]);

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN (
        'EnterpriseInventoryItem',
        'EnterpriseStockLot',
        'EnterpriseInventoryBalance',
        'EnterpriseStockMovement'
      )
  `);

  const byName = new Map(rows.map((row) => [row.indexname, row]));
  const failures = [];

  for (const [indexName, rule] of expected) {
    const row = byName.get(indexName);
    if (!row) {
      failures.push(`missing ${indexName}`);
      continue;
    }
    if (row.tablename !== rule.table) failures.push(`${indexName} targets ${row.tablename}, expected ${rule.table}`);
    if (!/CREATE UNIQUE INDEX/i.test(row.indexdef)) failures.push(`${indexName} is not UNIQUE`);
    if (rule.nullsNotDistinct && !/NULLS NOT DISTINCT/i.test(row.indexdef)) {
      failures.push(`${indexName} must use NULLS NOT DISTINCT`);
    }
  }

  if (failures.length) {
    console.error("Shop 2 inventory schema parity failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Shop 2 inventory schema parity OK (${expected.size} unique indexes verified).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
