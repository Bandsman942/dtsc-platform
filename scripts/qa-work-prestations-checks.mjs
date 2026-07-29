import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const schema = read("prisma/schema.prisma");
const service = read("lib/work-prestations.ts");
const entriesRoute = read("app/api/work/entries/route.ts");
const entryRoute = read("app/api/work/entries/[id]/route.ts");
const submitRoute = read("app/api/work/submissions/[id]/submit/route.ts");
const cooReview = read("app/api/admin/coo/work-submissions/[id]/review/route.ts");
const ceoReview = read("app/api/admin/ceo/work-submissions/[id]/review/route.ts");
const activitiesUi = read("components/activities/work-prestations-panel.tsx");
const reviewUi = read("components/admin/work-submission-review-panel.tsx");
const packageJson = read("package.json");
const agents = read("AGENTS.md");
const vercelJson = read("vercel.json");
const vercelScript = read("vercel.sh");
const migration = read("prisma/migrations/20260729031000_sprint04_work_prestations/migration.sql");

const checks = [];
const expect = (label, condition) => checks.push({ label, ok: Boolean(condition) });

expect("Prisma WorkEntry exists", schema.includes("model DtscWorkEntry"));
expect("Prisma WorkSubmission exists", schema.includes("model DtscWorkSubmission"));
expect("Prisma review history exists", schema.includes("model DtscWorkSubmissionReview"));
expect("One submission per employee/week", schema.includes("@@unique([employeeId, periodStart, periodEnd])"));
expect("Submission links employee and reviewer", schema.includes('relation("DtscWorkSubmissionEmployee"') && schema.includes('relation("DtscWorkSubmissionReviewer"'));
expect("Migration creates all Sprint 4 tables", ["DtscWorkEntry", "DtscWorkSubmission", "DtscWorkSubmissionReview"].every((name) => migration.includes(`CREATE TABLE \"${name}\"`)));
expect("Migration is expand-only regarding payroll", !/DROP\s+(TABLE|COLUMN)[\s\S]*HrcfoPayroll/i.test(migration) && !migration.includes('ALTER TABLE "HrcfoPayroll"'));
expect("Server calculates worked minutes", service.includes("calculateWorkedMinutes") && service.includes("endTime") && service.includes("breakMinutes"));
expect("Server rejects overlapping entries", service.includes("ensureNoWorkOverlap") && service.includes("WORK_ENTRY_OVERLAP"));
expect("Work ownership derives from session employee", service.includes("rejectCrossEmployeeWrite") && entriesRoute.includes("getWorkActor(session.userId)"));
expect("No self validation is explicit", service.includes('submission.employeeId === actor.id') && service.includes("SELF_REVIEW_FORBIDDEN"));
expect("Reviewer matrix centralizes COO to CEO", service.includes('getEmployeePositionCode(employee) === "COO" ? "CEO" : "COO"'));
expect("COO review rechecks official position", cooReview.includes('expectedReviewerCode: "COO"'));
expect("CEO review rechecks official position", ceoReview.includes('expectedReviewerCode: "CEO"'));
expect("Approved minutes default to declared minutes", service.includes('validatedMinutes: action === "APPROVED" ? declaredMinutes : null'));
expect("Submitted entries are immutable", service.includes("assertSubmissionEditable") && service.includes("SUBMISSION_LOCKED"));
expect("Correction workflow allows resubmission", service.includes('previousStatus === "CHANGES_REQUESTED"') && service.includes("RESUBMITTED"));
expect("Review history is append-only", service.includes("dtscWorkSubmissionReview.create"));
expect("Sprint 3 schedule resolver is reused", service.includes("resolveDtscEffectiveAvailability"));
expect("Absence conflict requires explicit submission confirmation", service.includes("SCHEDULE_CONFLICT_CONFIRMATION_REQUIRED") && activitiesUi.includes("confirmScheduleConflicts"));
expect("Source objects are permission validated", service.includes("validateWorkSourceAccess") && service.includes("SOURCE_FORBIDDEN"));
expect("Mutations keep same-origin protection", [entriesRoute, entryRoute, submitRoute, cooReview, ceoReview].every((content) => content.includes("isSameOriginRequest")));
expect("Mutations keep rate limits", [entriesRoute, entryRoute, submitRoute, cooReview, ceoReview].every((content) => content.includes("rateLimit(")));
expect("Mutations keep ApiLog", [entriesRoute, entryRoute, submitRoute, cooReview, ceoReview].every((content) => content.includes("writeApiLog")));
expect("Audit events cover employee and reviewer actions", entriesRoute.includes("WORK_ENTRY_CREATED") && entryRoute.includes("WORK_ENTRY_UPDATED") && entryRoute.includes("WORK_ENTRY_DELETED") && submitRoute.includes("WORK_SUBMISSION_SUBMITTED") && cooReview.includes("WORK_SUBMISSION_APPROVED"));
expect("Notifications use centralized Web Push path", service.includes("notifyUsers") && service.includes("notifyUser") && service.includes('type: "WORK_SUBMISSION"'));
expect("Payroll boundary exposes approved-work reader only", service.includes("getApprovedWorkForPayroll") && !/hrcfoPayroll\.(create|update|upsert|delete)/.test(service));
expect("Collaborator UI uses workspace/list/detail conventions", activitiesUi.includes("ModuleSection") && activitiesUi.includes("BusinessList") && activitiesUi.includes("ContextActions"));
expect("Reviewer UI uses workspace/list/detail conventions", reviewUi.includes("ModuleWorkspace") && reviewUi.includes("BusinessDetail") && reviewUi.includes("BusinessList"));
expect("UI uses translated labels", activitiesUi.includes("translate(locale") && reviewUi.includes("translate(locale"));
expect("Sprint 4 QA is wired into package scripts", packageJson.includes('"qa:work-prestations"') && packageJson.includes("qa-work-prestations-checks.mjs"));
expect("Sprint 4 permanent rules are documented", agents.includes("SPRINT_04_WORK_PRESTATIONS_RULES") && agents.includes("may approve their own work submission") && agents.includes("production-only"));
expect("Vercel remains main-only", vercelJson.includes('"main": true') && vercelJson.includes('"*": false') && vercelJson.includes("ignoreCommand"));
expect("Vercel script skips non-production", vercelScript.includes('VERCEL_ENV:-') && vercelScript.includes('!= "production"') && vercelScript.includes("exit 0"));
expect("Production deploy runs migration before build", vercelScript.indexOf("prisma migrate deploy") >= 0 && vercelScript.indexOf("prisma migrate deploy") < vercelScript.indexOf("pnpm build"));

let failed = 0;
for (const check of checks) {
  const symbol = check.ok ? "✓" : "✗";
  console.log(`${symbol} ${check.label}`);
  if (!check.ok) failed += 1;
}

console.log(`\nSprint 4 QA: ${checks.length - failed}/${checks.length} checks passed.`);
if (failed) process.exit(1);
