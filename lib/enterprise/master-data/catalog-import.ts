import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { catalogItemCreateSchema } from "@/lib/enterprise/master-data/schemas";
import { CATALOG_IMPORT_COLUMNS, CATALOG_IMPORT_MAX_BYTES, CATALOG_IMPORT_MAX_ROWS } from "@/lib/enterprise/master-data/catalog-template";

type Locale = "fr" | "en";
type CatalogInput = z.infer<typeof catalogItemCreateSchema>;
export type CatalogImportRow = { line: number; name: string; itemType: string; errors: string[]; data?: CatalogInput };

export class CatalogImportError extends Error {
  constructor(message: string, public readonly status = 422) { super(message); }
}

function tr(locale: Locale, fr: string, en: string) { return locale === "en" ? en : fr; }
function normalized(value: string) { return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function normalizeName(value: string) { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr"); }

export function parseCatalogCsv(content: string): string[][] {
  const text = content.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (!quoted && cell.trim()) throw new CatalogImportError("CSV quoting is invalid.");
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
      row = []; cell = "";
    } else { cell += char; }
    if (cell.length > 6000 || row.length > CATALOG_IMPORT_COLUMNS.length + 2) throw new CatalogImportError("CSV cell or column limit exceeded.");
  }
  if (quoted) throw new CatalogImportError("CSV quoting is incomplete.");
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function assertSafeZip(buffer: Buffer) {
  // Read the ZIP central directory before letting the XLSX parser inflate the
  // file. A small compressed upload must not expand into a huge workbook.
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) throw new CatalogImportError("Invalid XLSX archive.");
  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  let expandedBytes = 0;
  if (entries > 150) throw new CatalogImportError("XLSX contains too many parts.");
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new CatalogImportError("Invalid XLSX directory.");
    const uncompressed = buffer.readUInt32LE(offset + 24);
    expandedBytes += uncompressed;
    if (uncompressed > 8_000_000 || expandedBytes > 12_000_000) throw new CatalogImportError("XLSX expanded size exceeds the safe limit.");
    if (buffer.readUInt16LE(offset + 8) & 1) throw new CatalogImportError("Encrypted XLSX files are not supported.");
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
}

function excelCellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  // Excel/LibreOffice can create harmless rich text when a user formats a cell.
  // Flatten visible text only. Formula and hyperlink objects remain forbidden.
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }
  throw new CatalogImportError("Spreadsheet formulas, hyperlinks or unsupported cell types are not permitted in import data.");
}

