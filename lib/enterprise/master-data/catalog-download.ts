import ExcelJS from "exceljs";
import { CATALOG_IMPORT_COLUMNS, CATALOG_IMPORT_MAX_ROWS } from "@/lib/enterprise/master-data/catalog-template";

type Locale = "fr" | "en";
type Reference = { code: string; name: string };
export type CatalogTemplateReferences = { units: Reference[]; categories: Reference[] };

/**
 * Import-specific templates intentionally use ExcelJS, the SAME XLSX engine
 * as parseCatalogFile. Never reuse a presentation/report XLSX generator here.
 * The first sheet is the import data sheet, and its headers are the parser's
 * canonical columns, so a downloaded template can be uploaded unchanged
 * after the user adds records.
 */
export async function buildCatalogTemplateXlsx(locale: Locale, references: CatalogTemplateReferences): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DTSC Platform";
  workbook.subject = "Catalogue - import groupé";
  const sheet = workbook.addWorksheet("Données");
  sheet.columns = CATALOG_IMPORT_COLUMNS.map((column) => ({
    key: column.key,
    width: ["name", "description"].includes(column.key) ? 35 : 19,
  }));
  sheet.addRow(CATALOG_IMPORT_COLUMNS.map((column) => column[locale]));
  const header = sheet.getRow(1);
  header.height = 27;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF087EA4" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "L1" };

  // Validation dropdowns guide filling without adding sample rows or formulas.
  for (let row = 2; row <= CATALOG_IMPORT_MAX_ROWS + 1; row += 1) {
    sheet.getCell("B" + row).dataValidation = { type: "list", allowBlank: false, formulae: ['"PRODUCT,SERVICE"'] };
    for (const col of ["J", "L"]) {
      sheet.getCell(col + row).dataValidation = { type: "list", allowBlank: true, formulae: ['"Oui,Non"'] };
    }
    sheet.getCell("I" + row).dataValidation = { type: "list", allowBlank: true, formulae: ['"CDF,USD"'] };
  }

  const help = workbook.addWorksheet("Interprétation");
  help.columns = [{ width: 27 }, { width: 42 }];
  const localized = (fr: string, en: string) => locale === "fr" ? fr : en;
  help.addRow([localized("Consigne", "Instruction"), localized("Valeur", "Value")]);
  help.addRow([localized("Maximum par import", "Maximum per import"), CATALOG_IMPORT_MAX_ROWS]);
  help.addRow([localized("Type d'article", "Item type"), "PRODUCT / SERVICE"]);
  help.addRow([localized("Valeurs logiques", "Boolean values"), localized("Oui / Non", "Yes / No")]);
  help.addRow([localized("Suivi de stock", "Inventory tracking"), localized("Oui pour les produits uniquement", "Yes only for products")]);
  help.addRow([localized("Taxe", "Tax"), localized("N'indiquer un code taxe que s'il est configuré", "Use a tax code only if configured")]);
  help.addRow([localized("Quantités, lots, péremption", "Quantities, batches, expiry"), localized("Gérés dans Inventaire & Logistique", "Managed in Inventory & Logistics")]);
  help.addRow([]);
  help.addRow([localized("Unités disponibles", "Available units"), localized("Codes de cette entreprise", "Codes for this company")]);
  for (const unit of references.units) help.addRow([unit.code, unit.name]);
  help.addRow([]);
  help.addRow([localized("Catégories disponibles", "Available categories"), localized("Codes de cette entreprise", "Codes for this company")]);
  for (const category of references.categories) help.addRow([category.code, category.name]);
  help.getRow(1).font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildCatalogTemplateCsv(locale: Locale): string {
  const header = CATALOG_IMPORT_COLUMNS.map((column) =>
    '"' + column[locale].replace(/"/g, '""') + '"'
  ).join(",");
  return "\uFEFF" + header + "\r\n";
}
