import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const fail = (message) => { console.error(`FAIL #578 ${message}`); process.exit(1); };
const requireAll = (source, tokens, label) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label}: token manquant ${token}`);
};

const schemaPath = "prisma/enterprise-procurement-links.prisma";
const migrationPath = "prisma/migrations/20260905133000_repair_procurement_erp_link_constraints/migration.sql";
const pharmacyPath = "lib/enterprise/sector-convergence/pharmacy-procurement-service.ts";

for (const path of [schemaPath, migrationPath, pharmacyPath]) if (!fs.existsSync(path)) fail(`fichier absent: ${path}`);

const schema = read(schemaPath);
const migration = read(migrationPath);
const pharmacy = read(pharmacyPath);

requireAll(schema, [
  "model EnterprisePurchaseOperationalLink {",
  "@@unique([organizationId, id])",
  "@@unique([organizationId, purchaseId])",
  "model EnterprisePurchaseItemCatalogLink {",
  "@@unique([organizationId, purchaseItemId])",
  "model EnterprisePurchaseReceiptOperationalLink {",
  "@@unique([organizationId, purchaseReceiptId])",
  "@@unique([organizationId, idempotencyKey])",
  "model EnterprisePurchaseReceiptItemStockLink {",
  "@@unique([organizationId, purchaseReceiptItemId])",
  "@@unique([organizationId, stockMovementId])",
], "schéma Prisma");

requireAll(migration, [
  "GROUP BY \"organizationId\", \"purchaseId\"",
  "GROUP BY \"organizationId\", \"purchaseItemId\"",
  "GROUP BY \"organizationId\", \"purchaseReceiptId\"",
  "GROUP BY \"organizationId\", \"idempotencyKey\"",
  "GROUP BY \"organizationId\", \"stockMovementId\"",
  "reconcile them before applying #578",
  "EnterprisePurchaseOperationalLink_organizationId_purchaseId_key",
  "EnterprisePurchaseItemCatalogLink_organizationId_purchaseItemId_key",
  "EnterprisePurchaseReceiptOperationalLink_organizationId_purchaseReceiptId_key",
  "EnterprisePurchaseReceiptOperationalLink_organizationId_idempotencyKey_key",
  "EnterprisePurchaseReceiptItemStockLink_organizationId_purchaseReceiptItemId_key",
  "EnterprisePurchaseReceiptItemStockLink_organizationId_stockMovementId_key",
  "EnterprisePurchaseOperationalLink_organizationId_destinationWarehouseId_idx",
  "EnterprisePurchaseItemCatalogLink_organizationId_unitOfMeasureId_idx",
  "EnterprisePurchaseReceiptOperationalLink_organizationId_storageLocationId_status_idx",
], "migration additive");

for (const forbidden of ["DELETE FROM", "DROP TABLE", "DROP COLUMN", "TRUNCATE"]) {
  if (migration.toUpperCase().includes(forbidden)) fail(`migration destructive détectée: ${forbidden}`);
}

requireAll(pharmacy, [
  "enterprisePurchaseItemCatalogLink.upsert",
  "organizationId_purchaseItemId",
], "convergence Pharmacy→Procurement");

// In the Accounting production-like workflow the canonical tenant has already been
// migrated and seeded. Exercise the exact compound key used by Pharmacy twice so a
// fresh database proves the physical unique constraint exists and retry is idempotent.
if ((process.env.GITHUB_WORKFLOW || "").startsWith("Accounting onboarding")) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
  const purchaseItemId = `qa-578-purchase-item-${process.env.GITHUB_RUN_ID || Date.now()}`;
  try {
    await prisma.enterprisePurchaseItemCatalogLink.deleteMany({ where: { organizationId, purchaseItemId } });
    const first = await prisma.enterprisePurchaseItemCatalogLink.upsert({
      where: { organizationId_purchaseItemId: { organizationId, purchaseItemId } },
      update: { expectedItemType: "GOODS" },
      create: { organizationId, purchaseItemId, expectedItemType: "GOODS" },
    });
    const second = await prisma.enterprisePurchaseItemCatalogLink.upsert({
      where: { organizationId_purchaseItemId: { organizationId, purchaseItemId } },
      update: { expectedItemType: "GOODS" },
      create: { organizationId, purchaseItemId, expectedItemType: "GOODS" },
    });
    const count = await prisma.enterprisePurchaseItemCatalogLink.count({ where: { organizationId, purchaseItemId } });
    if (first.id !== second.id || count !== 1) fail(`retry non idempotent sur organizationId_purchaseItemId (count=${count})`);
    console.log("PASS #578 production-like: compound upsert Procurement/Pharmacy idempotent");
  } finally {
    await prisma.enterprisePurchaseItemCatalogLink.deleteMany({ where: { organizationId, purchaseItemId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

console.log("PASS #578 Procurement↔ERP migration parity");
