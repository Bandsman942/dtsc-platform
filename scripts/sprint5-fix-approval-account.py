from pathlib import Path
import json


def replace_once(path_string: str, old: str, new: str) -> None:
    path = Path(path_string)
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"Missing hardening anchor in {path_string}: {old[:140]!r}")
    path.write_text(text.replace(old, new, 1))

workflow = "lib/payroll-workflow.ts"
replace_once(
    workflow,
    '''  const employee = await prisma.hrcfoEmployee.findUnique({ where: { id: input.employeeId }, include: { position: true } });
  if (!employee) throw new PayrollWorkflowError("EMPLOYEE_NOT_FOUND", "Collaborateur introuvable.", 404);''',
    '''  const employee = await prisma.hrcfoEmployee.findUnique({ where: { id: input.employeeId }, include: { position: true } });
  if (!employee || employee.status === "EXITED") throw new PayrollWorkflowError("EMPLOYEE_NOT_FOUND", "Collaborateur actif introuvable.", 404);''',
)
replace_once(
    workflow,
    '''  assertAdjustmentReasons(input.bonusAmount, input.bonusReason, input.deductionAmount, input.deductionReason);

  const payroll = await prisma.$transaction(async (tx) => {''',
    '''  assertAdjustmentReasons(input.bonusAmount, input.bonusReason, input.deductionAmount, input.deductionReason);
  assertOwnedOperationEvidence(input.adjustmentEvidenceUrl, actor.userId);

  const payroll = await prisma.$transaction(async (tx) => {''',
)
replace_once(
    workflow,
    '''  const amounts = calculatePayrollAmounts(amount.grossAmount, bonusAmount, deductionAmount);

  const refreshEvidence = existing.status === "DRAFT";''',
    '''  const amounts = calculatePayrollAmounts(amount.grossAmount, bonusAmount, deductionAmount);
  const adjustmentEvidenceUrl = input.adjustmentEvidenceUrl === undefined ? existing.adjustmentEvidenceUrl : clean(input.adjustmentEvidenceUrl);
  if (input.adjustmentEvidenceUrl !== undefined && adjustmentEvidenceUrl !== existing.adjustmentEvidenceUrl) {
    assertOwnedOperationEvidence(adjustmentEvidenceUrl, actor.userId);
  }

  const refreshEvidence = existing.status === "DRAFT";''',
)
replace_once(
    workflow,
    '''        adjustmentEvidenceUrl: input.adjustmentEvidenceUrl === undefined ? existing.adjustmentEvidenceUrl : clean(input.adjustmentEvidenceUrl),''',
    '''        adjustmentEvidenceUrl,''',
)
replace_once(
    workflow,
    '''    if (action === "APPROVED") {
      if (Number(payroll.netAmount) <= 0) throw new PayrollWorkflowError("INVALID_NET", "Le montant net doit être positif avant approbation.", 409);
      const transaction = await createValidatedTransactionInTx(tx, {''',
    '''    if (action === "APPROVED") {
      if (Number(payroll.netAmount) <= 0) throw new PayrollWorkflowError("INVALID_NET", "Le montant net doit être positif avant approbation.", 409);
      const existingTransaction = await tx.hrcfoExpense.findFirst({ where: { sourceType: "PAYROLL_WORKFLOW", sourceId: payroll.id } });
      if (existingTransaction && (
        Number(existingTransaction.amount) !== Number(payroll.netAmount) ||
        existingTransaction.budgetId !== budget.id ||
        existingTransaction.accountId !== budget.accountId ||
        existingTransaction.transactionType !== "PAYROLL" ||
        existingTransaction.transactionCategory !== "OUT"
      )) {
        throw new PayrollWorkflowError("TRANSACTION_IDEMPOTENCY_MISMATCH", "Une transaction PAYROLL_WORKFLOW incohérente existe déjà pour cette paie.", 409);
      }
      const transaction = await createValidatedTransactionInTx(tx, {''',
)
replace_once(
    workflow,
    '''function assertPayrollReadyForSubmission(payroll: PayrollDetail) {
  assertAdjustmentReasons(Number(payroll.bonusAmount), payroll.bonusReason, Number(payroll.deductionAmount), payroll.deductionReason);''',
    '''function assertPayrollReadyForSubmission(payroll: PayrollDetail) {
  assertBaseAmountSource(payroll);
  assertAdjustmentReasons(Number(payroll.bonusAmount), payroll.bonusReason, Number(payroll.deductionAmount), payroll.deductionReason);''',
)
replace_once(
    workflow,
    '''function assertAdjustmentReasons(bonusAmount: number, bonusReason?: string | null, deductionAmount = 0, deductionReason?: string | null) {''',
    '''function assertBaseAmountSource(payroll: PayrollDetail) {
  const grossAmount = roundMoney(Number(payroll.grossAmount));
  if (payroll.baseAmountSource === "MONTHLY_COMPENSATION") {
    const monthly = payroll.employee.monthlyCompensation == null ? null : roundMoney(Number(payroll.employee.monthlyCompensation));
    if (!isFullCalendarMonth(payroll.periodStart, payroll.periodEnd) || monthly == null || grossAmount !== monthly) {
      throw new PayrollWorkflowError("BASE_AMOUNT_STALE", "La rémunération de base ne correspond plus au dossier RH. HR & CFO doit corriger le brouillon avant approbation.", 409);
    }
    return;
  }
  if (payroll.baseAmountSource === "EXPLICIT_OVERRIDE") {
    const override = payroll.baseAmountOverride == null ? null : roundMoney(Number(payroll.baseAmountOverride));
    if (override == null || !payroll.baseAmountOverrideReason?.trim() || grossAmount !== override) {
      throw new PayrollWorkflowError("BASE_OVERRIDE_INVALID", "Le montant de base explicite et son motif sont incohérents.", 409);
    }
    return;
  }
  throw new PayrollWorkflowError("BASE_AMOUNT_SOURCE_INVALID", "La source de rémunération de base est absente ou invalide.", 409);
}

function assertOwnedOperationEvidence(value: string | null | undefined, userId: string | null) {
  const url = clean(value);
  if (!url) return;
  if (!userId) throw new PayrollWorkflowError("EVIDENCE_FORBIDDEN", "Le justificatif privé ne peut pas être rattaché à ce compte.", 403);
  const expectedPrefix = `/api/admin/operation-files/operations/${encodeURIComponent(userId)}/`;
  if (!url.startsWith(expectedPrefix)) {
    throw new PayrollWorkflowError("EVIDENCE_FORBIDDEN", "Le justificatif doit provenir de l'upload privé contrôlé DTSC de l'utilisateur courant.", 403);
  }
}

function assertAdjustmentReasons(bonusAmount: number, bonusReason?: string | null, deductionAmount = 0, deductionReason?: string | null) {''',
)

