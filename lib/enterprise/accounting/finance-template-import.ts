import ExcelJS from "exceljs";
import { z } from "zod";
import { assertSafeZip, parseCatalogCsv } from "@/lib/enterprise/master-data/catalog-import";
import { taxCodeCreateSchema } from "@/lib/enterprise/accounting/finance-domain-schemas";
import { FINANCE_IMPORT_COLUMNS } from "@/lib/enterprise/accounting/finance-template-columns";
import { prisma } from "@/lib/prisma";

export type FinanceImportKind = "tax" | "accounts";
export type FinanceImportLocale = "fr" | "en";

const accountSchema = z.object({
  chartCode: z.string().trim().min(2).max(30),
  parentCode: z.string().trim().min(1).max(40),
  code: z.string().trim().min(2).max(40),
  nameFr: z.string().trim().min(2).max(180),
  nameEn: z.string().trim().min(2).max(180),
  currencyCode: z.union([z.literal(""), z.string().trim().regex(/^[A-Z]{3}$/)]).optional(),
});
const taxSchema = taxCodeCreateSchema.omit({ roundingRule: true, payableAccountId: true, recoverableAccountId: true }).extend({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rate: z.string().regex(/^\d+(\.\d{1,6})?$/),
  jurisdiction: z.string().max(120).optional(),
});

export type ValidFinanceImport =
  | { kind: "tax"; data: z.infer<typeof taxSchema> }
  | { kind: "accounts"; data: z.infer<typeof accountSchema>; chartId: string; parentId: string };
export type FinanceImportPreviewRow = { line: number; code: string; description: string; errors: string[]; valid?: ValidFinanceImport };

export class FinanceImportError extends Error {
  constructor(message: string, public readonly status = 422) { super(message); }
}

const norm = (text: string) => text.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
const tr = (locale: FinanceImportLocale, fr: string, en: string) => locale === "en" ? en : fr;

function readCell(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  throw new FinanceImportError("Les formules, liens et cellules Excel enrichies ne sont pas autorisés dans ce modèle.");
}

export async function parseFinanceImportFile(file: File, kind: FinanceImportKind, locale: FinanceImportLocale) {
  if (!file.size || file.size > 2 * 1024 * 1024) throw new FinanceImportError(tr(locale, "Fichier vide ou supérieur à 2 Mo.", "Empty file or larger than 2 MB."), 413);
  const columns = FINANCE_IMPORT_COLUMNS[kind];
  let lines: Array<{ line: number; cells: string[] }>;
  if (file.name.toLowerCase().endsWith(".csv")) {
    const content = await file.text();
    if (content.includes("\0")) throw new FinanceImportError("Fichier CSV invalide.");
    try { lines = parseCatalogCsv(content).map((cells, index) => ({ line: index + 1, cells })); }
    catch { throw new FinanceImportError(tr(locale, "CSV malformé. Vérifiez les guillemets et séparateurs.", "Malformed CSV. Check the quoting and delimiters.")); }
  } else if (file.name.toLowerCase().endsWith(".xlsx")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.subarray(0, 2).toString() !== "PK") throw new FinanceImportError("Fichier Excel invalide.");
    try {
      assertSafeZip(buffer);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      const sheet = workbook.getWorksheet("Données") || workbook.getWorksheet("Data") || workbook.worksheets[0];
      if (!sheet || sheet.rowCount > 102) throw new FinanceImportError("Maximum 100 lignes par import.");
      lines = [];
      sheet.eachRow((row, index) => {
        const cells = columns.map((_, colIndex) => readCell(row.getCell(colIndex + 1).value));
        if (cells.some((value) => value.trim())) lines.push({ line: index, cells });
      });
    } catch (error) {
      if (error instanceof FinanceImportError) throw error;
      throw new FinanceImportError(tr(locale, "Le fichier Excel est invalide, endommagé ou non sûr.", "The Excel file is invalid, corrupt or unsafe."));
    }
  } else throw new FinanceImportError(tr(locale, "Choisissez un CSV ou un Excel .xlsx.", "Choose a CSV or an .xlsx Excel file."));

  if (!lines.length || lines[0].cells.length !== columns.length || columns.some((column, index) =>
    ![column.key, column.fr, column.en].some((accepted) => norm(accepted) === norm(lines[0].cells[index] || "")))) {
    throw new FinanceImportError(tr(locale, "Colonnes incompatibles. Téléchargez le modèle DTSC pour ce référentiel.", "Columns do not match. Download the DTSC template for this reference data."));
  }
  const data = lines.slice(1);
  if (!data.length || data.length > 100) throw new FinanceImportError(tr(locale, "Renseignez entre 1 et 100 lignes.", "Fill in 1 to 100 rows."));
  return data;
}

