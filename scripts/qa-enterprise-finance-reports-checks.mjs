import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };
const includes = (file, snippets) => { const content = read(file); for (const snippet of snippets) ok(content.includes(snippet), `${file}: missing ${snippet}`); return content; };

const financeSchema = read("prisma/enterprise-finance-reporting.prisma");
for (const model of ["EnterpriseBudget", "EnterpriseBudgetLine", "EnterpriseBudgetCommitment", "EnterpriseExpense", "EnterpriseReport"]) ok(financeSchema.includes(`model ${model} {`), `Missing Sprint 8 Prisma model ${model}`);
ok(/^\s*plannedAmount\s+Decimal\s+@db\.Decimal\(18,\s*2\)\s*$/m.test(financeSchema) && /^\s*amount\s+Decimal\s+@db\.Decimal\(18,\s*2\)\s*$/m.test(financeSchema), "Budget and expense money must use Prisma Decimal fields.");
ok(financeSchema.includes("@@unique([organizationId, reference])"), "Sprint 8 references must be unique inside an organization.");
ok(financeSchema.includes("@@unique([organizationId, sourceEntityType, sourceEntityId])"), "Commitment sources must be idempotent per organization.");
ok(financeSchema.includes("snapshotJson") && financeSchema.includes("schemaVersion") && financeSchema.includes("revision"), "Reports need versioned immutable snapshots and optimistic revision.");

const procurementSchema = read("prisma/enterprise-documents-procurement.prisma");
ok(procurementSchema.includes("budgetLineId") && procurementSchema.includes("EnterpriseBudgetLine"), "EnterprisePurchase must support a structured budget line allocation.");
ok(procurementSchema.includes("expenses        EnterpriseExpense[]"), "EnterprisePurchase must support multiple expenses.");

const migration = read("prisma/migrations/20260729211500_add_enterprise_finance_reporting/migration.sql");
for (const table of ["EnterpriseBudget", "EnterpriseBudgetLine", "EnterpriseBudgetCommitment", "EnterpriseExpense", "EnterpriseReport"]) ok(migration.includes(`CREATE TABLE \"${table}\"`), `Sprint 8 migration missing ${table}`);
ok(migration.includes('ALTER TABLE "EnterprisePurchase" ADD COLUMN "budgetLineId" TEXT'), "Sprint 8 migration must add the purchase budget allocation structurally.");
ok(!/DROP\s+(TABLE|COLUMN)/i.test(migration), "Sprint 8 migration must be additive and keep legacy finance data.");
ok(exists("prisma/migrations/20260729212000_add_enterprise_report_revision/migration.sql"), "Report optimistic revision migration is missing.");

const constants = read("lib/enterprise/core-v2/constants.ts");
for (const type of ["BUDGET", "EXPENSE", "REPORT"]) ok(constants.includes(`"${type}"`), `Dedicated Core finance type missing: ${type}`);
for (const moduleCode of ["FINANCE_BUDGETS", "REPORTS"]) ok(constants.includes(`"${moduleCode}"`), `Dedicated finance module missing: ${moduleCode}`);
for (const target of ["EnterpriseBudget", "EnterpriseExpense"]) ok(constants.includes(`"${target}"`), `EnterpriseApproval target missing: ${target}`);

const core = read("lib/enterprise/enterprise-core.ts");
ok(core.includes("EnterpriseCoreRecord"), "Legacy EnterpriseCoreRecord must stay readable for compatibility.");
ok(constants.includes("DEDICATED_CORE_RECORD_TYPES"), "Dedicated domains must be centralized for legacy write blocking.");

const financeAccess = includes("lib/enterprise/finance/access.ts", ["resolveEnterpriseModuleCapabilities", "capabilities.canRead", "capabilities.canSubmit", "capabilities.canWrite", "capabilities.canApprove", "capabilities.canManage"]);
ok(financeAccess.includes("canSeeAll: capabilities.canApprove || capabilities.canManage"), "Finance approvers/managers must be able to read the records they are responsible for.");
ok(!financeAccess.includes("ENTERPRISE_MANAGER_ROLES"), "Finance access must derive capabilities from the canonical module access contract, not from a parallel manager-role shortcut.");

const money = includes("lib/enterprise/finance/money.ts", ["Prisma.Decimal", "toDecimalPlaces(2", "assertSameCurrency"]);
ok(!money.includes("Math.round") && !money.includes("toFixed(2) as number"), "Financial truth must not use JavaScript floating-point rounding.");

