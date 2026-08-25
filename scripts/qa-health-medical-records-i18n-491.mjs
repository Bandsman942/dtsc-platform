import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path)=>fs.readFileSync(path,"utf8");
const fr=JSON.parse(read("locales/health-medical-records.fr.json"));
const en=JSON.parse(read("locales/health-medical-records.en.json"));
const helper=read("components/enterprise/health-clinical-i18n.ts");
const workspace=read("components/enterprise/health-medical-records-workspace.tsx");
const frKeys=Object.keys(fr).sort(),enKeys=Object.keys(en).sort();
assert.deepEqual(frKeys,enKeys,"Health Medical Records #491: FR/EN keys must match exactly.");
assert.ok(frKeys.length>=120,`Health Medical Records #491: catalog too small (${frKeys.length} keys).`);
for(const key of frKeys){assert.ok(String(fr[key]).trim(),`Health Medical Records #491: empty FR value for ${key}.`);assert.ok(String(en[key]).trim(),`Health Medical Records #491: empty EN value for ${key}.`)}
assert.match(helper,/health-medical-records\.fr\.json/);
assert.match(helper,/health-medical-records\.en\.json/);
assert.match(helper,/\.\.\.medicalRecordsFr/);
assert.match(helper,/\.\.\.medicalRecordsEn/);
for(const marker of ["useHealthClinicalLocale","healthClinicalT","healthClinicalStatusLabel","healthClinicalDateTime","medicalRecords.confidentiality.","medicalRecords.category.","medicalRecords.allergyType.","medicalRecords.severity."]){assert.match(workspace,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),`Health Medical Records #491: missing i18n contract ${marker}.`)}
for(const forbidden of ["Dossiers médicaux","Nouveau dossier","Aucun dossier médical principal","Ajouter un élément médical","Antécédents","Résultats laboratoire liés",'toLocaleLowerCase("fr"','Intl.DateTimeFormat("fr-FR"']){assert.doesNotMatch(workspace,new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),`Health Medical Records #491: residual local system copy ${forbidden}.`)}
assert.match(workspace,/toLocaleLowerCase\(intlLocale\)/,"Health Medical Records #491: locale-aware search is required.");
for(const raw of ["record.patient.fullName","record[key]","item.title","item.description","item.chiefComplaint","item.finalDiagnosis","item.resultText","item.product.name","item.eventType","item.summary"]){assert.match(workspace,new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),`Health Medical Records #491: expected raw clinical value missing ${raw}.`)}
for(const raw of ["record.patient.fullName","item.title","item.description","item.chiefComplaint","item.finalDiagnosis","item.resultText","item.product.name","item.eventType","item.summary"]){const escaped=raw.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");assert.doesNotMatch(workspace,new RegExp(`healthClinicalT\\(\\s*${escaped}(?:\\s*[,\\)])`),`Health Medical Records #491: ${raw} must not become a translation key.`);assert.doesNotMatch(workspace,new RegExp(`\\bt\\(\\s*${escaped}(?:\\s*[,\\)])`),`Health Medical Records #491: ${raw} must not become a local translation key.`)}
for(const raw of ["chiefComplaint","finalDiagnosis","resultText","summary","activeProblems","riskFactors","mainAllergiesSummary","chronicTreatmentsSummary","followUpNotes"]){assert.doesNotMatch(workspace,new RegExp(`healthClinicalT\\([^)]*\\{[^}]*\\b${raw}\\s*:`),`Health Medical Records #491: ${raw} must not be injected as translation data.`)}
assert.match(workspace,/h-\[94dvh\]/);
assert.match(workspace,/h-\[90dvh\]/);
assert.match(workspace,/min-w-0/);
assert.match(workspace,/overflow-x-hidden/);
console.log(`PASS Health Medical Records #491 — ${frKeys.length} FR/EN keys, centralized system copy, locale-aware search/date, raw clinical data preserved.`);
