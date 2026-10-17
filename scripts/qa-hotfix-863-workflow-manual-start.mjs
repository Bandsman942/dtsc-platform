import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

/** No connection to Production: test the actual TS predicates with an isolated Prisma test double. */
const cases = [
  { code: "REQUEST_MANAGER_APPROVAL", type: "EnterpriseRequest", db: "enterpriseRequest", owner: "requestedByUserId", good: "SUBMITTED" },
  { code: "PURCHASE_APPROVAL", type: "EnterprisePurchase", db: "enterprisePurchase", owner: "buyerUserId", good: "SUBMITTED" },
  { code: "BUDGET_APPROVAL", type: "EnterpriseBudget", db: "enterpriseBudget", owner: "ownerUserId", good: "PENDING_APPROVAL", bad: "CLOSED" },
  { code: "EXPENSE_APPROVAL", type: "EnterpriseExpense", db: "enterpriseExpense", owner: "requestedByUserId", good: "PENDING_APPROVAL", bad: "APPROVED" },
  { code: "SUPPLIER_INVOICE_REVIEW_APPROVAL_POSTING", type: "EnterpriseSupplierInvoice", db: "enterpriseSupplierInvoice", owner: "createdByUserId", good: "PENDING_REVIEW", bad: "DRAFT" },
  { code: "SUPPLIER_PAYMENT_APPROVAL_CONFIRMATION", type: "EnterprisePayment", db: "enterprisePayment", owner: "initiatedByUserId", good: "PENDING_APPROVAL", bad: "CONFIRMED" },
  { code: "CASH_SESSION_INDEPENDENT_CLOSE", type: "EnterpriseCashSession", db: "enterpriseCashSession", owner: "cashierUserId", good: "PENDING_VALIDATION", bad: "OPEN" },
  { code: "MANUAL_JOURNAL_APPROVAL_POSTING", type: "EnterpriseJournalEntry", db: "enterpriseJournalEntry", owner: "preparedByUserId", good: "PENDING_APPROVAL", bad: "DRAFT" },
  { code: "FISCAL_PERIOD_CLOSE_REVIEW", type: "EnterpriseFinancialClose", db: "enterpriseFinancialClose", owner: "requestedByUserId", good: "PENDING_APPROVAL", bad: "PREPARING" },
];

function matchWhere(row, where) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "OR") return expected.some((candidate) => matchWhere(row, candidate));
    const actual = row[key];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if (Object.hasOwn(expected, "in")) return expected.in.includes(actual);
      if (Object.hasOwn(expected, "not")) return actual !== expected.not;
    }
    return actual === expected;
  });
}
const fixtures = Object.fromEntries(cases.map((spec) => [spec.db, []]));
const databaseCalls = [];
const db = Object.fromEntries(cases.map((spec) => [spec.db, {
  async findMany({ where, take, select }) {
    databaseCalls.push({ entity: spec.type, where });
    const matching = fixtures[spec.db].filter((row) => matchWhere(row, where)).slice(0, take);
    return matching.map((row) => Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])));
  },
}]));
const load = workflowTestLoader({ "@/lib/prisma": { prisma: db } });
const { findWorkflowManualSources } = load("@/lib/enterprise/workflows/manual-source-options");
const { isWorkflowManualSourceSelectable } = load("@/lib/enterprise/workflows/manual-source-access");
const {
  workflowManualEntityLabel, workflowManualModuleLinkLabel, workflowManualEmptyMessage,
} = load("@/lib/enterprise/workflows/manual-start-copy");
const { ENTERPRISE_WORKFLOW_TEMPLATES } = load("@/lib/enterprise/workflows/templates");

