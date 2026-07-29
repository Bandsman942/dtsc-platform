from pathlib import Path
import json


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Missing integration anchor in {path}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    text = read(path)
    if replacement in text:
        return
    start_index = text.find(start)
    end_index = text.find(end, start_index + len(start)) if start_index >= 0 else -1
    if start_index < 0 or end_index < 0:
        raise SystemExit(f"Missing block anchors in {path}: {start!r} -> {end!r}")
    write(path, text[:start_index] + replacement + "\n\n" + text[end_index:])


# Prisma: expand only; legacy rows remain workflowVersion = null.
schema = "prisma/schema.prisma"
replace_once(
    schema,
    '''  payrolls            HrcfoPayroll[]
  workEntries         DtscWorkEntry[]            @relation("DtscWorkEntryEmployee")''',
    '''  payrolls            HrcfoPayroll[]              @relation("HrcfoPayrollEmployee")
  preparedPayrolls    HrcfoPayroll[]              @relation("HrcfoPayrollPreparedBy")
  approvedPayrolls    HrcfoPayroll[]              @relation("HrcfoPayrollApprover")
  payrollReviews      HrcfoPayrollReview[]        @relation("HrcfoPayrollReviewActor")
  workEntries         DtscWorkEntry[]             @relation("DtscWorkEntryEmployee")''',
)

old_payroll = '''model HrcfoPayroll {
  id              String            @id @default(cuid())
  employeeId      String
  periodStart     DateTime
  periodEnd       DateTime
  grossAmount     Decimal           @db.Decimal(12, 2)
  bonusAmount     Decimal           @default(0) @db.Decimal(12, 2)
  deductionAmount Decimal           @default(0) @db.Decimal(12, 2)
  netAmount       Decimal           @db.Decimal(12, 2)
  accountId       String?
  budgetId        String?
  transactionId   String?           @unique
  status          String            @default("DRAFT")
  notes           String?
  createdById     String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  employee        HrcfoEmployee     @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  account         FinancialAccount? @relation(fields: [accountId], references: [id], onDelete: SetNull)
  budget          HrcfoBudget?      @relation(fields: [budgetId], references: [id], onDelete: SetNull)
  transaction     HrcfoExpense?     @relation(fields: [transactionId], references: [id], onDelete: SetNull)

  @@unique([employeeId, periodStart, periodEnd])
  @@index([status, periodStart])
  @@index([accountId])
  @@index([budgetId])
}'''
new_payroll = '''model HrcfoPayroll {
  id                          String                    @id @default(cuid())
  employeeId                  String
  periodStart                 DateTime
  periodEnd                   DateTime
  grossAmount                 Decimal                   @db.Decimal(12, 2)
  bonusAmount                 Decimal                   @default(0) @db.Decimal(12, 2)
  deductionAmount             Decimal                   @default(0) @db.Decimal(12, 2)
  netAmount                   Decimal                   @db.Decimal(12, 2)
  accountId                   String?
  budgetId                    String?
  transactionId               String?                   @unique
  status                      String                    @default("DRAFT")
  notes                       String?
  createdById                 String?
  workflowVersion             Int?
  baseAmountSource            String?
  baseAmountOverride          Decimal?                  @db.Decimal(12, 2)
  baseAmountOverrideReason    String?
  bonusReason                 String?
  deductionReason             String?
  workCoverage                String?
  workCoverageExceptionReason String?
  approvedWorkMinutes         Int?
  approvedWorkEntryCount      Int?
  approvedSubmissionCount     Int?
  workEvidenceCapturedAt      DateTime?
  preparedByEmployeeId        String?
  requiredApproverCode        String?
  approverEmployeeId          String?
  submittedAt                 DateTime?
  approvedAt                  DateTime?
  rejectedAt                  DateTime?
  paidAt                      DateTime?
  reviewComment               String?
  adjustmentEvidenceUrl       String?
  paymentReference            String?
  revision                    Int                       @default(0)
  createdAt                   DateTime                  @default(now())
  updatedAt                   DateTime                  @updatedAt
  employee                    HrcfoEmployee             @relation("HrcfoPayrollEmployee", fields: [employeeId], references: [id], onDelete: Restrict)
  account                     FinancialAccount?         @relation(fields: [accountId], references: [id], onDelete: SetNull)
  budget                      HrcfoBudget?              @relation(fields: [budgetId], references: [id], onDelete: SetNull)
  transaction                 HrcfoExpense?             @relation(fields: [transactionId], references: [id], onDelete: SetNull)
  preparedBy                  HrcfoEmployee?            @relation("HrcfoPayrollPreparedBy", fields: [preparedByEmployeeId], references: [id], onDelete: SetNull)
  approver                    HrcfoEmployee?            @relation("HrcfoPayrollApprover", fields: [approverEmployeeId], references: [id], onDelete: SetNull)
  workEvidence                HrcfoPayrollWorkEntry[]
  reviews                     HrcfoPayrollReview[]

  @@unique([employeeId, periodStart, periodEnd])
  @@index([status, periodStart])
  @@index([accountId])
  @@index([budgetId])
  @@index([workflowVersion, status, periodStart])
  @@index([requiredApproverCode, status])
  @@index([preparedByEmployeeId])
  @@index([approverEmployeeId])
}

model HrcfoPayrollWorkEntry {
  id               String             @id @default(cuid())
  payrollId        String
  workEntryId      String
  workSubmissionId String
  approvedMinutes  Int
  releasedAt       DateTime?
  createdAt        DateTime           @default(now())
  payroll          HrcfoPayroll       @relation(fields: [payrollId], references: [id], onDelete: Cascade)
  workEntry        DtscWorkEntry      @relation(fields: [workEntryId], references: [id], onDelete: Restrict)
  workSubmission   DtscWorkSubmission @relation(fields: [workSubmissionId], references: [id], onDelete: Restrict)

  @@unique([payrollId, workEntryId])
  @@index([payrollId, releasedAt])
  @@index([workSubmissionId])
}

model HrcfoPayrollReview {
  id              String        @id @default(cuid())
  payrollId       String
  actorEmployeeId String
  action          String
  comment         String?
  createdAt       DateTime      @default(now())
  payroll         HrcfoPayroll  @relation(fields: [payrollId], references: [id], onDelete: Cascade)
  actor           HrcfoEmployee @relation("HrcfoPayrollReviewActor", fields: [actorEmployeeId], references: [id], onDelete: Restrict)

  @@index([payrollId, createdAt])
  @@index([actorEmployeeId, createdAt])
}'''
replace_once(schema, old_payroll, new_payroll)
replace_once(schema, '''  entries            DtscWorkEntry[]
  reviews            DtscWorkSubmissionReview[]''', '''  entries            DtscWorkEntry[]
  reviews            DtscWorkSubmissionReview[]
  payrollEvidence    HrcfoPayrollWorkEntry[]''')
