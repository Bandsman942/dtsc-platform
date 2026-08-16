import fs from "node:fs";
import process from "node:process";

const read = (path) => fs.readFileSync(path, "utf8");
const parse = (path) => JSON.parse(read(path));
const fail = (message) => { console.error(`FAIL ${message}`); process.exitCode = 1; };
const assert = (condition, message) => { if (!condition) fail(message); };

const fr = parse("locales/professional-erp-people.fr.json");
const en = parse("locales/professional-erp-people.en.json");
const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();
assert(frKeys.length >= 350, `catalogue People trop petit: ${frKeys.length} clés`);
assert(JSON.stringify(frKeys) === JSON.stringify(enKeys), "parité stricte des clés People FR/EN absente");
for (const key of frKeys) {
  assert(typeof fr[key] === "string" && fr[key].trim(), `valeur FR vide: ${key}`);
  assert(typeof en[key] === "string" && en[key].trim(), `valeur EN vide: ${key}`);
}

const i18n = read("lib/i18n.ts");
assert(i18n.includes("professional-erp-people.fr.json"), "catalogue People FR non enregistré dans lib/i18n.ts");
assert(i18n.includes("professional-erp-people.en.json"), "catalogue People EN non enregistré dans lib/i18n.ts");
assert(i18n.includes("...professionalErpPeopleFr"), "catalogue People FR absent de translateProfessionalErp");
assert(i18n.includes("...professionalErpPeopleEn"), "catalogue People EN absent de translateProfessionalErp");

const helper = read("components/enterprise/professional/professional-erp-i18n.ts");
for (const group of ["employmentContractStatus", "employmentContractType", "payFrequency", "employmentStatus", "employmentType", "timeStatus", "leaveType", "payrollStatus"]) {
  assert(helper.includes(`| \"${group}\"`), `groupe enum People absent du helper: ${group}`);
}
assert(helper.includes("professionalErpDateTime"), "format date+heure locale-aware absent");
assert(helper.includes("useAppLocale"), "ERP professionnel: locale applicative canonique non consommée");
assert(!helper.includes("document.documentElement.lang"), "ERP professionnel: langue HTML encore utilisée comme source de vérité");
assert(!helper.includes("MutationObserver"), "ERP professionnel: observation DOM de langue encore active");
assert(helper.includes("SELF_APPROVAL_FORBIDDEN") && helper.includes("APPROVER_PERMISSION_DENIED"), "ERP professionnel: messages d’éligibilité approbateur FR/EN absents");

const sharedUi = read("components/enterprise/professional/professional-erp-ui.tsx");
assert(sharedUi.includes("useAppLocale"), "ERP professionnel partagé: locale applicative non consommée");
assert(sharedUi.includes('userGuide: "User guide"'), "ERP professionnel partagé: guide EN absent");
assert(sharedUi.includes('contactSupport: "Contact support"'), "ERP professionnel partagé: support EN absent");
assert(sharedUi.includes('permissions: "Permissions and configuration"'), "ERP professionnel partagé: permissions EN absentes");
assert(sharedUi.includes('search: "Search…"'), "ERP professionnel partagé: recherche EN absente");

const targets = [
  "components/enterprise/professional/enterprise-human-resources-workspace.tsx",
  "components/enterprise/professional/enterprise-employees-identity-workspace.tsx",
  "components/enterprise/professional/enterprise-time-attendance-workspace.tsx",
  "components/enterprise/professional/enterprise-payroll-operations-workspace.tsx",
  "components/enterprise/professional/professional-workflow-comments.tsx",
  "components/enterprise/identity-links/identity-link-choice.tsx",
];
for (const path of targets) {
  const source = read(path);
  assert(source.includes("professionalErpT") || source.includes("translateProfessionalErp"), `${path}: source canonique People absente`);
  assert(!source.includes('toLocaleDateString("fr-FR")'), `${path}: date fr-FR hardcodée`);
  assert(!source.includes('toLocaleString("fr-FR")'), `${path}: date+heure fr-FR hardcodée`);
}

