import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => { if (!condition) failures.push(message); };

const specPath = "tests/e2e/hotfix-576-finance-owner.spec.mjs";
expect(fs.existsSync(specPath), "Hotfix #576 must keep a dedicated Finance OWNER_E2E Playwright spec.");

if (fs.existsSync(specPath)) {
  const spec = read(specPath);
  for (const route of ["/enterprise-modules/FINANCE_RECEIVABLES", "/enterprise-modules/FINANCE_PAYABLES", "/enterprise-modules/FINANCE_PAYMENTS"]) {
    expect(spec.includes(route), `Hotfix #576 OWNER_E2E must cover ${route}.`);
  }
  expect(spec.includes('url.searchParams.get("overdue") === "true"'), "Hotfix #576 OWNER_E2E must prove overdue filtering is sent to the server.");
  expect(spec.includes('url.searchParams.get("workflowPending") === "true"') && spec.includes('toBe("PENDING_REVIEW")'), "Hotfix #576 OWNER_E2E must preserve supplier PENDING_REVIEW in the assigned queue.");
  expect(spec.includes('url.searchParams.get("unallocated") === "true"'), "Hotfix #576 OWNER_E2E must prove unallocated payment filtering is sent to the server.");
  expect(spec.includes("unallocatedByCurrency") && spec.includes("overdueByCurrency"), "Hotfix #576 OWNER_E2E must verify currency-separated server metrics.");
  expect(spec.includes('url.searchParams.get("recordId")') && spec.includes("invoiceId=") && spec.includes("paymentId="), "Hotfix #576 OWNER_E2E must verify page-independent deep links.");
  expect(spec.includes("finance/reference-options") && spec.includes("businessPartyId"), "Hotfix #576 OWNER_E2E must verify canonical supplier-party reference convergence.");
  expect(spec.includes("width: 390") && spec.includes("scrollWidth") && spec.includes("pageerror"), "Hotfix #576 OWNER_E2E must retain mobile overflow and client-exception checks.");
}

const workflow = read(".github/workflows/quality-gates.yml");
expect(workflow.includes("workflow_dispatch:"), "Quality gates must retain manual workflow_dispatch for OWNER_E2E.");
expect(workflow.includes("if: github.event_name == 'workflow_dispatch'"), "Authenticated browser acceptance must remain manual and separate from PR static CI.");
expect(workflow.includes("Hotfix 576 Finance owner acceptance"), "Manual browser acceptance must expose the Hotfix #576 Finance OWNER_E2E step.");
expect(workflow.includes("playwright test tests/e2e/hotfix-576-finance-owner.spec.mjs"), "Manual browser acceptance must execute the Hotfix #576 Finance OWNER_E2E spec.");
expect(workflow.includes("pnpm e2e:erp-professional"), "Hotfix #576 must extend, not replace, the existing authenticated ERP acceptance suite.");

if (failures.length) {
  console.error("FAIL Hotfix #576 Finance OWNER_E2E contract:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS Hotfix #576 Finance OWNER_E2E contract: dedicated receivables, payables and payments browser acceptance remains manual, functional and regression-protected.");
