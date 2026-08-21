import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const failures = [];

function expect(name, condition) {
  if (!condition) failures.push(name);
}

const formField = read("components/ui/form-field.tsx");
const erpUi = read("components/enterprise/core-v2/erp-v2-ui.tsx");
const referenceCatalog = read("lib/forms/reference-catalog.ts");
const referenceSelect = read("components/ui/reference-select.tsx");
const purchases = read("components/enterprise/core-v2/enterprise-purchases-workspace.tsx");
const purchaseCopy = read("lib/enterprise/purchase-form-i18n.ts");
const contract = read("docs/ENTERPRISE_FORM_UX_CONTRACT.md");

expect("FormField keeps contextual help visible below the control", formField.includes('effectiveHint ? <span className="break-words text-sm leading-6 text-dtsc-muted">{effectiveHint}</span>'));
expect("FormField supports visible field errors", /role="alert"/.test(formField));
expect("FormField prefers explicit guidance over generic reference guidance", formField.includes("const effectiveHint = hint || automaticHint"));
expect("ERP Field keeps help visible below the control", erpUi.includes('effectiveHelp ? <span className="break-words text-sm leading-6 text-dtsc-muted">{effectiveHelp}</span>'));
expect("ERP Field marks required business fields", /required = false/.test(erpUi) && /text-red-500/.test(erpUi));
expect("ERP uses the canonical reference catalog", erpUi.includes('from "@/lib/forms/reference-catalog"') && erpUi.includes("export { currencyChoices, unitChoices }"));
expect("Canonical catalog exposes controlled currency choices", referenceCatalog.includes("export function currencyChoices") && referenceCatalog.includes('id: "CDF"') && referenceCatalog.includes('id: "USD"'));
expect("Canonical catalog exposes controlled unit choices", referenceCatalog.includes("export function unitChoices") && referenceCatalog.includes('id: "unit"') && referenceCatalog.includes('id: "kg"'));
expect("Canonical reference selector renders a real select", referenceSelect.includes("<select") && referenceSelect.includes("data-dtsc-controlled-reference"));

expect("Purchase form declares the guided-form contract", purchases.includes('data-dtsc-guided-form="purchase"'));
expect("Purchase currency uses a controlled selector", purchases.includes('items={currencyChoices(locale)}') && !purchases.includes('<Input name="currency"'));
expect("Purchase unit uses a controlled selector", purchases.includes('items={unitChoices(locale)}') && !purchases.includes('<Input value={item.unit}'));
expect("Purchase form uses contextual help broadly", (purchases.match(/help=\{guide\(/g) || []).length >= 14);
expect("Purchase lines expose explicit business labels", purchases.includes('guide("lineDescription")') && purchases.includes('guide("quantity")') && purchases.includes('guide("unitPrice")') && purchases.includes('guide("taxRate")'));
expect("Purchase form keeps mobile-safe minmax grids", purchases.includes('grid-cols-[minmax(0,1fr)]'));

expect("Purchase guidance is bilingual", purchaseCopy.includes("fr: {") && purchaseCopy.includes("en: {") && purchaseCopy.includes("currency:") && purchaseCopy.includes("unitHelp:"));
expect("Form UX contract is application-wide", contract.includes("tous les formulaires professionnels de DTSC Platform"));
expect("Form UX contract forbids free currency entry", contract.includes("l’utilisateur ne saisit pas librement `USD`, `CDF`, `EUR`, etc."));
expect("Form UX contract requires tenant-safe references", contract.includes("même `organizationId`"));

if (failures.length) {
  console.error("FAIL guided form UX contract:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS guided form UX contract: visible guidance, canonical currency/unit catalogs and responsive purchase form are enforced.");
