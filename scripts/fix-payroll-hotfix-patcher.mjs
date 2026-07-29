import fs from "node:fs";

const path = "scripts/apply-payroll-hotfix-once.mjs";
let source = fs.readFileSync(path, "utf8");

const startMarker = 'write("scripts/qa-payroll-hotfix-checks.mjs", `';
const endMarker = '\n\nappendOnce("docs/DTSC_PAYROLL_WORKFLOW.md"';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error("QA generator block anchors not found");

const qaLines = [
  'import fs from "node:fs";',
  '',
  'const read = (path) => fs.readFileSync(path, "utf8");',
  'const schema = read("prisma/schema.prisma");',
  'const migration = read("prisma/migrations/20260729054500_payroll_active_period_retry/migration.sql");',
  'const workflow = read("lib/payroll-workflow.ts");',
  'const panel = read("components/admin/payroll-workflow-panel.tsx");',
  'const types = read("components/admin/payroll-workflow-types.ts");',
  'const packageJson = read("package.json");',
  'const docs = read("docs/DTSC_PAYROLL_WORKFLOW.md");',
  '',
  'const checks = [];',
  'const expect = (label, condition) => checks.push({ label, ok: Boolean(condition) });',
  '',
  'expect("Payroll period is no longer globally unique in Prisma", !schema.includes("@@unique([employeeId, periodStart, periodEnd])") && schema.includes("@@index([employeeId, periodStart, periodEnd])"));',
  'expect("DB keeps a partial unique active-period guard", migration.includes("HrcfoPayroll_active_period_key") && migration.includes("NOT IN (\'CANCELLED\', \'CANCELED\', \'REJECTED\')"));',
  'expect("Migration creates partial guard before dropping legacy unique index", migration.indexOf("CREATE UNIQUE INDEX") < migration.indexOf("DROP INDEX"));',
  'expect("Cancelled and rejected payrolls do not block a retry", workflow.includes(\'status: { notIn: ["CANCELLED", "CANCELED", "REJECTED"] }\'));',
  'expect("Race duplicate maps to an explicit payroll error", workflow.includes("isPrismaUniqueConstraintError") && workflow.includes("PAYROLL_PERIOD_EXISTS"));',
  'expect("Cancellation still releases active work evidence", workflow.includes(\'status: "CANCELLED"\') && workflow.includes("releasedAt: new Date()"));',
  'expect("Submission readiness exposes financial blockers", workflow.includes("buildPayrollSubmissionReadiness") && workflow.includes("COVERAGE_REASON_REQUIRED") && workflow.includes("BUDGET_ACCOUNT_CHANGED"));',
  'expect("Submission readiness exposes missing approver", workflow.includes("NO_APPROVER") && workflow.includes("approverName"));',
  'expect("Live submit uses the same readiness guard", workflow.includes("assertPayrollReadyForSubmission(existing, approvers.length > 0)"));',
  'expect("HR CFO UI has an explicit submission readiness model", types.includes("submissionReadiness") && panel.includes("submissionReadiness.blockers.map"));',
  'expect("Blocked submission button is disabled", panel.includes("submissionReadiness?.ready === false"));',
  'expect("Action failures use an explicit error tone", panel.includes(\'setMessageTone("error")\') && panel.includes("setActionError(errorMessage)") && panel.includes(\'role="alert"\'));',
  'expect("Hotfix QA is wired into regression", packageJson.includes("qa-payroll-hotfix-checks.mjs"));',
  'expect("Workflow documentation records period retry semantics", docs.includes("PAYROLL_PERIOD_RETRY_HOTFIX"));',
  '',
  'let failed = 0;',
  'for (const check of checks) {',
  '  console.log((check.ok ? "✓" : "✗") + " " + check.label);',
  '  if (!check.ok) failed += 1;',
  '}',
  'console.log("\\nPayroll hotfix QA: " + (checks.length - failed) + "/" + checks.length + " checks passed.");',
  'if (failed) process.exit(1);',
];

const qaReplacement = [
  'write("scripts/qa-payroll-hotfix-checks.mjs", [',
  ...qaLines.map((line) => `  ${JSON.stringify(line)},`),
  '].join("\\n") + "\\n");',
].join("\n");
source = source.slice(0, start) + qaReplacement + source.slice(end);

const docsStartMarker = 'appendOnce("docs/DTSC_PAYROLL_WORKFLOW.md"';
const docsEndMarker = '\n\nlet agents = read("AGENTS.md");';
const docsStart = source.indexOf(docsStartMarker);
const docsEnd = source.indexOf(docsEndMarker, docsStart);
if (docsStart < 0 || docsEnd < 0) throw new Error("Documentation generator block anchors not found");

