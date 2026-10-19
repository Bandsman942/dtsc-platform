import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

// #861: exercise the real CREATE_APPROVAL handler with a bounded in-memory
// Prisma adapter. This is a handler contract test, NOT a replacement for
// real accounting decision/Postgres services or an OWNER_E2E.
let approval = null;
let approveAllowed = true;
let requesterActive = true;
let attemptCreated = false;
let approveCount = 0;
const prisma = {
  enterpriseApproval: {
    async findFirst({where}) {
      if (where.workflowRunId) return approval?.workflowRunId === where.workflowRunId
        && approval.workflowStepRunId === where.workflowStepRunId ? {...approval} : null;
      return approval && approval.targetEntityType === where.targetEntityType
        && approval.targetEntityId === where.targetEntityId
        && approval.organizationId === where.organizationId ? {...approval} : null;
    },
    async updateMany({where,data}) {
      if (!approval || approval.workflowRunId || approval.workflowStepRunId ||
          approval.id !== where.id || approval.status !== where.status ||
          approval.revision !== where.revision || approval.organizationId !== where.organizationId) return {count:0};
      approval = {...approval,...data};
      return {count:1};
    },
  },
  organizationMember: {
    async findFirst({where}) { return requesterActive && where.userId === "maker" && where.organizationId === "tenant"
      ? {userId:"maker"} : null; },
  },
};
const load = workflowTestLoader({
  "@/lib/prisma": {prisma},
  "@/lib/enterprise/module-access": {
    resolveEnterpriseModuleAccess: async ({userId, organizationId, moduleCode, action}) => {
      approveCount++;
      return {allowed: approveAllowed && userId === "checker" && organizationId === "tenant"
        && moduleCode === "FINANCE_BUDGETS" && action === "approve"};
    },
  },
  "@/lib/enterprise/workflows/runtime-utils": {
    workflowSourceModule: () => "FINANCE_BUDGETS",
    resolveWorkflowExecutionUser: async () => "maker",
  },
  "@/lib/enterprise/workflows/adapters": { resolveWorkflowAssignment: () => { throw Error("Canonical step must not invent an approver"); }},
  "@/lib/enterprise/workflows/action-attempts": {
    beginWorkflowActionAttempt: () => { attemptCreated = true; throw Error("must not create action"); },
    completeWorkflowActionAttempt: () => { throw Error("must not write another action"); },
    failWorkflowActionAttempt: () => {},
  },
});
const {executeCreateApprovalStep} = load("@/lib/enterprise/workflows/steps/create-approval");
const {ENTERPRISE_WORKFLOW_TEMPLATES} = load("@/lib/enterprise/workflows/templates");

const source = readFileSync("app/api/internal/workflows/process/route.ts","utf8");
const isolated = readFileSync("lib/enterprise/workflows/worker-isolated.ts","utf8");
const worker = readFileSync("lib/enterprise/workflows/worker.ts","utf8");
const cutoff = readFileSync("lib/enterprise/workflows/event-recovery.ts","utf8");

