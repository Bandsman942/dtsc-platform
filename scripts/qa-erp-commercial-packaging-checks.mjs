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
const businessPartyRoute = fs.readFileSync("app/api/enterprise/[organizationId]/business-parties/route.ts", "utf8");
const businessErrors = fs.readFileSync("lib/enterprise/common/http.ts", "utf8");
const commercialCreateRoutes = [
  "app/api/enterprise/[organizationId]/catalog/route.ts",
  "app/api/enterprise/[organizationId]/leads/route.ts",
  "app/api/enterprise/[organizationId]/opportunities/route.ts",
  "app/api/enterprise/[organizationId]/quotes/route.ts",
  "app/api/enterprise/[organizationId]/contracts/route.ts",
];
for (const file of docs) if (!fs.existsSync(file)) failures.push(`Absent: ${file}`);
for (const file of workspaces) {
  const content = fs.readFileSync(file, "utf8");
  for (const marker of ["ProfessionalHelp", "EmptyState"]) if (!content.includes(marker)) failures.push(`${file}: ${marker}`);
}
if (!businessPartyRoute.includes("Promise.allSettled") || !businessPartyRoute.includes('enterpriseDomainErrorResponse(error, "BUSINESS_PARTY_CREATE_FAILED", req)')) failures.push("Tiers: le succès métier doit rester distinct des erreurs de télémétrie et retourner une erreur actionnable");
for (const marker of ["BUSINESS_PARTY_NOT_FOUND", "UNIT_OF_MEASURE_NOT_FOUND", "CATALOG_ITEM_NOT_FOUND", "OPPORTUNITY_NOT_FOUND", "CONTRACT_APPROVER_NOT_MEMBER"]) if (!businessErrors.includes(marker)) failures.push(`Contrat d'erreur métier manquant: ${marker}`);
if (/error\.message\s*\}/.test(businessErrors)) failures.push("Les erreurs métier brutes ne doivent pas être renvoyées au client");
for (const file of commercialCreateRoutes) {
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes("Promise.allSettled")) failures.push(`${file}: une notification ou télémétrie post-création peut encore transformer un succès durable en échec`);
  if (!content.includes("enterpriseDomainErrorResponse(error") || !content.includes(", req)")) failures.push(`${file}: contrat d'erreur métier localisé absent`);
}
if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}
console.log("✅ Packaging vérifié : onboarding, aide, support documentaire et états vides présents sur les workspaces guidés.");
