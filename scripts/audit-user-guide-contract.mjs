import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const guidesDir = path.join(root, "docs/user-guides");
const failures = [];
const requiredHeadings = [
  "## Objectif et périmètre",
  "## Accès et permissions",
  "## Statuts, validations et traçabilité",
  "## Sécurité et confidentialité",
  "## Dépannage",
];

if (!fs.existsSync(guidesDir)) failures.push("Répertoire docs/user-guides absent.");
const guides = fs.existsSync(guidesDir)
  ? fs.readdirSync(guidesDir).filter((file) => file.endsWith(".md")).sort()
  : [];

for (const file of guides) {
  const content = fs.readFileSync(path.join(guidesDir, file), "utf8");
  if (!content.startsWith("# Guide utilisateur — ")) failures.push(`${file}: titre canonique absent.`);
  if (!content.includes("Contrat de guide DTSC v2")) failures.push(`${file}: version du contrat absente.`);
  for (const heading of requiredHeadings) if (!content.includes(heading)) failures.push(`${file}: section absente: ${heading}`);
  const words = content.replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter(Boolean).length;
  if (words < 140) failures.push(`${file}: guide insuffisamment détaillé (${words} mots).`);
  if (/\b(?:TODO|LOREM IPSUM)\b/i.test(content)) failures.push(`${file}: contenu provisoire interdit.`);
}

const registryPath = path.join(root, "lib/modules/standard-module-registry-data.json");
if (fs.existsSync(registryPath)) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const serialized = JSON.stringify(registry);
  for (const match of serialized.matchAll(/docs\/user-guides\/[A-Z0-9_]+\.md/g)) {
    if (!fs.existsSync(path.join(root, match[0]))) failures.push(`Guide déclaré mais absent: ${match[0]}`);
  }
}

const featureContracts = {
  "DTSC_ACTIVITIES.md": ["type de travail", "discussion globale", "progression côté serveur", "ne peut pas être clôturée"],
  "COLLABORATORS.md": ["Mes contacts", "ADMIN DTSC", "Messages précédents", "ancrage visuel"],
  "BILLING.md": ["offres individuelles", "offres d’organisation", "source unique", "Assistant IA d’entreprise"],
  "PROFESSIONAL_TOOLBOX.md": ["plusieurs notes", "Kanban", "Calculatrice scientifique", "Financière"],
};
for (const [file, tokens] of Object.entries(featureContracts)) {
  const content = fs.readFileSync(path.join(guidesDir, file), "utf8");
  for (const token of tokens) if (!content.toLocaleLowerCase().includes(token.toLocaleLowerCase())) failures.push(`${file}: fonctionnalité non documentée: ${token}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `✗ ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`✓ Contrat unifié validé pour ${guides.length} guides utilisateur.`);
