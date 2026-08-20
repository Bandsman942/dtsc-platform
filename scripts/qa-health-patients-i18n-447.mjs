import assert from "node:assert/strict";
import fs from "node:fs";

const fr = JSON.parse(fs.readFileSync("locales/health-patients.fr.json", "utf8"));
const en = JSON.parse(fs.readFileSync("locales/health-patients.en.json", "utf8"));
const workspace = fs.readFileSync("components/enterprise/health-patients-workspace.tsx", "utf8");
const helper = fs.readFileSync("components/enterprise/health-clinical-i18n.ts", "utf8");

const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();
assert.deepEqual(enKeys, frKeys, "Health Patients #447: les catalogues Patients FR/EN doivent exposer les mêmes clés.");
assert.ok(frKeys.length >= 100, "Health Patients #447: le catalogue doit couvrir le workspace Patients au-delà des seuls titres.");
for (const key of frKeys) {
  assert.equal(typeof fr[key], "string", `Health Patients #447: valeur FR non textuelle pour ${key}.`);
  assert.equal(typeof en[key], "string", `Health Patients #447: valeur EN non textuelle pour ${key}.`);
  assert.ok(fr[key].trim(), `Health Patients #447: valeur FR vide pour ${key}.`);
  assert.ok(en[key].trim(), `Health Patients #447: valeur EN vide pour ${key}.`);
}

for (const key of [
  "patient.title",
  "patient.new",
  "patient.searchPlaceholder",
  "patient.section.medical",
  "patient.field.knownAllergies",
  "patient.protected.title",
  "patient.pharmacy.title",
  "patient.related.title",
  "patient.age.years",
]) assert.ok(frKeys.includes(key), `Health Patients #447: clé obligatoire manquante ${key}.`);

assert.match(helper, /health-patients\.fr\.json/, "Health Patients #447: le helper canonique doit charger le catalogue Patients FR.");
assert.match(helper, /health-patients\.en\.json/, "Health Patients #447: le helper canonique doit charger le catalogue Patients EN.");
assert.match(helper, /\.\.\.patientsFr/, "Health Patients #447: le dictionnaire FR doit inclure Patients.");
assert.match(helper, /\.\.\.patientsEn/, "Health Patients #447: le dictionnaire EN doit inclure Patients.");

assert.match(workspace, /useHealthClinicalLocale/, "Health Patients #447: la locale doit provenir du helper Health canonique.");
assert.match(workspace, /healthClinicalT/, "Health Patients #447: les copies système doivent utiliser le catalogue canonique.");
assert.match(workspace, /healthClinicalStatusLabel/, "Health Patients #447: les statuts doivent être localisés depuis leurs codes.");
assert.match(workspace, /healthClinicalDateTime/, "Health Patients #447: les dates visibles doivent être locale-aware.");
assert.doesNotMatch(workspace, /Intl\.DateTimeFormat|toLocaleString\("fr-FR"|toLocaleDateString\("fr-FR"/, "Health Patients #447: aucun format date FR local ne doit subsister dans le workspace.");
assert.doesNotMatch(workspace, /Féminin|Masculin|Tous les sexes|Créés à partir du|Nouveau patient|Détail patient|Enregistrement impossible|Aucun patient enregistré/, "Health Patients #447: les principales copies système FR ne doivent plus être codées en dur.");

for (const field of ["knownAllergies", "importantHistory", "chronicTreatments", "medicalNotes", "administrativeNotes"]) {
  assert.match(workspace, new RegExp(`patient\\.${field}|form\\.${field}`), `Health Patients #447: la donnée ${field} doit rester rendue/saisie telle quelle.`);
  assert.doesNotMatch(workspace, new RegExp(`(?:healthClinicalT|\\bt)\\([^\\n]{0,120}(?:patient|form)\\.${field}`), `Health Patients #447: ${field} ne doit jamais passer dans le traducteur.`);
}

for (const endpoint of [
  "/healthcare/patients`",
  "/healthcare/patients/${patient.id}`",
]) assert.ok(workspace.includes(endpoint), `Health Patients #447: endpoint patient attendu absent ${endpoint}.`);

console.log(`PASS Health Patients #447 — ${frKeys.length} clés FR/EN, locale globale, dates/stats localisés et données cliniques laissées intactes.`);
