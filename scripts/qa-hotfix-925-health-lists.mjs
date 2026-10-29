import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const patientsApi = read("app/api/enterprise/[organizationId]/healthcare/patients/route.ts");
const patientsWorkspace = read("components/enterprise/health-patients-workspace.tsx");
const insurance = read("components/enterprise/health-insurance-workspace.tsx");

assert.match(patientsApi, /prisma\.healthPatient\.count/);
assert.match(patientsApi, /skip: \(page - 1\) \* pageSize/);
assert.match(patientsApi, /pagination: \{ page, pageSize, total, totalUnfiltered/);
assert.match(patientsApi, /maskHealthPatientSensitive/);
assert.match(patientsWorkspace, /params\.set\("q", settledQuery\)/);
assert.match(patientsWorkspace, /signal:?.*\b|cache: "no-store", signal/);
assert.match(patientsWorkspace, /totalCount=\{totalUnfiltered\}/);
assert.match(patientsWorkspace, /filteredCount=\{totalPatients\}/);
assert.match(patientsWorkspace, /patients\.map\(\(patient\)/);
assert.match(insurance, /query=\{list\.query\}/);
assert.match(insurance, /onQueryChange=\{list\.setQuery\}/);
assert.match(insurance, /filteredCount=\{list\.filteredCount\}/);

console.log("PASS UX-02: server-side patient pages/search/counts and connected insurance search");
