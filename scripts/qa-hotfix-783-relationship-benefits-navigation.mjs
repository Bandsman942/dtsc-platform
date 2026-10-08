import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const includesAll = (content, tokens, label) => {
  for (const token of tokens) check(content.includes(token), `${label}: missing ${token}`);
};

const registry = read("lib/enterprise/module-registry-common-domains.json");
const enterpriseNavigation = read("lib/enterprise/enterprise-navigation.ts");
const modulesHub = read("app/modules/page.tsx");
const adminPage = read("app/enterprise-admin/page.tsx");
const adminModule = read("components/enterprise/enterprise-administration-module.tsx");
const adminPanels = read("components/enterprise/enterprise-administration-panels-base.tsx");

includesAll(
  registry,
  [
    '"code": "RELATIONSHIP_BENEFITS"',
    '"labelFr": "Relations & avantages"',
    '"routePath": "/enterprise-relationship-benefits"',
    '"accessPolicy": "POSITION_PERMISSION"',
  ],
  "Canonical relationship benefits registry",
);

includesAll(
  enterpriseNavigation,
  [
    "listNavigableEnterpriseModules",
    "definition.routePath",
    "href: definition.routePath",
  ],
  "Canonical enterprise navigation resolver",
);

includesAll(
  modulesHub,
  [
    'requestedGroup === "ORGANIZATION_ERP"',
    'item.code === "RELATIONSHIP_BENEFITS"',
    "relationshipBenefitsModule.href",
    "relationshipBenefitsModule.label",
    "data-responsive-actions",
  ],
  "Company & ERP discoverability",
);
check(
  !modulesHub.includes('href="/enterprise-relationship-benefits"'),
  "Company & ERP shortcut must consume the canonical href instead of hardcoding the dedicated route.",
);

includesAll(
  adminPage,
  [
    "getEnterpriseNavigationModules",
    "authorizedNavigationModules",
    "authorizedModuleRoutes",
    'enterpriseModule.code === "RELATIONSHIP_BENEFITS"',
    "relationshipBenefitsEntry",
  ],
  "Administration server-side discoverability",
);
check(
  !adminPage.includes('href: "/enterprise-relationship-benefits"'),
  "Administration shortcut must come from the canonical navigation resolver.",
);

includesAll(
  adminModule,
  [
    "relationshipBenefitsEntry",
    "authorizedModuleRoutes",
    "relationshipBenefitsEntry.href",
    "relationshipBenefitsEntry.label",
    "overflow-x-auto",
  ],
  "Administration visible relationship benefits entry",
);

includesAll(
  adminPanels,
  [
    "authorizedModuleRoutes",
    "const openHref = authorizedModuleRoutes[moduleCode] || null",
    "module.isEnabled && openHref",
    "href={openHref}",
  ],
  "Administration module canonical open action",
);
check(
  !adminPanels.includes('href={`/enterprise-modules/${encodeURIComponent(module.canonicalCode || module.moduleCode)}`}'),
  "Administration module action must not rebuild a generic route when the canonical resolver already supplied one.",
);

if (failures.length) {
  console.error("\nHotfix #783 navigation QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Hotfix #783 relationship benefits navigation QA passed.");
