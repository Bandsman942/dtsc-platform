import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import typescript from "typescript";

const require = createRequire(import.meta.url);
const read = (file) => fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
const templateColumns = [
  ["name", "Nom", "Name"], ["itemType", "Type", "Type"], ["sku", "Référence SKU", "SKU"],
  ["description", "Description", "Description"], ["categoryCode", "Code catégorie", "Category code"],
  ["unitCode", "Code unité", "Unit code"], ["salePrice", "Prix de vente", "Sale price"],
  ["cost", "Coût d’achat", "Purchase cost"], ["currency", "Devise", "Currency"],
  ["taxable", "Taxable", "Taxable"], ["taxCode", "Code taxe", "Tax code"],
  ["trackInventory", "Suivi de stock", "Track inventory"],
].map(([key, fr, en]) => ({ key, fr, en }));
const constants = { CATALOG_IMPORT_COLUMNS: templateColumns, CATALOG_IMPORT_MAX_BYTES: 2 * 1024 * 1024, CATALOG_IMPORT_MAX_ROWS: 200 };
const ExcelJS = require("exceljs");
const fakePrisma = {
  enterpriseUnitOfMeasure: { findMany: async () => [{ id: "unit-1", code: "BCN-PIECE" }] },
  enterpriseCatalogCategory: { findMany: async () => [{ id: "cat-1", code: "BCN-ACC" }] },
  enterpriseTaxCode: { findMany: async () => [] },
  enterpriseCatalogItem: { findMany: async () => [{ itemType: "PRODUCT", normalizedName: "existant", sku: "EXIST-001" }] },
};
function loadTs(file) {
  const transpiled = typescript.transpileModule(read(file), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const exported = { exports: {} };
  const mockedRequire = (id) => {
    if (id === "@/lib/enterprise/master-data/catalog-template") return constants;
    if (id === "@/lib/prisma") return { prisma: fakePrisma };
    if (id === "@/lib/enterprise/master-data/schemas") return { catalogItemCreateSchema: { safeParse(data) {
      return { success: Boolean(data.name && data.unitOfMeasureId && ["PRODUCT", "SERVICE"].includes(data.itemType)), data };
    } } };
    if (id.startsWith("@/")) throw new Error("Unknown mock: " + id);
    return require(id);
  };
  new Function("require", "module", "exports", "Buffer", "File", transpiled.outputText)(mockedRequire, exported, exported.exports, Buffer, File);
  return exported.exports;
}
const download = loadTs("lib/enterprise/master-data/catalog-download.ts");
const importer = loadTs("lib/enterprise/master-data/catalog-import.ts");

for (const locale of ["fr", "en"]) {
  const xlsx = await download.buildCatalogTemplateXlsx(locale, {
    units: [{ code: "BCN-PIECE", name: "Pièce" }],
    categories: [{ code: "BCN-ACC", name: "Accessoires" }],
  });
  assert.ok(xlsx.length > 200);
  importer.assertSafeZip(xlsx);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx);
  const sheet = workbook.getWorksheet("Données");
  assert.ok(sheet, "Import sheet is missing");
  assert.deepEqual(
    templateColumns.map((col, idx) => sheet.getRow(1).getCell(idx + 1).value),
    templateColumns.map((col) => col[locale]),
  );
  assert.equal(workbook.getWorksheet("Interprétation").getCell("A10").value, "BCN-PIECE");
  // Ensure the data sheet has no demonstration articles, formulas or hyperlinks.
  assert.equal(sheet.getCell("A2").value, null);
  const row = ["Écouteurs Bluetooth", "PRODUCT", "CAT-RND-001", "Écouteurs test", "BCN-ACC", "BCN-PIECE", 15.5, 9, "USD", locale === "fr" ? "Non" : "No", "", locale === "fr" ? "Oui" : "Yes"];
  row.forEach((value, index) => { sheet.getRow(2).getCell(index + 1).value = value; });
  const edited = Buffer.from(await workbook.xlsx.writeBuffer());
  const parsed = await importer.parseCatalogFile(new File([edited], "catalog.xlsx"), locale);
  assert.equal(parsed.length, 1);
  const validated = await importer.prepareCatalogImport("org-1", parsed, locale);
  assert.equal(validated[0].errors.length, 0, "Generated Excel template must import without validation errors");
  assert.equal(validated[0].data.sku, "CAT-RND-001");

  const csv = download.buildCatalogTemplateCsv(locale);
  const csvFilled = csv + row.map((value) => '"' + String(value).replace(/"/g, '""') + '"').join(",") + "\r\n";
  const csvParsed = await importer.parseCatalogFile(new File([csvFilled], "catalog.csv"), locale);
  const csvValidated = await importer.prepareCatalogImport("org-1", csvParsed, locale);
  assert.equal(csvValidated[0].errors.length, 0, "Generated CSV template must import without validation errors");
}

const dupe = [
  { line: 2, cells: ["Existant", "PRODUCT", "OTHER-001", "", "BCN-ACC", "BCN-PIECE", "10", "5", "USD", "Non", "", "Oui"] },
  { line: 3, cells: ["Nouveau A", "PRODUCT", "SAME-002", "", "BCN-ACC", "BCN-PIECE", "10", "5", "USD", "Non", "", "Oui"] },
  { line: 4, cells: ["Nouveau A", "PRODUCT", "SAME-002", "", "BCN-ACC", "BCN-PIECE", "10", "5", "USD", "Non", "", "Oui"] },
  { line: 5, cells: ["Nouveau B", "PRODUCT", "EXIST-001", "", "BCN-ACC", "BCN-PIECE", "10", "5", "USD", "Non", "", "Oui"] },
];
const checked = await importer.prepareCatalogImport("org-1", dupe, "fr");
assert.match(checked[0].errors.join(" "), /catalogue/);
assert.match(checked[2].errors.join(" "), /ligne 3/);
assert.match(checked[3].errors.join(" "), /SKU/);

const route = read("app/api/enterprise/[organizationId]/catalog/import/route.ts");
for (const marker of ["export async function GET", "export async function POST", "getEnterpriseCommonDomainAccess", "format", "buildCatalogTemplateXlsx", "buildCatalogTemplateCsv", "prepareCatalogImport", "Prisma.TransactionIsolationLevel.Serializable", "createEnterpriseCatalogItemTx", "writeApiLog"]) assert.ok(route.includes(marker), "Missing guarded API marker: " + marker);
const ui = read("components/enterprise/professional/catalog-import-controls.tsx");
for (const marker of ["previewSearch", "previewFilter", "visibleRows", "totalPages", "catalog.previewTitle", "downloadTemplate", "preview.invalid !== 0"]) assert.ok(ui.includes(marker), "Missing preview UX: " + marker);
for (const locale of ["fr", "en"]) {
  const translations = JSON.parse(read("locales/professional-erp-catalog." + locale + ".json"));
  for (const marker of ["catalog.previewTitle", "catalog.previewBlocking", "catalog.previewSearch", "catalog.templateFailed"]) assert.ok(translations[marker]);
}
console.log("✓ Catalogue 2026-11-13: ExcelJS/CSV round-trip, security, previews, duplicates and FR/EN");