const { isSharedCronDispatchPaused } = load("@/lib/scheduled-cron-activation");
const otherCrons = [
  ["app/api/internal/web-push/process/route.ts","WEB_PUSH_CRON_ENABLED"],
  ["app/api/internal/cross-module-projections/process/route.ts","CROSS_MODULE_PROJECTIONS_CRON_ENABLED"],
  ["app/api/internal/admin-broadcast-email/process/route.ts","ADMIN_BROADCAST_EMAIL_CRON_ENABLED"],
  ["app/api/internal/knowledge-index/process/route.ts","KNOWLEDGE_INDEX_CRON_ENABLED"],
  ["app/api/internal/enterprise-bulk/process/route.ts","ENTERPRISE_BULK_CRON_ENABLED"],
  ["app/api/internal/report-schedules/process/route.ts","REPORT_SCHEDULES_CRON_ENABLED"],
  ["app/api/internal/identity-links/expire/route.ts","IDENTITY_LINKS_CRON_ENABLED"],
];
for (const [route, flag] of otherCrons) {
  const contents = readFileSync(route,"utf8");
  assert.ok(contents.includes('isSharedCronDispatchPaused(request, "'+flag+'")'),
    "Restoring CRON_SECRET must not automatically start "+route);
  assert.ok(/if\s*\(\s*!\s*auth\.ok\s*\)/.test(contents)
    || /if\s*\(\s*!\s*authorize\(request\)\s*\)/.test(contents),
    "Existing authentication must remain before cron opt-in on "+route);
}
const oldCronEnv = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  CRON_SECRET: process.env.CRON_SECRET,
  WEB_PUSH_CRON_ENABLED: process.env.WEB_PUSH_CRON_ENABLED,
};
try {
  process.env.VERCEL_ENV = "production";
  process.env.CRON_SECRET = "isolated-qa-cron-secret";
  delete process.env.WEB_PUSH_CRON_ENABLED;
  const req = (secret) => ({ headers: { get: (name) =>
    name === "authorization" ? "Bearer "+secret : null } });
  assert.equal(isSharedCronDispatchPaused(req("isolated-qa-cron-secret"), "WEB_PUSH_CRON_ENABLED"),true);
  assert.equal(isSharedCronDispatchPaused(req("distinct-worker-secret"), "WEB_PUSH_CRON_ENABLED"),false,
    "Dedicated worker secret must retain its preexisting manual contract");
  process.env.WEB_PUSH_CRON_ENABLED = "true";
  assert.equal(isSharedCronDispatchPaused(req("isolated-qa-cron-secret"), "WEB_PUSH_CRON_ENABLED"),false);
  process.env.WEB_PUSH_CRON_ENABLED = "false";
  assert.equal(isSharedCronDispatchPaused(req("isolated-qa-cron-secret"), "WEB_PUSH_CRON_ENABLED"),true);
  process.env.VERCEL_ENV = "preview";
  assert.equal(isSharedCronDispatchPaused(req("isolated-qa-cron-secret"), "WEB_PUSH_CRON_ENABLED"),false);
} finally {
  for (const [key,value] of Object.entries(oldCronEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

const sourceOptions = readFileSync("lib/enterprise/workflows/manual-source-options.ts","utf8");
const sourceRoute = readFileSync("app/api/enterprise/[organizationId]/workflow-runs/sources/route.ts","utf8");
const sourceGuard = readFileSync("lib/enterprise/workflows/manual-source-access.ts","utf8");
assert.ok(sourceRoute.includes("findWorkflowManualSources") && sourceGuard.includes("findWorkflowManualSources"), "Both source picker and POST must use shared tenant/state/actor checks");
for (const sourceType of ["EnterpriseSupplierInvoice","EnterprisePayment","EnterpriseCashSession","EnterpriseJournalEntry","EnterpriseFinancialClose"]) {
  assert.ok(sourceOptions.includes('case "'+sourceType+'":'), "missing tenant-bounded manual options for "+sourceType);
}
assert.ok(sourceOptions.includes('paymentType: "SUPPLIER_PAYMENT"'), "supplier-payment selector must not show other payment types");
assert.ok(sourceOptions.includes('"PENDING_VALIDATION"'), "cash selector must use the canonical PENDING_VALIDATION status, not SUBMITTED");
assert.ok(sourceOptions.includes('fiscalPeriod: { select: { code: true } }'), "financial-close selector must show a business period code");
assert.ok(source.includes('WORKFLOW_WORKER_ENABLED') && source.includes('dryRun') && source.includes('getWorkflowQueueSnapshot'));
assert.ok(isolated.includes('workflowEventClaimCutover') && worker.includes('workflowEventClaimCutover'));
assert.ok(isolated.includes('AND "createdAt" >= ${cutover}') && worker.includes('AND "createdAt" >= ${cutover}'));
assert.ok(cutoff.includes('VERCEL_ENV !== "production"'));
assert.ok(cutoff.includes('WORKFLOW_EVENT_CUTOVER_AT'));
assert.ok(cutoff.includes("72 * 60 * 60_000"), "production cutover older than 72h must fail closed");
assert.ok(cutoff.includes('9999-12-31'), "Unconfigured production worker must not claim historic events");

const supplierPayment = ENTERPRISE_WORKFLOW_TEMPLATES.find(x => x.code === "SUPPLIER_PAYMENT_APPROVAL_CONFIRMATION");
assert.ok(supplierPayment?.version.steps.some(s=>s.stepType==="CONDITION"
  && s.configuration.condition.field==="paymentType"
  && s.configuration.condition.value==="SUPPLIER_PAYMENT"), "generic PAYMENT_SUBMIT must be type-gated");
assert.ok(supplierPayment.version.transitions.some(t=>t.fromStepCode==="IS_SUPPLIER_PAYMENT"&&t.outcome==="FALSE"&&t.toStepCode==="END_OUT_OF_SCOPE"),
  "non-supplier payment must never request an unrelated approval");
const expected = new Map([
  ["SUPPLIER_INVOICE_REVIEW_APPROVAL_POSTING",["EnterpriseSupplierInvoiceReview","EnterpriseSupplierInvoiceApproval"]],
  ["SUPPLIER_PAYMENT_APPROVAL_CONFIRMATION",["EnterprisePayment"]],
  ["CASH_SESSION_INDEPENDENT_CLOSE",["EnterpriseCashSession"]],
  ["MANUAL_JOURNAL_APPROVAL_POSTING",["EnterpriseJournalEntry"]],
  ["FISCAL_PERIOD_CLOSE_REVIEW",["EnterpriseFinancialClose"]],
]);
for (const [code, targets] of expected) {
  const t=ENTERPRISE_WORKFLOW_TEMPLATES.find(x=>x.code===code);
  assert.ok(t,code+" must exist");
  assert.deepEqual(t.version.steps.filter(s=>s.stepType==="CREATE_APPROVAL").map(s=>s.configuration.canonicalApprovalTarget),targets);
  assert.ok(!t.version.steps.some(s=>s.stepType==="DOMAIN_ACTION"),code+" cannot auto-post/confirm/close");
}
const run={id:"run",organizationId:"tenant",sourceEntityType:"EnterpriseExpense",sourceEntityId:"expense",startedByUserId:"maker",executionToken:"token"};
const step={id:"step",code:"APPROVAL",name:"Approve",stepType:"CREATE_APPROVAL",configurationJson:{
  assignment:{strategy:"DEPARTMENT_MANAGER"},canonicalApprovalTarget:"EnterprisePayment",
}};
const stepRun={id:"step-run",status:"RUNNING",attemptCount:1,assignedUserId:null,startedAt:null,outputJson:null};
const adapter={canonicalApprovalTargets:new Set(["EnterprisePayment"]),createApproval:()=>{throw Error("cannot create finance approval");}};
const context={run,step,stepRun,workflowName:"Test",adapter,entity:{id:"expense",organizationId:"tenant",revision:1}};
const make = (status="PENDING", overrides={}) => ({
  id:"approval",organizationId:"tenant",targetEntityType:"EnterprisePayment",targetEntityId:"expense",
  requestedByUserId:"maker",approverUserId:"checker",status,revision:1,workflowRunId:null,workflowStepRunId:null,...overrides,
});
const rejects = async code => assert.rejects(executeCreateApprovalStep(context),e=>e.code===code,"Expected "+code);
approval=null;
await rejects("WORKFLOW_CANONICAL_APPROVAL_MISSING");
approval=make("PENDING",{organizationId:"other"});
await rejects("WORKFLOW_CANONICAL_APPROVAL_MISSING");
approval=make("PENDING",{approverUserId:"maker"});
await rejects("WORKFLOW_SELF_APPROVAL_BLOCKED");
approval=make(); approveAllowed=false;
await rejects("WORKFLOW_APPROVER_MODULE_DENIED"); approveAllowed=true;
approval=make(); requesterActive=false;
await rejects("WORKFLOW_EXECUTION_MANDATE_REVOKED"); requesterActive=true;
approval=make(); const pending=await executeCreateApprovalStep(context);
assert.equal(pending.kind,"WAITING"); assert.equal(pending.runStatus,"WAITING_APPROVAL");
assert.equal(approval.workflowRunId,"run"); assert.equal(approval.workflowStepRunId,"step-run");
const repeated=await executeCreateApprovalStep(context);
assert.equal(repeated.kind,"WAITING"); assert.equal(approval.id,"approval");
approval.status="APPROVED";
const done=await executeCreateApprovalStep(context);
assert.equal(done.kind,"SUCCEEDED");assert.equal(done.outcome,"APPROVED");
const again=await executeCreateApprovalStep(context);
assert.equal(again.kind,"SUCCEEDED");
assert.equal(attemptCreated,false,"no shadow approval or non-idempotent effect");
assert.ok(approveCount>1,"permissions must be checked for canonical attachment");
console.log("PASS HOTFIX #861: finance approval attach, live rights, multi-tenant, SoD, duplicate, guarded cutoff and all five finance template contracts");