const commitments = includes("lib/enterprise/finance/commitments.ts", ["remainingCommitment", "planned.sub(remainingCommitment).sub(actualAmount)", "createPurchaseBudgetCommitment", "releasePurchaseBudgetCommitment", "applyExpenseCommitmentRealization", "INSUFFICIENT_BUDGET", "BUDGET_CURRENCY_MISMATCH", "updateMany"]);
ok(commitments.includes("position.available.add(realizable)"), "Expense approval must avoid double-counting the commitment portion converted to actual.");
ok(commitments.includes("sourceEntityType: \"EnterprisePurchase\""), "Purchase commitments must use a deterministic source identity.");

const purchase = includes("lib/enterprise/procurement/purchase-service.ts", ["createPurchaseBudgetCommitment", "releasePurchaseBudgetCommitment", "budgetLineId", "BUDGET_CURRENCY_MISMATCH", "assertEnterpriseApprovalCandidate", "assertEnterpriseApprovalDecision"]);
ok(!purchase.includes("pharmacyStockMovement.create"), "Common purchase finance integration must not mutate pharmacy stock truth.");

const budget = includes("lib/enterprise/finance/budget-service.ts", ["PENDING_APPROVAL", "ACTIVE", "EnterpriseApproval", "assertEnterpriseApprovalCandidate", "assertEnterpriseApprovalDecision", "REVISION_CONFLICT", "ENTERPRISE_BUDGET_APPROVED", "ENTERPRISE_BUDGET_REJECTED"]);
ok(budget.includes('existing.status !== "DRAFT"'), "Budget edits must be limited to DRAFT.");

const expense = includes("lib/enterprise/finance/expense-service.ts", ["amountVarianceReason", "EnterpriseApproval", "assertEnterpriseApprovalCandidate", "assertEnterpriseApprovalDecision", "BUDGET_CURRENCY_MISMATCH", "applyExpenseCommitmentRealization", "budgetImpactAppliedAt", "ENTERPRISE_EXPENSE_APPROVED", "EXPENSE_PURCHASE_SUPPLIER_MISMATCH", "refreshExpenseLinks"]);
ok(expense.includes('existing.status !== "DRAFT"'), "Approved or pending expenses must not be editable through normal PATCH.");
ok(expense.includes("documentIds"), "Expenses must support EnterpriseDocument evidence links.");
ok(expense.includes("enterpriseEntityLink.deleteMany") && expense.includes("SUPPORTING_DOCUMENT") && expense.includes("REALIZES_PURCHASE"), "Expense updates must replace obsolete active cross-module links instead of accumulating contradictory links.");

const reports = includes("lib/enterprise/finance/report-service.ts", ["BUDGET_VS_ACTUAL", "EXPENSE_SUMMARY", "PROCUREMENT_SUMMARY", "schemaVersion", "snapshotJson", "groupBy", "take: 500", "currencyBuckets", "resolveReportSourceScope", "resolveEnterpriseModuleCapabilities", "enterpriseBudgetVisibilityWhere", "enterpriseExpenseVisibilityWhere", "enterprisePurchaseVisibilityWhere", "REPORT_FINANCE_SOURCE_FORBIDDEN", "REPORT_PROCUREMENT_SOURCE_FORBIDDEN"]);
ok(!reports.includes("USD + EUR") && !reports.includes("exchangeRate"), "Sprint 8 reports must not implement or fake FX aggregation.");
ok(reports.includes("enterpriseBudgetCommitment.groupBy") && reports.includes("enterpriseExpense.groupBy") && reports.includes("enterprisePurchase.groupBy"), "Reports must derive real server aggregates from dedicated tables.");
ok(reports.includes("purchase: purchaseWhere"), "Procurement report receipt counts must remain inside the same visible purchase scope.");
ok(reports.includes("where: { ...scope.budget, id: input.budgetId }"), "An explicitly selected report budget must be revalidated against the caller's visible budget scope.");

