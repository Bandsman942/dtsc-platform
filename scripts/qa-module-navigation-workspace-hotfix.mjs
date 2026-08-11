import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`Fichier introuvable: ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
}

function check(label, condition, hint) {
  if (condition) {
    console.log(`PASS ${label}`);
    return;
  }
  failures.push(`${label}${hint ? ` — ${hint}` : ""}`);
  console.error(`FAIL ${label}`);
}

const navLinks = read("components/layout/nav-links.tsx");
const mobileShell = read("components/dtsc/mobile-shell.tsx");
const contextSwitcher = read("components/layout/organization-context-switcher.tsx");
const moduleWorkspace = read("components/workspace/module-workspace.tsx");
const refreshButton = read("components/workspace/module-refresh-button.tsx");
const productNavigation = read("components/layout/product-navigation.tsx");
const modulesHub = read("app/modules/page.tsx");
const groupRegistry = read("lib/navigation/module-navigation-groups.ts");

check("Les cinq groupes DTSC sont définis", ["PILOTAGE", "AI_COLLABORATION", "ORGANIZATION_ERP", "ACCOUNT_SUPPORT", "DTSC_INTERNAL"].every((code) => groupRegistry.includes(`\"${code}\"`)));
check("La navigation desktop utilise les groupes", navLinks.includes("MODULE_NAVIGATION_GROUPS") && navLinks.includes("getModuleNavigationGroupHref"));
check("La navigation desktop n’énumère plus standardNavItem", !navLinks.includes("standardNavItem("));
check("La navigation mobile utilise les groupes", mobileShell.includes("MODULE_NAVIGATION_GROUPS") && mobileShell.includes("getModuleNavigationGroupHref"));
check("La navigation mobile n’énumère plus les modules ERP", !mobileShell.includes("enterpriseContext.modules.map"));
check("Le hub modules est protégé par session", modulesHub.includes("requireUser()") && modulesHub.includes("getSession()"));
check("Le hub ERP dépend du résolveur serveur", modulesHub.includes("getEnterpriseNavigationModules") && modulesHub.includes("resolveEnterpriseModuleAccess"));
check("Le changement de contexte recharge la route courante après succès", contextSwitcher.includes("if (!response.ok)") && contextSwitcher.includes("window.location.reload()"));
check("Le changement de contexte expose les erreurs", contextSwitcher.includes("role=\"alert\"") && contextSwitcher.includes("setError"));
check("Actualiser utilise router.refresh", refreshButton.includes("router.refresh()") && refreshButton.includes("Actualiser"));
check("Actualiser couvre le shell produit", productNavigation.includes("ModuleRefreshButton"));
check("L’entrée de module porte l’identité DTSC", moduleWorkspace.includes("data-dtsc-module-entry") && moduleWorkspace.includes("DTSC · Workspace"));
check("Les sections sont focalisées plein écran", moduleWorkspace.includes("fixed inset-0") && moduleWorkspace.includes("Retour au module"));
check("Les deep links de section restent pris en charge", moduleWorkspace.includes("hashchange") && moduleWorkspace.includes("window.location.hash"));
check("La fermeture clavier est prise en charge", moduleWorkspace.includes('event.key === "Escape"'));

if (failures.length > 0) {
  console.error("\nQA hotfix navigation/workspace en échec:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\nPASS Hotfix navigation groupée / actualisation / workspaces focalisés.");
