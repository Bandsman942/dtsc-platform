import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };
const includes = (file, snippets) => { const content = read(file); for (const snippet of snippets) ok(content.includes(snippet), `${file}: missing ${snippet}`); return content; };

const sprint6 = read("prisma/enterprise-core-v2.prisma");
for (const model of ["EnterpriseTask", "EnterpriseRequest", "EnterpriseApproval", "EnterpriseMeeting"]) ok(sprint6.includes(`model ${model} {`), `Sprint 6 model missing from main-derived branch: ${model}`);
const sprint7 = read("prisma/enterprise-documents-procurement.prisma");
for (const model of ["EnterpriseDocument", "EnterpriseSupplier", "EnterprisePurchase"]) ok(sprint7.includes(`model ${model} {`), `Sprint 7 model missing from main-derived branch: ${model}`);
const sprint8 = read("prisma/enterprise-finance-reporting.prisma");
for (const model of ["EnterpriseBudget", "EnterpriseBudgetLine", "EnterpriseBudgetCommitment", "EnterpriseExpense", "EnterpriseReport"]) ok(sprint8.includes(`model ${model} {`), `Sprint 8 model missing from main-derived branch: ${model}`);

const schema = read("prisma/enterprise-workflow-engine.prisma");
for (const model of ["EnterpriseWorkflowDefinition", "EnterpriseWorkflowVersion", "EnterpriseWorkflowStep", "EnterpriseWorkflowTransition", "EnterpriseWorkflowRun", "EnterpriseWorkflowStepRun", "EnterpriseWorkflowEvent", "EnterpriseWorkflowActionAttempt", "EnterpriseDomainEvent"]) ok(schema.includes(`model ${model} {`), `Sprint 9 Prisma model missing: ${model}`);
ok(schema.includes("@@unique([organizationId, code])"), "Workflow definitions must have stable organization-scoped codes.");
ok(schema.includes("workflowVersionId") && schema.includes("definitionId"), "Workflow runs must stay pinned to a precise version.");
ok(schema.includes("resumeAt") && schema.includes("lockedAt") && schema.includes("lockedBy"), "Durable waits and worker leases are required.");
ok(schema.includes("idempotencyKey") && schema.includes("@@unique([idempotencyKey])"), "Events/actions require unique idempotency keys.");
ok(sprint6.includes("workflowRunId") && sprint6.includes("workflowStepRunId"), "EnterpriseApproval must have structural workflow links.");

const migration = [
  read("prisma/migrations/20260730123000_add_enterprise_workflow_engine/migration.sql"),
  read("prisma/migrations/20260730123500_link_workflow_approvals/migration.sql"),
  read("prisma/migrations/20260730124000_add_workflow_domain_event_outbox_trigger/migration.sql"),
].join("\n");
for (const table of ["EnterpriseWorkflowDefinition", "EnterpriseWorkflowVersion", "EnterpriseWorkflowRun", "EnterpriseWorkflowStepRun", "EnterpriseDomainEvent"]) ok(migration.includes(`CREATE TABLE "${table}"`), `Sprint 9 migration missing ${table}`);
ok(!/DROP\s+(TABLE|COLUMN)/i.test(migration), "Sprint 9 migrations must not drop Sprint 6-8 tables or columns.");
ok(migration.includes("EnterpriseWorkflowVersion_one_published_per_definition"), "Database must enforce one published version per definition.");
ok(migration.includes("EnterpriseWorkflowRun_single_active_key"), "Database must guard duplicate active runs.");
ok(migration.includes("enqueueEnterpriseWorkflowDomainEvent") && migration.includes("AFTER INSERT ON \"EnterpriseOperationalEvent\""), "Transactional operational-event outbox trigger is required.");

const constants = includes("lib/enterprise/workflows/constants.ts", ["WORKFLOW_STEP_TYPES", "WORKFLOW_TRIGGER_TYPES", "WORKFLOW_CONDITION_OPERATORS", "WORKFLOW_ASSIGNMENT_STRATEGIES", "WORKFLOW_DOMAIN_EVENTS", "maxAttempts: 3", "workerBatchSize: 20"]);
for (const stepType of ["START", "CONDITION", "ASSIGN", "CREATE_APPROVAL", "CREATE_TASK", "DOMAIN_ACTION", "NOTIFICATION", "WAIT_UNTIL", "END"]) ok(constants.includes(`"${stepType}"`), `Missing bounded step type ${stepType}`);
ok(!constants.includes("BPMN") && !constants.includes("JAVASCRIPT") && !constants.includes("HTTP_REQUEST"), "Sprint 9 must not introduce BPMN, arbitrary scripts or arbitrary HTTP steps.");