const financeSummary = includes("lib/enterprise/finance/summary-service.ts", ["enterpriseBudgetVisibilityWhere", "enterpriseExpenseVisibilityWhere", "budgetScope", "budgetLine: { budget: budgetScope }"]);
ok(financeSummary.includes("userId: string, canSeeAll: boolean"), "Finance summary must receive the caller visibility context instead of aggregating the whole tenant by default.");
const financeSummaryRoute = includes("app/api/enterprise/[organizationId]/finance-summary/route.ts", ["session.userId", "access.canSeeAll", "getEnterpriseFinanceSummary"]);
ok(financeSummaryRoute.includes("getEnterpriseFinanceSummary(organizationId, session.userId, access.canSeeAll)"), "Finance summary route must propagate the authenticated caller visibility into server aggregates.");

const overviewSummary = includes("lib/enterprise/finance/overview-summary-service.ts", ["unallocatedAmount: { gt: 0 }", "enterpriseSupplierInvoice.count", "enterpriseSalesInvoice.count", "enterpriseApproval.count", "FINANCE_APPROVAL_TARGETS"]);
ok(!overviewSummary.includes("groupBy") && !overviewSummary.includes("exchangeRate"), "Finance overview readiness KPIs must remain exact counts and must not invent cross-currency totals.");
const overviewRoute = includes("app/api/enterprise/[organizationId]/finance/overview-summary/route.ts", ["authorizeFinanceRequest", '"FINANCE_OVERVIEW"', "getEnterpriseFinanceOverviewSummary", "writeApiLog"]);
ok(overviewRoute.includes('"view"'), "Finance overview summary must require FINANCE_OVERVIEW read access.");

const shared = read("lib/enterprise/procurement/shared.ts");
for (const entityType of ["EnterpriseBudget", "EnterpriseBudgetLine", "EnterpriseExpense", "EnterpriseReport"]) ok(shared.includes(`entityType === "${entityType}"`), `EntityLink same-tenant validation missing ${entityType}`);
ok(shared.includes("CROSS_TENANT_LINK_DENIED"), "Cross-tenant entity links must be denied server-side.");

const approvalActions = read("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts");
for (const service of ["decideEnterpriseBudgetApproval", "decideEnterpriseExpenseApproval", "decideEnterprisePurchaseApproval"]) ok(approvalActions.includes(service), `Approval synchronization missing ${service}`);

const mutatingRoutes = [
  "app/api/enterprise/[organizationId]/budgets/route.ts",
  "app/api/enterprise/[organizationId]/budgets/[id]/route.ts",
  "app/api/enterprise/[organizationId]/budgets/[id]/actions/route.ts",
  "app/api/enterprise/[organizationId]/expenses/route.ts",
  "app/api/enterprise/[organizationId]/expenses/[id]/route.ts",
  "app/api/enterprise/[organizationId]/expenses/[id]/actions/route.ts",
  "app/api/enterprise/[organizationId]/reports/generate/route.ts",
  "app/api/enterprise/[organizationId]/reports/[id]/actions/route.ts",
];
for (const route of mutatingRoutes) {
  const content = read(route);
  ok(content.includes("isSameOriginRequest"), `${route}: same-origin guard missing.`);
  ok(content.includes("await rateLimit"), `${route}: awaited rateLimit missing.`);
  ok(content.includes("getEnterpriseFinanceAccess") || content.includes("getEnterpriseProcurementAccess"), `${route}: organization/module access guard missing.`);
}

for (const route of [
  "app/api/enterprise/[organizationId]/budgets/route.ts",
  "app/api/enterprise/[organizationId]/expenses/route.ts",
  "app/api/enterprise/[organizationId]/reports/route.ts",
  "app/api/enterprise/[organizationId]/budget-lines/route.ts",
]) {
  const content = read(route);
  ok((content.includes("pageSize") && content.includes("search")) || route.endsWith("budget-lines/route.ts"), `${route}: server pagination/search expected.`);
}