upload_route = "app/api/admin/operation-files/route.ts"
replace_once(
    upload_route,
    '''import { uploadOperationFileToSupabase } from "@/lib/supabase-storage";''',
    '''import { uploadOperationFileToSupabase } from "@/lib/supabase-storage";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";''',
)
replace_once(
    upload_route,
    '''export async function POST(req: Request) {
  const startedAt = Date.now();''',
    '''export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "operation_file_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }''',
)
replace_once(
    upload_route,
    '''async function uploadForSession(req: Request, userId: string, startedAt: number) {
  const formData = await req.formData();''',
    '''async function uploadForSession(req: Request, userId: string, startedAt: number) {
  const limited = await rateLimit(getRateLimitKey(req, `operation-file-upload:${userId}`), 40, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId, startedAt, metadata: { action: "operation_file_rate_limited" } });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const formData = await req.formData();''',
)

for panel in ("components/admin/payroll-workflow-panel.tsx", "components/admin/payroll-approval-panel.tsx"):
    path = Path(panel)
    text = path.read_text()
    anchor = '''      {payroll.baseAmountOverrideReason ? <p className="mt-2 text-sm"><strong>{t("baseOverrideReason")}:</strong> {payroll.baseAmountOverrideReason}</p> : null}'''
    addition = anchor + '''
      {payroll.adjustmentEvidenceUrl ? <a href={payroll.adjustmentEvidenceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-bold text-dtsc-blue underline underline-offset-4">{t("openAdjustmentEvidence")}</a> : null}'''
    if anchor not in text:
        raise SystemExit(f"Missing evidence UI anchor in {panel}")
    path.write_text(text.replace(anchor, addition, 1))