const validators = includes("lib/enterprise/workflows/validators.ts", ["z.discriminatedUnion", "workflowConditionSchema", "workflowAssignmentSchema", "workflowVersionSchema", "workflowManualStartSchema", "workflowRetrySchema", "workflowCancelSchema", "ENTITY_DATE", "RELATIVE_HOURS"]);
ok(!validators.includes("z.any()"), "Workflow step configuration must remain typed, not z.any().");
const graph = includes("lib/enterprise/workflows/graph.ts", ["MISSING_START", "MULTIPLE_START", "MISSING_END", "ORPHAN_STEP", "CYCLE_NOT_ALLOWED", "UNREACHABLE_STEP", "AMBIGUOUS_BRANCH"]);
ok(graph.includes("CONDITION_BRANCHES_REQUIRED") && graph.includes("APPROVAL_BRANCHES_REQUIRED"), "Publication readiness must validate explicit condition and approval outcomes.");

const adapters = includes("lib/enterprise/workflows/adapters/index.ts", ["getWorkflowEntityAdapter", "transitionEnterpriseTask", "transitionEnterpriseRequest", "transitionEnterpriseMeeting", "transitionEnterprisePurchase", "transitionEnterpriseBudget", "transitionEnterpriseExpense", "transitionEnterpriseReport", "Prisma.Decimal"]);
for (const entity of ["EnterpriseTask", "EnterpriseRequest", "EnterpriseMeeting", "EnterprisePurchase", "EnterpriseBudget", "EnterpriseExpense", "EnterpriseReport"]) ok(adapters.includes(`${entity}:`), `Static adapter missing ${entity}`);
ok(!/prisma\s*\[/.test(adapters), "Dynamic Prisma model selection is forbidden.");
const workflowLibFiles = fs.readdirSync(path.join(root, "lib/enterprise/workflows"), { recursive: true }).filter((entry) => typeof entry === "string" && entry.endsWith(".ts")).map((entry) => read(path.join("lib/enterprise/workflows", entry))).join("\n");
for (const model of ["enterpriseTask", "enterpriseRequest", "enterpriseMeeting", "enterprisePurchase", "enterpriseBudget", "enterpriseExpense", "enterpriseReport"]) ok(!workflowLibFiles.includes(`prisma.${model}.update({`) && !workflowLibFiles.includes(`prisma.${model}.updateMany({`), `Workflow engine must not directly patch ${model} status/state.`);

const definitions = includes("lib/enterprise/workflows/definitions.ts", ["PUBLISHED_WORKFLOW_IMMUTABLE", "getWorkflowVersionReadiness", "publishWorkflowVersion", "duplicateWorkflowVersion", "validateTemplatePlaceholders", "INVALID_DOMAIN_ACTION"]);
ok(definitions.includes("EnterpriseReport") && definitions.includes("APPROVAL_TARGET_UNSUPPORTED"), "Publication must reject unsupported report approvals.");
const engine = includes("lib/enterprise/workflows/engine.ts", ["startWorkflowRun", "advanceWorkflowRun", "executeWorkflowStep", "resumeWorkflowFromApproval", "resumeWaitingRuns", "retryWorkflowStep", "cancelWorkflowRun", "processWorkflowDomainEvent"]);
ok(engine.includes("workflowVersionId: version.id"), "Runs must pin their initial workflow version.");
ok(engine.includes("WORKFLOW_MAX_ATTEMPTS_REACHED") || read("lib/enterprise/workflows/action-attempts.ts").includes("WORKFLOW_MAX_ATTEMPTS_REACHED"), "Retries must be bounded.");
ok(engine.includes("WAITING_APPROVAL") && engine.includes("WAITING_TIME") && engine.includes("BLOCKED"), "Runtime must persist waiting and blocked states.");

const createApproval = includes("lib/enterprise/workflows/steps/create-approval.ts", ["createEnterpriseApproval", "createEnterprisePurchaseApproval", "createEnterpriseBudgetApproval", "createEnterpriseExpenseApproval", "WORKFLOW_SELF_APPROVAL_BLOCKED", "workflowRunId", "workflowStepRunId"]);
ok(!createApproval.includes("enterpriseApproval.create({"), "Approval steps must reuse authoritative approval services.");
const createTask = includes("lib/enterprise/workflows/steps/create-task.ts", ["createEnterpriseTask", "sourceEntityType", "sourceEntityId", "beginWorkflowActionAttempt"]);
ok(!createTask.includes("enterpriseTask.create({"), "Task steps must reuse Sprint 6 task service.");
const notification = includes("lib/enterprise/workflows/steps/notification.ts", ["notifyUser", "idempotencyKey", "resolveWorkflowAssignment"]);
ok(notification.includes("organizationId: run.organizationId"), "Workflow notifications must remain organization-scoped.");
const wait = includes("lib/enterprise/workflows/steps/wait-until.ts", ["RELATIVE_HOURS", "WAITING_TIME", "resumeAt", "adapter.conditionFields"]);
ok(wait.includes("Date.now()"), "Wait steps must resolve to durable dates, not open HTTP requests.");

const worker = includes("lib/enterprise/workflows/worker.ts", ["FOR UPDATE SKIP LOCKED", "lockedBy", "workerBatchSize", "DEAD", "processPendingWorkflowEvents"]);
ok(worker.includes("attemptCount") && worker.includes("availableAt"), "Worker must use bounded retries and backoff.");
const workerRoute = includes("app/api/internal/workflows/process/route.ts", ["WORKFLOW_WORKER_SECRET", "timingSafeEqual", "Bearer", "maxDuration", "processPendingWorkflowEvents"]);
ok(!workerRoute.includes("isSameOriginRequest"), "Server worker route must use dedicated secret authentication rather than browser same-origin semantics.");

const mutatingRoutes = [
  "app/api/enterprise/[organizationId]/workflows/route.ts",
  "app/api/enterprise/[organizationId]/workflows/[id]/route.ts",
  "app/api/enterprise/[organizationId]/workflows/[id]/versions/route.ts",
  "app/api/enterprise/[organizationId]/workflows/[id]/versions/[versionId]/route.ts",
  "app/api/enterprise/[organizationId]/workflows/[id]/versions/[versionId]/publish/route.ts",
  "app/api/enterprise/[organizationId]/workflows/[id]/versions/[versionId]/retire/route.ts",
  "app/api/enterprise/[organizationId]/workflow-runs/start/route.ts",
  "app/api/enterprise/[organizationId]/workflow-runs/[id]/retry/route.ts",
  "app/api/enterprise/[organizationId]/workflow-runs/[id]/cancel/route.ts",
];
for (const route of mutatingRoutes) {
  const content = read(route);
  ok(content.includes("isSameOriginRequest"), `${route}: same-origin guard missing.`);
  ok(content.includes("await rateLimit"), `${route}: awaited rateLimit missing.`);
  ok(content.includes("getEnterpriseWorkflowAccess"), `${route}: workflow membership/RBAC guard missing.`);
}

const access = includes("lib/enterprise/workflows/access.ts", ["activeContext !== \"ORGANIZATION\"", "activeOrganizationId !== organizationId", "organizationType: \"CLIENT\"", "removedAt: null", "canPublish", "canRetry", "canCancel"]);
ok(!access.includes("session.role === \"ADMIN\""), "Global DTSC ADMIN must not bypass client membership.");

const workspace = includes("components/enterprise/core-v2/enterprise-workflows-workspace.tsx", ["Définitions", "Exécutions", "À surveiller", "readiness", "Ajouter une étape structurée", "Timeline du workflow", "Réessayer l’étape", "Cancel workflow run"]);
ok(workspace.includes("BusinessList") && workspace.includes("ModuleMetrics"), "Workflow UI must follow the mobile-first workspace architecture.");
ok(workspace.includes("Ready to publish") && workspace.includes("Publication blockers"), "Workflow readiness must be explicit in FR/EN.");
const moduleWorkspace = read("components/enterprise/enterprise-module-workspace.tsx");
ok(moduleWorkspace.includes("EnterpriseWorkflowsWorkspace") && moduleWorkspace.includes('enterpriseModule.code === "WORKFLOWS"'), "WORKFLOWS module must mount the dedicated Sprint 9 workspace.");

const legacyLoader = read("lib/enterprise/enterprise-workflows-loader.ts");
const legacyActivityLoader = read("lib/enterprise/enterprise-activity-workflows-loader.ts");
ok(legacyLoader.includes("prisma.enterpriseWorkflow") && legacyActivityLoader.includes("prisma.enterpriseWorkflow"), "Legacy workflow catalog/loaders must remain available.");
ok(workspace.includes("CATALOG") || workspace.includes("Catalogue historique"), "UI must explain that legacy workflows are read-only catalog entries.");

ok(exists("lib/enterprise/workflows/AGENTS.md"), "Scoped permanent workflow-engine rules are required.");
ok(exists("docs/ENTERPRISE_WORKFLOW_ENGINE.md"), "Workflow engine technical/operations documentation is required.");
const vercel = read("vercel.json");
ok(vercel.includes('"main": true') && vercel.includes('"*": false') && vercel.includes("ignoreCommand"), "Vercel must remain production-only from main.");
const vercelScript = read("vercel.sh");
ok(vercelScript.includes("pnpm prisma migrate deploy") && vercelScript.includes("pnpm build"), "Production must apply migrations before build.");

if (failures.length) { console.error("Enterprise Workflow Engine Sprint 9 QA failed:\n- " + failures.join("\n- ")); process.exit(1); }
console.log("Enterprise Workflow Engine Sprint 9 QA passed: versioned DAG definitions, typed steps, static domain adapters, transactional outbox, idempotent sequential approvals/actions, bounded worker, tenant RBAC, monitoring UI and production-only Vercel policy verified.");
