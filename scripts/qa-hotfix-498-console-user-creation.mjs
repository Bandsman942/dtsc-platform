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

function zIndex(source) {
  const match = source.match(/z-\[(\d+)\]/);
  return match ? Number(match[1]) : 0;
}

const form = read("components/admin/create-user-form.tsx");
const copy = read("components/admin/create-user-i18n.ts");
const route = read("app/api/admin/users/route.ts");
const formField = read("components/ui/form-field.tsx");
const passwordInput = read("components/ui/password-input.tsx");
const toastProvider = read("components/ui/toast-provider.tsx");
const dialog = read("components/ui/dialog.tsx");

check(
  "la création exige la capability Console USERS_MANAGE en contexte DTSC",
  route.includes("requireConsoleCapability(CONSOLE_CAPABILITIES.USERS_MANAGE)") && route.includes("isSameOriginRequest(req)"),
  "La route ne doit plus dépendre du seul rôle global ADMIN et doit conserver la protection same-origin.",
);
check(
  "la validation API expose un contrat structuré sans message Zod brut",
  route.includes('reasonCode: "VALIDATION_ERROR"') && route.includes("validationFieldErrors(body.error.issues)") && route.includes('"INVALID_VALUE"'),
  "Le client doit recevoir les champs invalides sans diagnostic technique brut.",
);
check(
  "l'email déjà utilisé possède un code métier dédié",
  route.includes('reasonCode: "EMAIL_ALREADY_EXISTS"') && route.includes('fieldErrors: { email: "ALREADY_EXISTS" }'),
  "Le conflit d'email ne doit plus devenir une erreur générique.",
);
check(
  "la création utilisateur et l'abonnement freemium sont transactionnels",
  route.includes("prisma.$transaction") && route.includes("tx.user.create") && route.includes("tx.subscription.create") && route.includes('reasonCode: "PROVISIONING_UNAVAILABLE"'),
  "Un échec de provisioning ne doit pas laisser un compte partiellement créé.",
);
check(
  "le formulaire lit réellement la réponse JSON de l'API",
  form.includes("await response.json().catch") && form.includes("reasonCode") && form.includes("fieldErrors"),
  "Les erreurs serveur ne doivent plus être remplacées par une chaîne unique.",
);
check(
  "la contrainte mot de passe de 10 caractères est visible avant l'envoi",
  form.includes("minLength={10}") && form.includes("maxLength={128}") && copy.includes("au moins 10 caractères") && copy.includes("at least 10 characters"),
  "Le contrat HTML et l'aide utilisateur doivent refléter adminCreateUserSchema.",
);
check(
  "la validation navigateur produit aussi l'erreur inline et le toast",
  form.includes("function handleInvalid") && form.includes("onInvalid={handleInvalid}") && form.includes('setMessage(t("validationError"))'),
  "Un champ invalide doit expliquer son problème avant tout appel réseau.",
);
check(
  "les erreurs sont raccordées aux champs accessibles",
  formField.includes('"aria-describedby"') && formField.includes('"aria-invalid"') && formField.includes("cloneElement"),
  "Une erreur inline doit être annoncée et reliée au contrôle concerné.",
);
check(
  "le toggle mot de passe accepte des labels FR/EN",
  passwordInput.includes("showPasswordLabel") && passwordInput.includes("hidePasswordLabel") && form.includes('showPasswordLabel={t("showPassword")}'),
  "Le contrôle partagé doit permettre des libellés accessibles localisés.",
);
check(
  "la copie du hotfix est raccordée explicitement en FR et EN",
  copy.includes('fr: {') && copy.includes('en: {') && form.includes("useAppLocale") && form.includes("adminCreateUserT"),
  "Aucune nouvelle chaîne du flux ne doit être orpheline dans une surface bilingue.",
);
check(
  "le toast global reste au-dessus des dialogs",
  zIndex(toastProvider) > zIndex(dialog) && zIndex(dialog) >= 1000,
  `Toast z-index=${zIndex(toastProvider)}, Dialog z-index=${zIndex(dialog)}.`,
);
check(
  "les erreurs sont annoncées comme alertes sans bloquer les interactions",
  toastProvider.includes('role={toast.tone === "error" ? "alert" : "status"}') && toastProvider.includes("pointer-events-none"),
  "Les erreurs doivent être visibles et accessibles tout en gardant le conteneur global non bloquant.",
);
check(
  "l'ancien message générique destructeur d'information a disparu",
  !form.includes("Impossible de créer ce compte."),
  "Le message unique masquait validation, conflit d'email et autorisation.",
);

if (failures.length) {
  console.error(`\n${failures.length} échec(s) dans le hotfix #498:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\nHotfix #498: contrats création de compte, erreurs, RBAC et toast conformes.");