const docsCalls = [
  [
    "docs/DTSC_PAYROLL_WORKFLOW.md",
    "PAYROLL_PERIOD_RETRY_HOTFIX",
    `<!-- PAYROLL_PERIOD_RETRY_HOTFIX -->\n## Hotfix — soumission explicite et nouvelle préparation après annulation/refus\n\nUne paie \`CANCELLED\` ou \`REJECTED\` reste conservée pour l'audit mais ne réserve plus définitivement le couple collaborateur + période. La base conserve une unicité partielle sur les paies financièrement actives ; une nouvelle préparation est donc autorisée après annulation/refus, tandis qu'un DRAFT, PENDING_APPROVAL, CHANGES_REQUESTED, VALIDATED ou PAID continue de bloquer un doublon actif.\n\nLa préparation HR & CFO expose désormais une readiness de soumission avec l'approbateur attendu et les blocages lisibles (couverture à justifier, budget/compte, montant, preuve de travail ou approbateur absent). Le bouton de soumission est désactivé lorsque ces prérequis visibles ne sont pas satisfaits, et le backend répète les contrôles au moment du POST. Les erreurs d'action financière sont affichées explicitement comme erreurs et dans la modale, sans dépendre d'une déduction par mots-clés du toast.\n<!-- /PAYROLL_PERIOD_RETRY_HOTFIX -->`,
  ],
  [
    "docs/TECHNICAL_DOCUMENTATION.md",
    "SPRINT_05_PAYROLL_RETRY_HOTFIX",
    `<!-- SPRINT_05_PAYROLL_RETRY_HOTFIX -->\n### Hotfix Sprint 5 — retry de période et readiness de soumission\n\n\`HrcfoPayroll\` conserve l'historique CANCELLED/REJECTED. L'unicité active est portée par l'index PostgreSQL partiel \`HrcfoPayroll_active_period_key\`, tandis que Prisma conserve un index de recherche non unique. \`preparePayroll()\` ignore les lignes terminales libératrices et transforme aussi une collision concurrente P2002 en 409 métier. La workspace HR & CFO reçoit une readiness calculée côté serveur ; le POST de soumission répète les mêmes préconditions et les vérifications fortes de budget et de preuves approuvées.\n<!-- /SPRINT_05_PAYROLL_RETRY_HOTFIX -->`,
  ],
  [
    "docs/CHANGELOG.md",
    "SPRINT_05_PAYROLL_RETRY_CHANGELOG",
    `<!-- SPRINT_05_PAYROLL_RETRY_CHANGELOG -->\n- Hotfix Sprint 5 : une paie annulée ou refusée ne bloque plus une nouvelle préparation de la même période, tout en conservant son historique.\n- Ajout d'une readiness de soumission HR & CFO, de blocages lisibles avant envoi CEO/COO et d'erreurs d'action explicitement affichées comme erreurs.\n<!-- /SPRINT_05_PAYROLL_RETRY_CHANGELOG -->`,
  ],
  [
    "docs/QA_REGRESSION_CHECKLIST.md",
    "SPRINT_05_PAYROLL_RETRY_QA",
    `<!-- SPRINT_05_PAYROLL_RETRY_QA -->\n### Hotfix paie — retry et soumission\n- DRAFT/PENDING/VALIDATED/PAID bloque une seconde paie active de même collaborateur+période.\n- CANCELLED et REJECTED conservent l'historique mais permettent une nouvelle préparation.\n- Une collision concurrente de période renvoie PAYROLL_PERIOD_EXISTS/409.\n- PARTIAL/NONE sans justification, approbateur absent, budget/compte invalide ou snapshot incohérent apparaît comme blocage lisible avant soumission.\n- Une erreur de soumission est affichée comme erreur dans le toast et dans la modale.\n<!-- /SPRINT_05_PAYROLL_RETRY_QA -->`,
  ],
];

const docsReplacement = docsCalls
  .map(([file, marker, content]) => `appendOnce(${JSON.stringify(file)}, ${JSON.stringify(marker)}, ${JSON.stringify(content)});`)
  .join("\n\n");
source = source.slice(0, docsStart) + docsReplacement + source.slice(docsEnd);

fs.writeFileSync(path, source, "utf8");
console.log("Payroll hotfix QA and documentation generators replaced safely.");