export async function parseCatalogFile(file: File, locale: Locale): Promise<Array<{ line: number; cells: string[] }>> {
  if (file.size < 1 || file.size > CATALOG_IMPORT_MAX_BYTES) {
    throw new CatalogImportError(tr(locale, "Le fichier doit être non vide et ne pas dépasser 2 Mo.", "The file must be non-empty and no larger than 2 MB."), 413);
  }
  const filename = file.name.toLowerCase();
  let records: Array<{ line: number; cells: string[] }>;
  if (filename.endsWith(".csv")) {
    const content = await file.text();
    if (content.includes("\u0000")) throw new CatalogImportError(tr(locale, "Le CSV contient des caractères non autorisés.", "The CSV contains invalid characters."));
    try {
      records = parseCatalogCsv(content).map((cells, index) => ({ line: index + 1, cells }));
    } catch {
      throw new CatalogImportError(tr(locale, "Le CSV est malformé (guillemets ou nombre de colonnes). Vérifiez le modèle et réessayez.", "The CSV is malformed (quotes or column count). Check the template and retry."));
    }
  } else if (filename.endsWith(".xlsx")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.subarray(0, 2).toString() !== "PK") throw new CatalogImportError(tr(locale, "Ce fichier Excel n’est pas valide.", "This Excel file is invalid."));
    try {
      assertSafeZip(buffer);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      const sheet = workbook.getWorksheet("Données") || workbook.getWorksheet("Data") || workbook.worksheets[0];
      if (!sheet) throw new CatalogImportError("EMPTY_WORKBOOK");
      if (sheet.rowCount > CATALOG_IMPORT_MAX_ROWS + 1) throw new CatalogImportError("TOO_MANY_ROWS");
      records = [];
      sheet.eachRow((row, rowNumber) => {
        const cells = CATALOG_IMPORT_COLUMNS.map((_, index) => excelCellText(row.getCell(index + 1).value));
        if (cells.some((value) => value.trim())) records.push({ line: rowNumber, cells });
      });
    } catch (error) {
      if (error instanceof CatalogImportError && error.message === "TOO_MANY_ROWS") throw new CatalogImportError(tr(locale, "Le fichier dépasse 200 articles. Divisez-le en plusieurs lots.", "The file exceeds 200 items. Split it into smaller batches."));
      if (error instanceof CatalogImportError && error.message.includes("formulas")) throw new CatalogImportError(tr(locale, "Les formules Excel, liens et types de cellule non pris en charge sont interdits dans les lignes importées.", "Excel formulas, links and unsupported cell types are not allowed in imported rows."));
      if (error instanceof CatalogImportError && error.message.includes("XLSX expanded")) throw new CatalogImportError(tr(locale, "Le classeur Excel dépasse les limites de sécurité.", "The Excel workbook exceeds the security limits."));
      if (error instanceof CatalogImportError && error.message.includes("Invalid XLSX")) throw new CatalogImportError(tr(locale, "La structure ZIP du fichier Excel est invalide.", "The Excel file has an invalid ZIP structure."));
      throw new CatalogImportError(tr(locale, "Le fichier Excel est endommagé, non pris en charge ou non sûr. Téléchargez un nouveau modèle DTSC.", "The Excel file is damaged, unsupported or unsafe. Download a new DTSC template."));
    }
  } else {
    throw new CatalogImportError(tr(locale, "Choisissez un modèle CSV ou Excel (.xlsx).", "Choose a CSV or Excel (.xlsx) template."));
  }
  if (!records.length) throw new CatalogImportError(tr(locale, "Le modèle est vide.", "The template is empty."));
  const headers = records[0].cells;
  if (headers.length !== CATALOG_IMPORT_COLUMNS.length || !CATALOG_IMPORT_COLUMNS.every((column, index) =>
    [column.key, column.fr, column.en].some((label) => normalized(label) === normalized(headers[index] || ""))
  )) {
    throw new CatalogImportError(tr(locale, "Les colonnes ne correspondent pas au modèle DTSC. Téléchargez le modèle de cette entreprise.", "The columns do not match the DTSC template. Download this company's template."));
  }
  const content = records.slice(1);
  if (!content.length) throw new CatalogImportError(tr(locale, "Ajoutez au moins un article au modèle avant l’import.", "Add at least one item to the template before importing."));
  if (content.length > CATALOG_IMPORT_MAX_ROWS) throw new CatalogImportError(tr(locale, "Maximum 200 articles par import. Divisez le fichier.", "Maximum 200 items per import. Split the file."));
  return content;
}

function booleanCell(value: string): boolean | null {
  const cleaned = normalized(value);
  if (!cleaned || ["non", "no", "false", "0"].includes(cleaned)) return false;
  if (["oui", "yes", "true", "1"].includes(cleaned)) return true;
  return null;
}

function priceCell(value: string) {
  if (!value.trim()) return null;
  const text = value.trim().replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(text) ? Number(text) : Number.NaN;
}

