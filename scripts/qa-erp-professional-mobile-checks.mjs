import fs from "node:fs";

const files = [
  "enterprise-customers-workspace-v2.tsx",
  "enterprise-catalog-workspace-v2.tsx",
  "enterprise-sites-workspace.tsx",
  "enterprise-crm-workspace-v2.tsx",
  "enterprise-contracts-workspace-v2.tsx",
];
const failures = [];
for (const name of files) {
  const content = fs.readFileSync(`components/enterprise/professional/${name}`, "utf8");
  if (!content.includes("ModuleMetrics")) failures.push(`${name}: rail KPI absent`);
  if (!content.includes("data-responsive-actions") && !content.includes("sticky bottom-0") && !content.includes('presentation="editor"')) failures.push(`${name}: actions mobiles absentes`);
  if (content.includes("w-screen")) failures.push(`${name}: w-screen interdit`);
}
const sites = fs.readFileSync("components/enterprise/professional/enterprise-sites-workspace.tsx", "utf8");
if (!sites.includes("<details")) failures.push("La hiérarchie mobile doit utiliser une liste imbriquée.");
if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}
console.log("✅ Contrat mobile vérifié : KPI, dialogs editor/actions responsives et hiérarchie imbriquée.");