export async function previewFinanceImport(organizationId: string, kind: FinanceImportKind, lines: Array<{ line: number; cells: string[] }>, locale: FinanceImportLocale): Promise<FinanceImportPreviewRow[]> {
  const [taxCodes, accounts, charts] = await Promise.all([
    kind === "tax" ? prisma.enterpriseTaxCode.findMany({ where: { organizationId }, select: { code: true } }) : Promise.resolve([]),
    kind === "accounts" ? prisma.enterpriseLedgerAccount.findMany({ where: { organizationId, archivedAt: null }, select: { id: true, chartId: true, code: true, isActive: true } }) : Promise.resolve([]),
    kind === "accounts" ? prisma.enterpriseChartOfAccounts.findMany({ where: { organizationId, status: { in: ["DRAFT", "READY", "ACTIVE"] } }, select: { id: true, code: true, templateCode: true } }) : Promise.resolve([]),
  ]);
  const existingTaxCodes = new Set(taxCodes.map((item) => item.code.toUpperCase()));
  const existingAccounts = new Set(accounts.map((item) => `${item.chartId}:${item.code.toUpperCase()}`));
  const seen = new Set<string>();
  return lines.map(({ line, cells }) => {
    const fields = Object.fromEntries(FINANCE_IMPORT_COLUMNS[kind].map((column, index) => [column.key, (cells[index] || "").trim()]));
    const code = fields.code || "";
    const errors: string[] = [];
    let valid: ValidFinanceImport | undefined;
    if (cells.length !== FINANCE_IMPORT_COLUMNS[kind].length) errors.push(tr(locale, "Nombre de colonnes incorrect.", "Incorrect number of columns."));
    if (cells.some((cell) => /^[=+@]/.test(cell.trim()))) errors.push(tr(locale, "Cellule commençant par une formule interdite.", "Cell starts with a prohibited formula."));
    const key = kind === "tax" ? code.toUpperCase() : `${fields.chartCode.toUpperCase()}:${code.toUpperCase()}`;
    if (seen.has(key)) errors.push(tr(locale, "Code répété dans le fichier.", "Repeated code in the file."));
    seen.add(key);
    if (kind === "tax" && existingTaxCodes.has(code.toUpperCase())) errors.push(tr(locale, "Ce code existe déjà dans l’entreprise.", "Code already exists in the company."));
    if (kind === "tax") {
      // CSV from a French spreadsheet often stores decimal rates as "0,16".
      const parsed = taxSchema.safeParse({ ...fields, rate: (fields.rate || "").replace(",", ".") });
      if (!parsed.success) errors.push(tr(locale, "Code, libellés, catégorie, taux décimal ou date invalides.", "Invalid code, labels, category, decimal rate or date."));
      else if (Number.isNaN(new Date(`${parsed.data.effectiveFrom}T00:00:00Z`).getTime()) || new Date(`${parsed.data.effectiveFrom}T00:00:00Z`).toISOString().slice(0, 10) !== parsed.data.effectiveFrom) errors.push(tr(locale, "Date invalide.", "Invalid date."));
      else valid = { kind, data: parsed.data };
    } else {
      const parsed = accountSchema.safeParse(fields);
      if (!parsed.success) errors.push(tr(locale, "Plan, compte parent, code ou libellé invalide.", "Invalid chart, parent account, code or label."));
      else {
        const chart = charts.find((item) => item.code === parsed.data.chartCode && item.templateCode);
        const parent = chart && accounts.find((item) => item.code === parsed.data.parentCode && item.chartId === chart.id && item.isActive);
        if (!chart) errors.push(tr(locale, "Plan versionné inconnu ou inactif.", "Unknown or inactive versioned chart."));
        else if (existingAccounts.has(`${chart.id}:${code.toUpperCase()}`)) errors.push(tr(locale, "Ce sous-compte existe déjà dans ce plan.", "This child account already exists in this chart."));
        else if (!parent || !parsed.data.code.startsWith(parent.code) || parsed.data.code === parent.code) errors.push(tr(locale, "Compte parent introuvable dans ce plan ou code non dérivé du parent.", "Parent not found in this chart or child code does not extend parent code."));
        else valid = { kind, data: parsed.data, chartId: chart.id, parentId: parent.id };
      }
    }
    return { line, code, description: kind === "tax" ? fields.nameFr || "" : `${fields.parentCode || ""} → ${fields.nameFr || ""}`, errors, ...(errors.length ? {} : { valid }) };
  });
}
