import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, content) => fs.writeFileSync(path, content, "utf8");

function replaceOnce(path, from, to) {
  const current = read(path);
  const count = current.split(from).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one replacement anchor, found ${count}`);
  write(path, current.replace(from, to));
}

function appendOnce(path, marker, block) {
  const current = read(path);
  if (current.includes(marker)) return;
  write(path, `${current.trimEnd()}\n\n${block.trim()}\n`);
}

replaceOnce(
  "prisma/schema.prisma",
  `  @@unique([employeeId, periodStart, periodEnd])\n  @@index([status, periodStart])`,
  `  @@index([employeeId, periodStart, periodEnd])\n  @@index([status, periodStart])`,
);

let workflow = read("lib/payroll-workflow.ts");

const duplicateBefore = `  const duplicate = await prisma.hrcfoPayroll.findUnique({\n    where: { employeeId_periodStart_periodEnd: { employeeId: employee.id, periodStart, periodEnd } },\n    select: { id: true, status: true },\n  });\n  if (duplicate) throw new PayrollWorkflowError("PAYROLL_PERIOD_EXISTS", "Une paie existe déjà pour ce collaborateur et cette période.", 409);`;
const duplicateAfter = `  const duplicate = await prisma.hrcfoPayroll.findFirst({\n    where: {\n      employeeId: employee.id,\n      periodStart,\n      periodEnd,\n      status: { notIn: ["CANCELLED", "CANCELED", "REJECTED"] },\n    },\n    select: { id: true, status: true },\n  });\n  if (duplicate) throw new PayrollWorkflowError("PAYROLL_PERIOD_EXISTS", "Une paie active existe déjà pour ce collaborateur et cette période.", 409);`;
if ((workflow.split(duplicateBefore).length - 1) !== 1) throw new Error("payroll duplicate anchor missing");
workflow = workflow.replace(duplicateBefore, duplicateAfter);

const prepareStartBefore = `  const payroll = await prisma.$transaction(async (tx) => {\n    const created = await tx.hrcfoPayroll.create({`;
const prepareStartAfter = `  let payroll: PayrollDetail;\n  try {\n    payroll = await prisma.$transaction(async (tx) => {\n      const created = await tx.hrcfoPayroll.create({`;
if ((workflow.split(prepareStartBefore).length - 1) !== 1) throw new Error("prepare transaction start anchor missing");
workflow = workflow.replace(prepareStartBefore, prepareStartAfter);

const prepareEndBefore = `    await createEvidenceLinks(tx, created.id, evidence.entries);\n    return tx.hrcfoPayroll.findUniqueOrThrow({ where: { id: created.id }, include: payrollDetailInclude });\n  });\n  return serializePayroll(payroll);\n}\n\nexport async function updatePreparedPayroll`;
const prepareEndAfter = `      await createEvidenceLinks(tx, created.id, evidence.entries);\n      return tx.hrcfoPayroll.findUniqueOrThrow({ where: { id: created.id }, include: payrollDetailInclude });\n    });\n  } catch (error) {\n    if (isPrismaUniqueConstraintError(error)) {\n      throw new PayrollWorkflowError("PAYROLL_PERIOD_EXISTS", "Une paie active existe déjà pour ce collaborateur et cette période.", 409);\n    }\n    throw error;\n  }\n  return serializePayroll(payroll);\n}\n\nexport async function updatePreparedPayroll`;
if ((workflow.split(prepareEndBefore).length - 1) !== 1) throw new Error("prepare transaction end anchor missing");
workflow = workflow.replace(prepareEndBefore, prepareEndAfter);

const typeAnchor = `export class PayrollWorkflowError extends Error {`;
if ((workflow.split(typeAnchor).length - 1) !== 1) throw new Error("workflow error anchor missing");
workflow = workflow.replace(typeAnchor, `type PayrollSubmissionBlocker = { code: string; message: string; status: number };\ntype PayrollSubmissionReadiness = {\n  ready: boolean;\n  requiredApproverCode: PayrollApproverCode;\n  approverName: string | null;\n  blockers: PayrollSubmissionBlocker[];\n};\n\n${typeAnchor}`);

const workspacePayrollBefore = `    payrolls: payrolls.map(serializePayroll),`;
const workspacePayrollAfter = `    payrolls: payrolls.map((payroll) => {\n      const requiredApproverCode = resolvePayrollApproverCode(payroll.employee);\n      const approver = employees.find((candidate) =>\n        candidate.id !== payroll.employeeId &&\n        candidate.status !== "EXITED" &&\n        Boolean(candidate.userId) &&\n        getEmployeePositionCode(candidate) === requiredApproverCode\n      );\n      return serializePayroll(payroll, buildPayrollSubmissionReadiness(payroll, approver?.fullName || null));\n    }),`;
if ((workflow.split(workspacePayrollBefore).length - 1) !== 1) throw new Error("workspace payroll anchor missing");
workflow = workflow.replace(workspacePayrollBefore, workspacePayrollAfter);

const submitBefore = `  const expectedApprover = resolvePayrollApproverCode(existing.employee);\n  const approvers = await resolveEligibleApprovers(expectedApprover, existing.employeeId);\n  if (!approvers.length) {\n    throw new PayrollWorkflowError("NO_APPROVER", "Aucun approbateur financier opérationnel n'est actuellement configuré.", 409);\n  }\n  assertPayrollReadyForSubmission(existing);\n  await getUsableBudget(existing.budgetId || "");\n  await assertEvidenceSnapshot(existing);`;
const submitAfter = `  const expectedApprover = resolvePayrollApproverCode(existing.employee);\n  const approvers = await resolveEligibleApprovers(expectedApprover, existing.employeeId);\n  assertPayrollReadyForSubmission(existing, approvers.length > 0);\n  const budget = await getUsableBudget(existing.budgetId || "");\n  if (existing.accountId !== budget.accountId) {\n    throw new PayrollWorkflowError("BUDGET_ACCOUNT_CHANGED", "Le compte associé au budget a changé. Enregistrez à nouveau le brouillon avant de le soumettre.", 409);\n  }\n  await assertEvidenceSnapshot(existing);`;
if ((workflow.split(submitBefore).length - 1) !== 1) throw new Error("submit readiness anchor missing");
workflow = workflow.replace(submitBefore, submitAfter);

const serializeSignature = `export function serializePayroll(payroll: PayrollDetail) {`;
if ((workflow.split(serializeSignature).length - 1) !== 1) throw new Error("serialize signature anchor missing");
workflow = workflow.replace(serializeSignature, `export function serializePayroll(payroll: PayrollDetail, submissionReadiness: PayrollSubmissionReadiness | null = null) {`);

const serializeInsert = `    transactionId: payroll.transactionId,\n    createdAt: payroll.createdAt.toISOString(),`;
if ((workflow.split(serializeInsert).length - 1) !== 1) throw new Error("serialize readiness anchor missing");
workflow = workflow.replace(serializeInsert, `    transactionId: payroll.transactionId,\n    submissionReadiness,\n    createdAt: payroll.createdAt.toISOString(),`);

const readinessBefore = `function assertPayrollReadyForSubmission(payroll: PayrollDetail) {\n  assertBaseAmountSource(payroll);\n  assertAdjustmentReasons(Number(payroll.bonusAmount), payroll.bonusReason, Number(payroll.deductionAmount), payroll.deductionReason);\n  const recomputed = calculatePayrollAmounts(Number(payroll.grossAmount), Number(payroll.bonusAmount), Number(payroll.deductionAmount));\n  if (recomputed.netAmount !== Number(payroll.netAmount)) throw new PayrollWorkflowError("NET_MISMATCH", "Le montant net doit être recalculé avant soumission.", 409);\n  if (payroll.workCoverage !== "COMPLETE" && !payroll.workCoverageExceptionReason?.trim()) {\n    throw new PayrollWorkflowError("COVERAGE_REASON_REQUIRED", "Une justification est obligatoire pour une période avec prestations partielles ou absentes.", 400);\n  }\n  if (!payroll.budgetId || !payroll.accountId) throw new PayrollWorkflowError("BUDGET_REQUIRED", "La paie doit être liée à un budget et à son compte financier.", 409);\n}`;
const readinessAfter = `function buildPayrollSubmissionReadiness(payroll: PayrollDetail, approverName: string | null): PayrollSubmissionReadiness {\n  const blockers: PayrollSubmissionBlocker[] = [];\n  const capture = (run: () => void) => {\n    try {\n      run();\n    } catch (error) {\n      if (isPayrollWorkflowError(error)) {\n        blockers.push({ code: error.code, message: error.message, status: error.status });\n        return;\n      }\n      throw error;\n    }\n  };\n\n  capture(() => assertBaseAmountSource(payroll));\n  capture(() => assertAdjustmentReasons(Number(payroll.bonusAmount), payroll.bonusReason, Number(payroll.deductionAmount), payroll.deductionReason));\n  capture(() => {\n    const recomputed = calculatePayrollAmounts(Number(payroll.grossAmount), Number(payroll.bonusAmount), Number(payroll.deductionAmount));\n    if (recomputed.netAmount !== Number(payroll.netAmount)) {\n      throw new PayrollWorkflowError("NET_MISMATCH", "Le montant net doit être recalculé avant soumission.", 409);\n    }\n  });\n\n  if (payroll.workCoverage !== "COMPLETE" && !payroll.workCoverageExceptionReason?.trim()) {\n    blockers.push({ code: "COVERAGE_REASON_REQUIRED", message: "Une justification est obligatoire pour une période avec prestations partielles ou absentes.", status: 400 });\n  }\n\n  if (!payroll.budgetId || !payroll.accountId) {\n    blockers.push({ code: "BUDGET_REQUIRED", message: "La paie doit être liée à un budget et à son compte financier.", status: 409 });\n  } else if (!payroll.budget || !["OPEN", "MONITORING"].includes(payroll.budget.status) || !payroll.budget.accountId || !payroll.budget.account || payroll.budget.account.status !== "ACTIVE") {\n    blockers.push({ code: "BUDGET_UNAVAILABLE", message: "Le budget de paie est inactif ou son compte financier est indisponible.", status: 409 });\n  } else if (payroll.accountId !== payroll.budget.accountId) {\n    blockers.push({ code: "BUDGET_ACCOUNT_CHANGED", message: "Le compte associé au budget a changé. Enregistrez à nouveau le brouillon avant de le soumettre.", status: 409 });\n  }\n\n  const activeLinks = payroll.workEvidence.filter((link) => !link.releasedAt);\n  const expectedCount = payroll.approvedWorkEntryCount || 0;\n  const expectedMinutes = payroll.approvedWorkMinutes || 0;\n  if (activeLinks.length !== expectedCount || activeLinks.reduce((sum, link) => sum + link.approvedMinutes, 0) !== expectedMinutes) {\n    blockers.push({ code: "WORK_EVIDENCE_MISMATCH", message: "Le snapshot des prestations approuvées est incohérent.", status: 409 });\n  }\n\n  if (!approverName) {\n    blockers.push({ code: "NO_APPROVER", message: "Aucun approbateur financier opérationnel n'est actuellement configuré.", status: 409 });\n  }\n\n  return {\n    ready: blockers.length === 0,\n    requiredApproverCode: resolvePayrollApproverCode(payroll.employee),\n    approverName,\n    blockers,\n  };\n}\n\nfunction assertPayrollReadyForSubmission(payroll: PayrollDetail, approverAvailable = true) {\n  const readiness = buildPayrollSubmissionReadiness(payroll, approverAvailable ? "configured" : null);\n  const blocker = readiness.blockers[0];\n  if (blocker) throw new PayrollWorkflowError(blocker.code, blocker.message, blocker.status);\n}`;
if ((workflow.split(readinessBefore).length - 1) !== 1) throw new Error("readiness function anchor missing");
workflow = workflow.replace(readinessBefore, readinessAfter);

const cleanAnchor = `function clean(value?: string | null) {`;
if ((workflow.split(cleanAnchor).length - 1) !== 1) throw new Error("clean helper anchor missing");
workflow = workflow.replace(cleanAnchor, `function isPrismaUniqueConstraintError(error: unknown) {\n  return Boolean(\n    error &&\n    typeof error === "object" &&\n    "code" in error &&\n    (error as { code?: unknown }).code === "P2002"\n  );\n}\n\n${cleanAnchor}`);
write("lib/payroll-workflow.ts", workflow);

replaceOnce(
  "components/admin/payroll-workflow-types.ts",
  `  transactionId: string | null;\n  createdAt: string;`,
  `  transactionId: string | null;\n  submissionReadiness: {\n    ready: boolean;\n    requiredApproverCode: "CEO" | "COO";\n    approverName: string | null;\n    blockers: Array<{ code: string; message: string; status: number }>;\n  } | null;\n  createdAt: string;`,
);

let panel = read("components/admin/payroll-workflow-panel.tsx");
panel = panel.replace(
  `  const [message, setMessage] = useState("");\n  const [loading, setLoading] = useState(true);`,
  `  const [message, setMessage] = useState("");\n  const [messageTone, setMessageTone] = useState<"success" | "warning" | "error">("success");\n  const [actionError, setActionError] = useState("");\n  const [loading, setLoading] = useState(true);`,
);
panel = panel.replace(`  useToastMessage(message);`, `  useToastMessage(message, messageTone);`);
panel = panel.replace(`      setMessage(body?.message || t("loadError"));`, `      setMessageTone("error");\n      setMessage(body?.message || t("loadError"));`);
panel = panel.replace(`      setMessage(body?.message || t("saveError"));\n      return;`, `      setMessageTone("error");\n      setMessage(body?.message || t("saveError"));\n      return;`);
panel = panel.replace(`    setMessage(editTarget ? t("updated") : t("prepared"));`, `    setMessageTone("success");\n    setMessage(editTarget ? t("updated") : t("prepared"));`);
panel = panel.replace(`    setEditTarget(null);\n    await load();`, `    setEditTarget(null);\n    setSelected(null);\n    await load();`);
panel = panel.replace(`      setMessage(body?.error || t("uploadError"));`, `      setMessageTone("error");\n      setMessage(body?.error || t("uploadError"));`);
panel = panel.replace(`    setMessage(t("uploadDone"));`, `    setMessageTone("success");\n    setMessage(t("uploadDone"));`);
panel = panel.replace(
  `    if (!response.ok) {\n      setMessage(body?.message || t("actionError"));\n      return;\n    }\n    setMessage(confirmAction === "SUBMIT" ? t("submitted") : confirmAction === "PAID" ? t("markedPaid") : t("cancelled"));`,
  `    if (!response.ok) {\n      const errorMessage = body?.message || t("actionError");\n      setMessageTone("error");\n      setMessage(errorMessage);\n      setActionError(errorMessage);\n      return;\n    }\n    setMessageTone("success");\n    setActionError("");\n    setMessage(confirmAction === "SUBMIT" ? t("submitted") : confirmAction === "PAID" ? t("markedPaid") : t("cancelled"));`,
);
panel = panel.replace(
  `{(selected.status === "DRAFT" || selected.status === "CHANGES_REQUESTED") ? <Button type="button" onClick={() => setConfirmAction("SUBMIT")} className="rounded-xl bg-dtsc-blue text-white"><Send className="h-4 w-4" />{t("submit")}</Button> : null}`,
  `{(selected.status === "DRAFT" || selected.status === "CHANGES_REQUESTED") ? <Button type="button" disabled={selected.submissionReadiness?.ready === false} title={selected.submissionReadiness?.blockers[0]?.message} onClick={() => { setActionError(""); setConfirmAction("SUBMIT"); }} className="rounded-xl bg-dtsc-blue text-white"><Send className="h-4 w-4" />{t("submit")}</Button> : null}`,
);
panel = panel.replace(
  `{selected.status === "DRAFT" ? <Button type="button" variant="outline" onClick={() => setConfirmAction("CANCEL")} className="rounded-xl border-red-500/40 text-red-700"><XCircle className="h-4 w-4" />{t("cancelPayroll")}</Button> : null}`,
  `{selected.status === "DRAFT" ? <Button type="button" variant="outline" onClick={() => { setActionError(""); setConfirmAction("CANCEL"); }} className="rounded-xl border-red-500/40 text-red-700"><XCircle className="h-4 w-4" />{t("cancelPayroll")}</Button> : null}`,
);
panel = panel.replace(
  `{selected.status === "VALIDATED" ? <Button type="button" onClick={() => setConfirmAction("PAID")} className="rounded-xl bg-emerald-700 text-white"><CheckCircle2 className="h-4 w-4" />{t("markPaid")}</Button> : null}`,
  `{selected.status === "VALIDATED" ? <Button type="button" onClick={() => { setActionError(""); setConfirmAction("PAID"); }} className="rounded-xl bg-emerald-700 text-white"><CheckCircle2 className="h-4 w-4" />{t("markPaid")}</Button> : null}`,
);
panel = panel.replace(
  `description={confirmAction === "SUBMIT" ? t("submitConfirm") : confirmAction === "PAID" ? t("paidConfirm") : t("cancelConfirm")} onClose={() => { setConfirmAction(null); setActionText(""); }} footer=`,
  `description={confirmAction === "SUBMIT" ? t("submitConfirm") : confirmAction === "PAID" ? t("paidConfirm") : t("cancelConfirm")} onClose={() => { setConfirmAction(null); setActionText(""); setActionError(""); }} footer=`,
);
panel = panel.replace(
  `{confirmAction === "CANCEL" || confirmAction === "PAID" ? <FieldLabel label={confirmAction === "CANCEL" ? t("cancelReason") : t("paymentReference")}><Input value={actionText} onChange={(event) => setActionText(event.target.value)} /></FieldLabel> : <div className="flex gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3 text-sm"><FileCheck2 className="h-5 w-5 shrink-0" />{t("submitEvidenceFrozen")}</div>}`,
  `{actionError ? <div role="alert" className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-sm font-semibold text-red-700">{actionError}</div> : null}\n        {confirmAction === "CANCEL" || confirmAction === "PAID" ? <FieldLabel label={confirmAction === "CANCEL" ? t("cancelReason") : t("paymentReference")}><Input value={actionText} onChange={(event) => setActionText(event.target.value)} /></FieldLabel> : <div className="flex gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3 text-sm"><FileCheck2 className="h-5 w-5 shrink-0" />{t("submitEvidenceFrozen")}</div>}`,
);

const historyAnchor = `    <BusinessDetailSection title={t("history")} description={t("historyDescription")}>`;
const readinessSection = `    {(payroll.status === "DRAFT" || payroll.status === "CHANGES_REQUESTED") && payroll.submissionReadiness ? <BusinessDetailSection title={t("submissionReadiness")} description={t("submissionReadinessDescription")}>\n      <BusinessDetailGrid>\n        <BusinessDetailField label={t("submissionState")} value={payroll.submissionReadiness.ready ? t("submissionReady") : t("submissionBlocked")} />\n        <BusinessDetailField label={t("requiredApprover")} value={payroll.submissionReadiness.approverName ? \`${"${payroll.submissionReadiness.requiredApproverCode}"} · ${"${payroll.submissionReadiness.approverName}"}\` : payroll.submissionReadiness.requiredApproverCode} />\n      </BusinessDetailGrid>\n      {payroll.submissionReadiness.blockers.length ? <div role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-800">\n        <p className="font-black">{t("submissionBlockers")}</p>\n        <div className="mt-2 grid gap-1">{payroll.submissionReadiness.blockers.map((blocker) => <p key={blocker.code}>• {blocker.message}</p>)}</div>\n      </div> : <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-800">{t("submissionReadyHelp")}</p>}\n    </BusinessDetailSection> : null}\n`;
if ((panel.split(historyAnchor).length - 1) !== 1) throw new Error("panel history anchor missing");
panel = panel.replace(historyAnchor, readinessSection + historyAnchor);

const requiredPanelAnchors = [
  `useToastMessage(message, messageTone)`,
  `submissionReadiness?.ready === false`,
  `setActionError(errorMessage)`,
  `submissionReadiness.blockers.map`,
];
for (const anchor of requiredPanelAnchors) if (!panel.includes(anchor)) throw new Error(`panel patch missing: ${anchor}`);
write("components/admin/payroll-workflow-panel.tsx", panel);

for (const locale of ["fr", "en"]) {
  const path = `locales/${locale}.json`;
  const data = JSON.parse(read(path));
  if (!data.payrollWorkflow) throw new Error(`${path}: payrollWorkflow missing`);
  Object.assign(data.payrollWorkflow, locale === "fr" ? {
    submissionReadiness: "Préparation avant soumission",
    submissionReadinessDescription: "Vérifiez les prérequis financiers et opérationnels avant l'envoi à l'approbateur.",
    submissionState: "État de soumission",
    submissionReady: "Prête à soumettre",
    submissionBlocked: "Corrections requises",
    requiredApprover: "Approbateur financier",
    submissionBlockers: "Points à corriger avant soumission",
    submissionReadyHelp: "Tous les contrôles préalables visibles sont satisfaits. La vérification serveur sera répétée au moment de la soumission."
  } : {
    submissionReadiness: "Submission readiness",
    submissionReadinessDescription: "Review operational and financial prerequisites before sending payroll for approval.",
    submissionState: "Submission state",
    submissionReady: "Ready to submit",
    submissionBlocked: "Corrections required",
    requiredApprover: "Financial approver",
    submissionBlockers: "Items to fix before submission",
    submissionReadyHelp: "All visible prerequisites are satisfied. Server-side validation will run again when payroll is submitted."
  });
  write(path, `${JSON.stringify(data, null, 2)}\n`);
}

const packagePath = "package.json";
const pkg = JSON.parse(read(packagePath));
pkg.scripts["qa:payroll-hotfix"] = "node scripts/qa-payroll-hotfix-checks.mjs";
if (!pkg.scripts["qa:regression"].includes("qa-payroll-hotfix-checks.mjs")) {
  pkg.scripts["qa:regression"] += " && node scripts/qa-payroll-hotfix-checks.mjs";
}
write(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

fs.mkdirSync("prisma/migrations/20260729054500_payroll_active_period_retry", { recursive: true });
write("prisma/migrations/20260729054500_payroll_active_period_retry/migration.sql", `-- Hotfix Sprint 5: keep cancelled/rejected payroll history without reserving the period forever.\n-- The previous global unique index guaranteed there are no historical duplicate rows before this change.\n\nCREATE UNIQUE INDEX IF NOT EXISTS "HrcfoPayroll_active_period_key"\n  ON "HrcfoPayroll"("employeeId", "periodStart", "periodEnd")\n  WHERE "status" NOT IN ('CANCELLED', 'CANCELED', 'REJECTED');\n\nDROP INDEX IF EXISTS "HrcfoPayroll_employeeId_periodStart_periodEnd_key";\n\nCREATE INDEX IF NOT EXISTS "HrcfoPayroll_employeeId_periodStart_periodEnd_idx"\n  ON "HrcfoPayroll"("employeeId", "periodStart", "periodEnd");\n`);

write("scripts/qa-payroll-hotfix-checks.mjs", `import fs from "node:fs";\n\nconst read = (path) => fs.readFileSync(path, "utf8");\nconst schema = read("prisma/schema.prisma");\nconst migration = read("prisma/migrations/20260729054500_payroll_active_period_retry/migration.sql");\nconst workflow = read("lib/payroll-workflow.ts");\nconst panel = read("components/admin/payroll-workflow-panel.tsx");\nconst types = read("components/admin/payroll-workflow-types.ts");\nconst packageJson = read("package.json");\nconst docs = read("docs/DTSC_PAYROLL_WORKFLOW.md");\n\nconst checks = [];\nconst expect = (label, condition) => checks.push({ label, ok: Boolean(condition) });\n\nexpect("Payroll period is no longer globally unique in Prisma", !schema.includes("@@unique([employeeId, periodStart, periodEnd])") && schema.includes("@@index([employeeId, periodStart, periodEnd])"));\nexpect("DB keeps a partial unique active-period guard", migration.includes("HrcfoPayroll_active_period_key") && migration.includes("NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')"));\nexpect("Migration creates partial guard before dropping legacy unique index", migration.indexOf("CREATE UNIQUE INDEX") < migration.indexOf("DROP INDEX"));\nexpect("Cancelled and rejected payrolls do not block a retry", workflow.includes('status: { notIn: ["CANCELLED", "CANCELED", "REJECTED"] }'));\nexpect("Race duplicate maps to an explicit payroll error", workflow.includes("isPrismaUniqueConstraintError") && workflow.includes('"PAYROLL_PERIOD_EXISTS"'));\nexpect("Cancellation still releases active work evidence", workflow.includes('status: "CANCELLED"') && workflow.includes("releasedAt: new Date()"));\nexpect("Submission readiness exposes financial blockers", workflow.includes("buildPayrollSubmissionReadiness") && workflow.includes("COVERAGE_REASON_REQUIRED") && workflow.includes("BUDGET_ACCOUNT_CHANGED"));\nexpect("Submission readiness exposes missing approver", workflow.includes("NO_APPROVER") && workflow.includes("approverName"));\nexpect("Live submit uses the same readiness guard", workflow.includes("assertPayrollReadyForSubmission(existing, approvers.length > 0)"));\nexpect("HR CFO UI has an explicit submission readiness model", types.includes("submissionReadiness") && panel.includes("submissionReadiness.blockers.map"));\nexpect("Blocked submission button is disabled", panel.includes("submissionReadiness?.ready === false"));\nexpect("Action failures use an explicit error tone", panel.includes('setMessageTone("error")') && panel.includes("setActionError(errorMessage)") && panel.includes('role="alert"'));\nexpect("Hotfix QA is wired into regression", packageJson.includes("qa-payroll-hotfix-checks.mjs"));\nexpect("Workflow documentation records period retry semantics", docs.includes("PAYROLL_PERIOD_RETRY_HOTFIX"));\n\nlet failed = 0;\nfor (const check of checks) {\n  console.log(\`${"${check.ok ? "✓" : "✗"} ${check.label}"}\`);\n  if (!check.ok) failed += 1;\n}\nconsole.log(\`\\nPayroll hotfix QA: ${"${checks.length - failed}"}/${"${checks.length}"} checks passed.\`);\nif (failed) process.exit(1);\n`);

appendOnce("docs/DTSC_PAYROLL_WORKFLOW.md", "PAYROLL_PERIOD_RETRY_HOTFIX", `<!-- PAYROLL_PERIOD_RETRY_HOTFIX -->\n## Hotfix — soumission explicite et nouvelle préparation après annulation/refus\n\nUne paie `CANCELLED` ou `REJECTED` reste conservée pour l'audit mais ne réserve plus définitivement le couple collaborateur + période. La base conserve une unicité partielle sur les paies financièrement actives ; une nouvelle préparation est donc autorisée après annulation/refus, tandis qu'un DRAFT, PENDING_APPROVAL, CHANGES_REQUESTED, VALIDATED ou PAID continue de bloquer un doublon actif.\n\nLa préparation HR & CFO expose désormais une readiness de soumission avec l'approbateur attendu et les blocages lisibles (couverture à justifier, budget/compte, montant, preuve de travail ou approbateur absent). Le bouton de soumission est désactivé lorsque ces prérequis visibles ne sont pas satisfaits, et le backend répète les contrôles au moment du POST. Les erreurs d'action financière sont affichées explicitement comme erreurs et dans la modale, sans dépendre d'une déduction par mots-clés du toast.\n<!-- /PAYROLL_PERIOD_RETRY_HOTFIX -->`);

appendOnce("docs/TECHNICAL_DOCUMENTATION.md", "SPRINT_05_PAYROLL_RETRY_HOTFIX", `<!-- SPRINT_05_PAYROLL_RETRY_HOTFIX -->\n### Hotfix Sprint 5 — retry de période et readiness de soumission\n\n` + "`HrcfoPayroll`" + ` conserve l'historique CANCELLED/REJECTED. L'unicité active est portée par l'index PostgreSQL partiel ` + "`HrcfoPayroll_active_period_key`" + `, tandis que Prisma conserve un index de recherche non unique. ` + "`preparePayroll()`" + ` ignore les lignes terminales libératrices et transforme aussi une collision concurrente P2002 en 409 métier. La workspace HR & CFO reçoit une readiness calculée côté serveur ; le POST de soumission répète les mêmes préconditions et les vérifications fortes de budget et de preuves approuvées.\n<!-- /SPRINT_05_PAYROLL_RETRY_HOTFIX -->`);

appendOnce("docs/CHANGELOG.md", "SPRINT_05_PAYROLL_RETRY_CHANGELOG", `<!-- SPRINT_05_PAYROLL_RETRY_CHANGELOG -->\n- Hotfix Sprint 5 : une paie annulée ou refusée ne bloque plus une nouvelle préparation de la même période, tout en conservant son historique.\n- Ajout d'une readiness de soumission HR & CFO, de blocages lisibles avant envoi CEO/COO et d'erreurs d'action explicitement affichées comme erreurs.\n<!-- /SPRINT_05_PAYROLL_RETRY_CHANGELOG -->`);

appendOnce("docs/QA_REGRESSION_CHECKLIST.md", "SPRINT_05_PAYROLL_RETRY_QA", `<!-- SPRINT_05_PAYROLL_RETRY_QA -->\n### Hotfix paie — retry et soumission\n- DRAFT/PENDING/VALIDATED/PAID bloque une seconde paie active de même collaborateur+période.\n- CANCELLED et REJECTED conservent l'historique mais permettent une nouvelle préparation.\n- Une collision concurrente de période renvoie PAYROLL_PERIOD_EXISTS/409.\n- PARTIAL/NONE sans justification, approbateur absent, budget/compte invalide ou snapshot incohérent apparaît comme blocage lisible avant soumission.\n- Une erreur de soumission est affichée comme erreur dans le toast et dans la modale.\n<!-- /SPRINT_05_PAYROLL_RETRY_QA -->`);

let agents = read("AGENTS.md");
const agentsMarker = `<!-- /SPRINT_05_PAYROLL_WORKFLOW_RULES -->`;
if (!agents.includes("Cancelled or rejected payroll history must not permanently reserve")) {
  if (!agents.includes(agentsMarker)) throw new Error("AGENTS Sprint 5 marker missing");
  agents = agents.replace(agentsMarker, `- Cancelled or rejected payroll history must not permanently reserve an employee+period; active-period uniqueness must remain DB-enforced while terminal retryable records stay auditable.\n- Payroll submission blockers must be returned by the server and displayed explicitly as errors/readiness items; financial-action UX must never infer success or failure only from message wording.\n${agentsMarker}`);
  write("AGENTS.md", agents);
}

console.log("Payroll hotfix patch applied successfully.");
