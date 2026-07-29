import fs from "node:fs";

function replaceOnce(path, from, to) {
  const current = fs.readFileSync(path, "utf8");
  const count = current.split(from).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one anchor, found ${count}`);
  fs.writeFileSync(path, current.replace(from, to), "utf8");
}

replaceOnce(
  "lib/payroll-workflow.ts",
  `    payrolls: payrolls.map((payroll) => {\n      const requiredApproverCode = resolvePayrollApproverCode(payroll.employee);`,
  `    payrolls: payrolls.map((payroll) => {\n      if (payroll.workflowVersion !== 1 || !["DRAFT", "CHANGES_REQUESTED"].includes(payroll.status)) {\n        return serializePayroll(payroll);\n      }\n      const requiredApproverCode = resolvePayrollApproverCode(payroll.employee);`,
);

replaceOnce(
  "scripts/qa-payroll-hotfix-checks.mjs",
  `expect("HR CFO UI has an explicit submission readiness model", types.includes("submissionReadiness") && panel.includes("submissionReadiness.blockers.map"));`,
  `expect("Submission readiness is limited to editable Sprint 5 payrolls", workflow.includes('payroll.workflowVersion !== 1 || !["DRAFT", "CHANGES_REQUESTED"].includes(payroll.status)'));\nexpect("HR CFO UI has an explicit submission readiness model", types.includes("submissionReadiness") && panel.includes("submissionReadiness.blockers.map"));`,
);

console.log("Payroll readiness compatibility guard applied.");
