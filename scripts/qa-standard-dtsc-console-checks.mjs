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

// Contrat mobile : le sélecteur d'espace doit être large, non rétrécissable et rester
// strictement avant Déconnexion dans le rail horizontal.
requireToken("components/layout/organization-context-switcher.tsx", "w-[82vw]", "le sélecteur mobile doit occuper une largeur confortable");
requireToken("components/layout/organization-context-switcher.tsx", "min-w-[18rem]", "le sélecteur mobile doit conserver une largeur minimale lisible");
requireToken("components/layout/organization-context-switcher.tsx", "shrink-0", "le sélecteur mobile ne doit pas être comprimé par le rail");
const mobileShell = fs.readFileSync("components/dtsc/mobile-shell.tsx", "utf8");
const groupsPosition = mobileShell.indexOf("{visibleGroups.map((group) => {");
const switcherPosition = mobileShell.indexOf("{organizationOptions.length > 0 ? <OrganizationContextSwitcher");
const signOutPosition = mobileShell.indexOf('<button type="button" onClick={() => void signOut()}');
if (!(groupsPosition >= 0 && switcherPosition > groupsPosition && signOutPosition > switcherPosition)) {
  console.error("✗ Navigation mobile: l’ordre doit rester espaces de navigation → sélecteur d’espace → Déconnexion");
  process.exitCode = 1;
}

if (!process.exitCode) console.log("✓ DTSC Console iteration 07 quality gate");
