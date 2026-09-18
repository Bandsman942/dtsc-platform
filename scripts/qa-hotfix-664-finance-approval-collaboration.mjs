import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const json = (path) => JSON.parse(read(path));
const checks = [];
const check = (condition, label) => checks.push({ ok: Boolean(condition), label });
const hasAll = (source, markers) => markers.every((marker) => source.includes(marker));

const approvalSchemas = read("lib/enterprise/accounting/accounting-approval-schemas.ts");
const treasurySchemas = read("lib/enterprise/accounting/treasury-schemas.ts");
const http = read("lib/enterprise/accounting/http.ts");
const financeUi = read("components/enterprise/professional/finance-professional-ui.ts");
const shared = read("components/enterprise/professional/finance-professional-workspace-shared-legacy.tsx");
const commentsUi = read("components/enterprise/professional/professional-workflow-comments.tsx");
const commentsRoute = read("app/api/enterprise/[organizationId]/finance-comments/[entityType]/[entityId]/route.ts");
const cashUi = read("components/enterprise/professional/enterprise-finance-cash-workspace.tsx");
const paymentsUi = read("components/enterprise/professional/enterprise-finance-payments-workspace-hotfix.tsx");
const invoicesUi = read("components/enterprise/professional/enterprise-finance-invoices-workspace-hotfix.tsx");
const fr = json("locales/enterprise-finance.fr.json");
const en = json("locales/enterprise-finance.en.json");
const pkg = json("package.json");

check(hasAll(approvalSchemas, [
  "const optionalComment = z.string().trim().min(1).max(1000).optional()",
  'z.literal("APPROVE"), revision, reason: optionalComment',
  'const requiredReason = z.string().trim().min(4',
  'z.literal("REJECT"), revision, reason: requiredReason',
]), "assigned approval schemas accept short optional approval comments and retain explicit rejection reasons");
check(!approvalSchemas.includes("const reason = z.string().trim().min(4).max(1000).optional()"), "old optional-minimum-four approval comment contract is removed");

check(hasAll(treasurySchemas, [
  "cashValidateSchema",
  "z.string().trim().min(1).max(1000).optional()",
  "!value.approve && (!value.reason || value.reason.length < 4)",
]), "cash approval accepts short comments while rejection keeps a meaningful minimum");

check(hasAll(http, [
  "financeValidationErrorResponse",
  "FINANCE_INPUT_INVALID",
  "FINANCE_DECISION_REASON_TOO_SHORT",
  "fieldErrors",
  "ACCOUNTING_APPROVAL_CONFLICT",
]), "Finance HTTP exposes stable safe validation and workflow errors");

const decisionRoutes = [
  "app/api/enterprise/[organizationId]/journal-entries/[entryId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/payments/[paymentId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/sales-invoices/[invoiceId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/supplier-invoices/[invoiceId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/financial-close/[closeId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/reconciliations/[sessionId]/complete/route.ts",
  "app/api/enterprise/[organizationId]/opening-balances/[openingId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/sales-credit-notes/[creditNoteId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/supplier-credit-notes/[creditNoteId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/cash-sessions/[sessionId]/close/route.ts",
  "app/api/enterprise/[organizationId]/cash-sessions/[sessionId]/validate/route.ts",
  "app/api/enterprise/[organizationId]/cash-sessions/[sessionId]/approver/route.ts",
];
for (const path of decisionRoutes) {
  const source = read(path);
  check(source.includes("financeValidationErrorResponse(parsed.error)"), `${path} uses the canonical validation-error response`);
  check(!source.includes('error: "Invalid payload"'), `${path} no longer leaks a generic Invalid payload contract`);
}

check(hasAll(financeUi, [
  "extractSafeFinanceClientMessage",
  'value.name !== "FinanceApiError"',
  "clientMessage",
  "PAYMENT_TRANSITION_INVALID",
  "SALES_INVOICE_TRANSITION_INVALID",
  "CASH_SESSION_CONFLICT",
]), "client Finance errors preserve safe server detail after known-code mapping");

