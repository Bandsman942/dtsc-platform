import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const expected = [
  { label: "inventory item per catalog item", table: "EnterpriseInventoryItem", columns: ["organizationId", "catalogItemId"], nullsNotDistinct: false },
  { label: "tenant-scoped stock lot id", table: "EnterpriseStockLot", columns: ["organizationId", "id"], nullsNotDistinct: false },
  { label: "stock lot business key", table: "EnterpriseStockLot", columns: ["organizationId", "inventoryItemId", "lotNumber"], nullsNotDistinct: false },
  { label: "inventory balance coordinate", table: "EnterpriseInventoryBalance", columns: ["organizationId", "inventoryItemId", "warehouseId", "storageLocationId", "stockLotId"], nullsNotDistinct: true },
  { label: "tenant-scoped stock movement id", table: "EnterpriseStockMovement", columns: ["organizationId", "id"], nullsNotDistinct: false },
  { label: "stock movement idempotency key", table: "EnterpriseStockMovement", columns: ["organizationId", "idempotencyKey"], nullsNotDistinct: false },
];

function sameColumns(actual, expectedColumns) {
  return Array.isArray(actual)
    && actual.length === expectedColumns.length
    && actual.every((column, index) => column === expectedColumns[index]);
}

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      table_rel.relname AS tablename,
      index_rel.relname AS indexname,
      index_meta.indisunique AS unique,
      index_meta.indnullsnotdistinct AS "nullsNotDistinct",
      array_agg(attribute.attname ORDER BY key_position.ordinality) AS columns
    FROM pg_class AS table_rel
    JOIN pg_namespace AS namespace ON namespace.oid = table_rel.relnamespace
    JOIN pg_index AS index_meta ON index_meta.indrelid = table_rel.oid
    JOIN pg_class AS index_rel ON index_rel.oid = index_meta.indexrelid
    JOIN LATERAL unnest(index_meta.indkey) WITH ORDINALITY AS key_position(attnum, ordinality) ON true
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = table_rel.oid
     AND attribute.attnum = key_position.attnum
    WHERE namespace.nspname = 'public'
      AND table_rel.relname IN (
        'EnterpriseInventoryItem',
        'EnterpriseStockLot',
        'EnterpriseInventoryBalance',
        'EnterpriseStockMovement'
      )
    GROUP BY table_rel.relname, index_rel.relname, index_meta.indisunique, index_meta.indnullsnotdistinct
  `);

  const failures = [];
  for (const rule of expected) {
    const row = rows.find((candidate) => candidate.tablename === rule.table && candidate.unique && sameColumns(candidate.columns, rule.columns));
    if (!row) {
      failures.push(`${rule.label}: missing UNIQUE(${rule.columns.join(", ")}) on ${rule.table}`);
      continue;
    }
    if (Boolean(row.nullsNotDistinct) !== rule.nullsNotDistinct) {
      failures.push(`${rule.label}: ${row.indexname} NULLS NOT DISTINCT=${Boolean(row.nullsNotDistinct)}, expected ${rule.nullsNotDistinct}`);
    }
  }

  if (failures.length) {
    console.error("Shop 2 inventory schema parity failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Shop 2 inventory schema parity OK (${expected.length} unique contracts verified).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
