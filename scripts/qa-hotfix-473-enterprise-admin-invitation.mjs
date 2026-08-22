import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
}

function check(label, condition, hint) {
  if (condition) {
    console.log(`PASS ${label}`);
    return;
  }
  failures.push(`${label}${hint ? `\n  ${hint}` : ""}`);
  console.error(`FAIL ${label}`);
}

const panel = read("components/admin/client-organizations-panel.tsx");
const createRoute = read("app/api/admin/client-organizations/route.ts");
const updateRoute = read("app/api/admin/client-organizations/[id]/route.ts");
const createInvitationValidator = read("lib/console/client-organization-create-invitation.ts");
const validators = read("lib/validators.ts");
const combobox = read("components/ui/reference-combobox.tsx");
const copy = read("lib/console/client-organizations-i18n.ts");

check(
  "les boutons rapides Admin ont disparu",
  !panel.includes("Admin: {user.name}") && !panel.includes("users.slice(0, 8).map((user)"),
  "La désignation d'un administrateur doit passer par le flux guidé unique.",
);
check(
  "la création utilise une combobox pour l'admin initial",
  panel.includes('name="adminUserId"') && panel.includes("createAdminUserId") && panel.includes('t("createAdminLabel")'),
  "Le formulaire de création doit utiliser la même logique de sélection contrôlée.",
);
check(
  "la création révèle la raison après sélection",
  panel.includes("createAdminUserId ?") && panel.includes('name="adminReason"') && panel.includes("createAdminReason.trim().length < 3"),
  "Créer avec un admin initial doit exiger un motif visible avant soumission.",
);
check(
  "le serveur refuse une désignation initiale sans raison",
  createInvitationValidator.includes("value.adminUserId?.trim()") && createInvitationValidator.includes('path: ["adminReason"]') && createRoute.includes("parseInitialAdminInvitation"),
  "Le contrôle de création ne doit pas dépendre du seul bouton disabled côté client.",
);
check(
  "le motif initial alimente le grant et l'audit",
  createRoute.includes("reason: adminReason") && createRoute.includes("adminInvitationReason: data.adminUserId ? adminReason : null"),
  "La raison saisie doit devenir la justification persistée de la désignation initiale.",
);
check(
  "le changement d'admin utilise la combobox de référence",
  panel.includes("<ReferenceCombobox") && panel.includes('name="userId"') && panel.includes("eligibleAdminOptions"),
  "La sélection doit rester contrôlée par la liste d'utilisateurs éligibles.",
);
check(
  "la raison conditionne l'envoi d'une nouvelle invitation",
  panel.includes("selectedAdminUserId ?") && panel.includes("adminReason.trim().length < 3") && panel.includes('reason: normalizedReason'),
  "Aucune invitation administrateur ne doit être envoyée sans motif explicite.",
);
check(
  "le contrat serveur conserve le motif obligatoire à l'édition",
  validators.includes('["set_status", "grant_admin", "revoke_admin", "soft_delete"]') && validators.includes('path: ["reason"]'),
  "Le hotfix ne doit pas affaiblir l'audit des actions sensibles.",
);
check(
  "les API exposent une validation exploitable sans diagnostic brut",
  createRoute.includes('reasonCode: "VALIDATION_ERROR"') && createRoute.includes("field") && updateRoute.includes('reasonCode: "VALIDATION_ERROR"') && updateRoute.includes("client_organization_validation_failed"),
  "Le client doit pouvoir distinguer une saisie invalide d'une panne générique.",
);
check(
  "l'API d'édition refuse un admin déjà actif ou déjà invité",
  updateRoute.includes('reasonCode: "ADMIN_ALREADY_ACTIVE"') && updateRoute.includes('reasonCode: "ADMIN_INVITATION_ALREADY_PENDING"'),
  "Une nouvelle invitation ne doit pas écraser silencieusement un accès actif ou pending.",
);
check(
  "les invitations en attente sont visibles dans la Console",
  panel.includes('member.status === "INVITED"') && panel.includes('t("pendingInvitation")'),
  "Un admin invité ne doit plus être présenté comme un simple état non désigné.",
);
check(
  "la combobox partagée expose les changements de valeur",
  combobox.includes("onValueChange?: (value: string) => void") && combobox.includes("onValueChange?.(nextSelected)"),
  "Le champ de raison dépend de la sélection réelle de la combobox.",
);
check(
  "les nouveaux messages du flux admin sont bilingues",
  copy.includes('fr: {') && copy.includes('en: {') && copy.includes('companyCreatedWithAdmin') && copy.includes('adminInvitationSent') && copy.includes('reasonLabel'),
  "Les nouveaux états création/édition doivent préserver le contrat FR/EN.",
);
check(
  "la modification générale ne déclenche plus grant_admin implicitement",
  panel.includes("delete payload.userId;") && !panel.includes('await updateOrganization(editingOrganization.id, { action: "grant_admin"'),
  "La mise à jour de l'entreprise et l'invitation administrateur doivent rester deux intentions distinctes.",
);

if (failures.length) {
  console.error(`\n${failures.length} échec(s) dans le hotfix #473:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\nHotfix #473: contrats création et modification administrateur conformes.");
