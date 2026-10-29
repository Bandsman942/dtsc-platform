import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const panel = read("components/admin/work-submission-review-panel.tsx");
const fr = JSON.parse(read("locales/fr.json")).workPrestations;
const en = JSON.parse(read("locales/en.json")).workPrestations;
for (const role of ["ceo", "coo"]) {
  const api = read(`app/api/admin/${role}/work-submissions/[id]/review/route.ts`);
  assert.match(api, /return NextResponse\.json\(\{ ok: true, submission \}\)/, `${role} success contract`);
  assert.match(api, /isDtscInternalSession\(session\)/, `${role} must be internal`);
  assert.match(api, /reviewWorkSubmission\(/, `${role} must enforce reviewer rules on server`);
}
assert.match(panel, /useToastMessage\(notice\)/);
assert.doesNotMatch(panel, /useToastMessage\(message\)|setMessage\(/);
assert.match(panel, /if \(!selected \|\| !decision \|\| saving\) return/);
assert.match(panel, /body\?\.ok !== true \|\| body\.submission\?\.id !== selected\.id/);
assert.match(panel, /if \(!response\.ok\)/);
assert.match(panel, /setNotice\(\{\s*tone: "success"/);
assert.match(panel, /setNotice\(\{ tone: "error", description: t\("reviewNetworkError"\) \}\)/);
assert.match(panel, /disabled=\{saving\}/, "Review cancel must stay disabled while submitting");
for (const status of ["401", "403", "409", "429", "400", "422", "500"]) {
  assert.ok(panel.includes(status), `Missing HTTP status handling: ${status}`);
}
for (const key of [
  "reviewSessionExpired", "reviewForbidden", "reviewConflict",
  "reviewRateLimited", "reviewInvalidDecision", "reviewServiceUnavailable",
  "reviewNetworkError", "reviewUnexpectedResponse",
]) {
  assert.equal(typeof fr[key], "string", `FR ${key}`);
  assert.equal(typeof en[key], "string", `EN ${key}`);
}
assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort(), "FR/EN prestation dictionary parity");
console.log("OK: CEO/COO work review semantic feedback, verified API response and localized errors.");
