import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path)=>fs.readFileSync(path,"utf8");
const fr=JSON.parse(read("locales/health-staff.fr.json"));
const en=JSON.parse(read("locales/health-staff.en.json"));
const helper=read("components/enterprise/health-clinical-i18n.ts");
const workspace=read("components/enterprise/health-staff-workspace.tsx");
const frKeys=Object.keys(fr).sort(),enKeys=Object.keys(en).sort();
assert.deepEqual(frKeys,enKeys,"Health Staff #494: FR/EN keys must match exactly.");
assert.ok(frKeys.length>=140,`Health Staff #494: catalog too small (${frKeys.length} keys).`);
for(const key of frKeys){assert.ok(String(fr[key]).trim(),`Health Staff #494: empty FR value for ${key}.`);assert.ok(String(en[key]).trim(),`Health Staff #494: empty EN value for ${key}.`)}
assert.match(helper,/health-staff\.fr\.json/);
assert.match(helper,/health-staff\.en\.json/);
assert.match(helper,/\.\.\.staffFr/);
assert.match(helper,/\.\.\.staffEn/);
for(const marker of ["useHealthClinicalLocale","healthClinicalT","healthClinicalDateTime","staff.status.","staff.availability.","staff.day.","permissionLabel","catalogLabel"]){assert.match(workspace,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),`Health Staff #494: missing i18n contract ${marker}.`)}
for(const forbidden of ["Professionnels actifs","Permissions Santé","Activité médicale liée","Aucun professionnel santé enregistré","Nouvelle spécialité","Affecter un membre",'toLocaleLowerCase("fr"','Intl.DateTimeFormat("fr-FR"']){assert.doesNotMatch(workspace,new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),`Health Staff #494: residual local system copy ${forbidden}.`)}
assert.match(workspace,/toLocaleLowerCase\(intlLocale\)/,"Health Staff #494: locale-aware search is required.");
for(const raw of ["item.organizationMember.user.name","item.organizationMember.user.email","item.organizationMember.user.phone","item.professionalNumber","item.supervisorStaff?.user.name","event.eventType","event.actor.name","event.summary"]){assert.match(workspace,new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),`Health Staff #494: expected raw member/professional value missing ${raw}.`)}
for(const raw of ["item.organizationMember.user.name","item.organizationMember.user.email","item.organizationMember.user.phone","item.professionalNumber","item.supervisorStaff?.user.name","event.eventType","event.actor.name","event.summary"]){const escaped=raw.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");assert.doesNotMatch(workspace,new RegExp(`healthClinicalT\\(\\s*${escaped}(?:\\s*[,\\)])`),`Health Staff #494: ${raw} must not become a translation key.`);assert.doesNotMatch(workspace,new RegExp(`\\bt\\(\\s*${escaped}(?:\\s*[,\\)])`),`Health Staff #494: ${raw} must not become a local translation key.`)}
for(const raw of ["professionalNumber","professionalOrder","experienceLevel","competenceArea","notes","event.summary"]){assert.doesNotMatch(workspace,new RegExp(`healthClinicalT\\([^)]*\\{[^}]*\\b${raw}\\s*:`),`Health Staff #494: ${raw} must not be injected as translation data.`)}
assert.match(workspace,/labelEn\|\|item\.labelFr/,"Health Staff #494: EN reference labels need safe FR fallback.");
assert.match(workspace,/labelFr\|\|item\.labelEn/,"Health Staff #494: FR reference labels need safe EN fallback.");
assert.match(workspace,/h-\[94dvh\]/);
assert.match(workspace,/min-w-0/);
assert.match(workspace,/overflow-x-hidden/);
console.log(`PASS Health Staff #494 — ${frKeys.length} FR/EN keys, centralized system copy, locale-aware search/date, raw staff data preserved.`);
