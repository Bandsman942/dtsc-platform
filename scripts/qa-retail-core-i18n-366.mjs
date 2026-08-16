import fs from "node:fs";
import process from "node:process";

const read = (path) => fs.readFileSync(path, "utf8");
const parse = (path) => JSON.parse(read(path));
const fail = (message) => { console.error(`FAIL ${message}`); process.exitCode = 1; };
const assert = (condition, message) => { if (!condition) fail(message); };

const fr = parse("locales/retail-workspace.fr.json");
const en = parse("locales/retail-workspace.en.json");
const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();
assert(frKeys.length >= 90, `catalogue Retail trop petit: ${frKeys.length} clés`);
assert(JSON.stringify(frKeys) === JSON.stringify(enKeys), "parité stricte des clés Retail FR/EN absente");
for (const key of frKeys) {
  assert(typeof fr[key] === "string" && fr[key].trim(), `valeur FR vide: ${key}`);
  assert(typeof en[key] === "string" && en[key].trim(), `valeur EN vide: ${key}`);
}

const i18n = read("lib/i18n.ts");
assert(i18n.includes('retail-workspace.fr.json'), "catalogue Retail FR non enregistré dans lib/i18n.ts");
assert(i18n.includes('retail-workspace.en.json'), "catalogue Retail EN non enregistré dans lib/i18n.ts");
assert(i18n.includes("translateRetailWorkspace"), "helper canonique translateRetailWorkspace absent");
assert(i18n.includes("RetailWorkspaceKey"), "type de clé Retail canonique absent");

const pagePath = "app/enterprise-modules/retail-page.tsx";
const sharedPath = "components/enterprise/professional/retail-workspace-shared.tsx";
const posPath = "components/enterprise/professional/retail-pos-workspace.tsx";
const supplementaryPath = "components/enterprise/professional/retail-pos-supplementary-tools.tsx";
const page = read(pagePath);
const shared = read(sharedPath);
const pos = read(posPath);
const supplementary = read(supplementaryPath);

assert(page.includes("RetailPosSupplementaryTools"), "shell Retail POS: outils complémentaires non déplacés vers le client locale-aware");
assert(!page.includes("const locale:"), "shell Retail POS: locale serveur encore figée dans retail-page.tsx");
assert(!page.includes('locale === "en" ?'), "shell Retail POS: copies FR/EN locales encore présentes");

assert(shared.includes("translateRetailWorkspace"), "Retail partagé: source i18n canonique absente");
assert(shared.includes("retailText(locale"), "Retail partagé: projection locale canonique absente");
assert(shared.includes('moneyValue(value: string | number | null | undefined, currency?: string, locale?: "fr" | "en")'), "Retail partagé: formatage monétaire locale-aware absent");
assert(shared.includes('retailText(locale, "sevenDays")'), "Retail partagé: période 7 jours non canonique");
assert(shared.includes('retailText(locale, "thirtyDays")'), "Retail partagé: période 30 jours non canonique");
assert(!shared.includes('label: locale === "en" ? "Operate"'), "Retail partagé: onglet Operate/Opérer encore local");
assert(!shared.includes('locale === "en" ? "User guide"'), "Retail partagé: guide utilisateur encore local");
assert(!shared.includes('locale === "en" ? "Shop setup"'), "Retail partagé: mise en service encore locale");
assert(!shared.includes('locale === "en" ? "Open my till"'), "Retail partagé: ouverture caisse encore locale");
assert(!shared.includes('locale === "en" ? "Continue in the ERP"'), "Retail partagé: liens ERP encore locaux");

assert(pos.includes("translateRetailWorkspace"), "POS: source i18n canonique absente");
assert(pos.includes('retailText(locale, "counterSale")'), "POS: vente comptoir non canonique");
assert(pos.includes('retailText(locale, "collectPayment")'), "POS: encaissement non canonique");
assert(pos.includes('retailText(locale, "recentReceipts")'), "POS: historique des tickets non canonique");
assert(!pos.includes('locale === "en" ? "Counter sale"'), "POS: titre vente comptoir encore local");
assert(!pos.includes('locale === "en" ? "Basket"'), "POS: panier encore local");
assert(!pos.includes('locale === "en" ? "Payment"'), "POS: paiement encore local");
assert(!pos.includes('locale === "en" ? "Reason for reversal"'), "POS: motif annulation encore local");
assert(!pos.includes('moneyValue(total, currency)'), "POS: total encore formaté sans locale explicite");
assert(!pos.includes('moneyValue(item.grandTotal, item.currencyCode)'), "POS: historique encore formaté sans locale explicite");

assert(supplementary.includes("useAppLocale"), "outils complémentaires POS: locale applicative canonique non consommée");
assert(supplementary.includes("translateRetailWorkspace"), "outils complémentaires POS: source i18n canonique absente");
assert(supplementary.includes('t("additionalShopTools")'), "outils complémentaires POS: aria-label non canonique");
assert(!supplementary.includes('locale === "en" ?'), "outils complémentaires POS: copie FR/EN locale réintroduite");

for (const path of [pagePath, sharedPath, posPath, supplementaryPath]) {
  const source = read(path);
  assert(!source.includes('toLocaleString("fr-FR"'), `${path}: format fr-FR direct encore présent`);
  assert(!source.includes('toLocaleString("en-US"'), `${path}: format en-US direct encore présent`);
}

const historicalContracts = [
  "scripts/qa-shop2-retail-frontend-contract.mjs",
  "scripts/qa-retail-product-coherence.mjs",
  "scripts/qa-retail-telco-mobile-money.mjs",
  "scripts/qa-sector-onboarding-commercial-readiness.mjs",
];
for (const path of historicalContracts) assert(fs.existsSync(path), `QA Retail historique perdue: ${path}`);

if (!process.exitCode) console.log(`PASS Retail core/POS i18n #366 — ${frKeys.length} clés FR/EN, shell réactif et contrats Retail historiques préservés.`);
