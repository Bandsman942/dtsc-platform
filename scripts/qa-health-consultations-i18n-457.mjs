import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path)=>fs.readFileSync(path,"utf8");
const fr=JSON.parse(read("locales/health-consultations.fr.json"));
const en=JSON.parse(read("locales/health-consultations.en.json"));
const helper=read("components/enterprise/health-clinical-i18n.ts");
const workspace=read("components/enterprise/health-consultations-workspace.tsx");
const frKeys=Object.keys(fr).sort(), enKeys=Object.keys(en).sort();
assert.deepEqual(frKeys,enKeys,"Health Consultations #457: les catalogues FR/EN doivent avoir exactement les mêmes clés.");
assert.ok(frKeys.length>=150,`Health Consultations #457: catalogue trop petit (${frKeys.length} clés).`);
for(const key of frKeys){assert.ok(String(fr[key]).trim(),`Health Consultations #457: valeur FR vide pour ${key}.`);assert.ok(String(en[key]).trim(),`Health Consultations #457: valeur EN vide pour ${key}.`)}
assert.match(helper,/health-consultations\.fr\.json/,"Health Consultations #457: catalogue FR non raccordé au helper canonique.");
assert.match(helper,/health-consultations\.en\.json/,"Health Consultations #457: catalogue EN non raccordé au helper canonique.");
assert.match(helper,/\.\.\.consultationsFr/,"Health Consultations #457: fusion FR manquante.");
assert.match(helper,/\.\.\.consultationsEn/,"Health Consultations #457: fusion EN manquante.");
for(const marker of ["useHealthClinicalLocale","healthClinicalT","healthClinicalStatusLabel","healthClinicalPriorityLabel","healthClinicalDateTime","consultation.type.","consultation.certainty."]){assert.match(workspace,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),`Health Consultations #457: contrat i18n manquant ${marker}.`)}
for(const forbidden of ["Nouvelle consultation","Aucune consultation enregistrée","Mettre en attente d’examens","Informations médicales protégées","Consultation générale","À réévaluer","toLocaleString(\"fr-FR\"","toLocaleDateString(\"fr-FR\""]){assert.doesNotMatch(workspace,new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),`Health Consultations #457: copie système locale résiduelle ${forbidden}.`)}
assert.match(workspace,/toLocaleLowerCase\(intlLocale\)/,"Health Consultations #457: recherche locale-aware requise.");
for(const raw of ["item.chiefComplaint","item.reason","clinical(\"historyOfPresentIllness\")","clinical(\"symptoms\")","clinical(\"provisionalDiagnosis\")","clinical(\"finalDiagnosis\")","clinical(\"prescriptionText\")","request.resultText","event.summary","event.eventType","selectedAppointment.reason","selectedPatient.knownAllergies","selectedPatient.chronicTreatments"]){assert.match(workspace,new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),`Health Consultations #457: donnée clinique brute attendue absente ${raw}.`)}
// A free clinical value may appear on the same compact source line as a translated label.
// The safety contract is stricter and more precise: the clinical value itself must never be
// the translation key nor be passed as the direct value argument to the canonical translator.
for(const raw of ["item.chiefComplaint","item.reason","request.resultText","event.summary"]){
  const escaped=raw.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  assert.doesNotMatch(workspace,new RegExp(`healthClinicalT\\(\\s*${escaped}(?:\\s*[,\\)])`),"Health Consultations #457: une donnée clinique libre ne doit jamais être une clé du traducteur canonique.");
  assert.doesNotMatch(workspace,new RegExp(`\\bt\\(\\s*${escaped}(?:\\s*[,\\)])`),"Health Consultations #457: une donnée clinique libre ne doit jamais être une clé du traducteur local.");
}
for(const raw of ["chiefComplaint","reason","symptoms","provisionalDiagnosis","finalDiagnosis","prescriptionText","resultText"]){
  assert.doesNotMatch(workspace,new RegExp(`healthClinicalT\\([^)]*\\{[^}]*\\b${raw}\\s*:`),`Health Consultations #457: ${raw} ne doit pas être injecté comme variable de traduction.`);
}
assert.match(workspace,/department\?\.labelFr/,"Health Consultations #457: le libellé de référentiel service doit rester fourni par le serveur.");
assert.match(workspace,/h-\[94dvh\]/,"Health Consultations #457: contrat mobile plein écran manquant.");
assert.match(workspace,/min-w-0/,"Health Consultations #457: garde responsive min-width manquante.");
assert.match(workspace,/overflow-x-hidden/,"Health Consultations #457: garde overflow mobile manquante.");
console.log(`PASS Health Consultations #457 — ${frKeys.length} clés FR/EN, copie système centralisée, locale globale et données cliniques brutes préservées.`);