const hr = read(targets[0]);
assert(hr.includes('professionalErpEnumLabel(locale, "employmentContractStatus"'), "RH: statuts contrat non projetés");
assert(hr.includes('professionalErpEnumLabel(locale, "employmentContractType"'), "RH: types contrat non projetés");
assert(hr.includes('professionalErpEnumLabel(locale, "payFrequency"'), "RH: fréquence non projetée");
assert(hr.includes('labelEn: string | null'), "RH: départements EN absents du contrat UI");
assert(!hr.includes("positionTitle || member.role"), "RH: rôle brut encore utilisé en fallback membre");
assert(hr.includes('professionalErpEnumLabel(locale, "role", member.role)'), "RH: fallback rôle membre non humanisé");
assert(hr.includes('"Contrat rejeté"') && hr.includes('"Contrat contrôlé"'), "RH: commentaires d’audit persistés modifiés");
assert(hr.includes("useToastMessage(message)"), "RH: retours transitoires non remontés par toast");
assert(!hr.includes('{message ? <div role="status"'), "RH: message transitoire encore persisté dans le corps du module");
assert(hr.includes("approval-eligibility"), "RH: vérification immédiate de l’approbateur absente");
assert(hr.includes('method: "PATCH"') || hr.includes('"PATCH"'), "RH: modification du contrat par le créateur absente");
assert(hr.includes("contract.canEdit"), "RH: action Modifier non conditionnée à la capacité créateur");

const identity = read(targets[1]);
assert(identity.includes('professionalErpEnumLabel(locale, "employmentStatus"'), "Identité: statut emploi non projeté");
assert(identity.includes('professionalErpEnumLabel(locale, "identityStatus"'), "Identité: statut de liaison non projeté");
assert(identity.includes("labelEn?: string | null"), "Identité: labels EN des référentiels absents");
assert(!identity.includes("positionTitle || member.role"), "Identité: rôle brut encore utilisé en fallback membre");
assert(identity.includes('professionalErpEnumLabel(locale, "role", member.role)'), "Identité: fallback rôle membre non humanisé");
assert(identity.includes("purpose: `Permettre à cette personne"), "Identité: purpose persisté d’invitation modifié silencieusement");

const time = read(targets[2]);
assert(time.includes('professionalErpEnumLabel(locale, "timeStatus"'), "Temps: statuts non projetés");
assert(time.includes('professionalErpEnumLabel(locale, "leaveType"'), "Temps: types de congé non projetés");
assert(!time.includes("positionTitle || member.role"), "Temps: rôle brut encore utilisé en fallback approbateur");
assert(time.includes('professionalErpEnumLabel(locale, "role", member.role)'), "Temps: fallback rôle approbateur non humanisé");
assert(time.includes('"Retour motivé depuis le workspace professionnel"'), "Temps: commentaire d’audit existant modifié");

const payroll = read(targets[3]);
assert(payroll.includes('professionalErpEnumLabel(locale, "payrollStatus"'), "Paie: statuts non projetés");
assert(payroll.includes('name="approverUserId"'), "Paie: sélecteur d’approbateur absent");
assert(!payroll.includes("Identifiant de l’approbateur sélectionné"), "Paie: saisie d’identifiant brut encore visible");
assert(payroll.includes('"Paie rejetée"') && payroll.includes('"Paie contrôlée"'), "Paie: commentaires d’audit persistés modifiés");
assert(payroll.includes('value="Variable de paie"'), "Paie: raison persistée existante modifiée silencieusement");

const comments = read(targets[4]);
assert(comments.includes("professionalErpDateTime"), "Workflow comments: date+heure locale-aware absente");
assert(comments.includes("comment.content"), "Workflow comments: contenu utilisateur perdu");
assert(comments.includes("canEdit") && comments.includes("canDelete"), "Workflow comments: permissions perdues");

const choice = read(targets[5]);
assert(choice.includes('t("identityChoice.legend")'), "Identity link choice: copie canonique absente");
assert(choice.includes("aria-pressed"), "Identity link choice: contrat accessible perdu");

if (!process.exitCode) console.log(`PASS Professional ERP People i18n #332/#364 — ${frKeys.length} clés FR/EN + locale applicative, chrome partagé, confidentialité et workflows préservés.`);