export async function prepareCatalogImport(organizationId: string, records: Array<{ line: number; cells: string[] }>, locale: Locale): Promise<CatalogImportRow[]> {
  const [units, categories, taxes] = await Promise.all([
    prisma.enterpriseUnitOfMeasure.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, code: true } }),
    prisma.enterpriseCatalogCategory.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, code: true } }),
    prisma.enterpriseTaxCode.findMany({ where: { organizationId, isActive: true }, select: { code: true } }),
  ]);
  const unitByCode = new Map(units.map((unit) => [unit.code.toUpperCase(), unit.id]));
  const categoryByCode = new Map(categories.map((category) => [category.code.toUpperCase(), category.id]));
  const taxCodes = new Set(taxes.map((tax) => tax.code.toUpperCase()));
  const names = records.map(({ cells }) => normalizeName(cells[0] || ""));
  const skus = records.map(({ cells }) => (cells[2] || "").trim()).filter(Boolean);
  const existing = await prisma.enterpriseCatalogItem.findMany({
    where: { organizationId, archivedAt: null, OR: [{ normalizedName: { in: names } }, { sku: { in: skus, mode: "insensitive" } }] },
    select: { normalizedName: true, itemType: true, sku: true },
    take: CATALOG_IMPORT_MAX_ROWS * 2,
  });
  const existingNames = new Set(existing.map((item) => `${item.itemType}:${item.normalizedName}`));
  const existingSkus = new Set(existing.map((item) => item.sku?.toLowerCase()).filter(Boolean));
  const fileNames = new Map<string, number>();
  const fileSkus = new Map<string, number>();

  return records.map(({ line, cells }) => {
    const [nameRaw, typeRaw, skuRaw, description, categoryRaw, unitRaw, saleRaw, costRaw, currencyRaw, taxableRaw, taxRaw, inventoryRaw] = cells.map((cell) => cell.trim());
    const name = nameRaw.replace(/\s+/g, " ");
    const itemType = ["produit", "product"].includes(normalized(typeRaw)) ? "PRODUCT" : ["service"].includes(normalized(typeRaw)) ? "SERVICE" : typeRaw.toUpperCase();
    const sku = skuRaw || null;
    const categoryCode = categoryRaw.toUpperCase();
    const unitCode = unitRaw.toUpperCase();
    const taxCode = taxRaw.toUpperCase();
    const taxable = booleanCell(taxableRaw);
    const trackInventory = booleanCell(inventoryRaw);
    const errors: string[] = [];
    if (cells.length !== CATALOG_IMPORT_COLUMNS.length) errors.push(tr(locale, "Nombre de colonnes incorrect.", "Incorrect number of columns."));
    if ([nameRaw, skuRaw, description, categoryRaw, unitRaw, currencyRaw, taxRaw].some((value) => /^[=+\-@]/.test(value))) errors.push(tr(locale, "Une cellule texte commence par une formule interdite.", "A text cell begins with a forbidden spreadsheet formula."));
    if (!unitByCode.has(unitCode)) errors.push(tr(locale, `Unité « ${unitRaw} » introuvable dans cette entreprise.`, `Unit “${unitRaw}” is not available in this company.`));
    if (categoryCode && !categoryByCode.has(categoryCode)) errors.push(tr(locale, `Catégorie « ${categoryRaw} » introuvable.`, `Category “${categoryRaw}” is not available.`));
    if (taxCode && !taxCodes.has(taxCode)) errors.push(tr(locale, `Code taxe « ${taxRaw} » non configuré.`, `Tax code “${taxRaw}” is not configured.`));
    if (taxable === null || trackInventory === null) errors.push(tr(locale, "Utilisez Oui/Non pour les champs de contrôle.", "Use Yes/No for check fields."));
    if (itemType === "SERVICE" && trackInventory) errors.push(tr(locale, "Un service ne peut pas activer le suivi de stock.", "A service cannot enable inventory tracking."));
    const nameKey = `${itemType}:${normalizeName(name)}`;
    const skuKey = sku?.toLowerCase();
    if (existingNames.has(nameKey)) errors.push(tr(locale, "Ce nom et ce type existent déjà dans le catalogue.", "This name and item type already exist in the catalog."));
    const sameNameLine = fileNames.get(nameKey);
    if (sameNameLine != null) errors.push(tr(locale, `Nom et type déjà utilisés à la ligne ${sameNameLine}.`, `Name and item type already used on row ${sameNameLine}.`));
    if (skuKey && existingSkus.has(skuKey)) errors.push(tr(locale, "Cette référence SKU existe déjà dans le catalogue.", "This SKU already exists in the catalog."));
    const sameSkuLine = skuKey ? fileSkus.get(skuKey) : undefined;
    if (sameSkuLine != null) errors.push(tr(locale, `SKU déjà utilisé à la ligne ${sameSkuLine}.`, `SKU already used on row ${sameSkuLine}.`));
    if (!fileNames.has(nameKey)) fileNames.set(nameKey, line);
    if (skuKey && !fileSkus.has(skuKey)) fileSkus.set(skuKey, line);
    const parsed = catalogItemCreateSchema.safeParse({
      name, itemType, sku, description: description || null,
      categoryId: categoryByCode.get(categoryCode) || null,
      unitOfMeasureId: unitByCode.get(unitCode) || "",
      indicativeSalePrice: priceCell(saleRaw), indicativeCost: priceCell(costRaw),
      currency: currencyRaw.toUpperCase() || null, taxable: taxable ?? false,
      taxCode: taxCode || null, trackInventory: trackInventory ?? false,
    });
    if (!parsed.success) errors.push(tr(locale, "Vérifiez le nom, le type, les prix (2 décimales), la devise et les champs obligatoires.", "Check the name, type, prices (2 decimals), currency and required fields."));
    return { line, name, itemType, errors, ...(parsed.success && errors.length === 0 ? { data: parsed.data } : {}) };
  });
}
