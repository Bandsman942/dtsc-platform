import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import typescript from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");
const columns = ["Nom", "Type", "Référence SKU", "Description", "Code catégorie", "Code unité", "Prix de vente", "Coût d’achat", "Devise", "Taxable", "Code taxe", "Suivi de stock"];

// Transpile only the parser to exercise CSV/XLSX behavior without a database.
const importSource = read("lib/enterprise/master-data/catalog-import.ts");
const transpiled = typescript.transpileModule(importSource, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true } });
const catalog = { exports: {} };
const mockedRequire = (id) => {
  if (id === "@/lib/enterprise/master-data/catalog-template") return { CATALOG_IMPORT_COLUMNS: columns.map((fr, index) => ({ fr, en: ["Name", "Type", "SKU", "Description", "Category code", "Unit code", "Sale price", "Purchase cost", "Currency", "Taxable", "Tax code", "Track inventory"][index], key: ["name", "itemType", "sku", "description", "categoryCode", "unitCode", "salePrice", "cost", "currency", "taxable", "taxCode", "trackInventory"][index] })), CATALOG_IMPORT_MAX_BYTES: 2 * 1024 * 1024, CATALOG_IMPORT_MAX_ROWS: 200 };
  if (id.startsWith("@/")) return {};
  return require(id);
};
new Function("require", "module", "exports", "Buffer", "File", transpiled.outputText)(mockedRequire, catalog, catalog.exports, Buffer, File);
const { parseCatalogCsv, parseCatalogFile } = catalog.exports;

assert.deepEqual(parseCatalogCsv('"Nom","Type"\r\n"Produit, test","PRODUCT"\r\n'), [["Nom", "Type"], ["Produit, test", "PRODUCT"]]);
assert.deepEqual(parseCatalogCsv('Nom;Description\n"Pièce";"Texte avec ""guillemets"""'), [["Nom", "Description"], ["Pièce", 'Texte avec "guillemets"']]);
assert.throws(() => parseCatalogCsv('"incomplete'), /incomplete/);
const csv = [columns.join(","), 'Casque Bluetooth,PRODUCT,CAS-001,, ,PCS,12.5,8,USD,Oui,,Oui', 'Installation,SERVICE,SRV-001,, ,H,10,0,USD,Non,,Non'].join("\r\n");
const csvRows = await parseCatalogFile(new File([csv], "catalog.csv", { type: "text/csv" }), "fr");
assert.equal(csvRows.length, 2);
assert.equal(csvRows[0].line, 2);
await assert.rejects(parseCatalogFile(new File(["wrong,headers\nfoo,bar"], "bad.csv"), "fr"), /colonnes/);
await assert.rejects(parseCatalogFile(new File([csv], "bad.txt"), "fr"), /CSV ou Excel/);

const ExcelJS = require("exceljs");
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Données");
sheet.addRow(columns);
sheet.addRow(["Casque", "PRODUCT", "CAS-002", "", "", "PCS", 12.5, 8, "USD", "Oui", "", "Oui"]);
const bytes = await workbook.xlsx.writeBuffer();
const xlsxRows = await parseCatalogFile(new File([bytes], "catalog.xlsx"), "fr");
assert.equal(xlsxRows.length, 1);
assert.equal(xlsxRows[0].cells[0], "Casque");
sheet.getRow(2).getCell(1).value = { formula: 'HYPERLINK("evil")', result: "unsafe" };
const malicious = await workbook.xlsx.writeBuffer();
await assert.rejects(parseCatalogFile(new File([malicious], "formulas.xlsx"), "fr"), /formules/);

const api = read("app/api/enterprise/[organizationId]/catalog/import/route.ts");
for (const proof of ["isSameOriginRequest", "getSession", "getEnterpriseCommonDomainAccess", 'moduleCode: "CATALOG"', 'action: "write"', "rateLimit", "prepareCatalogImport", "Prisma.TransactionIsolationLevel.Serializable", "createEnterpriseCatalogItemTx", "writeAuditLog", "writeApiLog"]) assert.ok(api.includes(proof), `API import missing: ${proof}`);
const create = read("components/admin/client-organizations-panel.tsx");
for (const proof of ["formElement.reset()", "setCreateOpen(false)", "companyCreatedWithAdmin", "companyCreatedNotificationPending", "companyCreationNetworkFailed"]) assert.ok(create.includes(proof), `Company onboarding missing: ${proof}`);
assert.ok(read("components/enterprise/professional/enterprise-sites-workspace.tsx").includes("TimeZoneCombobox"));
assert.ok(read("lib/enterprise/master-data/schemas.ts").includes("isSupportedTimeZone"));
assert.ok(read("components/enterprise/professional/enterprise-catalog-workspace.tsx").includes("CatalogImportControls"));
const stock = read("components/enterprise/professional/enterprise-inventory-operations-workspace.tsx");
assert.ok(stock.includes("notifyToast"));
assert.ok(!stock.includes("useToastMessage(message)"));
const toast = read("components/ui/toast-provider.tsx");
for (const color of ["emerald", "red", "amber", "cyan"]) assert.ok(toast.includes(color));
assert.ok(toast.includes("Math.abs(item.createdAt - existing.createdAt) < 120"));
console.log("✓ Hotfix #1075: CSV/XLSX parsing, hostile files, enterprise access, onboarding, timezone and toast contract");
