import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function expect(name, condition) {
  if (!condition) failures.push(name);
}

function walk(relativePath) {
  const absolute = path.join(root, relativePath);
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) return walk(child);
    return entry.isFile() && /\.(tsx|jsx)$/.test(entry.name) ? [child.replaceAll("\\", "/")] : [];
  });
}

const input = read("components/ui/input.tsx");
const referenceSelect = read("components/ui/reference-select.tsx");
const catalog = read("lib/forms/reference-catalog.ts");
const formField = read("components/ui/form-field.tsx");
const erpUi = read("components/enterprise/core-v2/erp-v2-ui.tsx");
const contract = read("docs/ENTERPRISE_FORM_UX_CONTRACT.md");
const inventory = read("docs/FORM_REFERENCE_INVENTORY_467.md");

expect("shared Input resolves controlled reference kinds", input.includes("controlledReferenceKind") && input.includes("<ReferenceSelect"));
expect("currency, unit and payment method are canonical controlled references", catalog.includes('currency: "currency"') && catalog.includes('unit: "unit"') && catalog.includes('currencyCode: "currency"') && catalog.includes('unitCode: "unit"') && catalog.includes('paymentMethod: "paymentMethod"'));
expect("reference selector is a real select", referenceSelect.includes("<select") && referenceSelect.includes("data-dtsc-controlled-reference"));
expect("reference selector is bilingual", referenceSelect.includes("document.documentElement.lang") && catalog.includes('fr: "Dollar américain (USD)"') && catalog.includes('en: "US dollar (USD)"') && catalog.includes('fr: "Virement bancaire"'));
expect("FormField can provide automatic reference help", formField.includes("referenceFieldHelp") && formField.includes("effectiveHint"));
expect("ERP Field shares the canonical reference catalog", erpUi.includes('from "@/lib/forms/reference-catalog"') && erpUi.includes("export { currencyChoices, unitChoices }"));
expect("form contract requires controlled statuses/types/categories", contract.includes("Les statuts, priorités, types et catégories utilisent des valeurs contrôlées."));

const sourceFiles = [...walk("components"), ...walk("app")];
const globallyControlledInputNames = new Set(["currency", "currencyCode", "unit", "unitCode", "paymentMethod"]);

// Ces exceptions sont des taxonomies réellement configurables : aucun référentiel canonique
// n'existe dans le modèle courant. Elles restent explicites, bornées par fichier et documentées.
const documentedFreeTextExceptions = new Map([
  ["components/enterprise/core-v2/enterprise-documents-workspace.tsx", new Set(["category"])],
  ["components/enterprise/core-v2/enterprise-finance-workspace.tsx", new Set(["category"])],
  ["components/enterprise/core-v2/enterprise-reports-workspace.tsx", new Set(["category"])],
  ["components/enterprise/core-v2/enterprise-suppliers-workspace.tsx", new Set(["category"])],
  ["components/enterprise/professional/enterprise-catalog-workspace.tsx", new Set(["category"])],
  ["components/enterprise/professional/enterprise-projects-deliverables-workspace.tsx", new Set(["category"])],
]);

for (const [relativePath, fields] of documentedFreeTextExceptions) {
  for (const field of fields) {
    expect(`documented exception ${relativePath}#${field}`, inventory.includes(`\`${relativePath}\``) && inventory.includes(`\`${field}\``));
  }
}

function looksReferenceLike(fieldName) {
  return /(?:^|[A-Z_])(status|priority|type|category|method)$/i.test(fieldName)
    || /(Status|Priority|Type|Category|Method)$/.test(fieldName);
}

function isDocumentedException(relativePath, fieldName) {
  return documentedFreeTextExceptions.get(relativePath)?.has(fieldName) || false;
}

for (const relativePath of sourceFiles) {
  const source = read(relativePath);

  // Case-sensitive by design: do not confuse the shared React <Input> with a raw HTML <input>.
  for (const match of source.matchAll(/<input\b[^>]*\bname=["']([A-Za-z0-9_]+)["'][^>]*>/gs)) {
    const fieldName = match[1];
    if (globallyControlledInputNames.has(fieldName) || looksReferenceLike(fieldName)) {
      failures.push(`${relativePath}: native input remains free for reference-like field '${fieldName}'`);
    }
  }

  for (const match of source.matchAll(/<Input\b[^>]*\bname=["']([A-Za-z0-9_]+)["'][^>]*\/?\s*>/gs)) {
    const fieldName = match[1];
    const tag = match[0];
    if (globallyControlledInputNames.has(fieldName)) continue;
    if (!looksReferenceLike(fieldName)) continue;
    // A numeric priority is a rank/weight measurement, not a business-priority enum.
    if (/Priority$/i.test(fieldName) && /\btype=["']number["']/.test(tag)) continue;
    if (isDocumentedException(relativePath, fieldName)) continue;
    failures.push(`${relativePath}: Input remains free for reference-like field '${fieldName}'`);
  }
}

if (failures.length) {
  console.error("FAIL controlled form reference contract:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS controlled form reference contract: ${sourceFiles.length} active TSX/JSX files scanned; canonical references and documented custom taxonomies are clean.`);
