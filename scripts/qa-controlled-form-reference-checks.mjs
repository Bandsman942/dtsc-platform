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

expect("shared Input resolves controlled reference kinds", input.includes("controlledReferenceKind") && input.includes("<ReferenceSelect"));
expect("currency and unit are canonical controlled reference fields", catalog.includes('currency: "currency"') && catalog.includes('unit: "unit"') && catalog.includes('currencyCode: "currency"') && catalog.includes('unitCode: "unit"'));
expect("reference selector is a real select", referenceSelect.includes("<select") && referenceSelect.includes("data-dtsc-controlled-reference"));
expect("reference selector is bilingual", referenceSelect.includes("document.documentElement.lang") && catalog.includes('fr: "Dollar américain (USD)"') && catalog.includes('en: "US dollar (USD)"'));
expect("FormField can provide automatic reference help", formField.includes("referenceFieldHelp") && formField.includes("effectiveHint"));
expect("ERP Field shares the canonical reference catalog", erpUi.includes('from "@/lib/forms/reference-catalog"') && erpUi.includes("export { currencyChoices, unitChoices }"));
expect("form contract requires controlled statuses/types/categories", contract.includes("Les statuts, priorités, types et catégories utilisent des valeurs contrôlées."));

const sourceFiles = [...walk("components"), ...walk("app")];
const forbiddenFreeInputNames = new Set(["status", "priority", "type", "category", "paymentMethod"]);
const globallyControlledInputNames = new Set(["currency", "currencyCode", "unit", "unitCode"]);

for (const relativePath of sourceFiles) {
  const source = read(relativePath);

  for (const match of source.matchAll(/<input\b[^>]*\bname=["'](currency|currencyCode|unit|unitCode|status|priority|type|category|paymentMethod)["'][^>]*>/gsi)) {
    failures.push(`${relativePath}: native input remains free for controlled reference '${match[1]}'`);
  }

  for (const match of source.matchAll(/<Input\b[^>]*\bname=["'](currency|currencyCode|unit|unitCode|status|priority|type|category|paymentMethod)["'][^>]*\/?\s*>/gsi)) {
    const fieldName = match[1];
    if (globallyControlledInputNames.has(fieldName)) continue;
    if (forbiddenFreeInputNames.has(fieldName)) {
      failures.push(`${relativePath}: Input remains free for reference-like field '${fieldName}'`);
    }
  }
}

if (failures.length) {
  console.error("FAIL controlled form reference contract:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS controlled form reference contract: ${sourceFiles.length} active TSX/JSX files scanned; canonical currency/unit selectors and reference-field inventory are clean.`);