replace_once(schema, '''  submission                  DtscWorkSubmission? @relation(fields: [submissionId], references: [id], onDelete: Restrict)

  @@index([employeeId, workDate, deletedAt])''', '''  submission                  DtscWorkSubmission?      @relation(fields: [submissionId], references: [id], onDelete: Restrict)
  payrollEvidence             HrcfoPayrollWorkEntry[]

  @@index([employeeId, workDate, deletedAt])''')

# Finance engine: expose the existing transaction engine inside a caller-owned transaction,
# lock the budget/account rows, and make the old payroll CRUD draft-only.
finance = "lib/hr-cfo-finance.ts"
new_transaction_engine = '''export async function createValidatedTransaction(input: HrcfoTransactionInput) {
  return prisma.$transaction((tx) => createValidatedTransactionInTx(tx, input));
}

export async function createValidatedTransactionInTx(tx: Prisma.TransactionClient, input: HrcfoTransactionInput) {
  const normalizedCategory = input.transactionCategory || input.category;
  if (input.category !== normalizedCategory) {
    throw new Error("La catégorie de transaction est incohérente.");
  }

  const existing = input.sourceType && input.sourceId
    ? await tx.hrcfoExpense.findFirst({ where: { sourceType: input.sourceType, sourceId: input.sourceId } })
    : null;
  if (existing) return existing;

  const status = input.status || "PENDING";
  let accountId = input.accountId;
  if (normalizedCategory === "OUT") {
    if (!input.budgetId) throw new Error("Une transaction de sortie doit être liée à un budget disponible.");
    await tx.$queryRaw`SELECT "id" FROM "HrcfoBudget" WHERE "id" = ${input.budgetId} FOR UPDATE`;
    const budget = await tx.hrcfoBudget.findUnique({
      where: { id: input.budgetId },
      select: { id: true, accountId: true, amount: true, spentAmount: true, status: true },
    });
    if (!budget || !["OPEN", "MONITORING"].includes(budget.status)) throw new Error("Le budget sélectionné n'est pas actif.");
    if (!budget.accountId) throw new Error("Le budget sélectionné n'est lié à aucun compte financier.");
    accountId = budget.accountId;
    await tx.$queryRaw`SELECT "id" FROM "FinancialAccount" WHERE "id" = ${accountId} FOR UPDATE`;
    await assertBudgetAndAccountCanSpend(tx, budget.id, accountId, input.amount);
  }

  if (!accountId) throw new Error("Une transaction d'entrée doit être liée à un compte financier.");
  if (normalizedCategory !== "OUT") {
    await tx.$queryRaw`SELECT "id" FROM "FinancialAccount" WHERE "id" = ${accountId} FOR UPDATE`;
  }
  const account = await tx.financialAccount.findUnique({ where: { id: accountId } });
  if (!account || account.status !== "ACTIVE") throw new Error("Le compte financier sélectionné est inactif ou introuvable.");

  const transaction = await tx.hrcfoExpense.create({
    data: {
      title: input.title,
      requesterName: input.requesterName || "DTSC",
      category: normalizedCategory,
      transactionCategory: normalizedCategory,
      transactionType: input.transactionType || "MANUAL",
      amount: input.amount,
      currency: input.currency || "USD",
      transactionDate: input.transactionDate || new Date(),
      accountId,
      departmentId: input.departmentId || null,
      budgetId: input.budgetId || null,
      paymentMethod: input.paymentMethod || null,
      attachmentUrl: input.attachmentUrl || null,
      sourceType: input.sourceType || null,
      sourceId: input.sourceId || null,
      clientUserId: input.clientUserId || null,
      status,
      priority: input.priority || "MEDIUM",
      validatedAt: isFinanciallyImpactingStatus(status) ? new Date() : null,
      paidAt: status === "PAID" ? new Date() : null,
      notes: input.notes || null,
      createdById: input.createdById || null,
    },
  });

  if (isFinanciallyImpactingStatus(status)) {
    await reconcileFinancialState(tx);
    if (!input.skipInvoice) {
      await createOperationalInvoice(tx, transaction.id, {
        userId: input.clientUserId || input.createdById,
        title: input.title,
        amount: input.amount,
        currency: input.currency || "USD",
        paidAt: normalizedCategory === "IN" ? transaction.validatedAt : null,
      });
    }
  }
  return transaction;
}'''
replace_between(finance, "export async function createValidatedTransaction(input: HrcfoTransactionInput) {", "export async function createPayroll(input: PayrollInput) {", new_transaction_engine)
new_legacy_create = '''export async function createPayroll(input: PayrollInput) {
  if (input.status && input.status !== "DRAFT") {
    throw new Error("Le CRUD historique de paie ne peut créer qu'un brouillon. Le workflow Sprint 5 doit être utilisé pour soumettre, valider ou payer.");
  }
  const employee = await prisma.hrcfoEmployee.findUnique({ where: { id: input.employeeId } });
  if (!employee) throw new Error("Collaborateur introuvable pour la paie.");
  const budget = await prisma.hrcfoBudget.findUnique({ where: { id: input.budgetId } });
  if (!budget || !budget.accountId) throw new Error("Le budget de paie doit être lié à un compte financier.");
  const grossAmount = Number(employee.monthlyCompensation || input.grossAmount || 0);
  const bonusAmount = Number(input.bonusAmount || 0);
  const deductionAmount = Number(input.deductionAmount || 0);
  const netAmount = grossAmount + bonusAmount - deductionAmount;
  if (netAmount <= 0) throw new Error("Le montant net de paie doit être positif.");
  return prisma.hrcfoPayroll.create({
    data: {
      employeeId: input.employeeId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      grossAmount,
      bonusAmount,
      deductionAmount,
      netAmount,
      accountId: budget.accountId,
      budgetId: input.budgetId,
      status: "DRAFT",
      notes: input.notes,
      createdById: input.createdById,
    },
  });
}'''
replace_between(finance, "export async function createPayroll(input: PayrollInput) {", "export async function updateHrcfoTransaction", new_legacy_create)
new_legacy_update = '''export async function updatePayroll(id: string, input: Partial<PayrollInput>) {
  const existing = await prisma.hrcfoPayroll.findUnique({ where: { id }, include: { employee: true } });
  if (!existing) throw new Error("Paie introuvable.");
  if (existing.workflowVersion === 1) throw new Error("Le workflow Sprint 5 doit être utilisé pour modifier cette paie.");
  if (existing.status !== "DRAFT" || (input.status && input.status !== "DRAFT")) {
    throw new Error("Le CRUD historique de paie ne peut modifier qu'un brouillon sans impact financier. Le workflow Sprint 5 doit être utilisé.");
  }
  const budgetId = input.budgetId || existing.budgetId;
  if (!budgetId) throw new Error("La paie doit être liée à un budget.");
  const budget = await prisma.hrcfoBudget.findUnique({ where: { id: budgetId }, select: { accountId: true, status: true } });
  if (!budget || !budget.accountId || !["OPEN", "MONITORING"].includes(budget.status)) throw new Error("Le budget de paie est inactif ou sans compte financier.");
  const grossAmount = Number(existing.employee.monthlyCompensation || existing.grossAmount || 0);
  const bonusAmount = Number(input.bonusAmount ?? existing.bonusAmount);
  const deductionAmount = Number(input.deductionAmount ?? existing.deductionAmount);
  const netAmount = grossAmount + bonusAmount - deductionAmount;
  if (netAmount <= 0) throw new Error("Le montant net de paie doit être positif.");
  const payroll = await prisma.hrcfoPayroll.update({
    where: { id },
    data: {
      periodStart: input.periodStart || existing.periodStart,
      periodEnd: input.periodEnd || existing.periodEnd,
      grossAmount,
      bonusAmount,
      deductionAmount,
      netAmount,
      accountId: budget.accountId,
      budgetId,
      status: "DRAFT",
      notes: input.notes ?? existing.notes,
    },
    include: { employee: true, account: true, budget: true },
  });
  return { ...payroll, employeeName: payroll.employee.fullName, accountName: payroll.account?.name, budgetName: payroll.budget?.name };
}'''
replace_between(finance, "export async function updatePayroll(id: string, input: Partial<PayrollInput>) {", "export async function deleteHrcfoTransaction", new_legacy_update)

