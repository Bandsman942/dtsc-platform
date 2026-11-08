import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const src = fs.readFileSync("lib/enterprise/retail/site-financial-export.ts", "utf8");
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports, require, Date });
const row = (currencyCode, revenue, grossMargin, journalLineCount = 2) => ({
  currencyCode, revenue, grossMargin, otherIncome: "0.000000", costOfSales: "3.000000",
  operatingExpenses: "0.000000", operatingResult: grossMargin, journalLineCount,
});
const result = mod.exports.buildRetailPostedLedgerExport({
  locale: "fr", from: "2026-11-01T00:00:00.000Z", to: "2026-11-07T23:59:59.000Z",
  sites: [
    { code: "A", name: "Boutique A", postedLedger: [row("CDF", "40.000000", "37.000000"), row("USD", "20.000000", "17.000000")] },
    { code: "B", name: "Boutique B", postedLedger: [] },
  ],
  unallocated: [row("CDF", "12.000000", "9.000000", 1)],
});
assert.match(result.title, /PROVISOIRE/);
assert.match(result.subtitle, /NON CERTIFIÉ/);
assert.equal(result.rows.length, 3, "No invented zero from a store without posted lines");
assert.deepEqual(Array.from(result.rows.map((entry) => entry.currency)), ["CDF", "USD", "CDF"], "No CDF/USD conversion or summation");
assert.equal(result.rows[0].revenue, "40.000000");
assert.equal(result.rows[1].revenue, "20.000000");
assert.equal(result.rows[2].attribution, "Non attribuée");
assert.equal(result.rows[2].site, "Écritures sans boutique");
assert.equal(result.rows.every((entry) => entry.status === "PROVISOIRE — NON CERTIFIÉ"), true);
assert.equal(result.kpis.find((entry) => entry.label === "Écritures non attribuées").value, "1");
assert.equal(result.filters.some((entry) => entry.value === "POSTED/REVERSED"), true);
const ui = fs.readFileSync("components/enterprise/professional/retail-site-overview.tsx", "utf8");
assert.match(ui, /downloadProfessionalXlsx\(exportLedger\(\)\)/);
assert.match(ui, /downloadProfessionalPdfV2\(exportLedger\(\)\)/);
assert.match(ui, /disabled=\{loading \|\| !items.length\}/);
// Exercise the actual shared exporters in-memory; this test must not depend
// on browser download privileges or write financial files to the repository.
let downloaded;
const browser = {
  URL: { createObjectURL: (blob) => { downloaded = blob; return "blob:retail-qa"; }, revokeObjectURL: () => {} },
  document: { body: { appendChild: () => {} }, createElement: () => ({ click: () => {}, remove: () => {} }) },
  setTimeout: () => {},
};
function loadExporter(path) {
  const exporter = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: exporter, exports: exporter.exports, require, Date, Blob, TextEncoder, ...browser });
  return exporter.exports;
}
const shared = loadExporter("lib/reporting/professional-export.ts");
shared.downloadProfessionalXlsx(result);
assert.equal(downloaded.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
const workbook = new Uint8Array(await downloaded.arrayBuffer());
assert.equal(new TextDecoder().decode(workbook.slice(0, 4)), "PK\u0003\u0004", "Actual XLSX ZIP signature");
assert.match(new TextDecoder().decode(workbook), /PROVISOIRE/, "The exported workbook must carry a non-certification label");
const pdf = loadExporter("lib/reporting/professional-pdf-v2.ts");
const pdfBytes = pdf.renderProfessionalPdfBytes(result);
assert.match(new TextDecoder().decode(pdfBytes.slice(0, 8)), /^%PDF-/, "Actual PDF signature");
assert.match(new TextDecoder().decode(pdfBytes), /PROVISOIRE/, "The exported PDF must carry a provisional label");
console.log("HOTFIX #1042 provisional financial PDF/XLSX exports, currency isolation, missing-site disclosure and labels: OK");