check(hasAll(commentsRoute, [
  'EnterpriseSalesCreditNote: "FINANCE_RECEIVABLES"',
  'EnterpriseSupplierCreditNote: "FINANCE_PAYABLES"',
  'EnterpriseReceivable: "FINANCE_RECEIVABLES"',
  'EnterprisePayable: "FINANCE_PAYABLES"',
  "enterpriseSalesCreditNote.findFirst",
  "enterpriseSupplierCreditNote.findFirst",
  "enterpriseReceivable.findFirst",
  "enterprisePayable.findFirst",
  "organizationId",
]), "Finance comments support every entity type exposed by the shared collaboration surface with tenant scoping");

check(hasAll(shared, [
  't("financeCollaborationTitle")',
  't("financialDocuments")',
  't("viewLinkedDocuments")',
  't("addLinkedDocument")',
  "documentsHref",
  "uploadHref",
  'title={t("financeConversation")}',
  "collapsible",
  "defaultOpen={false}",
]), "shared Finance collaboration has professional document and collapsible conversation surfaces");

check(hasAll(commentsUi, [
  "aria-expanded={expanded}",
  "max-h-[min(48dvh,28rem)]",
  "overflow-y-auto",
  "data-no-group-swipe",
  "<textarea",
  "maxLength={4000}",
  "sticky bottom-0",
  'useToastMessage(error, "error")',
]), "workflow comments behave as a bounded mobile-safe conversation with a global error toast");

check(hasAll(cashUi, [
  'useToastMessage(message, "success")',
  'useToastMessage(error, "error")',
  'const [cashDecision, setCashDecision] = useState("true")',
  'minLength={cashDecision === "false" ? 4 : undefined}',
  'required={cashDecision === "false"}',
  't(cashDecision === "false" ? "rejectionReasonMinimumHint" : "decisionCommentOptionalHint")',
  "disabled={busy}",
]), "Cash decision UI aligns validation, guidance, toast and busy-state contracts");

check(hasAll(paymentsUi, [
  't("rejectionReasonMinimumHint")',
  't("decisionCommentOptionalHint")',
  'minLength={4}',
  "required",
]), "Payments explain required destructive reasons and optional approval comments");

check(hasAll(invoicesUi, [
  'const actionRequiresReason = Boolean(actionTarget && ["REJECT", "CANCEL", "VOID"].includes(actionTarget.action))',
  "minLength={actionRequiresReason ? 4 : undefined}",
  "required={actionRequiresReason}",
  't(actionRequiresReason ? "rejectionReasonMinimumHint" : "decisionCommentOptionalHint")',
]), "Invoice decisions keep UI and server reason requirements aligned");

for (const [locale, dictionary] of [["fr", fr], ["en", en]]) {
  for (const key of [
    "financeCollaborationTitle",
    "financialDocuments",
    "financialDocumentsDescription",
    "financialDocumentsPrivacy",
    "viewLinkedDocuments",
    "addLinkedDocument",
    "financeConversation",
    "financeConversationDescription",
    "decisionCommentOptionalHint",
    "rejectionReasonMinimumHint",
  ]) check(Boolean(dictionary[key]), `Finance ${locale} dictionary contains ${key}`);
}

check(pkg.scripts?.["qa:hotfix-664"] === "node scripts/qa-hotfix-664-finance-approval-collaboration.mjs", "hotfix 664 QA has a direct package script");
check(String(pkg.scripts?.["qa:regression"] || "").includes("qa-hotfix-664-finance-approval-collaboration.mjs"), "hotfix 664 QA is included in regression");

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"} #664 ${item.label}`);
if (failed.length) {
  console.error(`Hotfix #664 QA: ${failed.length} failure(s).`);
  process.exit(1);
}
console.log(`Hotfix #664 QA: PASS (${checks.length} controls).`);
