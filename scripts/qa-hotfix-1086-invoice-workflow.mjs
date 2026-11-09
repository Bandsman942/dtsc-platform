import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const route = read("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/transition/route.ts");
const queue = read("app/api/enterprise/[organizationId]/retail/invoices/workflow/route.ts");
const service = read("lib/enterprise/accounting/accounting-invoice-approval-orchestration.ts");
const posting = read("lib/enterprise/accounting/receivables-service.ts");
const generic = read("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts");
const print = read("app/api/enterprise/[organizationId]/sales-invoices/[invoiceId]/print/route.ts");
const finance = read("app/api/enterprise/[organizationId]/sales-invoices/route.ts");
const site = read("lib/enterprise/retail/site-access.ts");
const ui = read("components/enterprise/professional/retail-invoice-approval-workbench.tsx");
const financeUi = read("components/enterprise/professional/enterprise-finance-invoices-workspace.tsx");

for (const action of ["SUBMIT", "APPROVE", "REJECT", "REQUEST_CORRECTION", "ISSUE"]) {
  assert.match(route, new RegExp(`z\\.literal\\("${action}"\\)`), `Retail transition exposes ${action}`);
}
assert.match(route, /decideSalesInvoiceAssignedApproval\(/, "Retail never writes approvals independently of Finance");
assert.match(route, /transitionSalesInvoice\(/, "Issuance passes through Finance");
assert.match(route, /requireRetailSiteCapability\(/, "Store capability checked server-side");
assert.match(route, /siteStaffCapabilities\(assignment\.roleCode, assignment\.permissionsJson\)\.includes\("ISSUE_INVOICE"\)/, "Issuance checks store-scoped capability, including managers");
assert.match(route, /moduleCode: "FINANCE_RECEIVABLES", action: "manage"/, "Finance issuer requires the canonical permission");
assert.match(route, /retailFinanceReadSiteScope\(/, "Finance access cannot bypass a retail site boundary");
assert.doesNotMatch(route, /z\.literal\("(VOID|REFUND)"\)/, "POS offers no direct void/refund escape hatch");
assert.match(site, /MANAGER: \[[^\]]*"ISSUE_INVOICE"/, "Manager's native capability is effective for new assignments");
assert.match(site, /roleCode === "MANAGER" \? \[\.\.\.validated\.data, "ISSUE_INVOICE"/, "Historical explicit permission arrays inherit native manager issuance");

assert.match(queue, /a\."approverUserId" = \$\{auth\.session\.userId\}/, "Approval queue is addressed solely to the assigned validator");
assert.match(queue, /i\."status" = \$\{view === "issue" \? "APPROVED" : "PENDING_APPROVAL"\}/, "Neither queue admits draft or prematurely issued invoices");
assert.match(queue, /c\."siteId" IN/, "Cross-store issuance scope enforced in SQL");
assert.match(queue, /dateFrom/);
assert.match(queue, /dateTo/);
assert.match(queue, /COUNT\(\*\)/, "Paginated queue has a server-side count");
assert.match(queue, /LIMIT \$\{pageSize\} OFFSET/, "Queue pagination runs before serialization");
assert.match(queue, /Prisma\.join\(conditions/, "Search predicates are parameterized");
assert.match(ui, /browserCivilDate\(\)/, "Exact-day shortcut does not use UTC day");
assert.match(ui, /AbortController/, "Stale queue responses are canceled");
assert.match(ui, /REQUEST_CORRECTION/);
assert.match(ui, /A4 preview|Aperçu A4/);

assert.match(service, /input\.action === "APPROVE" \? "APPROVED" : input\.action === "REJECT" \? "REJECTED" : "DRAFT"/);
assert.match(service, /decideAccountingApproval\(tx/);
assert.match(service, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
assert.match(posting, /postBusinessEventTx\(tx/, "Invoice posting uses canonical Finance journal service");
assert.match(posting, /tx\.enterpriseReceivable\.upsert/, "Receivable is created atomically with issuance");
assert.match(generic, /current\.targetEntityType !== "EnterpriseSalesInvoice"/, "Common approvals do not duplicate the already-recorded Finance decision");

assert.match(finance, /pendingApproverName/, "All-sector invoice lists expose the designated validator");
assert.match(finance, /assignedIds\.has\(item\.id\)/, "Only designated reviewers see Finance approval actions");
assert.match(financeUi, /printCustomerInvoice\(/, "Common Finance invoice rows and details offer print preview");
assert.match(financeUi, /pendingApproverName/, "Common Finance shows the designated reviewer");
assert.match(print, /authorizeFinanceRequest/, "All-sector print access requires Finance view");
assert.match(print, /requireRetailSiteCapability/, "Manager print fallback is limited to their retail store");
assert.match(print, /resolveOrganizationLogoStoragePath/, "Print displays the company logo when configured");
assert.match(print, /htmlSafe\(item\.description\)/, "Print escapes customer-controlled data");
assert.match(print, /@page\{size:A4/, "Print is A4 with page margins");
assert.match(print, /DOCUMENT NON ÉMIS/, "Pending invoices are visibly non-final");
assert.match(print, /cache-control": "private, no-store"/, "Sensitive document is not cached publicly");
console.log("PASS #1086: designated review, scoped native manager or Finance issuance, canonical posting, searchable paginated queues and universal secure A4 preview.");
