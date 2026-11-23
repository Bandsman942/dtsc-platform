import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = file("app/api/enterprise/[organizationId]/retail/returns/historical/route.ts");
const invoices = file("app/api/enterprise/[organizationId]/retail/invoices/route.ts");
const pos = file("components/enterprise/professional/retail-invoice-flow-workbench.tsx");
const recovery = file("components/enterprise/professional/retail-historical-return-recovery.tsx");
const reservations = file("lib/enterprise/retail/invoice-stock-holds.ts");
const finance = file("lib/enterprise/retail/invoice-return-finance.ts");

assert.match(route, /export async function GET\(/, "read-only recovery route required");
assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)\(/, "recovery browsing never mutates Finance");
assert.match(route, /authorizeRetailRequest\(req, organizationId, "RETAIL_POS", "read"\)/);
assert.match(route, /retailInvoiceVisibleSites\(organizationId, auth\.session\.userId\)/, "tenant and store visibility required");
assert.match(route, /!visible\.isOwner && !visible\.siteIds\.includes\(siteId\)/, "forbid another store");
assert.match(route, /\[\.\.\.OPEN\]/, "active return status constraint");
for (const status of ["SUBMITTED","INSPECTED","APPROVED","FINANCE_PENDING","REFUND_PENDING"]) {
  assert.ok(route.includes(status), `recovery must cover ${status}`);
}
for (const caseName of ["INSPECTION_REQUIRED", "RETURN_APPROVAL_REQUIRED", "FINANCE_PREPARATION_REQUIRED", "FINANCE_APPROVAL_REQUIRED", "INDEPENDENT_SETTLEMENT_REQUIRED", "REFUND_CONFIRMATION_REQUIRED", "FINANCE_CONFLICT_REVIEW"]) {
  assert.ok(route.includes(caseName) && recovery.includes(caseName), `guided recovery must cover ${caseName}`);
}
for (const field of ["stockPostedAt", "stockDisposition", "refundPayoutAmount", "salesCreditNote", "refundLegs", "returnPolicySnapshot"]) {
  assert.ok(route.includes(field), `recovery must inspect ${field}`);
}
assert.match(route, /readRetailInvoiceReturnPolicySnapshot\(item\.returnPolicySnapshot\)/, "historical policy remains immutable");
assert.match(route, /orderBy: \{ createdAt: "desc" \}.*skip:/s, "pagination is server-side");
assert.match(pos, /data-testid="retail-invoice-status-filter"/, "invoice register status UI required");
assert.match(pos, /invoiceStatusFilter \? \{ status: invoiceStatusFilter \}/, "status must be sent to server");
assert.match(pos, /setInvoiceStatusFilter\(event\.target\.value\); setPage\(1\)/, "status changes reset page");
assert.match(invoices, /supportedStatuses\.includes\(status\)/, "server validates invoice statuses");
assert.match(invoices, /status \? \{ status \}/, "server status filter before database pagination");
assert.match(invoices, /returnRequests: \{ where:/, "expose return state next to invoice financial state");
assert.match(pos, /data-testid="retail-invoice-return-status"/, "display distinct active return badge");
assert.match(recovery, /returnInvoiceId=.*encodeURIComponent\(item\.invoiceId\)/, "use existing return workflow for every historical case");
assert.match(recovery, /Aucune comptabilisation ni remise en stock/, "do not promise automatic release");
assert.match(reservations, /request: \{ status: \{ in: \["COMPLETED", "REFUND_PENDING"\]/, "approved returns must not prematurely free reserved stock");
assert.match(finance, /status: "POSTED", postedAt:/, "only canonical settlement posts credit");
assert.match(finance, /status: deferredPayout \? "REFUND_PENDING" : "COMPLETED"/, "settlement finalizes return");
console.info("HOTFIX #1224: historical recovery, invoice status filter and stock/Finance parity contracts OK.");