const budgetRoute = read("app/api/enterprise/[organizationId]/budgets/route.ts");
const expenseRoute = read("app/api/enterprise/[organizationId]/expenses/route.ts");
const budgetActionRoute = read("app/api/enterprise/[organizationId]/budgets/[id]/actions/route.ts");
const expenseActionRoute = read("app/api/enterprise/[organizationId]/expenses/[id]/actions/route.ts");
const reportGenerateRoute = read("app/api/enterprise/[organizationId]/reports/generate/route.ts");
ok(budgetRoute.includes("capabilities") && budgetRoute.includes("canCreateRevision") && budgetRoute.includes("canFreeze") && budgetRoute.includes("access.canSubmit"), "Budget list must expose permission-aware server-derived action capabilities.");
ok(expenseRoute.includes("capabilities") && expenseRoute.includes("canSubmit") && expenseRoute.includes("canReopen") && expenseRoute.includes("access.canSubmit"), "Expense list must expose permission-aware server-derived action capabilities.");
ok(budgetRoute.includes('action: "submit"') && expenseRoute.includes('action: "submit"') && reportGenerateRoute.includes('action: "submit"'), "Budget, expense and report creation must use the canonical create/submit capability instead of requiring update permission.");
ok(budgetActionRoute.includes("BUDGET_MANAGEMENT_ACTIONS") && budgetActionRoute.includes('? "manage" : "submit"'), "Budget management transitions must require manage while owner workflow transitions require submit.");
ok(expenseActionRoute.includes('parsed.data.action === "ARCHIVE" ? "manage" : "submit"'), "Expense archival must require manage while owner workflow transitions require submit.");

const financeEntry = read("components/enterprise/core-v2/enterprise-finance-workspace.tsx");
const financeWorkspace = read("components/enterprise/core-v2/enterprise-finance-workspace-hotfix.tsx");
const financeReferenceSelect = read("components/enterprise/core-v2/finance-reference-select.tsx");
const reportsWorkspace = read("components/enterprise/core-v2/enterprise-reports-workspace.tsx");
const overviewWorkspace = read("components/enterprise/professional/enterprise-finance-overview-workspace.tsx");
ok(financeEntry.includes("EnterpriseFinanceWorkspaceHotfix") && financeEntry.includes('"use client"'), "FINANCE_BUDGETS entry point must route through the hotfix workspace without losing the client boundary.");
ok(financeWorkspace.includes("BusinessList") && financeWorkspace.includes("Planifié") && financeWorkspace.includes("Disponible"), "Finance workspace must use the mobile-first business list and budget position UI.");
ok(financeWorkspace.includes("FinanceReferenceSelect") && financeWorkspace.includes('presentation="editor"'), "Finance forms must use searchable references and the mobile editor dialog contract.");
ok(financeWorkspace.includes('useToastMessage(message, "success")') && financeWorkspace.includes('useToastMessage(errorMessage, "error")'), "Finance workspace must keep success and error feedback on distinct global toast channels.");
ok(financeWorkspace.includes("busyAction") && financeWorkspace.includes("disabled={busy}"), "Finance mutations must expose busy/disabled states against double submission.");
ok(!financeWorkspace.includes("pageSize=100&status=ACTIVE") && !financeWorkspace.includes("pageSize=100"), "Finance reference selectors must not rely on the first 100 records.");
ok(financeReferenceSelect.includes("pageSize") && financeReferenceSelect.includes("search") && financeReferenceSelect.includes("organizationId"), "Finance reference selector must search paginated tenant-scoped endpoints.");

ok(overviewWorkspace.includes("/finance/overview-summary") && overviewWorkspace.includes("invoicesToPost") && overviewWorkspace.includes("pendingApprovals"), "Finance overview must use the authoritative server summary and render the repaired KPIs.");
ok(
  !overviewWorkspace.includes("pageSize=100")
    && overviewWorkspace.includes('state: "error", value: null')
    && overviewWorkspace.includes('value.state === "error"')
    && overviewWorkspace.includes("degradedMetrics")
    && overviewWorkspace.includes('financeT(locale, "metricsUnavailable")')
    && overviewWorkspace.includes('setProjectionError(financeT(locale, "projectionHealthUnavailable"))')
    && !overviewWorkspace.includes("setProjectionError(projectionsBody")
    && !overviewWorkspace.includes("projection.lastErrorMessage")
    && !overviewWorkspace.includes("item.lastErrorMessage"),
  "Finance overview must use authoritative KPIs, expose unavailable metrics explicitly and never render raw projection errors.",
);
ok(overviewWorkspace.includes('presentation="editor"') && overviewWorkspace.includes('useToastMessage(error, "error")'), "Finance overview configuration must follow editor and explicit error-toast contracts.");