# Generic HR & CFO CRUD must no longer expose payroll status as a free-form command.
create_route = "app/api/admin/hr-cfo/[entity]/route.ts"
replace_once(create_route, 'import { createHrcfoBudget, createPayroll, createValidatedTransaction } from "@/lib/hr-cfo-finance";', 'import { createHrcfoBudget, createValidatedTransaction } from "@/lib/hr-cfo-finance";')
replace_once(create_route, 'type HrcfoEntity = "employees" | "budgets" | "transactions" | "payrolls" | "departments" | "accounts" | "positions";', 'type HrcfoEntity = "employees" | "budgets" | "transactions" | "departments" | "accounts" | "positions";')
replace_once(create_route, 'return value === "employees" || value === "budgets" || value === "transactions" || value === "payrolls" || value === "departments" || value === "accounts" || value === "positions";', 'return value === "employees" || value === "budgets" || value === "transactions" || value === "departments" || value === "accounts" || value === "positions";')
replace_once(create_route, '  return hrcfoSchemas.payrolls.safeParse(body);', '  return hrcfoSchemas.budgets.safeParse(body);')
old_payroll_create_tail = '''  const payroll = await createPayroll({ ...(data as Parameters<typeof createPayroll>[0]), createdById });
  const saved = await prisma.hrcfoPayroll.findUnique({
    where: { id: payroll.id },
    include: { employee: true, account: true, budget: true },
  });
  return saved ? {
    ...saved,
    employeeName: saved.employee.fullName,
    accountName: saved.account?.name,
    budgetName: saved.budget?.name,
  } : payroll;'''
replace_once(create_route, old_payroll_create_tail, '  throw new Error("Entité HR & CFO non prise en charge par le CRUD générique.");')

update_route = "app/api/admin/hr-cfo/[entity]/[id]/route.ts"
replace_once(update_route, 'import { deleteHrcfoTransaction, updateHrcfoTransaction, updatePayroll } from "@/lib/hr-cfo-finance";', 'import { deleteHrcfoTransaction, updateHrcfoTransaction } from "@/lib/hr-cfo-finance";')
replace_once(update_route, 'type HrcfoEntity = "employees" | "budgets" | "transactions" | "payrolls" | "departments" | "accounts" | "positions";', 'type HrcfoEntity = "employees" | "budgets" | "transactions" | "departments" | "accounts" | "positions";')
replace_once(update_route, 'return value === "employees" || value === "budgets" || value === "transactions" || value === "payrolls" || value === "departments" || value === "accounts" || value === "positions";', 'return value === "employees" || value === "budgets" || value === "transactions" || value === "departments" || value === "accounts" || value === "positions";')
replace_once(update_route, '  if (entity === "payrolls") {\n    return updatePayroll(id, data as never);\n  }', '  if (entity === "payrolls") { throw new Error("Le workflow Sprint 5 doit être utilisé pour la paie."); }') if '  if (entity === "payrolls") {' in read(update_route) else None

