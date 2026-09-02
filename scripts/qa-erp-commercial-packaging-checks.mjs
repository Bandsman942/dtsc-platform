import fs from "node:fs";

const docs = [
  "docs/ERP_COMMERCIAL_PACKAGING_STANDARD.md",
  "docs/ERP_ITERATION_02_USER_GUIDE.md",
  "docs/ERP_PROFESSIONAL_MASTER_DATA.md",
  "docs/ERP_PROFESSIONAL_CRM.md",
  "docs/ERP_PROFESSIONAL_CONTRACTS.md",
];
const workspaces = [
  "components/enterprise/professional/enterprise-customers-workspace-v2.tsx",
  "components/enterprise/professional/enterprise-catalog-workspace-v2.tsx",
  "components/enterprise/professional/enterprise-sites-workspace.tsx",
  "components/enterprise/professional/enterprise-crm-workspace-v2.tsx",
  "components/enterprise/professional/enterprise-contracts-workspace-v2.tsx",
];
const failures = [];
for (const file of docs) if (!fs.existsSync(file)) failures.push(`Absent: ${file}`);
for (const file of workspaces) {
  const content = fs.readFileSync(file, "utf8");
  for (const marker of ["ProfessionalHelp", "EmptyState"]) if (!content.includes(marker)) failures.push(`${file}: ${marker}`);
}
if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}
console.log("✅ Packaging vérifié : onboarding, aide, support documentaire et états vides présents sur les workspaces guidés.");