ok(
  reportsWorkspace.includes("BusinessList")
    && (reportsWorkspace.includes("Export CSV") || reportsWorkspace.includes('t("reports.action.export")'))
    && reportsWorkspace.includes("/reports/${item.id}/export"),
  "Reports workspace must use the DTSC business list and lightweight export.",
);
ok(reportsWorkspace.includes("item.capabilities?.canPublish") && reportsWorkspace.includes("reports.meta.metrics?.published") && reportsWorkspace.includes("reports.meta.latestGeneratedAt"), "Reports UI must consume server capabilities and server-wide summary metadata instead of current-page approximations.");
ok(reportsWorkspace.includes('useToastMessage(errorMessage, "error")') && reportsWorkspace.includes('presentation="editor"'), "Reports forms must preserve input on errors, use global error feedback and editor dialogs.");
const reportsRoute = read("app/api/enterprise/[organizationId]/reports/route.ts");
ok(reportsRoute.includes("capabilities") && reportsRoute.includes("latestGeneratedAt") && reportsRoute.includes("publishedCount"), "Reports route must expose item capabilities and global report summary metadata.");

const moduleWorkspace = read("components/enterprise/enterprise-module-workspace.tsx");
for (const component of ["EnterpriseFinanceWorkspace", "EnterpriseReportsWorkspace"]) ok(moduleWorkspace.includes(component), `Dedicated Sprint 8 workspace missing: ${component}`);

const financeFr = read("locales/enterprise-finance.fr.json");
const financeEn = read("locales/enterprise-finance.en.json");
for (const key of ["pendingApproval", "budgetVsActual", "unbudgeted", "commitment", "available"]) { ok(financeFr.includes(`"${key}"`), `French finance translation missing ${key}`); ok(financeEn.includes(`"${key}"`), `English finance translation missing ${key}`); }

const libAgents = read("lib/AGENTS.md");
ok(libAgents.includes("Organization client finance is isolated from `DTSC_INTERNAL`"), "Permanent DTSC_INTERNAL/organization finance boundary rule missing.");
ok(libAgents.includes("Never aggregate different currencies"), "Permanent no-cross-currency rule missing.");
ok(libAgents.includes("Sprint 9 Workflow Engine"), "Sprint 9 boundary must be documented in permanent rules.");

const hrcfoSchema = ["prisma/schema.prisma", ...fs.readdirSync(path.join(root, "prisma")).filter((name) => name.endsWith(".prisma")).map((name) => `prisma/${name}`)].map((file) => read(file)).join("\n");
for (const legacyInternal of ["HrcfoBudget", "HrcfoExpense", "HrcfoPayroll", "FinancialAccount"]) ok(hrcfoSchema.includes(legacyInternal), `DTSC internal finance model must remain present: ${legacyInternal}`);

const vercel = read("vercel.json");
ok(vercel.includes('"main": true') && vercel.includes('"**": false'), "Vercel must remain production-only from main, including slash branches.");
ok(vercel.includes("VERCEL_ENV") && vercel.includes("production"), "Vercel ignoreCommand must preserve production-only behavior.");
const vercelScript = read("vercel.sh");
ok(vercelScript.includes("pnpm prisma migrate deploy") && vercelScript.includes("pnpm build"), "Production must run prisma migrate deploy before pnpm build.");
const productionOnlyPolicy = read(".github/workflows/vercel-production-only-policy.yml");
ok(productionOnlyPolicy.includes("Vercel production-only delivery policy") && productionOnlyPolicy.includes("qa-vercel-production-only-policy.mjs"), "Production-only Vercel policy workflow must remain enforced by GitHub CI.");
ok(!exists(".github/workflows/vercel-production-only-status.yml"), "Legacy Preview status normalizer must stay removed.");

const changedFinanceFiles = [financeSchema, migration, budget, expense, commitments, reports].join("\n");
ok(!/\bBPMN\b/.test(changedFinanceFiles) && !/model\s+.*WorkflowEngine/.test(changedFinanceFiles), "Sprint 8 must not implement the Sprint 9 Workflow Engine/BPMN domain.");
ok(!/general ledger|bank reconciliation|double-entry/i.test(changedFinanceFiles), "Sprint 8 must not implement general-ledger or bank-reconciliation logic.");

if (failures.length) { console.error("Enterprise finance/reporting QA failed:\n- " + failures.join("\n- ")); process.exit(1); }
console.log("Enterprise finance/reporting QA passed: dedicated Decimal-safe finance sources, purchase/expense consistency, stale-link replacement, shared approvals, authoritative overview counts, capability-based RBAC, action-level permission boundaries, visibility-scoped aggregates and snapshots, searchable tenant references, immutable report snapshots, mobile editor forms, legacy isolation and production-only delivery verified.");