# Admin: dedicated payroll preparation and financial approval surfaces.
admin_page = "app/admin/page.tsx"
replace_once(admin_page, 'import { OperationsAdminPanel } from "@/components/admin/operations-admin-panel";\nimport { WorkSubmissionReviewPanel } from "@/components/admin/work-submission-review-panel";', 'import { OperationsAdminPanel } from "@/components/admin/operations-admin-panel";\nimport { PayrollApprovalPanel } from "@/components/admin/payroll-approval-panel";\nimport { PayrollWorkflowPanel } from "@/components/admin/payroll-workflow-panel";\nimport { WorkSubmissionReviewPanel } from "@/components/admin/work-submission-review-panel";')
replace_once(admin_page, '''        {activeSection === "hrCfo" && canView("hrCfo") && (
          <OperationsAdminPanel
            eyebrow="Gestion interne"
            title="Opérations HR & CFO"
            description="Centralisez les dossiers RH, budgets, dépenses, factures, alertes et contrôles internes de DTSC. Cette section suit les principes de reporting capital humain, contrôle interne, séparation des validations et pilotage financier utile aux décisions."
            playbook={["Dossier RH complet", "Budget cadré", "Dépense soumise", "Validation financière", "Paiement ou clôture", "Audit"]}
            datasets={internalModulesDataset.hrcfoDatasets}
            canEdit={canView("hrCfo")}
          />
        )}''', '''        {activeSection === "hrCfo" && canView("hrCfo") && (
          <div className="space-y-5">
            <PayrollWorkflowPanel locale={user.locale} />
            <OperationsAdminPanel
              eyebrow="Gestion interne"
              title="Opérations HR & CFO"
              description="Centralisez les dossiers RH, budgets, dépenses, factures, alertes et contrôles internes de DTSC. La paie utilise désormais son workflow dédié ci-dessus."
              playbook={["Dossier RH complet", "Budget cadré", "Dépense soumise", "Validation financière", "Paiement ou clôture", "Audit"]}
              datasets={internalModulesDataset.hrcfoDatasets.filter((dataset) => dataset.id !== "payrolls")}
              canEdit={canView("hrCfo")}
            />
          </div>
        )}''')
replace_once(admin_page, '            <WorkSubmissionReviewPanel reviewerRole="COO" locale={user.locale} />', '            <PayrollApprovalPanel approverRole="COO" locale={user.locale} />\n            <WorkSubmissionReviewPanel reviewerRole="COO" locale={user.locale} />')
replace_once(admin_page, '            <CeoExecutiveSummary groups={internalModulesDataset.ceoExecutiveGroups} dateStart={selectedCeoStart} dateEnd={selectedCeoEnd} />\n            <WorkSubmissionReviewPanel reviewerRole="CEO" locale={user.locale} />', '            <CeoExecutiveSummary groups={internalModulesDataset.ceoExecutiveGroups} dateStart={selectedCeoStart} dateEnd={selectedCeoEnd} />\n            <PayrollApprovalPanel approverRole="CEO" locale={user.locale} />\n            <WorkSubmissionReviewPanel reviewerRole="CEO" locale={user.locale} />')

# Collaborator activities: self-only already, but stop loading/exposing budget/account and show only payroll-safe context.
activities = "app/activities/page.tsx"
replace_once(activities, '''    prisma.hrcfoPayroll.findMany({
      where: { employeeId: employee.id },
      include: { budget: true, account: true },
      orderBy: [{ periodStart: "desc" }, { updatedAt: "desc" }],
      take: 80,
    }),''', '''    prisma.hrcfoPayroll.findMany({
      where: { employeeId: employee.id },
      orderBy: [{ periodStart: "desc" }, { updatedAt: "desc" }],
      take: 80,
    }),''')
replace_once(activities, '''    {
      id: "payrolls",
      title: "Suivi de la paie",
      description: "Consultez vos rémunérations dans le temps, le net payé, le budget lié et vos bulletins de paie.",
      items: payrolls.map((payroll) => ({
        id: payroll.id,
        entityType: "PAYROLL" as const,
        title: `Paie ${formatDate(payroll.periodStart)} - ${formatDate(payroll.periodEnd)}`,
        status: payroll.status,
        detail: [`Net: ${Number(payroll.netAmount).toFixed(2)} USD`, payroll.budget?.name, payroll.account?.name].filter(Boolean).join(" · "),
        body: [
          `Brut: ${Number(payroll.grossAmount).toFixed(2)} USD`,
          `Primes: ${Number(payroll.bonusAmount).toFixed(2)} USD`,
          `Retenues: ${Number(payroll.deductionAmount).toFixed(2)} USD`,
          payroll.notes || "",
        ].filter(Boolean).join("\n"),
        href: `/api/admin/payrolls/${payroll.id}/pdf`,
        hrefLabel: "Télécharger le bulletin de paie",
        date: toIso(payroll.periodStart),
      })),
    },''', '''    {
      id: "payrolls",
      title: user.locale === "en" ? "My payroll" : "Suivi de la paie",
      description: user.locale === "en" ? "View only your own payroll status and payslips, without internal budget or account data." : "Consultez uniquement vos propres paies et bulletins, sans données internes de budget ou de compte financier.",
      items: payrolls.map((payroll) => ({
        id: payroll.id,
        entityType: "PAYROLL" as const,
        title: `${user.locale === "en" ? "Payroll" : "Paie"} ${formatDate(payroll.periodStart)} - ${formatDate(payroll.periodEnd)}`,
        status: payroll.status,
        detail: [`${user.locale === "en" ? "Net" : "Net"}: ${Number(payroll.netAmount).toFixed(2)} USD`, payroll.approvedWorkMinutes != null ? `${user.locale === "en" ? "Approved time" : "Temps approuvé"}: ${Math.floor(payroll.approvedWorkMinutes / 60)} h ${String(payroll.approvedWorkMinutes % 60).padStart(2, "0")}` : ""].filter(Boolean).join(" · "),
        body: [
          `${user.locale === "en" ? "Base" : "Brut"}: ${Number(payroll.grossAmount).toFixed(2)} USD`,
          `${user.locale === "en" ? "Bonus" : "Primes"}: ${Number(payroll.bonusAmount).toFixed(2)} USD${payroll.bonusReason ? ` — ${payroll.bonusReason}` : ""}`,
          `${user.locale === "en" ? "Deductions" : "Retenues"}: ${Number(payroll.deductionAmount).toFixed(2)} USD${payroll.deductionReason ? ` — ${payroll.deductionReason}` : ""}`,
          payroll.workCoverage ? `${user.locale === "en" ? "Work coverage" : "Couverture des prestations"}: ${payroll.workCoverage === "COMPLETE" ? (user.locale === "en" ? "Complete" : "Complète") : payroll.workCoverage === "PARTIAL" ? (user.locale === "en" ? "Partial" : "Partielle") : (user.locale === "en" ? "None" : "Aucune")}` : "",
          payroll.notes || "",
        ].filter(Boolean).join("\n"),
        href: ["VALIDATED", "PAID"].includes(payroll.status) ? `/api/admin/payrolls/${payroll.id}/pdf` : undefined,
        hrefLabel: user.locale === "en" ? "Download payslip" : "Télécharger le bulletin de paie",
        date: toIso(payroll.periodStart),
      })),
    },''')