assert.equal(ENTERPRISE_WORKFLOW_TEMPLATES.length, 9, "Exactly nine canonical templates");
const byCode = new Map(ENTERPRISE_WORKFLOW_TEMPLATES.map((t) => [t.code, t]));
for (const spec of cases) {
  assert.equal(byCode.get(spec.code)?.triggerEntityType, spec.type, spec.code + " must match source type");
  const archivedAt = null;
  const own = {
    id: spec.code + "-owner",
    organizationId: "tenant-a", archivedAt,
    status: spec.good, title: "Example", reference: "TEST-001", number: "TEST-001",
    fiscalPeriod: { code: "FY-TEST" }, paymentType: "SUPPLIER_PAYMENT",
    [spec.owner]: "actor-a",
  };
  const other = { ...own, id: spec.code + "-other", [spec.owner]: "actor-b" };
  const foreign = { ...own, id: spec.code + "-foreign", organizationId: "tenant-b" };
  const hasArchivePredicate = !["EnterprisePayment", "EnterpriseCashSession", "EnterpriseJournalEntry", "EnterpriseFinancialClose"].includes(spec.type);
  const inactive = hasArchivePredicate ? { ...own, id: spec.code + "-inactive", archivedAt: new Date("2025-01-01") } : null;
  const badStatus = spec.bad ? { ...own, id: spec.code + "-wrong-status", status: spec.bad } : null;
  const wrongSubtype = spec.type === "EnterprisePayment" ? { ...own, id: spec.code + "-other-payment", paymentType: "CUSTOMER_PAYMENT" } : null;
  fixtures[spec.db] = [own, other, foreign, ...(inactive ? [inactive] : []), ...(badStatus ? [badStatus] : []), ...(wrongSubtype ? [wrongSubtype] : [])];
  const picker = await findWorkflowManualSources({ organizationId: "tenant-a", userId: "actor-a", entityType: spec.type, allowAll: false });
  assert.deepEqual(picker.map((row) => row.id), [own.id], spec.code + " picker must reveal only owned eligible rows");
  assert.equal(await isWorkflowManualSourceSelectable({ organizationId: "tenant-a", userId: "actor-a", entityType: spec.type, entityId: own.id, allowAll: false }), true);
  for (const row of [other, foreign, inactive, badStatus, wrongSubtype].filter(Boolean)) {
    assert.equal(await isWorkflowManualSourceSelectable({ organizationId: "tenant-a", userId: "actor-a", entityType: spec.type, entityId: row.id, allowAll: false }), false, spec.code + " must reject " + row.id);
  }
  const supervisor = await findWorkflowManualSources({ organizationId: "tenant-a", userId: "actor-a", entityType: spec.type, allowAll: true });
  assert.deepEqual(supervisor.map((row) => row.id), [own.id, other.id], "Supervisor sees only same-company eligible sources");
  assert.equal(await isWorkflowManualSourceSelectable({ organizationId: "tenant-a", userId: "actor-a", entityType: spec.type, entityId: other.id, allowAll: true }), true);
  assert.equal(await isWorkflowManualSourceSelectable({ organizationId: "tenant-b", userId: "actor-a", entityType: spec.type, entityId: own.id, allowAll: true }), false);
  if (badStatus) {
    const allStates = await findWorkflowManualSources({ organizationId: "tenant-a", userId: "actor-a", entityType: spec.type, allowAll: true, includeIneligibleStatus: true });
    assert.ok(allStates.some((row) => row.id === badStatus.id), "Only supervisor may diagnose source status");
    assert.ok(!supervisor.some((row) => row.id === badStatus.id), "Ineligible source must not be selectable");
  }
  assert.ok(workflowManualEntityLabel(spec.type, false) && workflowManualEntityLabel(spec.type, true));
  assert.ok(!workflowManualEntityLabel(spec.type, false).startsWith("Enterprise"), "No raw ORM name in UI");
  if (spec.type.startsWith("Enterprise") && ["SupplierInvoice", "Payment", "CashSession", "JournalEntry", "FinancialClose"].some((part) => spec.type.endsWith(part))) {
    const label = workflowManualModuleLinkLabel(spec.type, false);
    assert.ok(label.startsWith("Ouvrir ") && !label.includes("Budgets"), spec.code + " must not link-label as Budget");
  }
  assert.ok(!byCode.get(spec.code).version.steps.some((s) => s.stepType === "DOMAIN_ACTION" && /POST|CLOSE|CONFIRM/.test(s.configuration?.action || "")), "No financial mutation");
}
assert.equal(await findWorkflowManualSources({ organizationId: "tenant-a", userId: "actor-a", entityType: "UnlistedPrismaDelegate", allowAll: true }), null);
assert.equal(await isWorkflowManualSourceSelectable({ organizationId: "tenant-a", userId: "actor-a", entityType: "UnlistedPrismaDelegate", entityId: "x", allowAll: true }), false);
assert.match(workflowManualEmptyMessage("EnterpriseCashSession", "NO_ELIGIBLE_RECORDS", false), /soumettez une clôture/i);
assert.match(workflowManualEmptyMessage("EnterpriseExpense", "NO_VISIBLE_RECORDS", false), /droits/i);
assert.match(workflowManualEmptyMessage("EnterprisePayment", "NO_RECORDS", true), /source module/i);
assert.ok(databaseCalls.every(({ where }) => where.organizationId), "Every lookup is scoped by organization");

const sourceRoute = readFileSync("app/api/enterprise/[organizationId]/workflow-runs/sources/route.ts", "utf8");
const startRoute = readFileSync("app/api/enterprise/[organizationId]/workflow-runs/start/route.ts", "utf8");
const manualGuard = readFileSync("lib/enterprise/workflows/manual-source-access.ts", "utf8");
const ui = readFileSync("components/enterprise/core-v2/enterprise-workflows-workspace.tsx", "utf8");
assert.ok(sourceRoute.includes("findWorkflowManualSources") && manualGuard.includes("findWorkflowManualSources"), "Picker and POST share predicates");
assert.ok(sourceRoute.includes("NO_ELIGIBLE_RECORDS") && sourceRoute.includes("NO_VISIBLE_RECORDS"), "Empty states are scoped");
assert.ok(sourceRoute.includes("requireWorkflowSourceAccess") && sourceRoute.includes("getEnterpriseWorkflowAccess"), "Read authorization retained");
assert.ok(startRoute.includes("isWorkflowManualSourceSelectable") && startRoute.includes('action: "submit"') && startRoute.includes("isSameOriginRequest") && startRoute.includes("rateLimit("), "POST security unchanged");
assert.ok(ui.includes("workflowManualModuleLinkLabel") && ui.includes("workflowManualEmptyMessage") && ui.includes("startLoadError"), "New UI uses canonical copy");
assert.ok(!ui.includes('en ? "Open Budgets and Expenses" : "Ouvrir Budgets et dépenses"'), "Generic wrong CTA removed");
console.log("PASS HOTFIX #863: nine template source contracts; same picker/POST predicates, tenant/actor/status/subtype fail-closed, ERP links, FR/EN and safe empty states");
