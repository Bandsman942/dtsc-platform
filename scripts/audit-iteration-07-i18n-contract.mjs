import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const warnings = [];
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

const canonicalizedContracts = {
  "components/activities/entity-comments-thread.tsx": {
    required: ["getSharedCollaborationCopy", "getIntlLocale"],
    forbidden: [
      "const english =",
      'locale === "en"',
      '"Unable to load comments."',
      '"Chargement des commentaires impossible."',
      '"Comment added."',
      '"Commentaire ajouté."',
      '"fr-FR"',
      '"en-GB"',
      "toLocaleString(english",
    ],
  },
};
for (const [file, contract] of Object.entries(canonicalizedContracts)) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) { failures.push(`Fichier i18n canonique absent: ${file}`); continue; }
  const content = fs.readFileSync(target, "utf8");
  for (const token of contract.required) if (!content.includes(token)) failures.push(`${file}: dépendance i18n canonique absente: ${token}`);
  for (const token of contract.forbidden) if (content.includes(token)) failures.push(`${file}: dette i18n locale réintroduite: ${token}`);
}

validateDictionaryParity(
  "locales/shared-collaboration.fr.json",
  "locales/shared-collaboration.en.json",
  "shared collaboration",
);

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
  ensureMainRef();
  for (const [file, maximum] of Object.entries(baseline.files || {})) {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) continue;
    const content = fs.readFileSync(target, "utf8");
    const count = countLikelyHardcodedLabels(content);
    if (count <= maximum) continue;

    const baseContent = readBaseVersion(file);
    const baseCount = baseContent == null ? null : countLikelyHardcodedLabels(baseContent);
    const allowedForThisChange = baseCount == null ? maximum : Math.max(maximum, baseCount);
    if (count > allowedForThisChange) {
      failures.push(`${file}: nouveaux libellés codés en dur (${count} > ${allowedForThisChange}; cible historique ${maximum}).`);
    } else {
      warnings.push(`${file}: dette i18n existante sur la branche de base (${count} libellés; cible historique ${maximum}), sans aggravation dans ce changement.`);
    }
  }
}

for (const warning of warnings) {
  console.warn(`! ${warning}`);
  if (process.env.GITHUB_ACTIONS === "true") console.warn(`::warning title=Dette i18n existante::${escapeAnnotation(warning)}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `✗ ${failure}`).join("\n"));
  if (process.env.GITHUB_ACTIONS === "true") {
    for (const failure of failures.slice(0, 20)) console.error(`::error title=Contrat i18n itération 07::${escapeAnnotation(failure)}`);
  }
  process.exit(1);
}
console.log("✓ Contrat i18n itération 07 validé: aucun nouveau dépassement par rapport à la cible historique ou à la branche de base.");

function validateDictionaryParity(frFile, enFile, label) {
  const frPath = path.join(root, frFile);
  const enPath = path.join(root, enFile);
  if (!fs.existsSync(frPath) || !fs.existsSync(enPath)) {
    failures.push(`Dictionnaires ${label} incomplets: ${frFile} / ${enFile}`);
    return;
  }
  const frKeys = flattenKeys(JSON.parse(fs.readFileSync(frPath, "utf8")));
  const enKeys = flattenKeys(JSON.parse(fs.readFileSync(enPath, "utf8")));
  const missingInEn = frKeys.filter((key) => !enKeys.includes(key));
  const missingInFr = enKeys.filter((key) => !frKeys.includes(key));
  if (missingInEn.length) failures.push(`${label}: clés absentes en EN: ${missingInEn.join(", ")}`);
  if (missingInFr.length) failures.push(`${label}: clés absentes en FR: ${missingInFr.join(", ")}`);
}

function flattenKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, nested]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return nested && typeof nested === "object" && !Array.isArray(nested) ? flattenKeys(nested, next) : [next];
  });
}

function ensureMainRef() {
  if (process.env.GITHUB_REF_NAME === "main") {
    const parentProbe = spawnSync("git", ["rev-parse", "--verify", "HEAD^"], { cwd: root, stdio: "ignore" });
    if (parentProbe.status === 0) return;
    spawnSync("git", ["fetch", "origin", "main", "--depth=2"], { cwd: root, stdio: "ignore" });
    return;
  }
  const probe = spawnSync("git", ["rev-parse", "--verify", "origin/main"], { cwd: root, stdio: "ignore" });
  if (probe.status === 0) return;
  spawnSync("git", ["fetch", "origin", "main", "--depth=1"], { cwd: root, stdio: "ignore" });
}

function readBaseVersion(file) {
  const ref = process.env.GITHUB_REF_NAME === "main" ? "HEAD^" : "origin/main";
  const result = spawnSync("git", ["show", `${ref}:${file}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return result.status === 0 ? result.stdout : null;
}

function countLikelyHardcodedLabels(content) {
  // Match text only when it follows an actual JSX opening tag. The previous
  // `>(...)<` expression also started at TypeScript generic closers such as
  // `useState<Readiness>()`, creating false positives whenever typed UI code grew.
  // Keep the historical ceilings unchanged; improve only the signal being counted.
  const jsxText = [...content.matchAll(/<(?:[A-Z][A-Za-z0-9.]*|[a-z][a-z0-9-]*)\b[^>\n]*>([^<{\n][^<{]*?)<\//g)]
    .map((match) => match[1].trim())
    .filter((value) => /[A-Za-zÀ-ÿ]{3}/.test(value));
  const attributes = [...content.matchAll(/(?:placeholder|title|aria-label)="([^"]*[A-Za-zÀ-ÿ][^"]*)"/g)].map((match) => match[1]);
  return jsxText.length + attributes.length;
}

function escapeAnnotation(value) {
  return String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}