for locale_file, label in (("locales/fr.json", "Ouvrir le justificatif privé"), ("locales/en.json", "Open private evidence")):
    path = Path(locale_file)
    data = json.loads(path.read_text())
    data.setdefault("payrollWorkflow", {})["openAdjustmentEvidence"] = label
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

qa_path = Path("scripts/qa-payroll-work-integration-checks.mjs")
qa = qa_path.read_text()
qa = qa.replace('const payslip = read("app/api/admin/payrolls/[id]/pdf/route.ts");', 'const payslip = read("app/api/admin/payrolls/[id]/pdf/route.ts");\nconst operationFileRoute = read("app/api/admin/operation-files/route.ts");')
qa = qa.replace('expect("Standard gross comes from HR compensation", workflow.includes("employeeMonthlyCompensation") && workflow.includes(\'source: "MONTHLY_COMPENSATION"\'));', 'expect("Standard gross comes from HR compensation", workflow.includes("employeeMonthlyCompensation") && workflow.includes(\'source: "MONTHLY_COMPENSATION"\'));\nexpect("Standard gross is revalidated before financial approval", workflow.includes("assertBaseAmountSource(payroll)") && workflow.includes("BASE_AMOUNT_STALE"));')
qa = qa.replace('expect("Approval uses the existing finance transaction engine", reviewSlice.includes("createValidatedTransactionInTx") && reviewSlice.includes(\'sourceType: "PAYROLL_WORKFLOW"\'));', 'expect("Approval uses the existing finance transaction engine", reviewSlice.includes("createValidatedTransactionInTx") && reviewSlice.includes(\'sourceType: "PAYROLL_WORKFLOW"\'));\nexpect("Idempotent transaction must match payroll financial data", reviewSlice.includes("TRANSACTION_IDEMPOTENCY_MISMATCH") && reviewSlice.includes("existingTransaction.budgetId !== budget.id") && reviewSlice.includes("existingTransaction.accountId !== budget.accountId"));')
qa = qa.replace('expect("Payslip access is hardened", payslip.includes("HR_CFO") && !payslip.includes("UserRole.SUPPORT") && !payslip.includes("UserRole.MANAGER"));', 'expect("Payslip access is hardened", payslip.includes("HR_CFO") && !payslip.includes("UserRole.SUPPORT") && !payslip.includes("UserRole.MANAGER"));\nexpect("Adjustment evidence must come from controlled private upload", workflow.includes("assertOwnedOperationEvidence") && workflow.includes("/api/admin/operation-files/operations/") && operationFileRoute.includes("isSameOriginRequest") && operationFileRoute.includes("rateLimit("));')
qa_path.write_text(qa)

workflow_docs = Path("docs/DTSC_PAYROLL_WORKFLOW.md")
docs = workflow_docs.read_text()
marker = "## Sécurité des justificatifs privés"
if marker not in docs:
    docs += '''\n\n## Sécurité des justificatifs privés\n\nLes justificatifs d'ajustement utilisent exclusivement l'upload privé `operation-files` déjà contrôlé par DTSC. Le backend refuse une URL arbitraire ou un fichier appartenant à un autre utilisateur préparateur. La route d'upload applique same-origin, limites MIME/taille, rate limiting, RBAC, audit et stockage Supabase privé. L'approbateur peut ouvrir le justificatif depuis le détail financier sans rendre le fichier public.\n'''
    workflow_docs.write_text(docs)

print("Final Sprint 5 payroll security hardening applied.")