# Payslip: remove budget/account disclosure and generic MANAGER/SUPPORT access; include Sprint 5 evidence safely.
payslip = "app/api/admin/payrolls/[id]/pdf/route.ts"
replace_once(payslip, 'import { UserRole } from "@prisma/client";\nimport { getCurrentUser } from "@/lib/auth";', 'import { UserRole } from "@prisma/client";\nimport { getCurrentUser } from "@/lib/auth";\nimport { getCollaboratorBusinessContext } from "@/lib/business-roles";')
replace_once(payslip, '''      employee: true,
      account: true,
      budget: true,
      transaction: true,''', '''      employee: true,
      transaction: true,''')
replace_once(payslip, '''  const canReadPayroll =
    user.role === UserRole.ADMIN ||
    user.role === UserRole.MANAGER ||
    user.role === UserRole.SUPPORT ||
    payroll.employee.userId === user.id;
  if (!canReadPayroll) {
    return new Response("Forbidden", { status: 403 });
  }''', '''  const businessContext = await getCollaboratorBusinessContext(user.id);
  const isHrCfo = businessContext.positionCode === "HR_CFO";
  const isOwner = payroll.employee.userId === user.id;
  const canReadPayroll = user.role === UserRole.ADMIN || isHrCfo || isOwner;
  if (!canReadPayroll || (isOwner && !["VALIDATED", "PAID"].includes(payroll.status))) {
    return new Response("Forbidden", { status: 403 });
  }''')
replace_once(payslip, '''  const account = escapeHtml(payroll.account?.name || "Non renseigné");
  const budget = escapeHtml(payroll.budget?.name || "Non renseigné");
  const status = escapeHtml(payroll.status);
  const notes = escapeHtml(payroll.notes || "");''', '''  const approvedTime = payroll.approvedWorkMinutes == null ? "Historique non disponible" : `${Math.floor(payroll.approvedWorkMinutes / 60)} h ${String(payroll.approvedWorkMinutes % 60).padStart(2, "0")}`;
  const status = escapeHtml(payroll.status === "VALIDATED" ? "Validée" : payroll.status === "PAID" ? "Payée" : payroll.status);
  const validatedAt = payroll.approvedAt ? payroll.approvedAt.toLocaleDateString("fr-FR") : "Non renseignée";
  const paidAt = payroll.paidAt ? payroll.paidAt.toLocaleDateString("fr-FR") : "Non renseignée";
  const notes = escapeHtml(payroll.notes || "");''')
replace_once(payslip, '''          <div class="box"><strong>Statut</strong><br />${status}<br /><span class="muted">Compte: ${account}<br />Budget: ${budget}</span></div>''', '''          <div class="box"><strong>Statut</strong><br />${status}<br /><span class="muted">Temps approuvé: ${escapeHtml(approvedTime)}<br />Validation: ${escapeHtml(validatedAt)} · Paiement: ${escapeHtml(paidAt)}</span></div>''')

# Fix the new service's evidence type and avoid a self-referential z.infer in schema initialization.
workflow = "lib/payroll-workflow.ts"
replace_once(workflow, '''    workedMinutes: number;
    summary: string;''', '''    workedMinutes: number;
    approvedMinutes: number;
    summary: string;''')
replace_once(workflow, '''function validatePayrollPreparationInput(value: z.infer<typeof payrollPrepareSchema>, ctx: z.RefinementCtx) {''', '''function validatePayrollPreparationInput(value: { periodStart: string; periodEnd: string; bonusAmount: number; bonusReason?: string; deductionAmount: number; deductionReason?: string }, ctx: z.RefinementCtx) {''')

# React type import used by the HR form helper.
workflow_panel = "components/admin/payroll-workflow-panel.tsx"
replace_once(workflow_panel, 'import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";', 'import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";')
replace_once(workflow_panel, 'function FieldLabel({ label, children }: { label: string; children: React.ReactNode })', 'function FieldLabel({ label, children }: { label: string; children: ReactNode })')

# Package scripts.
package_path = Path("package.json")
package_data = json.loads(package_path.read_text())
regression = package_data["scripts"]["qa:regression"]
if "qa-payroll-work-integration-checks.mjs" not in regression:
    package_data["scripts"]["qa:regression"] = regression + " && node scripts/qa-payroll-work-integration-checks.mjs"
package_data["scripts"]["qa:payroll-workflow"] = "node scripts/qa-payroll-work-integration-checks.mjs"
package_path.write_text(json.dumps(package_data, ensure_ascii=False, indent=2) + "\n")

