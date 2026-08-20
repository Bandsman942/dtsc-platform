import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const exists = (file) => fs.existsSync(path.join(root, file));
const ok = (condition, message) => { if (!condition) failures.push(message); };

const requiredFiles = [
  "components/dtsc/mobile-group-swipe-navigation.tsx",
  "components/workspace/business-detail.tsx",
  "components/workspace/business-list.tsx",
  "components/enterprise/professional/finance-professional-ui.ts",
  "lib/client-facing-copy.ts",
  "lib/i18n.ts",
  "scripts/qa-smooth-mobile-group-swipe.mjs",
  "scripts/qa-finance-client-ux.mjs",
];
for (const file of requiredFiles) ok(exists(file), `Hotfix #455: fichier requis absent ${file}`);

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

const swipe = read("components/dtsc/mobile-group-swipe-navigation.tsx");
const detail = read("components/workspace/business-detail.tsx");
const list = read("components/workspace/business-list.tsx");
const financeUi = read("components/enterprise/professional/finance-professional-ui.ts");
const clientCopy = read("lib/client-facing-copy.ts");
const i18n = read("lib/i18n.ts");
const smoothQa = read("scripts/qa-smooth-mobile-group-swipe.mjs");
const financeQa = read("scripts/qa-finance-client-ux.mjs");

ok(/const DRAG_ACTIVATION_PX = 12;/.test(swipe), "Hotfix #455: le swipe doit conserver une dead-zone tactile suffisante.");
ok(/activeGesture\.axis !== "horizontal"[\s\S]*settleGestureWithoutMotion\(activeGesture\)/.test(swipe), "Hotfix #455: un tap neutre doit se terminer sans animation globale.");
ok(/Math\.abs\(dy\) > Math\.abs\(dx\) \* HORIZONTAL_DOMINANCE[\s\S]*settleGestureWithoutMotion\(activeGesture\)/.test(swipe), "Hotfix #455: un geste vertical précoce ne doit pas animer le workspace.");
ok(smoothQa.includes("neutral taps stay still"), "Hotfix #455: la QA responsive doit documenter explicitement le contrat anti-tremblement.");
ok(!swipe.includes("preventDefault()"), "Hotfix #455: le geste global ne doit pas confisquer les gestes système/native scroll.");

for (const [file, source] of [
  ["BusinessDetail", detail],
  ["BusinessList", list],
]) {
  ok(source.includes("min-w-0"), `Hotfix #455: ${file} doit rester réductible sur mobile.`);
  ok(!/translate3d|style\.transform|\.animate\(/.test(source), `Hotfix #455: ${file} ne doit pas introduire sa propre animation de déplacement globale.`);
}
ok(detail.includes("data-business-detail"), "Hotfix #455: la primitive de détail partagée doit rester identifiable.");
ok(list.includes("max-w-full"), "Hotfix #455: la liste métier partagée doit rester bornée au viewport.");

for (const token of [
  "Valeur métier à vérifier",
  "Business value to review",
  '["Valeur métier à vérifier", "Autre catégorie"]',
  '["Business value to review", "Other category"]',
  "Données filtrées par entreprise, paginées côté serveur et présentées en langage métier.",
  "Organization-scoped, server-paginated data presented in business language.",
  "Consultez, recherchez et suivez les informations utiles à cette activité.",
  "Review, search, and follow the information that matters to this activity.",
  "tenant et approbation",
  "currency, balance, tenant and approval",
]) ok(clientCopy.includes(token), `Hotfix #455: mapping client-safe manquant pour ${token}`);

ok(clientCopy.includes("must never process user-entered or business-record values"), "Hotfix #455: la frontière données utilisateur / copie système doit être documentée dans le helper.");
ok(i18n.includes('import { clientFacingCopy } from "@/lib/client-facing-copy";'), "Hotfix #455: les traducteurs canoniques doivent utiliser le filtre de copie client.");
ok((i18n.match(/translatedClientCopy\(/g) || []).length >= 11, "Hotfix #455: le filtre client-safe doit couvrir les traducteurs de domaine partagés.");

for (const forbidden of ["Valeur métier à vérifier", "Business value to review"]) {
  ok(!financeUi.includes(forbidden), `Hotfix #455: fallback technique encore présent dans Finance (${forbidden}).`);
}
for (const token of [
  'COST_OF_SALES: "Coût des ventes"',
  'OPERATING_EXPENSE: "Charges d’exploitation"',
  'TAX_RECEIVABLE: "Taxes à récupérer"',
  'COST_OF_SALES: "Cost of sales"',
  'OPERATING_EXPENSE: "Operating expenses"',
  'TAX_RECEIVABLE: "Tax receivable"',
  '"Autre catégorie"',
  '"Other category"',
]) ok(financeUi.includes(token), `Hotfix #455: libellé Finance client-safe manquant ${token}`);
ok(financeQa.includes("ancien fallback interne encore exposable"), "Hotfix #455: la QA Finance doit refuser explicitement les anciens fallbacks techniques.");

// The client-copy helper must remain a system-copy boundary, not a formatter for arbitrary records.
const directClientCopyImports = [];
for (const base of ["components", "app"]) walk(path.join(root, base));
function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      const source = fs.readFileSync(absolute, "utf8");
      if (source.includes("client-facing-copy")) directClientCopyImports.push(path.relative(root, absolute));
    }
  }
}
ok(directClientCopyImports.length === 0, `Hotfix #455: clientFacingCopy ne doit pas être appelé directement par une surface métier (${directClientCopyImports.join(", ")}).`);

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log("PASS Hotfix #455 — taps neutres stables, swipe intentionnel préservé, détails mobile-first et copie système client-safe sans toucher aux données utilisateur.");
