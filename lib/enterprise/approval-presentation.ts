import { getEnterpriseModuleDefinition, normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";

export type PendingApprovalReference = {
  id: string;
  targetEntityType: string;
  targetEntityId: string;
};

export type EnterpriseApprovalPresentation = {
  title: string;
  description: string;
  sourceModuleCode: string | null;
  sourceModuleLabel: string;
  actionUrl: string;
  priority: string | null;
};

type Seed = Omit<EnterpriseApprovalPresentation, "sourceModuleLabel"> & { sourceModuleCode: string | null };

function moduleLabel(moduleCode: string | null, english: boolean) {
  if (!moduleCode) return english ? "Approvals" : "Validations";
  const definition = getEnterpriseModuleDefinition(normalizeEnterpriseModuleCode(moduleCode));
  if (!definition) return english ? "Business module" : "Module métier";
  return english ? definition.labelEn : definition.labelFr;
}

function presentation(seed: Seed, english: boolean): EnterpriseApprovalPresentation {
  return { ...seed, sourceModuleLabel: moduleLabel(seed.sourceModuleCode, english) };
}

function idsFor(approvals: PendingApprovalReference[], type: string) {
  return approvals.filter((item) => item.targetEntityType === type).map((item) => item.targetEntityId);
}

export async function resolveEnterpriseApprovalPresentations(
  organizationId: string,
  approvals: PendingApprovalReference[],
  english: boolean,
) {
  const map = new Map<string, EnterpriseApprovalPresentation>();
  if (!approvals.length) return map;

  const [
    transfers,
    tasks,
    requests,
    meetings,
    purchases,
    budgets,
    expenses,
    incidents,
    leaveRequests,
    employmentContracts,
    timesheets,
    payrollRuns,
  ] = await Promise.all([
    prisma.enterpriseAccountTransfer.findMany({
      where: { organizationId, id: { in: idsFor(approvals, "EnterpriseAccountTransfer") } },
      select: { id: true, number: true, sourceAmount: true, sourceCurrencyCode: true, targetAmount: true, targetCurrencyCode: true },
    }),
    prisma.enterpriseTask.findMany({
      where: { organizationId, id: { in: idsFor(approvals, "EnterpriseTask") }, archivedAt: null },
      select: { id: true, title: true, description: true, priority: true },
    }),
    prisma.enterpriseRequest.findMany({
      where: { organizationId, id: { in: idsFor(approvals, "EnterpriseRequest") }, archivedAt: null },
      select: { id: true, title: true, description: true, priority: true },
    }),
    prisma.enterpriseMeeting.findMany({
      where: { organizationId, id: { in: idsFor(approvals, "EnterpriseMeeting") }, archivedAt: null },
      select: { id: true, title: true, agenda: true },
    }),
    prisma.enterprisePurchase.findMany({
      where: { organizationId, id: { in: idsFor(approvals, "EnterprisePurchase") }, archivedAt: null },
      select: { id: true, reference: true, title: true, priority: true },
    }),
    prisma.enterpriseBudget.findMany({
      where: { organizationId, id: { in: idsFor(approvals, "EnterpriseBudget") }, archivedAt: null },
      select: { id: true, reference: true, title: true },
    }),
    prisma.enterpriseExpense.findMany({
      where: { organizationId, id: { in: idsFor(approvals, "EnterpriseExpense") }, archivedAt: null },
      select: { id: true, reference: true, title: true },
    }),
    prisma.pharmacyQualityIncident.findMany({
      where: { organizationId, id: { in: idsFor(approvals, "PharmacyQualityIncident") } },
      select: { id: true, title: true, priority: true, description: true },
    }),
    prisma.enterpriseLeaveRequest.findMany({
      where: { organizationId, id: { in: idsFor(approvals, "EnterpriseLeaveRequest") }, archivedAt: null },
      select: { id: true, reference: true, leaveType: true, startDate: true, endDate: true },
    }),
    prisma.enterpriseEmploymentContract.findMany({
      where: { organizationId, id: { in: idsFor(approvals, "EnterpriseEmploymentContract") }, archivedAt: null },
      select: { id: true, reference: true, contractType: true, jobTitle: true },
    }),
    prisma.enterpriseTimesheet.findMany({
      where: { organizationId, id: { in: idsFor(approvals, "EnterpriseTimesheet") }, archivedAt: null },
      select: { id: true, reference: true, periodStart: true, periodEnd: true },
    }),
    prisma.enterprisePayrollRun.findMany({
      where: { organizationId, id: { in: idsFor(approvals, "EnterprisePayrollRun") }, archivedAt: null },
      select: { id: true, reference: true, employeeCount: true, netAmount: true, currency: true },
    }),
  ]);

  for (const item of transfers) {
    map.set(`EnterpriseAccountTransfer:${item.id}`, presentation({
      title: english ? `Transfer ${item.number}` : `Transfert ${item.number}`,
      description: english
        ? `${item.sourceAmount.toFixed()} ${item.sourceCurrencyCode} → ${item.targetAmount.toFixed()} ${item.targetCurrencyCode}`
        : `${item.sourceAmount.toFixed()} ${item.sourceCurrencyCode} → ${item.targetAmount.toFixed()} ${item.targetCurrencyCode}`,
      sourceModuleCode: "FINANCE_TREASURY",
      actionUrl: `/enterprise-modules/FINANCE_TREASURY?transfer=${encodeURIComponent(item.id)}`,
      priority: "HIGH",
    }, english));
  }
  for (const item of tasks) {
    map.set(`EnterpriseTask:${item.id}`, presentation({ title: item.title, description: item.description || (english ? "Task awaiting approval." : "Tâche en attente de validation."), sourceModuleCode: "TASKS_OPERATIONS", actionUrl: `/enterprise-modules/TASKS_OPERATIONS?task=${encodeURIComponent(item.id)}`, priority: item.priority }, english));
  }
  for (const item of requests) {
    map.set(`EnterpriseRequest:${item.id}`, presentation({ title: item.title, description: item.description, sourceModuleCode: "INTERNAL_REQUESTS", actionUrl: `/enterprise-modules/INTERNAL_REQUESTS?request=${encodeURIComponent(item.id)}`, priority: item.priority }, english));
  }
  for (const item of meetings) {
    map.set(`EnterpriseMeeting:${item.id}`, presentation({ title: item.title, description: item.agenda || (english ? "Meeting awaiting approval." : "Réunion en attente de validation."), sourceModuleCode: "MEETINGS", actionUrl: `/enterprise-modules/MEETINGS?meeting=${encodeURIComponent(item.id)}`, priority: "NORMAL" }, english));
  }
  for (const item of purchases) {
    map.set(`EnterprisePurchase:${item.id}`, presentation({ title: `${item.reference} · ${item.title}`, description: english ? "Purchase awaiting approval." : "Achat en attente de validation.", sourceModuleCode: "SUPPLIERS_PURCHASES", actionUrl: `/enterprise-modules/SUPPLIERS_PURCHASES?purchase=${encodeURIComponent(item.id)}`, priority: item.priority }, english));
  }
  for (const item of budgets) {
    map.set(`EnterpriseBudget:${item.id}`, presentation({ title: `${item.reference} · ${item.title}`, description: english ? "Budget awaiting approval." : "Budget en attente de validation.", sourceModuleCode: "FINANCE_BUDGETS", actionUrl: `/enterprise-modules/FINANCE_BUDGETS?budget=${encodeURIComponent(item.id)}`, priority: "HIGH" }, english));
  }
  for (const item of expenses) {
    map.set(`EnterpriseExpense:${item.id}`, presentation({ title: `${item.reference} · ${item.title}`, description: english ? "Expense awaiting approval." : "Dépense en attente de validation.", sourceModuleCode: "FINANCE_BUDGETS", actionUrl: `/enterprise-modules/FINANCE_BUDGETS?expense=${encodeURIComponent(item.id)}`, priority: "HIGH" }, english));
  }
  for (const item of incidents) {
    map.set(`PharmacyQualityIncident:${item.id}`, presentation({ title: item.title, description: item.description || (english ? "Quality incident awaiting approval." : "Incident qualité en attente de validation."), sourceModuleCode: "QUALITY_PHARMACOVIGILANCE", actionUrl: `/enterprise-modules/QUALITY_PHARMACOVIGILANCE?incident=${encodeURIComponent(item.id)}`, priority: item.priority }, english));
  }
  for (const item of leaveRequests) {
    map.set(`EnterpriseLeaveRequest:${item.id}`, presentation({ title: english ? `Leave ${item.reference}` : `Congé ${item.reference}`, description: `${item.leaveType} · ${item.startDate.toLocaleDateString(english ? "en" : "fr")} → ${item.endDate.toLocaleDateString(english ? "en" : "fr")}`, sourceModuleCode: "TIME_ATTENDANCE", actionUrl: `/enterprise-modules/TIME_ATTENDANCE?leave=${encodeURIComponent(item.id)}`, priority: "NORMAL" }, english));
  }
  for (const item of employmentContracts) {
    map.set(`EnterpriseEmploymentContract:${item.id}`, presentation({ title: english ? `Employment contract ${item.reference}` : `Contrat de travail ${item.reference}`, description: [item.contractType, item.jobTitle].filter(Boolean).join(" · ") || (english ? "Employment contract awaiting approval." : "Contrat de travail en attente de validation."), sourceModuleCode: "HUMAN_RESOURCES", actionUrl: `/enterprise-modules/HUMAN_RESOURCES?contract=${encodeURIComponent(item.id)}`, priority: "HIGH" }, english));
  }
  for (const item of timesheets) {
    map.set(`EnterpriseTimesheet:${item.id}`, presentation({ title: english ? `Timesheet ${item.reference}` : `Feuille de temps ${item.reference}`, description: `${item.periodStart.toLocaleDateString(english ? "en" : "fr")} → ${item.periodEnd.toLocaleDateString(english ? "en" : "fr")}`, sourceModuleCode: "TIME_ATTENDANCE", actionUrl: `/enterprise-modules/TIME_ATTENDANCE?timesheet=${encodeURIComponent(item.id)}`, priority: "NORMAL" }, english));
  }
  for (const item of payrollRuns) {
    map.set(`EnterprisePayrollRun:${item.id}`, presentation({ title: english ? `Payroll ${item.reference}` : `Paie ${item.reference}`, description: english ? `${item.employeeCount} employees · ${item.netAmount.toFixed()} ${item.currency}` : `${item.employeeCount} collaborateurs · ${item.netAmount.toFixed()} ${item.currency}`, sourceModuleCode: "PAYROLL_OPERATIONS", actionUrl: `/enterprise-modules/PAYROLL_OPERATIONS?payroll=${encodeURIComponent(item.id)}`, priority: "CRITICAL" }, english));
  }

  for (const approval of approvals) {
    const key = `${approval.targetEntityType}:${approval.targetEntityId}`;
    if (!map.has(key)) {
      map.set(key, presentation({
        title: english ? "Approval pending" : "Validation en attente",
        description: english ? "A pending approval needs a decision before the related process can continue." : "Une validation est en attente avant que le traitement associé puisse continuer.",
        sourceModuleCode: "VALIDATIONS",
        actionUrl: `/enterprise-modules/VALIDATIONS?approval=${encodeURIComponent(approval.id)}`,
        priority: "HIGH",
      }, english));
    }
  }
  return map;
}