# i18n labels for all new Sprint 5 surfaces.
labels_fr = {
  "hrTitle": "Préparation de la paie", "hrDescription": "Préparez la paie à partir des prestations approuvées, puis soumettez-la à une approbation financière indépendante.",
  "metrics": "Indicateurs paie", "metricDraft": "Brouillons / corrections", "metricPending": "À approuver", "metricValidated": "Validées", "metricPaid": "Payées", "metricChanges": "À corriger", "metricRejected": "Refusées",
  "filters": "Filtres paie", "search": "Rechercher", "searchPlaceholder": "Collaborateur, poste, période…", "allStatuses": "Tous les statuts", "noActiveFilter": "Aucun filtre actif", "prepare": "Préparer la paie",
  "payrollList": "Paies", "payrollListDescription": "Une ligne par collaborateur et période. Les preuves de travail sont figées avant approbation.", "net": "Net", "approvedTime": "Temps approuvé", "legacy": "Historique", "open": "Examiner", "actions": "Actions", "edit": "Corriger",
  "emptyTitle": "Aucune paie", "emptyDescription": "Préparez une paie lorsque la période et le budget sont cadrés.", "editTitle": "Corriger la préparation", "prepareTitle": "Préparer une paie", "prepareDescription": "Le serveur détermine la rémunération standard et charge uniquement les prestations APPROVED.",
  "employee": "Collaborateur", "employeePlaceholder": "Choisir un collaborateur", "periodStart": "Début de période", "periodEnd": "Fin de période", "budget": "Budget", "budgetPlaceholder": "Choisir un budget", "accountMissing": "Compte indisponible", "budgetAccount": "Compte imposé par le budget",
  "baseSalary": "Rémunération de base", "fromHrRecord": "issue du dossier RH", "baseOverride": "Montant de base explicite", "baseOverrideReason": "Motif du montant de base", "bonus": "Prime", "bonusReason": "Motif de la prime", "deduction": "Retenue", "deductionReason": "Motif de la retenue",
  "coverageException": "Justification de couverture partielle ou absente", "adjustmentEvidence": "Justificatif d'ajustement", "replaceEvidence": "Remplacer le justificatif", "uploadEvidence": "Importer un justificatif privé", "uploadError": "Import du justificatif impossible.", "uploadDone": "Justificatif importé.", "notes": "Notes",
  "saving": "Enregistrement…", "save": "Enregistrer", "prepared": "Brouillon de paie préparé.", "updated": "Préparation mise à jour.", "saveError": "Enregistrement impossible.", "actionError": "Action impossible.", "submitted": "Paie soumise à approbation.", "markedPaid": "Paiement confirmé.", "cancelled": "Brouillon annulé.",
  "submit": "Soumettre", "cancelPayroll": "Annuler le brouillon", "markPaid": "Marquer payé", "detailTitle": "Détail de paie", "detailDescription": "Montants, preuves approuvées, budget, approbation et historique.",
  "submitTitle": "Soumettre pour approbation", "paidTitle": "Confirmer le paiement", "cancelTitle": "Annuler le brouillon", "submitConfirm": "La soumission fige les preuves de travail et transmet la paie à l'approbateur requis.", "paidConfirm": "Confirmez uniquement après exécution réelle du paiement.", "cancelConfirm": "L'annulation libère les preuves de travail sans créer de transaction financière.",
  "close": "Fermer", "confirm": "Confirmer", "cancelReason": "Motif d'annulation", "paymentReference": "Référence de paiement", "submitEvidenceFrozen": "Après soumission, les preuves de travail sont gelées. Une correction doit être demandée par l'approbateur.",
  "payroll": "Paie", "financialSummary": "Synthèse financière", "financialSummaryDescription": "Montants calculés côté serveur et contexte financier contrôlé.", "period": "Période", "account": "Compte", "approver": "Approbateur", "notAvailable": "Non renseigné",
  "workEvidence": "Prestations approuvées", "workEvidenceDescription": "Résumé des preuves opérationnelles Sprint 4 utilisées par cette paie.", "approvedEntries": "Prestations", "approvedSubmissions": "Soumissions", "coverage": "Couverture", "noWorkEvidence": "Aucune prestation approuvée", "noWorkEvidenceDescription": "La paie peut rester possible avec une justification RH explicite.",
  "history": "Historique", "historyDescription": "Soumissions, décisions et paiement restent traçables.", "noComment": "Sans commentaire", "noHistory": "Aucun historique", "noHistoryDescription": "Les décisions apparaîtront ici.",
  "approvalLoadError": "Chargement des paies à approuver impossible.", "approvalTitle": "Paies à approuver", "approvalDescriptionCeo": "Contrôle financier indépendant des paies DTSC hors paie CEO.", "approvalDescriptionCoo": "Contre-validation financière réservée à la paie du CEO.", "approvalMetrics": "File d'approbation", "approvalQueue": "File de validation", "approvalQueueDescription": "Ouvrez une paie pour examiner montants, preuves, couverture et budget.", "approvalEmpty": "Aucune paie à traiter", "approvalEmptyDescription": "La file est à jour.",
  "review": "Examiner", "requestChanges": "Demander correction", "reject": "Refuser", "approve": "Valider", "approvalDetailDescription": "La validation crée au maximum une transaction financière idempotente.", "approveTitle": "Valider financièrement", "changesTitle": "Demander une correction", "rejectTitle": "Refuser la paie", "approveDescription": "Confirmez l'approbation financière indépendante.", "reviewReasonDescription": "Le motif sera conservé dans l'historique.", "approveFinancialConfirmation": "Cette action revalide le budget, le compte, les montants et les preuves avant de créer l'unique transaction PAYROLL_WORKFLOW.", "comment": "Motif / commentaire", "financialApproval": "Approbation financière", "approvalFinancialDescription": "Le reviewer contrôle sans réécrire silencieusement les montants.", "preparedBy": "Préparé par", "approvalEvidenceDescription": "Le temps approuvé est une preuve opérationnelle, pas un taux salarial.", "coverageExceptionMissing": "Justification de couverture manquante.", "reviewError": "Décision impossible.", "approved": "Paie validée.", "changesRequested": "Correction demandée.", "rejected": "Paie refusée.", "loadError": "Chargement de la paie impossible.",
  "status_DRAFT": "Brouillon", "status_PENDING_APPROVAL": "En attente d'approbation", "status_CHANGES_REQUESTED": "À corriger", "status_VALIDATED": "Validée", "status_REJECTED": "Refusée", "status_PAID": "Payée", "status_CANCELLED": "Annulée", "status_CANCELED": "Annulée",
  "coverage_COMPLETE": "Couverture complète", "coverage_PARTIAL": "Couverture partielle", "coverage_NONE": "Aucune prestation approuvée", "coverageLegacy": "Historique non disponible",
  "workType_NORMAL_WORK": "Travail normal", "workType_MEETING": "Réunion", "workType_MISSION": "Mission", "workType_PROJECT_WORK": "Travail projet", "workType_SUPPORT": "Support", "workType_TRAINING": "Formation", "workType_ADMINISTRATIVE": "Administratif", "workType_OTHER": "Autre",
  "review_SUBMITTED": "Soumise", "review_RESUBMITTED": "Resoumise", "review_APPROVED": "Validée", "review_CHANGES_REQUESTED": "Correction demandée", "review_REJECTED": "Refusée", "review_PAID": "Paiement confirmé", "review_CANCELLED": "Annulée"
}
labels_en = {
  "hrTitle": "Payroll preparation", "hrDescription": "Prepare payroll from approved work, then submit it for independent financial approval.",
  "metrics": "Payroll metrics", "metricDraft": "Drafts / changes", "metricPending": "Pending approval", "metricValidated": "Validated", "metricPaid": "Paid", "metricChanges": "Changes requested", "metricRejected": "Rejected",
  "filters": "Payroll filters", "search": "Search", "searchPlaceholder": "Employee, role, period…", "allStatuses": "All statuses", "noActiveFilter": "No active filter", "prepare": "Prepare payroll",
  "payrollList": "Payrolls", "payrollListDescription": "One record per employee and period. Work evidence is frozen before approval.", "net": "Net", "approvedTime": "Approved time", "legacy": "Legacy", "open": "Review", "actions": "Actions", "edit": "Edit",
  "emptyTitle": "No payroll", "emptyDescription": "Prepare payroll once the period and budget are defined.", "editTitle": "Edit preparation", "prepareTitle": "Prepare payroll", "prepareDescription": "The server determines the standard base amount and loads APPROVED work only.",
  "employee": "Employee", "employeePlaceholder": "Choose an employee", "periodStart": "Period start", "periodEnd": "Period end", "budget": "Budget", "budgetPlaceholder": "Choose a budget", "accountMissing": "Account unavailable", "budgetAccount": "Account imposed by budget",
  "baseSalary": "Base compensation", "fromHrRecord": "from the HR record", "baseOverride": "Explicit base amount", "baseOverrideReason": "Base override reason", "bonus": "Bonus", "bonusReason": "Bonus reason", "deduction": "Deduction", "deductionReason": "Deduction reason",
  "coverageException": "Partial/no-work coverage justification", "adjustmentEvidence": "Adjustment evidence", "replaceEvidence": "Replace evidence", "uploadEvidence": "Upload private evidence", "uploadError": "Evidence upload failed.", "uploadDone": "Evidence uploaded.", "notes": "Notes",
  "saving": "Saving…", "save": "Save", "prepared": "Payroll draft prepared.", "updated": "Preparation updated.", "saveError": "Save failed.", "actionError": "Action failed.", "submitted": "Payroll submitted for approval.", "markedPaid": "Payment confirmed.", "cancelled": "Draft cancelled.",
  "submit": "Submit", "cancelPayroll": "Cancel draft", "markPaid": "Mark paid", "detailTitle": "Payroll detail", "detailDescription": "Amounts, approved evidence, budget, approval and history.",
  "submitTitle": "Submit for approval", "paidTitle": "Confirm payment", "cancelTitle": "Cancel draft", "submitConfirm": "Submission freezes work evidence and routes payroll to the required approver.", "paidConfirm": "Confirm only after the payment has actually been executed.", "cancelConfirm": "Cancellation releases work evidence without creating a financial transaction.",
  "close": "Close", "confirm": "Confirm", "cancelReason": "Cancellation reason", "paymentReference": "Payment reference", "submitEvidenceFrozen": "After submission, work evidence is frozen. Corrections require an approver-requested change cycle.",
  "payroll": "Payroll", "financialSummary": "Financial summary", "financialSummaryDescription": "Server-calculated amounts and controlled financial context.", "period": "Period", "account": "Account", "approver": "Approver", "notAvailable": "Not available",
  "workEvidence": "Approved work", "workEvidenceDescription": "Summary of Sprint 4 operational evidence used by this payroll.", "approvedEntries": "Work entries", "approvedSubmissions": "Submissions", "coverage": "Coverage", "noWorkEvidence": "No approved work", "noWorkEvidenceDescription": "Payroll may still proceed with an explicit HR justification.",
  "history": "History", "historyDescription": "Submissions, decisions and payment remain traceable.", "noComment": "No comment", "noHistory": "No history", "noHistoryDescription": "Decisions will appear here.",
  "approvalLoadError": "Unable to load payroll approvals.", "approvalTitle": "Payroll approvals", "approvalDescriptionCeo": "Independent financial control for DTSC payrolls except the CEO payroll.", "approvalDescriptionCoo": "Financial counter-approval restricted to the CEO payroll.", "approvalMetrics": "Approval queue", "approvalQueue": "Approval queue", "approvalQueueDescription": "Open a payroll to review amounts, evidence, coverage and budget.", "approvalEmpty": "Nothing to approve", "approvalEmptyDescription": "The queue is up to date.",
  "review": "Review", "requestChanges": "Request changes", "reject": "Reject", "approve": "Approve", "approvalDetailDescription": "Approval creates at most one idempotent financial transaction.", "approveTitle": "Financial approval", "changesTitle": "Request changes", "rejectTitle": "Reject payroll", "approveDescription": "Confirm the independent financial approval.", "reviewReasonDescription": "The reason is retained in the audit history.", "approveFinancialConfirmation": "This action revalidates budget, account, amounts and evidence before creating the single PAYROLL_WORKFLOW transaction.", "comment": "Reason / comment", "financialApproval": "Financial approval", "approvalFinancialDescription": "The reviewer controls the payroll without silently rewriting amounts.", "preparedBy": "Prepared by", "approvalEvidenceDescription": "Approved time is operational evidence, not a salary rate.", "coverageExceptionMissing": "Coverage justification is missing.", "reviewError": "Decision failed.", "approved": "Payroll approved.", "changesRequested": "Changes requested.", "rejected": "Payroll rejected.", "loadError": "Unable to load payroll.",
  "status_DRAFT": "Draft", "status_PENDING_APPROVAL": "Pending approval", "status_CHANGES_REQUESTED": "Changes requested", "status_VALIDATED": "Validated", "status_REJECTED": "Rejected", "status_PAID": "Paid", "status_CANCELLED": "Cancelled", "status_CANCELED": "Cancelled",
  "coverage_COMPLETE": "Complete coverage", "coverage_PARTIAL": "Partial coverage", "coverage_NONE": "No approved work", "coverageLegacy": "Legacy evidence unavailable",
  "workType_NORMAL_WORK": "Normal work", "workType_MEETING": "Meeting", "workType_MISSION": "Mission", "workType_PROJECT_WORK": "Project work", "workType_SUPPORT": "Support", "workType_TRAINING": "Training", "workType_ADMINISTRATIVE": "Administrative", "workType_OTHER": "Other",
  "review_SUBMITTED": "Submitted", "review_RESUBMITTED": "Resubmitted", "review_APPROVED": "Approved", "review_CHANGES_REQUESTED": "Changes requested", "review_REJECTED": "Rejected", "review_PAID": "Payment confirmed", "review_CANCELLED": "Cancelled"
}
for locale_file, labels in (("locales/fr.json", labels_fr), ("locales/en.json", labels_en)):
    path = Path(locale_file)
    data = json.loads(path.read_text())
    data["payrollWorkflow"] = labels
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

