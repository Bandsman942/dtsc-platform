import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const bilingualContracts = {
  "components/productivity/professional-toolbox.tsx": ["const english", "Professional toolbox", "Boîte à outils professionnelle", "Scientific", "Scientifique", "Financial", "Financière"],
  "components/floating-actions/floating-action-hub.tsx": ["useAppLocale", "Quick actions", "Actions rapides"],
  "components/activities/work-prestations-panel-v2.tsx": ["english", "Work type", "Type de travail"],
  "components/collaborators/collaborators-conversation-workspace.tsx": ["Mes contacts", "My contacts", "Messages précédents", "Older messages"],
  "components/admin/billing-plan-manager.tsx": ["Individual offers", "Offres individuelles", "Organization offers", "Offres d’organisation"],
};
for (const [file, tokens] of Object.entries(bilingualContracts)) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) { failures.push(`Fichier i18n absent: ${file}`); continue; }
  const content = fs.readFileSync(target, "utf8");
  for (const token of tokens) if (!content.includes(token)) failures.push(`${file}: libellé/contrat FR-EN absent: ${token}`);
}

const forbiddenRawLabels = [
  ["components/productivity/professional-toolbox.tsx", ">DRAFT<"],
  ["components/productivity/professional-toolbox.tsx", ">CRITICAL<"],
  ["components/admin/billing-plan-manager.tsx", ">ORGANIZATION<"],
];
for (const [file, token] of forbiddenRawLabels) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  if (content.includes(token)) failures.push(`${file}: enum technique exposé: ${token}`);
}

const baselinePath = path.join(root, "config/i18n-hardcoded-baseline.json");
if (!fs.existsSync(baselinePath)) failures.push("Inventaire global i18n absent.");
else {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  for (const [file, maximum] of Object.entries(baseline.files || {})) {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) continue;
    const content = fs.readFileSync(target, "utf8");
    const count = countLikelyHardcodedLabels(content);
    if (count > maximum) failures.push(`${file}: nouveaux libellés codés en dur (${count} > ${maximum}).`);
  }
}

if (failures.length) { console.error(failures.map((failure) => `✗ ${failure}`).join("\n")); process.exit(1); }
console.log("✓ Contrat i18n itération 07 et budget global de non-régression validés.");

function countLikelyHardcodedLabels(content) {
  const jsxText = [...content.matchAll(/>([^<{\n][^<{]*?)</g)].map((match) => match[1].trim()).filter((value) => /[A-Za-zÀ-ÿ]{3}/.test(value));
  const attributes = [...content.matchAll(/(?:placeholder|title|aria-label)="([^"]*[A-Za-zÀ-ÿ][^"]*)"/g)].map((match) => match[1]);
  return jsxText.length + attributes.length;
}
