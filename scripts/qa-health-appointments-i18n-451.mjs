import assert from "node:assert/strict";
import fs from "node:fs";

const fr = JSON.parse(fs.readFileSync("locales/health-appointments.fr.json", "utf8"));
const en = JSON.parse(fs.readFileSync("locales/health-appointments.en.json", "utf8"));
const workspace = fs.readFileSync("components/enterprise/health-appointments-workspace.tsx", "utf8");
const helper = fs.readFileSync("components/enterprise/health-clinical-i18n.ts", "utf8");

const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();
assert.deepEqual(enKeys, frKeys, "Health Appointments #451: les catalogues Rendez-vous FR/EN doivent exposer les mêmes clés.");
assert.ok(frKeys.length >= 100, "Health Appointments #451: le catalogue doit couvrir le workspace au-delà des seuls titres.");
for (const key of frKeys) {
  assert.equal(typeof fr[key], "string", `Health Appointments #451: valeur FR non textuelle pour ${key}.`);
  assert.equal(typeof en[key], "string", `Health Appointments #451: valeur EN non textuelle pour ${key}.`);
  assert.ok(fr[key].trim(), `Health Appointments #451: valeur FR vide pour ${key}.`);
  assert.ok(en[key].trim(), `Health Appointments #451: valeur EN vide pour ${key}.`);
}

for (const key of [
  "appointment.title",
  "appointment.new",
  "appointment.searchPlaceholder",
  "appointment.section.patient",
  "appointment.field.startAt",
  "appointment.action.convert",
  "appointment.info.history",
  "appointment.type.GENERAL_CONSULTATION",
  "appointment.ageUnknown",
]) assert.ok(frKeys.includes(key), `Health Appointments #451: clé obligatoire manquante ${key}.`);

assert.match(helper, /health-appointments\.fr\.json/, "Health Appointments #451: le helper canonique doit charger le catalogue FR.");
assert.match(helper, /health-appointments\.en\.json/, "Health Appointments #451: le helper canonique doit charger le catalogue EN.");
assert.match(helper, /\.\.\.appointmentsFr/, "Health Appointments #451: le dictionnaire FR doit inclure Rendez-vous.");
assert.match(helper, /\.\.\.appointmentsEn/, "Health Appointments #451: le dictionnaire EN doit inclure Rendez-vous.");

assert.match(workspace, /useHealthClinicalLocale/, "Health Appointments #451: la locale doit provenir du helper Health canonique.");
assert.match(workspace, /healthClinicalT/, "Health Appointments #451: les copies système doivent utiliser le catalogue canonique.");
assert.match(workspace, /healthClinicalStatusLabel/, "Health Appointments #451: les statuts doivent être localisés depuis leurs codes.");
assert.match(workspace, /healthClinicalPriorityLabel/, "Health Appointments #451: les priorités doivent être localisées depuis leurs codes.");
assert.match(workspace, /healthClinicalDateTime/, "Health Appointments #451: les date-heures visibles doivent être locale-aware.");
assert.match(workspace, /locale === "en" \? "en-US" : "fr-FR"/, "Health Appointments #451: le planning doit utiliser la locale globale pour son Intl.");
assert.doesNotMatch(workspace, /toLocaleLowerCase\("fr"\)|toLocaleString\("fr-FR"|toLocaleDateString\("fr-FR"|toLocaleTimeString\("fr-FR"/, "Health Appointments #451: aucun format/recherche FR locale codée en dur ne doit subsister.");
assert.doesNotMatch(workspace, /Nouveau rendez-vous|Vue planning|Tous les professionnels|Aucun rendez-vous enregistré|Confirmer la modification|Convertir en consultation|Marquer absent/, "Health Appointments #451: les principales copies système FR ne doivent plus être codées en dur.");

const catalogValues = [...new Set([...Object.values(fr), ...Object.values(en)])]
  .filter((value) => typeof value === "string" && value.length >= 4 && !value.includes("{{"));
const literalLeaks = [];
for (const value of catalogValues) {
  const quoted = JSON.stringify(value);
  const jsxLiteral = `>${value}<`;
  if (workspace.includes(quoted) || workspace.includes(jsxLiteral)) literalLeaks.push(value);
}
assert.deepEqual(literalLeaks, [], `Health Appointments #451: valeurs du catalogue recopiées localement: ${literalLeaks.slice(0, 10).join(" | ")}`);

for (const field of ["reason", "description", "administrativeNotes", "internalNotes", "cancellationReason"]) {
  assert.match(workspace, new RegExp(`(?:item|form)\\.${field}`), `Health Appointments #451: la donnée ${field} doit rester utilisée telle quelle.`);
  assert.doesNotMatch(workspace, new RegExp(`\\bt\\(\\s*(?:item|form)\\.${field}\\b`), `Health Appointments #451: ${field} ne doit jamais devenir une clé de traduction.`);
  assert.doesNotMatch(workspace, new RegExp(`healthClinicalT\\(\\s*[^,]+,\\s*(?:item|form)\\.${field}\\b`), `Health Appointments #451: ${field} ne doit jamais passer dans le traducteur canonique.`);
}
assert.match(workspace, /event\.summary/, "Health Appointments #451: le résumé historique doit rester rendu tel que fourni.");
assert.doesNotMatch(workspace, /\bt\(\s*event\.summary|healthClinicalT\(\s*[^,]+,\s*event\.summary/, "Health Appointments #451: l'historique métier ne doit pas être retraduit.");
assert.match(workspace, /department\?\.labelFr/, "Health Appointments #451: le libellé de référentiel département reste une donnée source, sans traduction inventée.");

for (const endpoint of [
  "/healthcare/appointments`",
  "/healthcare/appointments/${item.id}`",
  "/healthcare/appointments/${pendingAction.appointment.id}/actions`",
]) assert.ok(workspace.includes(endpoint), `Health Appointments #451: endpoint attendu absent ${endpoint}.`);

console.log(`PASS Health Appointments #451 — ${frKeys.length} clés FR/EN, copie système centralisée, locale globale et données métier intactes.`);