# Permanent engineering rules and documentation indexes.
agents = Path("AGENTS.md")
agents_text = agents.read_text()
marker = "<!-- SPRINT_05_PAYROLL_WORKFLOW_RULES -->"
if marker not in agents_text:
    agents.write_text(agents_text.rstrip() + '''\n\n<!-- SPRINT_05_PAYROLL_WORKFLOW_RULES -->
## Règles permanentes — paie DTSC à partir du travail approuvé

- Payroll may consume only approved DTSC work submissions/entries.
- Availability and unapproved work must never feed payroll.
- Approved minutes are operational evidence and must not automatically determine salary without an explicit compensation policy.
- The standard gross salary source remains the employee HR compensation record for a normal full-month payroll.
- Bonuses and deductions require explicit audited reasons.
- HR & CFO prepares payroll but does not financially approve its own preparation.
- CEO approves standard DTSC payrolls; COO approves the CEO payroll.
- No employee may approve their own payroll, including CEO, COO, HR_CFO or ADMIN.
- Draft and pending payrolls must not create financial transactions.
- Financially validated payrolls must create at most one idempotent PAYROLL_WORKFLOW transaction; marking paid must reuse that transaction.
- A work entry may not be consumed by multiple active payrolls.
- Validated and paid payroll evidence and financial amounts are immutable in the normal workflow.
- Legacy payrolls remain readable without fabricated Sprint 4 evidence.
- Vercel remains production-only from main; feature branches must never enable or trigger preview deployments.
<!-- /SPRINT_05_PAYROLL_WORKFLOW_RULES -->\n''')

