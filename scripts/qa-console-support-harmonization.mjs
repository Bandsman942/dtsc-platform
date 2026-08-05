import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const navigation = read("components/workspace/product-section-navigation.tsx");
const adminNavigation = read("components/admin/admin-floating-nav.tsx");
const consoleRoutes = read("lib/console/console-routes.ts");
const supportPage = read("app/support/page.tsx");
const ticketBoard = read("components/support/ticket-board.tsx");
const input = read("components/ui/input.tsx");
const fallbackGuide = read("components/user-guides/standard-module-fallback-guide.tsx");
const pwaPrompt = read("components/pwa/pwa-install-prompt.tsx");
const registrySource = read("lib/modules/standard-module-registry.ts");
const registryData = JSON.parse(read("lib/modules/standard-module-registry-data.json"));

assert(navigation.includes("ProductSectionNavigation"), "La primitive ProductSectionNavigation doit exister.");
assert(navigation.includes("safe-area-inset-bottom"), "La navigation produit doit respecter la safe-area mobile.");
assert(navigation.includes('role="dialog"') && navigation.includes("overflow-y-auto"), "Le sélecteur mobile doit être un dialogue défilable.");
assert(adminNavigation.includes("ProductSectionNavigation"), "Administration DTSC doit utiliser la primitive de navigation produit commune.");
assert(adminNavigation.includes("CONSOLE_SECTION_GROUP"), "Administration DTSC doit utiliser le regroupement canonique des sections.");

for (const group of ["governance", "customers", "identity", "engagement", "platform", "internal"]) {
  assert(consoleRoutes.includes(`id: \"${group}\"`), `Groupe Console manquant: ${group}.`);
}
for (const mapping of ["CONSOLE_SECTION_GROUP", "CONSOLE_SECTION_ADMIN_BLOCK", "CONSOLE_SECTION_MODULE_CODE"]) {
  assert(consoleRoutes.includes(`export const ${mapping}`), `Mapping Console manquant: ${mapping}.`);
}

assert(supportPage.includes("ProductSectionNavigation"), "Support doit partager la navigation produit commune.");
assert(supportPage.includes("ContextualUserGuide") && supportPage.includes('getIteration07UserGuide("CONSOLE_SUPPORT"'), "Support doit exposer son guide utilisateur exact.");
assert(supportPage.includes('id="new-ticket"') && supportPage.includes('id="tickets"') && supportPage.includes('id="support-guide"'), "Les sous-sections Support doivent être structurées et adressables.");

assert(ticketBoard.includes("CollapsibleThread"), "Les commentaires de ticket doivent être masquables/démasquables.");
assert(ticketBoard.includes('label="commentaire(s)"'), "Le ticket doit utiliser le vocabulaire Commentaires.");
assert(!ticketBoard.includes(">Discussion<"), "Le libellé Discussion ne doit plus être affiché dans les tickets.");
assert(ticketBoard.includes("<textarea") && ticketBoard.includes("Entrée ajoute une ligne"), "Le compositeur de commentaires doit accepter les retours à la ligne.");
assert(ticketBoard.includes("ProfessionalMentionActions"), "Les mentions de ticket doivent ouvrir des actions professionnelles contextualisées.");
assert(ticketBoard.includes("Répondre") && ticketBoard.includes("Modifier") && ticketBoard.includes("Supprimer"), "Le CRUD et les réponses des commentaires doivent être préservés.");

assert(input.includes("data-comment-composer") && input.includes("<textarea"), "La primitive Input doit fournir une compatibilité multiligne aux compositeurs de commentaires existants.");
assert(fallbackGuide.includes("StandardModuleFallbackGuide") && fallbackGuide.includes("ContextualUserGuide"), "La couverture native de repli des guides doit exister.");
assert(pwaPrompt.includes("StandardModuleFallbackGuide") && pwaPrompt.includes("Suspense"), "La couverture de guides doit être montée dans le shell privé sans bloquer le rendu.");
assert(registrySource.includes("STANDARD_MODULE_FALLBACK_GUIDE_PATH"), "Le registre canonique doit déclarer le chemin de guide de repli.");
assert(registrySource.includes("module visible sans guide utilisateur natif ni couverture de repli"), "L’intégrité du registre doit refuser un module visible sans guide.");

const routedWithoutDeclaredGuide = registryData.modules.filter((module) => ["ACTIVE", "BETA"].includes(module.implementationStatus) && module.routePath && !module.userGuidePath);
assert(routedWithoutDeclaredGuide.length > 0, "Le test doit confirmer l’existence historique des lacunes de guides traitées par la couverture de repli.");
for (const module of routedWithoutDeclaredGuide) {
  assert(registrySource.includes("STANDARD_MODULE_FALLBACK_GUIDE_PATH"), `${module.code}: aucune couverture de guide de repli détectée.`);
}

assert(fs.existsSync(path.join(root, "docs/E2E_CONSOLE_SUPPORT_HARMONIZATION_2026-08-05.md")), "La preuve E2E et maturité doit être versionnée.");

if (failures.length) {
  console.error("Échec QA harmonisation Console/Support:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`QA harmonisation Console/Support réussie. ${routedWithoutDeclaredGuide.length} modules/sous-modules routés bénéficient désormais de la couverture native de guide.`);
