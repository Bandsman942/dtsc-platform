import fs from "node:fs";

function read(path) { return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }
function expect(condition, label) {
  if (!condition) { console.error(`FAIL EDU-0: ${label}`); process.exitCode = 1; }
  else console.log(`PASS EDU-0: ${label}`);
}
function hasAll(source, markers) { return markers.every((marker) => source.includes(marker)); }

const contract = read("docs/sectors/education.md");
const sectorDoc = read("docs/enterprise-sector-modules.md");
const schema = read("prisma/schema.prisma");
const regression = read("scripts/qa-regression-checks.mjs");
const packageJson = read("package.json");

expect(hasAll(contract, ["DTSC Education — Contrat d’architecture EDU-0", "ERP Finance", "Documents communs", "ERP commun RH", "multi-campus", "aucun de ces modules ne devient ACTIVE ou BETA", "Aucun dual-write permanent"]), "authority matrix and anti-duplication contract are present");
for (const code of ["EDUCATION_SETTINGS","ACADEMIC_STRUCTURE","ADMISSIONS","STUDENTS","GUARDIANS","TEACHING_STAFF","COURSES","ATTENDANCE","ASSESSMENTS","GRADES","ACADEMIC_RESULTS","REPORT_CARDS","SCHOOL_FEES","SCHOLARSHIPS","DISCIPLINE","ACADEMIC_REPORTING","EMIS_REPORTING","EDUCATION_INTEGRATIONS"]) {
  expect(contract.includes(code), `canonical module code documented: ${code}`);
}
for (const forbiddenModel of ["model EducationInvoice","model EducationPayment","model EducationCashSession","model EducationJournalEntry","model EducationPayroll"]) {
  expect(!schema.includes(forbiddenModel), `no parallel common-domain model: ${forbiddenModel}`);
}
expect(sectorDoc.includes("`EDUCATION`"), "EDUCATION remains a seeded business sector");
expect(packageJson.includes('"qa:education-architecture"'), "EDU-0 targeted QA is exposed in package scripts");
expect(regression.includes('await import("./qa-education-architecture-contract.mjs")'), "EDU-0 gate runs in qa:regression");
if (process.exitCode) process.exit(process.exitCode);
console.log("EDU-0 architecture contract QA passed.");
