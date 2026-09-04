import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => { if (!condition) failures.push(message); };

const specPath = "tests/e2e/hotfix-574-finance-owner.spec.mjs";
expect(fs.existsSync(specPath), "Hotfix #574 must keep a dedicated Finance OWNER_E2E Playwright spec.");

if (fs.existsSync(specPath)) {
  const spec = read(specPath);
  for (const route of ["/enterprise-modules/FINANCE_BUDGETS", "/enterprise-modules/FINANCE_OVERVIEW", "/enterprise-modules/REPORTS"]) {
    expect(spec.includes(route), `Hotfix #574 OWNER_E2E must cover ${route}.`);
  }
  expect(spec.includes("/finance/overview-summary"), "Hotfix #574 OWNER_E2E must verify the authoritative Finance overview summary.");
  expect(spec.includes("/budgets") && spec.includes("/expenses"), "Hotfix #574 OWNER_E2E must exercise real budget and expense mutations.");
  expect(spec.includes("/reports/generate"), "Hotfix #574 OWNER_E2E must exercise real report generation.");
  expect(spec.includes("width: 390") && spec.includes("scrollWidth") && spec.includes("pageerror"), "Hotfix #574 OWNER_E2E must retain mobile overflow and client-exception checks.");
  expect(spec.includes("snapshotJson") && spec.includes('status).toBe("GENERATED")'), "Hotfix #574 OWNER_E2E must verify the persisted immutable report snapshot contract.");
}

const workflow = read(".github/workflows/quality-gates.yml");
expect(workflow.includes("workflow_dispatch:"), "Quality gates must retain manual workflow_dispatch for OWNER_E2E.");
expect(workflow.includes("if: github.event_name == 'workflow_dispatch'"), "Authenticated browser acceptance must remain manual and separate from PR static CI.");
expect(workflow.includes("Hotfix 574 Finance owner acceptance"), "Manual browser acceptance must expose the Hotfix #574 Finance OWNER_E2E step.");
expect(workflow.includes("playwright test tests/e2e/hotfix-574-finance-owner.spec.mjs"), "Manual browser acceptance must execute the Hotfix #574 Finance OWNER_E2E spec.");
expect(workflow.includes("pnpm e2e:erp-professional"), "Hotfix #574 must extend, not replace, the existing authenticated ERP acceptance suite.");

if (failures.length) {
  console.error("FAIL Hotfix #574 Finance OWNER_E2E contract:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS Hotfix #574 Finance OWNER_E2E contract: dedicated FINANCE_BUDGETS, FINANCE_OVERVIEW and REPORTS browser acceptance remains manual, functional and regression-protected.");
