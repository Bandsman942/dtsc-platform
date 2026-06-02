import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatEnumLabel } from "@/lib/labels";
import { buildCeoDatasets, buildCooDatasets, buildCtoDatasets, buildHrcfoDatasets, buildLaDatasets, buildMpoDatasets, buildScoDatasets } from "@/lib/admin-operations";
import { toJsonSafe } from "@/lib/console/console-utils";

export async function getConsoleInternalModulesDataset({
  ceoEndDate,
  ceoStartDate,
  loadInternalOperations,
  selectedCeoEnd,
  selectedCeoStart,
}: {
  ceoEndDate?: Date;
  ceoStartDate?: Date;
  loadInternalOperations: boolean;
  selectedCeoEnd?: string;
  selectedCeoStart?: string;
}) {
  const [
    hrcfoEmployees,
    hrcfoBudgets,
    hrcfoTransactions,
    hrcfoPayrolls,
    hrcfoDepartments,
    hrcfoAccounts,
    hrcfoPositions,
    hrcfoStaffUsers,
    scoMaterialItems,
    scoVendors,
    scoPurchaseRequests,
    scoInventory,
    scoAssets,
    scoLogistics,
    cooOperations,
    cooTasks,
    cooRecurringTasks,
    cooDepartmentRequests,
    cooBlockers,
    cooMeetings,
    cooMeetingGroups,
    cooWorkflows,
    cooReports,
    ceoObjectives,
    ceoSupervisionLogs,
    mpoProjects,
    mpoRecords,
    ctoProjects,
    ctoRecords,
    legalCases,
    legalContracts,
    legalTemplates,
    legalRisks,
    legalDocuments,
    legalDisputes,
    legalRequests,
    legalReports,
  ] = await Promise.all([
    loadInternalOperations ? prisma.hrcfoEmployee.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.hrcfoBudget.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.hrcfoExpense.findMany({
      orderBy: { updatedAt: "desc" },
      include: { account: true, department: true, budget: true, invoice: true },
      take: 200,
    }) : Promise.resolve([]),
    loadInternalOperations ? prisma.hrcfoPayroll.findMany({
      orderBy: { updatedAt: "desc" },
      include: { employee: true, account: true, budget: true },
      take: 200,
    }) : Promise.resolve([]),
    loadInternalOperations ? prisma.department.findMany({ orderBy: { name: "asc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.financialAccount.findMany({ orderBy: { name: "asc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.dtscPosition.findMany({ orderBy: [{ hierarchyLevel: "asc" }, { title: "asc" }], take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.user.findMany({
      where: { role: { not: UserRole.CLIENT } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, status: true },
      take: 500,
    }) : Promise.resolve([]),
    loadInternalOperations ? prisma.materialItem.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.scoVendor.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.scoPurchaseRequest.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.scoInventoryItem.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.scoAsset.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.scoLogisticsEvent.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.cooOperation.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.cooTask.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.cooRecurringTask.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.cooDepartmentRequest.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.cooBlocker.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.cooMeeting.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.collaborationGroup.findMany({ where: { status: "ACTIVE" }, orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.cooWorkflow.findMany({ orderBy: { updatedAt: "desc" }, include: { _count: { select: { shares: true } } }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.cooOperationalReport.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.ceoObjective.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.ceoSupervisionLog.findMany({ orderBy: { logDate: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.mpoProject.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.mpoProjectRecord.findMany({ orderBy: { updatedAt: "desc" }, include: { project: { select: { title: true } } }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.ctoTechnicalProject.findMany({ orderBy: { updatedAt: "desc" }, include: { mpoProject: { select: { title: true } } }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.ctoTechnicalRecord.findMany({ orderBy: { updatedAt: "desc" }, include: { technicalProject: { select: { title: true } }, mpoProject: { select: { title: true } } }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.legalCase.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.legalContract.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.legalTemplate.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.legalRisk.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.legalDocument.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.legalDispute.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.legalRequest.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
    loadInternalOperations ? prisma.legalReport.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }) : Promise.resolve([]),
  ]);

  const hrcfoDatasets = buildHrcfoDatasets(toJsonSafe({
    employees: hrcfoEmployees,
    budgets: hrcfoBudgets,
    transactions: hrcfoTransactions.map((transaction) => ({
      ...transaction,
      accountName: transaction.account?.name,
      departmentName: transaction.department?.name,
      budgetName: transaction.budget?.name,
      invoiceId: transaction.invoice?.id,
    })),
    payrolls: hrcfoPayrolls.map((payroll) => ({
      ...payroll,
      employeeName: payroll.employee.fullName,
      accountName: payroll.account?.name,
      budgetName: payroll.budget?.name,
    })),
    departments: hrcfoDepartments,
    accounts: hrcfoAccounts,
    positions: hrcfoPositions,
    staffUsers: hrcfoStaffUsers,
  }));
  const scoDatasets = buildScoDatasets(toJsonSafe({
    materialItems: scoMaterialItems,
    employees: hrcfoEmployees,
    vendors: scoVendors,
    purchaseRequests: scoPurchaseRequests,
    inventory: scoInventory,
    assets: scoAssets,
    logistics: scoLogistics,
    departments: hrcfoDepartments,
    budgets: hrcfoBudgets,
    mpoProjects,
    ctoProjects,
    cooTasks,
  }));
  const cooDatasets = buildCooDatasets(toJsonSafe({
    operations: cooOperations,
    tasks: cooTasks,
    recurringTasks: cooRecurringTasks,
    departmentRequests: cooDepartmentRequests,
    blockers: cooBlockers,
    meetings: cooMeetings,
    meetingGroups: cooMeetingGroups,
    workflows: cooWorkflows.map((workflow) => ({ ...workflow, shareCount: workflow._count.shares })),
    reports: cooReports,
    departments: hrcfoDepartments,
    employees: hrcfoEmployees,
  }));
  const ceoDatasets = buildCeoDatasets(toJsonSafe({
    objectives: ceoObjectives,
    supervisionLogs: ceoSupervisionLogs,
    departments: hrcfoDepartments,
    employees: hrcfoEmployees,
  }));
  const mpoDatasets = buildMpoDatasets(toJsonSafe({
    projects: mpoProjects,
    records: mpoRecords.map((record) => ({ ...record, projectTitle: record.project?.title })),
    departments: hrcfoDepartments,
    employees: hrcfoEmployees,
  }));
  const ctoDatasets = buildCtoDatasets(toJsonSafe({
    projects: ctoProjects.map((project) => ({ ...project, mpoProjectTitle: project.mpoProject?.title })),
    records: ctoRecords.map((record) => ({
      ...record,
      technicalProjectTitle: record.technicalProject?.title,
      mpoProjectTitle: record.mpoProject?.title,
    })),
    mpoProjects,
    departments: hrcfoDepartments,
    employees: hrcfoEmployees,
  }));
  const laDatasets = buildLaDatasets(toJsonSafe({
    cases: legalCases,
    contracts: legalContracts,
    templates: legalTemplates,
    risks: legalRisks,
    documents: legalDocuments,
    disputes: legalDisputes,
    requests: legalRequests,
    reports: legalReports,
    departments: hrcfoDepartments,
    employees: hrcfoEmployees,
    mpoProjects,
    ctoProjects,
    scoPurchaseRequests,
  }));

  const countBy = <T,>(items: T[], getLabel: (item: T) => string | null | undefined) => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const rawLabel = getLabel(item);
      const label = rawLabel ? formatEnumLabel(rawLabel) : "Non renseigné";
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((first, second) => second.value - first.value || first.label.localeCompare(second.label, "fr"));
  };
  const now = new Date();
  const legalSoonLimit = new Date(now);
  legalSoonLimit.setDate(legalSoonLimit.getDate() + 30);
  const isDueSoon = (value: Date | string | null | undefined) => {
    if (!value) {
      return false;
    }
    const dateValue = value instanceof Date ? value : new Date(value);
    const time = dateValue.getTime();
    return !Number.isNaN(time) && time >= now.getTime() && time <= legalSoonLimit.getTime();
  };
  const isLegalOpen = (status: string) => !/ARCHIVED|CANCELED|CANCELLED|SIGNED|REJECTED|RESOLVED|CLOSED|EXPIRED/i.test(status);
  const legalMonthDeadlines = [
    ...legalCases.filter((item) => isDueSoon(item.dueDate)).map(() => ({ label: "Dossiers" })),
    ...legalContracts.filter((item) => isDueSoon(item.endDate)).map(() => ({ label: "Contrats" })),
    ...legalDocuments.filter((item) => isDueSoon(item.expirationDate)).map(() => ({ label: "Documents" })),
    ...legalRequests.filter((item) => isDueSoon(item.desiredDueDate)).map(() => ({ label: "Demandes" })),
  ];
  const legalMetrics = [
    { label: "Dossiers ouverts", value: legalCases.filter((item) => isLegalOpen(item.status)).length, detail: "Dossiers juridiques encore actifs." },
    { label: "Contrats à relire", value: legalContracts.filter((item) => item.status === "LEGAL_REVIEW" || item.status === "TO_CORRECT").length, detail: "Contrats en relecture LA ou à corriger." },
    { label: "Risques critiques", value: legalRisks.filter((item) => item.riskLevel === "CRITICAL" && isLegalOpen(item.status)).length, detail: "Risques juridiques à escalader." },
    { label: "Arbitrage CEO", value: legalCases.filter((item) => item.ceoValidationRequired || item.status === "WAITING_CEO").length + legalContracts.filter((item) => item.ceoValidationRequired).length + legalRisks.filter((item) => item.ceoEscalation).length, detail: "Dossiers sensibles nécessitant une décision." },
    { label: "Documents bientôt expirés", value: legalDocuments.filter((item) => isDueSoon(item.expirationDate)).length, detail: "Échéances documentaires à anticiper." },
    { label: "Demandes en retard", value: legalRequests.filter((item) => item.desiredDueDate && new Date(item.desiredDueDate).getTime() < now.getTime() && isLegalOpen(item.status)).length, detail: "Demandes internes dépassant l'échéance." },
    { label: "Litiges ouverts", value: legalDisputes.filter((item) => isLegalOpen(item.status)).length, detail: "Réclamations et litiges en suivi." },
    { label: "Documents archivés", value: legalDocuments.filter((item) => item.status === "ARCHIVED").length, detail: "Archives juridiques sécurisées." },
  ];
  const legalCharts = [
    { title: "Dossiers juridiques par statut", items: countBy(legalCases, (item) => item.status) },
    { title: "Dossiers par département demandeur", items: countBy(legalCases, (item) => item.requesterDepartmentName) },
    { title: "Risques juridiques par niveau", items: countBy(legalRisks, (item) => item.riskLevel) },
    { title: "Contrats par type", items: countBy(legalContracts, (item) => item.contractType) },
    { title: "Échéances juridiques du mois", items: countBy(legalMonthDeadlines, (item) => item.label) },
    { title: "Demandes juridiques par priorité", items: countBy(legalRequests, (item) => item.priority) },
  ];
  const isInCeoPeriod = (value: Date | string | null | undefined) => {
    if (!ceoStartDate && !ceoEndDate) {
      return true;
    }
    if (!value) {
      return true;
    }
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (Number.isNaN(time)) {
      return true;
    }
    if (ceoStartDate && time < ceoStartDate.getTime()) {
      return false;
    }
    if (ceoEndDate && time > ceoEndDate.getTime()) {
      return false;
    }
    return true;
  };
  const ceoTransactions = hrcfoTransactions.filter((transaction) => isInCeoPeriod(transaction.transactionDate || transaction.createdAt));
  const ceoEmployees = hrcfoEmployees.filter((employee) => isInCeoPeriod(employee.createdAt));
  const ceoTasks = cooTasks.filter((task) => isInCeoPeriod(task.plannedDate || task.createdAt));
  const ceoOperations = cooOperations.filter((operation) => isInCeoPeriod(operation.createdAt));
  const ceoMeetings = cooMeetings.filter((meeting) => isInCeoPeriod(meeting.meetingDate || meeting.createdAt));
  const ceoVendors = scoVendors.filter((vendor) => isInCeoPeriod(vendor.createdAt));
  const ceoPurchaseRequests = scoPurchaseRequests.filter((request) => isInCeoPeriod(request.neededBy || request.createdAt));
  const ceoInventory = scoInventory.filter((item) => isInCeoPeriod(item.updatedAt || item.createdAt));
  const ceoAssets = scoAssets.filter((asset) => isInCeoPeriod(asset.createdAt));
  const ceoMpoProjects = mpoProjects.filter((project) => isInCeoPeriod(project.dueDate || project.updatedAt));
  const ceoMpoRecords = mpoRecords.filter((record) => isInCeoPeriod(record.dueDate || record.updatedAt));
  const ceoCtoProjects = ctoProjects.filter((project) => isInCeoPeriod(project.dueDate || project.updatedAt));
  const ceoCtoRecords = ctoRecords.filter((record) => isInCeoPeriod(record.dueDate || record.updatedAt));
  const ceoLegalCases = legalCases.filter((item) => isInCeoPeriod(item.dueDate || item.updatedAt));
  const ceoLegalContracts = legalContracts.filter((item) => isInCeoPeriod(item.endDate || item.updatedAt));
  const ceoLegalRisks = legalRisks.filter((item) => isInCeoPeriod(item.dueDate || item.updatedAt));
  const ceoLegalDisputes = legalDisputes.filter((item) => isInCeoPeriod(item.dueDate || item.updatedAt));
  const ceoLegalRequests = legalRequests.filter((item) => isInCeoPeriod(item.desiredDueDate || item.updatedAt));
  const ceoLegalDocuments = legalDocuments.filter((item) => isInCeoPeriod(item.expirationDate || item.updatedAt));
  const financiallyImpacting = ceoTransactions.filter((transaction) => transaction.status === "VALIDATED" || transaction.status === "PAID");
  const revenue = financiallyImpacting
    .filter((transaction) => transaction.transactionCategory === "IN" && transaction.title.trim().toLocaleLowerCase("fr-FR") !== "capital de départ")
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const totalIn = financiallyImpacting
    .filter((transaction) => transaction.transactionCategory === "IN")
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const totalOut = financiallyImpacting
    .filter((transaction) => transaction.transactionCategory === "OUT")
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const todayKey = new Date().toISOString().slice(0, 10);
  const ceoExecutiveGroups = [
    {
      title: "Vue financière synthétique",
      description: "Chiffres issus des transactions validées ou payées, hors brouillons.",
      metrics: [
        { label: "Chiffre d'affaires", value: `${revenue.toFixed(2)} USD`, detail: "Entrées réelles hors capital de départ." },
        { label: "Entrées", value: `${totalIn.toFixed(2)} USD`, detail: "Transactions d'entrée impactantes." },
        { label: "Sorties", value: `${totalOut.toFixed(2)} USD`, detail: "Transactions de sortie impactantes." },
        { label: "Solde comptes", value: `${hrcfoAccounts.reduce((sum, account) => sum + Number(account.currentBalance || 0), 0).toFixed(2)} USD`, detail: "Solde courant des comptes, non limité par période." },
      ],
    },
    {
      title: "Vue RH synthétique",
      description: "Lecture capital humain, paie et postes officiels DTSC.",
      metrics: [
        { label: "Collaborateurs", value: ceoEmployees.length, detail: "Dossiers RH enregistrés sur la période." },
        { label: "Actifs", value: ceoEmployees.filter((employee) => employee.status === "ACTIVE").length, detail: "Collaborateurs actifs sur la période." },
        { label: "Masse salariale", value: `${ceoEmployees.reduce((sum, employee) => sum + Number(employee.monthlyCompensation || 0), 0).toFixed(2)} USD`, detail: "Rémunération mensuelle théorique des dossiers filtrés." },
        { label: "Postes actifs", value: hrcfoPositions.filter((position) => position.status === "ACTIVE").length, detail: "Référentiel officiel des postes." },
      ],
    },
    {
      title: "Vue opérationnelle COO",
      description: "Charge opérationnelle, retards, blocages et décisions terrain.",
      metrics: [
        { label: selectedCeoStart || selectedCeoEnd ? "Tâches filtrées" : "Tâches du jour", value: selectedCeoStart || selectedCeoEnd ? ceoTasks.length : ceoTasks.filter((task) => task.plannedDate?.toISOString().slice(0, 10) === todayKey).length, detail: "Tâches COO selon la période CEO." },
        { label: "Tâches bloquées", value: ceoTasks.filter((task) => task.status === "BLOCKED").length, detail: "À débloquer ou escalader." },
        { label: "Opérations critiques", value: ceoOperations.filter((operation) => operation.priority === "CRITICAL" || operation.status === "BLOCKED").length, detail: "Suivi exécutif recommandé." },
        { label: "Réunions prévues", value: ceoMeetings.filter((meeting) => meeting.status === "PLANNED").length, detail: "Réunions COO planifiées." },
      ],
    },
    {
      title: "Vue commerciale et SCO",
      description: "Suivi fournisseurs, achats, stocks, actifs et logistique.",
      metrics: [
        { label: "Fournisseurs", value: ceoVendors.length, detail: "Référentiel fournisseurs filtré." },
        { label: "Achats ouverts", value: ceoPurchaseRequests.filter((request) => request.status !== "RECEIVED" && request.status !== "CANCELED" && request.status !== "REJECTED").length, detail: "Demandes d'achat à suivre." },
        { label: "Stocks faibles", value: ceoInventory.filter((item) => item.status === "LOW_STOCK" || item.status === "OUT_OF_STOCK").length, detail: "Risque opérationnel SCO." },
        { label: "Actifs suivis", value: ceoAssets.length, detail: "Biens matériels affectés ou disponibles." },
      ],
    },
    {
      title: "Vue consolidée MPO",
      description: "Portefeuille projets, cadrage, livrables, risques et arbitrages CEO.",
      metrics: [
        { label: "Projets MPO", value: ceoMpoProjects.length, detail: "Projets filtrés sur la période CEO." },
        { label: "En cadrage", value: ceoMpoProjects.filter((project) => project.status === "SCOPING").length, detail: "Besoins et cahiers de charges en préparation." },
        { label: "Attente CTO / budget / SCO", value: ceoMpoProjects.filter((project) => ["WAITING_CTO", "WAITING_BUDGET", "WAITING_SCO_RESOURCES"].includes(String(project.status))).length, detail: "Dépendances nécessitant suivi." },
        { label: "Bloqués ou en retard", value: ceoMpoProjects.filter((project) => project.status === "BLOCKED" || (project.dueDate && project.dueDate < now && !["DELIVERED", "CLOSED", "CANCELED"].includes(String(project.status)))).length, detail: "Arbitrage ou relance possible." },
        { label: "Livrables validés", value: ceoMpoRecords.filter((record) => record.recordType === "DELIVERABLE" && record.status === "VALIDATED").length, detail: "Livrables MPO validés." },
        { label: "Risques critiques", value: ceoMpoProjects.filter((project) => project.riskLevel === "CRITICAL" || project.priority === "CRITICAL").length, detail: "Projets stratégiques ou critiques." },
      ],
    },
    {
      title: "Vue consolidée CTO",
      description: "Delivery technique, incidents, sécurité, production, documentation et besoins techniques.",
      metrics: [
        { label: "Projets techniques", value: ceoCtoProjects.length, detail: "Projets CTO filtrés." },
        { label: "Analyse / développement / test", value: ceoCtoProjects.filter((project) => ["TECH_ANALYSIS", "DEVELOPMENT", "TESTING", "REVIEW"].includes(String(project.status))).length, detail: "Pipeline technique actif." },
        { label: "Production", value: ceoCtoProjects.filter((project) => project.status === "PRODUCTION").length, detail: "Solutions en production." },
        { label: "Bloqués techniques", value: ceoCtoProjects.filter((project) => project.status === "BLOCKED").length + ceoCtoRecords.filter((record) => record.status === "BLOCKED").length, detail: "Blocages à arbitrer." },
        { label: "Bugs / incidents critiques", value: ceoCtoRecords.filter((record) => record.recordType === "BUG_INCIDENT" && record.priority === "CRITICAL").length, detail: "Incidents techniques critiques." },
        { label: "Documentation", value: ceoCtoRecords.filter((record) => record.recordType === "TECH_DOCUMENTATION").length, detail: "Documents techniques disponibles." },
      ],
    },
    {
      title: "Vue consolidée LA",
      description: "Dossiers, contrats, risques, litiges, demandes internes et confidentialité juridique.",
      metrics: [
        { label: "Dossiers ouverts", value: ceoLegalCases.filter((item) => isLegalOpen(item.status)).length, detail: "Dossiers LA actifs." },
        { label: "Contrats en relecture", value: ceoLegalContracts.filter((item) => item.status === "LEGAL_REVIEW" || item.status === "TO_CORRECT").length, detail: "Contrats à suivre." },
        { label: "Risques élevés / critiques", value: ceoLegalRisks.filter((item) => item.riskLevel === "HIGH" || item.riskLevel === "CRITICAL").length, detail: "Exposition juridique importante." },
        { label: "Litiges ouverts", value: ceoLegalDisputes.filter((item) => isLegalOpen(item.status)).length, detail: "Litiges et réclamations actifs." },
        { label: "Demandes en retard", value: ceoLegalRequests.filter((item) => item.desiredDueDate && item.desiredDueDate < now && isLegalOpen(item.status)).length, detail: "Demandes juridiques dépassées." },
        { label: "Documents sensibles", value: ceoLegalDocuments.filter((item) => item.confidentialityLevel === "CEO_ONLY" || item.confidentialityLevel === "LA_CEO_ONLY" || item.confidentialityLevel === "VERY_CONFIDENTIAL").length, detail: "Documents LA à confidentialité renforcée." },
      ],
    },
  ];

  return {
    ceoDatasets,
    ceoExecutiveGroups,
    cooDatasets,
    ctoDatasets,
    hrcfoDatasets,
    laDatasets,
    legalCharts,
    legalMetrics,
    mpoDatasets,
    scoDatasets,
  };
}
