import assert from "node:assert/strict";
import fs from "node:fs";

const fr = JSON.parse(fs.readFileSync("locales/health-clinical.fr.json", "utf8"));
const en = JSON.parse(fs.readFileSync("locales/health-clinical.en.json", "utf8"));
const helper = fs.readFileSync("components/enterprise/health-clinical-i18n.ts", "utf8");

const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();
assert.deepEqual(enKeys, frKeys, "Health i18n #443: les catalogues FR/EN doivent exposer exactement les mêmes clés.");
assert.ok(frKeys.length >= 80, "Health i18n #443: le catalogue canonique doit couvrir le socle clinique, les statuts, priorités et messages.");

for (const key of frKeys) {
  assert.equal(typeof fr[key], "string", `Health i18n #443: valeur FR non textuelle pour ${key}.`);
  assert.equal(typeof en[key], "string", `Health i18n #443: valeur EN non textuelle pour ${key}.`);
  assert.ok(fr[key].trim(), `Health i18n #443: traduction FR vide pour ${key}.`);
  assert.ok(en[key].trim(), `Health i18n #443: traduction EN vide pour ${key}.`);
}

for (const key of [
  "health.patients",
  "health.appointments",
  "health.consultations",
  "health.medicalRecords",
  "health.careTeam",
  "health.laboratory",
  "status.ACTIVE",
  "status.ARCHIVED",
  "status.DECEASED",
  "priority.CRITICAL",
  "message.saveFailed",
]) assert.ok(frKeys.includes(key), `Health i18n #443: clé canonique manquante ${key}.`);

assert.match(helper, /useAppLocale/, "Health i18n #443: la locale doit provenir du provider global.");
assert.match(helper, /locale === "en" \? "en" : "fr"/, "Health i18n #443: le helper doit normaliser explicitement FR/EN.");
assert.match(helper, /dictionaries\.fr\[key\]/, "Health i18n #443: le fallback français doit rester explicite.");
assert.match(helper, /Intl\.DateTimeFormat/, "Health i18n #443: les dates doivent être formatées via Intl.");
assert.match(helper, /"en-US" : "fr-FR"/, "Health i18n #443: le formatage date/heure doit suivre la locale active.");
assert.doesNotMatch(helper, /fetch\(|\/api\//, "Health i18n #443: le helper i18n ne doit lire ni muter aucune donnée clinique.");
assert.doesNotMatch(helper, /knownAllergies|medicalNotes|diagnosis|prescription|resultText|patient\.fullName/, "Health i18n #443: le helper ne doit contenir aucun traitement de donnée clinique utilisateur.");

console.log(`PASS Health i18n #443 — ${frKeys.length} clés FR/EN symétriques, locale globale et formatage Intl sans donnée clinique.`);
