import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
let passes = 0;
function check(path, patterns) {
  const code = read(path);
  for (const pattern of patterns) {
    assert.match(code, pattern, "Contract absent in " + path + ": " + pattern);
    passes++;
  }
}
check("lib/enterprise/retail/site-access.ts", [
  /SELF_APPROVE_INVOICE/, /SELF_APPROVE_PAYMENT/, /SELF_APPROVE_INVOICE_RETURN/,
  /export async function retailSelfApprovalAllowed/, /siteStaffIsolationEnabled|retailStaffIsolationIsEnabled/,
  /invoiceCheckoutEnabled/, /assignment\.isActive/, /REQUEST_INVOICE_RETURN/,
]);
check("app/api/enterprise/[organizationId]/retail/site-assignments/route.ts", [
  /role: "OWNER"/, /SELF_APPROVE_INVOICE_RETURN/, /permissionsBefore/, /permissionsAfter/, /RETAIL_SELF_APPROVAL_OWNER_REQUIRED/,
]);
check("lib/enterprise/retail/invoice-approval.ts", [
  /selfApprovalOverrideAvailable/, /retailSelfApprovalAllowed/, /"SELF_APPROVE_INVOICE"/, /"SELF_APPROVE_PAYMENT"/,
]);
check("lib/enterprise/accounting/accounting-approval-service.ts", [
  /retailSelfApprovalAllowed/, /EnterpriseSalesInvoice/, /EnterprisePayment/, /ACCOUNTING_SELF_APPROVAL_FORBIDDEN/,
]);
check("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/transition/handler.ts", [/retailSelfApprovalAllowed/, /submitSalesInvoiceForAssignedApproval/, /decideSalesInvoiceAssignedApproval/]);
check("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/payments/[paymentId]/transition/handler.ts", [
  /approvePaymentAssignedApproval/, /retailSelfApprovalAllowed/, /"PENDING_APPROVAL"/,
]);
check("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/payments/handler.ts", [/canSelfApprove/, /retailSelfApprovalAllowed/]);
check("lib/enterprise/retail/invoice-returns.ts", [/SELF_APPROVE_INVOICE_RETURN/, /selfApprovalOverride/, /inspectedByUserId/, /FINANCE_PAYMENTS/]);
check("components/enterprise/professional/retail-site-staff-access.tsx", [/SELF_APPROVE_INVOICE/, /SELF_APPROVE_PAYMENT/, /SELF_APPROVE_INVOICE_RETURN/]);
check("components/enterprise/professional/retail-invoice-payment-dialog.tsx", [/canSelfApprove/, /selfApprove/]);
check("lib/enterprise/audit-event-i18n.ts", [/auditActionLabel/, /auditValueLabel/, /auditSearchCode/, /RETAIL_SITE_ASSIGNMENT_UPDATED/]);
check("components/enterprise/enterprise-admin-audit-history.tsx", [/auditActionLabel/, /auditSearchCode/, /auditValueLabel/, /Technical details and traceability/]);
console.log("HOTFIX #1186 static source contracts: " + passes + "/" + passes + " PASS (not an E2E/runtime test).");
