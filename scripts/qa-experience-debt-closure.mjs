import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) {
    failures.push(`Fichier introuvable: ${file}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n");
}

function ok(condition, message) {
  if (!condition) failures.push(message);
}

function includesAll(source, snippets, label) {
  for (const snippet of snippets) {
    ok(source.includes(snippet), `${label}: missing ${snippet}`);
  }
}

const fr = read("locales/experience.fr.json");
const en = read("locales/experience.en.json");
for (const source of [fr, en]) {
  includesAll(source, [
    '"workspace"',
    '"dashboard"',
    '"settings"',
    '"mobile"',
    '"newChat"',
    '"switchWorkspace"',
  ], "experience locale");
}
ok(fr.includes('DTSC · Espace de travail'), "French workspace signature must be user-facing and localized.");
ok(en.includes('DTSC · Workspace'), "English workspace signature must remain available in the English dictionary.");

const experienceI18n = read("lib/experience-i18n.ts");
includesAll(experienceI18n, ["getExperienceCopy", "fillExperienceTemplate", "getIntlLocale"], "experience-i18n");

const labelsI18n = read("lib/labels-i18n.ts");
includesAll(labelsI18n, ["formatEnumLabelForLocale", "englishLabels", "GLOBAL_CLIENT"], "labels-i18n");

const button = read("components/ui/button.tsx");
ok(button.includes('"inline-flex h-auto'), "Shared Button must use automatic height for wrapped labels.");
ok(button.includes('min-h-10'), "Shared Button must retain a minimum tactile height.");
ok(button.includes('active:translate-y-px'), "Shared Button must expose a pressed state.");
ok(!/size:\s*\{[\s\S]*?default:\s*"h-9\b/.test(button), "Shared Button default size must not reintroduce a fixed h-9 with wrapping.");

const moduleWorkspace = read("components/workspace/module-workspace.tsx");
includesAll(moduleWorkspace, [
  "getExperienceCopy",
  "copy.signature",
  "MoreHorizontal",
  "ModuleRefreshButton compact",
  "copy.openSection",
  "copy.backToModule",
], "module-workspace");
ok(!moduleWorkspace.includes('>DTSC · Workspace<'), "Module workspace must not hardcode the English signature in JSX.");
ok(!moduleWorkspace.includes('Ouvrir le workspace'), "Module section controls must come from the experience dictionary.");

const dashboard = read("app/dashboard/page.tsx");
includesAll(dashboard, [
  "getExperienceCopy",
  "copy.newChat",
  "getIntlLocale",
  "formatEnumLabelForLocale",
], "dashboard");
ok(!dashboard.includes("Nouvelle conversation IA"), "Dashboard must use the short localized New chat CTA.");
ok(!dashboard.includes('toLocaleString("fr-FR")'), "Dashboard timestamps must follow the active locale.");
ok(!dashboard.includes('toLocaleDateString("fr-FR")'), "Dashboard dates must follow the active locale.");
ok(!dashboard.includes("Contexte contrôlé côté serveur"), "Dashboard must not expose implementation-oriented context language.");

const settingsPage = read("app/settings/page.tsx");
includesAll(settingsPage, ["getExperienceCopy", "getIntlLocale", "formatEnumLabelForLocale"], "settings page");
ok(!settingsPage.includes('toLocaleString("fr-FR")'), "Settings session dates must follow the active locale.");

const settingsPanel = read("components/settings/settings-panel.tsx");
includesAll(settingsPanel, ["getExperienceCopy", "copy.professionalIdentity", "copy.callSettings", "copy.language"], "settings panel");
ok(!settingsPanel.includes('title="Identité professionnelle"'), "Settings UI title must not be hardcoded in French.");
ok(!settingsPanel.includes('label="Langue"'), "Settings language label must come from i18n.");

const mobileShell = read("components/dtsc/mobile-shell.tsx");
includesAll(mobileShell, [
  "data-mobile-system-rail",
  "data-horizontal-rail",
  "variant=\"mobileRail\"",
  'if (groupCode === "PILOTAGE") return 0',
], "mobile shell");
ok(!mobileShell.includes("QuickChip"), "Top mobile header must not duplicate primary module-group navigation.");
ok(!mobileShell.includes("visibleGroups.map"), "Top mobile header must not enumerate primary module groups.");

const swipe = read("components/dtsc/mobile-group-swipe-navigation.tsx");
includesAll(swipe, [
  "SWIPE_THRESHOLD_PX = 72",
  "EDGE_GUARD_PX = 28",
  "INTERACTIVE_SELECTOR",
  "[data-horizontal-rail]",
  "[role='dialog']",
  "hasHorizontalScrollContainer",
  "getModuleNavigationGroupHref",
  "data-mobile-group-swipe=\"enabled\"",
], "mobile group swipe");
ok(!swipe.includes("preventDefault()"), "Group swipe must not block browser/system gestures with preventDefault.");

const contextSwitcher = read("components/layout/organization-context-switcher.tsx");
includesAll(contextSwitcher, ["useAppLocale", "getExperienceCopy", "copy.switchWorkspace", "copy.personalWorkspace"], "context switcher");

const appShell = read("components/layout/app-shell.tsx");
includesAll(appShell, ["MobileGroupSwipeNavigation", "getExperienceCopy", "formatEnumLabelForLocale"], "app shell");
ok(!appShell.includes("unreadCollaboratorMessages={unreadCollaboratorMessages}\n          pendingEnterpriseInvitations"), "MobilePwaHeader must not receive primary-group counters after top-nav deduplication.");

const contributing = read("docs/CONTRIBUTING.md");
includesAll(contributing, [
  "Pas de nouvelle dette silencieuse",
  "Dette créée",
  "Dette maintenue",
  "Dette remboursée",
  "Dette reportée",
  "LOCAL_EXECUTED",
  "CI_PROVEN",
  "OWNER_E2E",
  "NOT_EXECUTED",
  "aucune nouvelle chaîne utilisateur orpheline",
  "un grep ne voit pas un bouton cassé",
  "Performance et coût transverse",
], "CONTRIBUTING");

const prTemplate = read(".github/PULL_REQUEST_TEMPLATE.md");
includesAll(prTemplate, [
  "## Dette de contribution",
  "## Matrice de preuves",
  "## Validation UI / i18n / accessibilité",
  "aucune dette silencieuse",
  "aucun test, build, E2E ou déploiement réussi sans preuve réelle",
], "PR template");

const governanceValidator = read("scripts/github/validate-pr-governance.mjs");
includesAll(governanceValidator, [
  "## Dette de contribution",
  "## Matrice de preuves",
  "Contribution debt ledger",
  "no-silent-debt contribution rule",
  "truthful execution evidence",
], "PR governance validator");

if (failures.length) {
  console.error(`Experience debt closure QA failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Experience debt closure QA passed: i18n, resilient buttons, mobile navigation, guarded swipe and anti-debt contribution governance are protected.");