append_docs = {
  "docs/TECHNICAL_DOCUMENTATION.md": "\n\n## Sprint 5 — Paie fondée sur les prestations approuvées\nLe workflow détaillé est documenté dans `docs/DTSC_PAYROLL_WORKFLOW.md`. Les paies Sprint 5 consomment uniquement les preuves APPROVED du Sprint 4, séparent préparation HR & CFO, approbation CEO/COO et paiement, et utilisent une transaction `PAYROLL_WORKFLOW` idempotente. Les anciennes paies restent des enregistrements legacy lisibles.\n",
  "docs/QA_REGRESSION_CHECKLIST.md": "\n\n## Sprint 5 — Payroll / approved work\n- [ ] `pnpm qa:payroll-workflow` passe.\n- [ ] Seules les prestations APPROVED sont consommées.\n- [ ] Une entrée active ne peut être liée à deux paies.\n- [ ] DRAFT/PENDING_APPROVAL ne créent aucune transaction.\n- [ ] CEO approuve les paies standard, COO uniquement la paie CEO, aucune auto-approbation.\n- [ ] VALIDATED crée au plus une transaction `PAYROLL_WORKFLOW`; PAID la réutilise.\n- [ ] Bonus/retenue exigent un motif et les périodes partielles ne sont jamais proratisées automatiquement.\n- [ ] Les anciennes paies restent consultables et le collaborateur ne voit ni budget ni compte financier.\n",
  "docs/CHANGELOG.md": "\n- Sprint 5: ajout du workflow DTSC de paie fondé sur les prestations approuvées, snapshots de travail, anti-double-consommation, préparation HR & CFO, approbation CEO/COO, motifs d'ajustement, transaction financière idempotente, paiement séparé, bulletins renforcés et compatibilité legacy.\n",
}
for path_string, appendix in append_docs.items():
    path = Path(path_string)
    text = path.read_text()
    if "Sprint 5" not in text[-3000:]:
        path.write_text(text.rstrip() + appendix)

print("Sprint 5 integration patch applied successfully.")
