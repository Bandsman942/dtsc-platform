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
assert.ok(source.includes('WORKFLOW_WORKER_ENABLED') && source.includes('dryRun') && source.includes('getWorkflowQueueSnapshot'));
assert.ok(isolated.includes('workflowEventClaimCutover') && worker.includes('workflowEventClaimCutover'));
assert.ok(isolated.includes('AND "createdAt" >= ${cutover}') && worker.includes('AND "createdAt" >= ${cutover}'));
assert.ok(cutoff.includes('VERCEL_ENV !== "production"'));
assert.ok(cutoff.includes('WORKFLOW_EVENT_CUTOVER_AT'));
assert.ok(cutoff.includes('9999-12-31'), "Unconfigured production worker must not claim historic events");

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
