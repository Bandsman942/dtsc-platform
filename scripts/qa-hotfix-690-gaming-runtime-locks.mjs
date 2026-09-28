import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };

const bookings = read("lib/enterprise/gaming/bookings.ts");
const checkout = read("lib/enterprise/gaming/checkout-service.ts");
const dailyClose = read("lib/enterprise/gaming/daily-close.ts");
const gamingHttp = read("lib/enterprise/gaming/http.ts");
const checkoutHttp = read("lib/enterprise/gaming/checkout-http.ts");
const professionalUi = read("components/enterprise/professional/professional-erp-ui.tsx");
const bookingsWorkspace = read("components/enterprise/gaming/enterprise-gaming-bookings-workspace.tsx");
const tournaments = read("lib/enterprise/gaming/tournaments.ts");
const reports = read("lib/enterprise/gaming/reports.ts");
const workflow = read(".github/workflows/quality-gates.yml");
const docs = read("docs/ERP_GAMING_LOUNGE.md");
const regression = read("scripts/qa-regression-checks.mjs");

for (const [label, source] of [
  ["bookings", bookings],
  ["checkout", checkout],
  ["daily close", dailyClose],
]) {
  check(source.includes("pg_advisory_xact_lock"), `${label}: advisory lock missing`);
  check(source.includes("tx.$executeRaw"), `${label}: advisory lock must use $executeRaw`);
  check(!/\$queryRaw[\s\S]{0,180}pg_advisory_xact_lock/.test(source), `${label}: $queryRaw must never deserialize pg_advisory_xact_lock(void)`);
}

check(professionalUi.includes("toast = true"), "ProfessionalError must preserve default global toast behavior");
check(professionalUi.includes('useToastMessage(toast ? message : "", "error")'), "ProfessionalError must support inline-only rendering");
check(bookingsWorkspace.includes('useToastMessage(message, "error")'), "bookings workspace must own mutation error toast");
check(bookingsWorkspace.includes('message={message} toast={false}'), "bookings inline mutation errors must not emit a second toast");
check(bookingsWorkspace.includes("mutationError={message}"), "booking conversion must preserve inline mutation feedback without duplicate toast");

check(gamingHttp.includes("supportReference"), "Gaming unexpected errors must expose a safe support reference");
check(gamingHttp.includes("[gaming-domain] unexpected operation failure"), "Gaming unexpected errors must be correlated in server logs");
check(checkoutHttp.includes("gamingUnexpectedErrorResponse"), "Gaming checkout must use the shared safe unexpected-error response");

check(tournaments.includes("pg_advisory_xact_lock") && tournaments.includes("$executeRaw"), "Gaming tournaments advisory locks must remain on $executeRaw");
check(reports.includes("export") && reports.includes("Gaming"), "Gaming reports implementation must remain present for non-regression");
check(workflow.includes("node scripts/qa-gaming-advisory-lock-runtime.mjs"), "Quality Gate must execute real PostgreSQL advisory-lock QA");
check(regression.includes('await import("./qa-hotfix-690-gaming-runtime-locks.mjs");'), "hotfix QA must be part of canonical regression");
check(docs.includes("Hotfix #690"), "Gaming domain documentation must record hotfix #690");

if (errors.length) {
  console.error("Gaming runtime locks hotfix #690 QA failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Gaming runtime locks hotfix #690 QA passed.");
