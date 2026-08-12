import fs from "node:fs";
import { runAudit, iteration07Profiles } from "./standard-iteration-07-audit-utils.mjs";

for (const profile of iteration07Profiles) runAudit(profile, `Itération 07: ${profile}`);

function requireToken(file, token, label) {
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes(token)) {
    console.error(`✗ Console abonnements: ${label} (${file}: ${token})`);
    process.exitCode = 1;
  }
}

// Contrat anti-ambiguïté Billing : la Console doit présenter l'offre commerciale,
// l'abonnement et le niveau de capacité comme trois notions distinctes.
requireToken("lib/console/console-billing.ts", "name: plan.name", "le nom commercial configuré doit rester l'identité de l'offre");
requireToken("lib/console/console-billing.ts", "capabilityLabel: getSaasPlanLabel", "le niveau de capacité doit être exposé séparément");
requireToken("lib/console/console-billing.ts", "planName: subscription.plan.name", "l'abonnement doit afficher l'offre réellement liée");
requireToken("components/admin/billing-plan-manager.tsx", "Offres et niveaux de capacité", "le catalogue doit distinguer offre et capacité");
requireToken("components/admin/billing-plan-manager.tsx", "Audience de l’offre", "l'audience doit être qualifiée comme propriété de l'offre");
requireToken("components/admin/admin-billing-subscriptions.tsx", "Offre commerciale", "la sélection d'abonnement doit nommer l'offre commerciale");
requireToken("components/admin/admin-billing-subscriptions.tsx", "Niveau de capacité", "les abonnements doivent afficher le niveau séparément");
requireToken("app/api/admin/billing-plans/[id]/route.ts", "PLAN_AUDIENCE_IMMUTABLE", "les audiences des offres canoniques doivent être protégées côté serveur");

// Contrat d'expérience module : Administration DTSC doit utiliser le même header moderne
// que les autres workspaces et garder des libellés compréhensibles par l'utilisateur.
requireToken("components/admin/admin-floating-nav.tsx", "ModuleHeader", "Administration DTSC doit utiliser le header de module canonique");
requireToken("components/admin/admin-floating-nav.tsx", "data-admin-modern-module-header", "le nouveau header Administration DTSC doit remplacer visuellement l'ancien");
requireToken("components/admin/admin-floating-nav.tsx", "Administration DTSC", "le titre métier Administration DTSC doit rester visible");
requireToken("components/admin/admin-floating-nav.tsx", "Espaces de travail disponibles", "la navigation Administration DTSC doit utiliser un libellé orienté utilisateur");
requireToken("components/admin/admin-floating-nav.tsx", "ContextualUserGuide", "le guide utilisateur doit rester accessible depuis le nouveau header");
requireToken("lib/console/console-routes.ts", "Réglages de la plateforme", "les groupes Administration DTSC doivent utiliser un libellé métier plutôt qu'un intitulé technique");
requireToken("lib/console/console-routes.ts", "Gérer les comptes, les droits d’accès", "la gestion des accès doit être décrite avec des termes utilisateur");
const consoleRoutes = fs.readFileSync("lib/console/console-routes.ts", "utf8");
if (consoleRoutes.includes("feature flags") || consoleRoutes.includes("pilotage technique")) {
  console.error("✗ Administration DTSC: les descriptions de navigation ne doivent pas exposer de jargon d’implémentation");
  process.exitCode = 1;
}

// Contrat mobile : le sélecteur d'espace reste large et non rétrécissable. Depuis
// l'itération transverse #251, la barre supérieure ne duplique plus les grands groupes :
// elle contient le chrome système, puis sélecteur d'espace → Déconnexion. La navigation
// primaire des groupes appartient uniquement à la barre inférieure.
requireToken("components/layout/organization-context-switcher.tsx", "w-[82vw]", "le sélecteur mobile doit occuper une largeur confortable");
requireToken("components/layout/organization-context-switcher.tsx", "min-w-[18rem]", "le sélecteur mobile doit conserver une largeur minimale lisible");
requireToken("components/layout/organization-context-switcher.tsx", "shrink-0", "le sélecteur mobile ne doit pas être comprimé par le rail");
const mobileShell = fs.readFileSync("components/dtsc/mobile-shell.tsx", "utf8");
const systemRailPosition = mobileShell.indexOf("data-mobile-system-rail");
const switcherPosition = mobileShell.indexOf("<OrganizationContextSwitcher");
const signOutPosition = mobileShell.indexOf('onClick={() => void signOut()}');
const bottomNavPosition = mobileShell.indexOf("data-mobile-bottom-nav");
const primaryGroupMapPosition = mobileShell.indexOf("{groups.map((group) => {");
if (!(systemRailPosition >= 0 && switcherPosition > systemRailPosition && signOutPosition > switcherPosition)) {
  console.error("✗ Navigation mobile: le rail système doit conserver l’ordre sélecteur d’espace → Déconnexion");
  process.exitCode = 1;
}
if (!(bottomNavPosition >= 0 && primaryGroupMapPosition > bottomNavPosition)) {
  console.error("✗ Navigation mobile: les grands groupes doivent être rendus par la barre inférieure primaire");
  process.exitCode = 1;
}
if (mobileShell.includes("visibleGroups.map") || mobileShell.includes("QuickChip")) {
  console.error("✗ Navigation mobile: la barre supérieure ne doit pas dupliquer les grands groupes de navigation");
  process.exitCode = 1;
}
if (!mobileShell.includes('if (groupCode === "PILOTAGE") return 0')) {
  console.error("✗ Navigation mobile: le compteur global de notifications ne doit pas être dupliqué sur Pilotage");
  process.exitCode = 1;
}

if (!process.exitCode) console.log("✓ DTSC Console iteration 07 quality gate");
