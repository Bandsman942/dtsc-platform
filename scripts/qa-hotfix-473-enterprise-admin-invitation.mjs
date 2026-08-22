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
const route = read("app/api/admin/client-organizations/[id]/route.ts");
const validators = read("lib/validators.ts");
const combobox = read("components/ui/reference-combobox.tsx");
const copy = read("lib/console/client-organizations-i18n.ts");

check(
  "les boutons rapides Admin ont disparu",
  !panel.includes("Admin: {user.name}") && !panel.includes("users.slice(0, 8).map((user)"),
  "La désignation d'un administrateur doit passer par le flux guidé unique.",
);
check(
  "le changement d'admin utilise la combobox de référence",
  panel.includes("<ReferenceCombobox") && panel.includes('name="userId"') && panel.includes("eligibleAdminOptions"),
  "La sélection doit rester contrôlée par la liste d'utilisateurs éligibles.",
);
check(
  "la raison apparaît et conditionne l'envoi",
  panel.includes("selectedAdminUserId ?") && panel.includes("adminReason.trim().length < 3") && panel.includes('reason: normalizedReason'),
  "Aucune invitation administrateur ne doit être envoyée sans motif explicite.",
);
check(
  "le contrat serveur conserve le motif obligatoire",
  validators.includes('["set_status", "grant_admin", "revoke_admin", "soft_delete"]') && validators.includes('path: ["reason"]'),
  "Le hotfix ne doit pas affaiblir l'audit des actions sensibles.",
);
check(
  "l'API expose une erreur de validation exploitable sans diagnostic brut",
  route.includes('reasonCode: "VALIDATION_ERROR"') && route.includes("field") && route.includes("client_organization_validation_failed"),
  "Le client doit pouvoir distinguer une saisie invalide d'une panne générique.",
);
check(
  "l'API refuse un admin déjà actif ou déjà invité",
  route.includes('reasonCode: "ADMIN_ALREADY_ACTIVE"') && route.includes('reasonCode: "ADMIN_INVITATION_ALREADY_PENDING"'),
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
  copy.includes('fr: {') && copy.includes('en: {') && copy.includes('adminInvitationSent') && copy.includes('reasonLabel'),
  "Le flux Console modifié doit préserver le contrat FR/EN.",
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

console.log("\nHotfix #473: contrat de désignation administrateur conforme.");
