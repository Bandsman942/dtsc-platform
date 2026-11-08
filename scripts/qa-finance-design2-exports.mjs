import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import ExcelJS from "exceljs";

const source = fs.readFileSync("lib/reporting/professional-export.ts", "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const downloads = [];
let currentBlob = null;
const anchor = { click() { downloads.push(currentBlob); }, remove() {} };
const document = { body: { appendChild() {} }, createElement() { return anchor; } };
const urlStub = { createObjectURL(blob) { currentBlob = blob; return "blob:qa"; }, revokeObjectURL() {} };
const exports = {};
vm.runInNewContext(javascript, { exports, document, URL: urlStub, Blob, TextEncoder, setTimeout() {}, console });

const model = {
  organizationName: "SHOP BCN · Kinshasa", title: "Registre comptable · Démonstration",
  subtitle: "Contrôles, paiements et résultats", filenameBase: "finance-design2-qa",
  generatedLabel: "08/11/2026", filters: [{ label: "Statut", value: "Validé" }],
  kpis: [{ label: "Opérations", value: "125", numericValue: 125 }],
  columns: [{ key: "reference", label: "Référence" }, { key: "name", label: "Libellé" }, { key: "amount", label: "Montant CDF" },
    { key: "status", label: "Statut" }, { key: "store", label: "Boutique" }, { key: "currency", label: "Devise" },
    { key: "cost", label: "Coût" }, { key: "finalField", label: "Champ final" }],
  rows: Array.from({ length: 125 }, (_, i) => ({ reference: `DTSC-${i + 1}`, name: i === 0 ? "=HYPERLINK(unsafe)" : `Test de ligne ${i + 1}`, amount: i * 1000, status: "Actif", store: "BCN", currency: "CDF", cost: i * 100, finalField: `COLONNE-HUIT-${i + 1}` })),
  chart: [], insights: [], accentHex: "#087EA4",
};

exports.downloadProfessionalCsv(model);
exports.downloadProfessionalXlsx(model);
exports.downloadProfessionalPdf(model);
assert.equal(downloads.length, 3);

const csv = await downloads[0].text();
assert.match(csv, /DTSC-125/);
assert.match(csv, /'\=HYPERLINK\(unsafe\)/, "CSV formula injection must be neutralized");
assert.equal(csv.split(/\r?\n/).length, 126);

const bytes = Buffer.from(await downloads[1].arrayBuffer());
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(bytes);
const sheet = workbook.getWorksheet("Données");
assert.ok(sheet, "Professional XLSX must have the data sheet");
assert.equal(sheet.getRow(126).getCell(1).value, "DTSC-125");

const pdfBytes = Buffer.from(await downloads[2].arrayBuffer());
assert.ok(pdfBytes.toString("latin1", 0, 10).startsWith("%PDF-1.4"));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "dtsc-finance-export-"));
const pdfPath = path.join(scratch, "test.pdf");
try {
  fs.writeFileSync(pdfPath, pdfBytes);
  const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  const count = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
  assert.ok(count >= 4, `125 rows should be paginated over multiple PDF pages, got ${count}`);
  const text = execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" });
  assert.match(text, /SHOP BCN/);
  assert.match(text, /DTSC-125/);
  assert.match(text, /COLONNE-HUIT-125/, "PDF must preserve columns past the first seven");
} finally {
  fs.unlinkSync(pdfPath);
  fs.rmdirSync(scratch);
}
console.log("PASS Finance Design 2.0: CSV 125 lignes, XLSX ouvrable, PDF premium multipage PDFInfo et texte final vérifiés.");
