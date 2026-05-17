import Link from "next/link";
import { BarChart3, BriefcaseBusiness, Code2, Crown, FileText, FolderKanban, Megaphone, MessageSquare, PackageCheck, Scale, Settings, ShieldCheck, Users } from "lucide-react";
import { DocumentStatus, PaymentStatus, UserRole, UserStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { AdminDataTables } from "@/components/admin/admin-data-tables";
import { AdminAuditTables } from "@/components/admin/admin-audit-tables";
import { AdminAccessPanel } from "@/components/admin/admin-access-panel";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";
import { AdminOverviewMetrics } from "@/components/admin/admin-overview-metrics";
import { CeoExecutiveSummary } from "@/components/admin/ceo-executive-summary";
import { LegalDashboardSummary } from "@/components/admin/legal-dashboard-summary";
import { NewsletterSubscribersManager } from "@/components/admin/newsletter-subscribers-manager";
import { OperationsAdminPanel } from "@/components/admin/operations-admin-panel";
import { PublicPublicationsManager } from "@/components/admin/public-publications-manager";
import { SiteVisitsChart, type VisitPoint } from "@/components/admin/site-visits-chart";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { canAccessAdministration, parseAdminRoleAccess, type AdminBlockId } from "@/lib/admin-access";
import { buildCeoDatasets, buildCooDatasets, buildCtoDatasets, buildHrcfoDatasets, buildLaDatasets, buildMpoDatasets, buildScoDatasets } from "@/lib/admin-operations";
import { canAccessAdminSection, ensureDefaultPositions } from "@/lib/business-roles";
import { reconcileFinancialState, syncPaidSubscriptionIncomeTransactions } from "@/lib/hr-cfo-finance";
import { formatEnumLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

function isUserRole(value: string | undefined): value is UserRole {
  return value === UserRole.ADMIN || value === UserRole.MANAGER || value === UserRole.CLIENT || value === UserRole.SUPPORT;
}

type AdminSectionId = AdminBlockId | "access";
type RawMetricRow = { date: Date | string; count: number | bigint };
type RawModelRow = { model: string; count: number | bigint; tokens: number | bigint };

const adminSections: Array<{ id: AdminSectionId; label: string; description: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Vue générale", description: "KPIs et synthèse plateforme", icon: BarChart3 },
  { id: "access", label: "Accès RBAC", description: "Droits des rôles non-client", icon: ShieldCheck },
  { id: "settings", label: "Paramètres", description: "Limites, OTP, diffusions", icon: Settings },
  { id: "publications", label: "Publications", description: "Articles et ressources publiques", icon: FileText },
  { id: "users", label: "Utilisateurs", description: "Comptes, rôles et limites", icon: Users },
  { id: "hrCfo", label: "HR & CFO", description: "RH, finance et contrôle", icon: BriefcaseBusiness },
  { id: "sco", label: "SCO", description: "Achats, stocks et logistique", icon: PackageCheck },
  { id: "coo", label: "COO", description: "Opérations, tâches et workflows", icon: BarChart3 },
  { id: "ceo", label: "CEO", description: "Supervision exécutive", icon: Crown },
  { id: "mpo", label: "MPO", description: "Management & projets", icon: FolderKanban },
  { id: "cto", label: "CTO", description: "Technologie & développement", icon: Code2 },
  { id: "la", label: "LA", description: "Legal Advisor", icon: Scale },
  { id: "visits", label: "Visites", description: "Audience du site public", icon: BarChart3 },
  { id: "activity", label: "Activité", description: "Conversations et tickets", icon: MessageSquare },
  { id: "audits", label: "Audits", description: "Paiements, API et webhooks", icon: Megaphone },
];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; period?: string; date?: string; section?: string; ceoStart?: string; ceoEnd?: string }>;
}) {
  const user = await requireUser();
  if (!canAccessAdministration(user.role)) {
    redirect("/dashboard");
  }
  const { role, period, date, section, ceoStart, ceoEnd } = await searchParams;
  const parsedPeriod = Number(period || 30);
  const selectedPeriod = Number.isFinite(parsedPeriod) ? Math.min(Math.max(parsedPeriod, 7), 200) : 30;
  const selectedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  const visitStart = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
  const visitEnd = selectedDate ? new Date(`${selectedDate}T23:59:59`) : new Date();
  if (!selectedDate) {
    visitStart.setDate(visitStart.getDate() - Math.min(Math.max(selectedPeriod, 7), 200));
  }
  const roleFilter = isUserRole(role) ? role : undefined;
  const selectedCeoStart = ceoStart && /^\d{4}-\d{2}-\d{2}$/.test(ceoStart) ? ceoStart : undefined;
  const selectedCeoEnd = ceoEnd && /^\d{4}-\d{2}-\d{2}$/.test(ceoEnd) ? ceoEnd : undefined;
  const ceoStartDate = selectedCeoStart ? new Date(`${selectedCeoStart}T00:00:00`) : undefined;
  const ceoEndDate = selectedCeoEnd ? new Date(`${selectedCeoEnd}T23:59:59.999`) : undefined;

  const periodWhere = { createdAt: { gte: visitStart, lte: visitEnd } };
  await ensureDefaultPositions();
  await syncPaidSubscriptionIncomeTransactions();
  await reconcileFinancialState();

  const [
    settings,
    users,
    userCount,
    activeUserCount,
    conversationCount,
    conversations,
    messageCount,
    usageLogs,
    tickets,
    visitRows,
    messageRows,
    tokenRows,
    visitTotal,
    usersInPeriod,
    conversationsInPeriod,
    messagesInPeriod,
    tokensInPeriod,
    ticketsInPeriod,
    resolvedTicketsInPeriod,
    contactsInPeriod,
    subscribersInPeriod,
    paidPaymentsInPeriod,
    apiErrorsInPeriod,
    readyDocuments,
    publishedPublicationsCount,
    draftPublicationsCount,
    roleBreakdown,
    ticketBreakdown,
    paymentBreakdown,
    topModels,
    payments,
    apiLogs,
    webhookEvents,
    publicPublications,
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
  ] =
    await Promise.all([
      getAppSettings(),
      prisma.user.findMany({
        where: roleFilter ? { role: roleFilter } : undefined,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { conversations: true } } },
        take: 200,
      }),
      prisma.user.count(),
      prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      prisma.conversation.count(),
      prisma.conversation.findMany({
        orderBy: { updatedAt: "desc" },
        include: { user: true, _count: { select: { messages: true } } },
        take: 200,
      }),
      prisma.message.count(),
      prisma.usageLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.supportTicket.findMany({
        orderBy: { createdAt: "desc" },
        include: { user: true },
        take: 200,
      }),
      prisma.$queryRaw<Array<{ date: Date | string; count: number | bigint }>>`
        SELECT DATE("createdAt") AS date, COUNT(*)::int AS count
        FROM "SiteVisit"
        WHERE "createdAt" >= ${visitStart} AND "createdAt" <= ${visitEnd}
        GROUP BY DATE("createdAt")
        ORDER BY DATE("createdAt") ASC
      `,
      prisma.$queryRaw<RawMetricRow[]>`
        SELECT DATE("createdAt") AS date, COUNT(*)::int AS count
        FROM "Message"
        WHERE "createdAt" >= ${visitStart} AND "createdAt" <= ${visitEnd}
        GROUP BY DATE("createdAt")
        ORDER BY DATE("createdAt") ASC
      `,
      prisma.$queryRaw<RawMetricRow[]>`
        SELECT DATE("createdAt") AS date, COALESCE(SUM("totalTokens"), 0)::int AS count
        FROM "UsageLog"
        WHERE "createdAt" >= ${visitStart} AND "createdAt" <= ${visitEnd}
        GROUP BY DATE("createdAt")
        ORDER BY DATE("createdAt") ASC
      `,
      prisma.siteVisit.count({ where: periodWhere }),
      prisma.user.count({ where: periodWhere }),
      prisma.conversation.count({ where: periodWhere }),
      prisma.message.count({ where: periodWhere }),
      prisma.usageLog.aggregate({ where: periodWhere, _sum: { totalTokens: true } }),
      prisma.supportTicket.count({ where: periodWhere }),
      prisma.supportTicket.count({ where: { resolvedAt: { gte: visitStart, lte: visitEnd } } }),
      prisma.contactMessage.count({ where: periodWhere }),
      prisma.newsletterSubscriber.count({ where: periodWhere }),
      prisma.payment.aggregate({ where: { ...periodWhere, status: { in: [PaymentStatus.ACCEPTED, PaymentStatus.PAID] } }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.apiLog.count({ where: { ...periodWhere, statusCode: { gte: 400 } } }),
      prisma.knowledgeDocument.count({ where: { status: DocumentStatus.READY } }),
      prisma.publicPublication.count({ where: { published: true } }),
      prisma.publicPublication.count({ where: { published: false } }),
      prisma.user.groupBy({ by: ["role"], where: periodWhere, _count: { _all: true } }),
      prisma.supportTicket.groupBy({ by: ["status"], where: periodWhere, _count: { _all: true } }),
      prisma.payment.groupBy({ by: ["status"], where: periodWhere, _count: { _all: true } }),
      prisma.$queryRaw<RawModelRow[]>`
        SELECT "model", COUNT(*)::int AS count, COALESCE(SUM("totalTokens"), 0)::int AS tokens
        FROM "UsageLog"
        WHERE "createdAt" >= ${visitStart} AND "createdAt" <= ${visitEnd}
        GROUP BY "model"
        ORDER BY tokens DESC
        LIMIT 5
      `,
      prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        include: { user: true, subscription: { include: { plan: true } } },
        take: 200,
      }),
      prisma.apiLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.webhookEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.publicPublication.findMany({
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true, email: true } } },
        take: 40,
      }),
      prisma.hrcfoEmployee.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.hrcfoBudget.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.hrcfoExpense.findMany({
        orderBy: { updatedAt: "desc" },
        include: { account: true, department: true, budget: true, invoice: true },
        take: 200,
      }),
      prisma.hrcfoPayroll.findMany({
        orderBy: { updatedAt: "desc" },
        include: { employee: true, account: true, budget: true },
        take: 200,
      }),
      prisma.department.findMany({ orderBy: { name: "asc" }, take: 200 }),
      prisma.financialAccount.findMany({ orderBy: { name: "asc" }, take: 200 }),
      prisma.dtscPosition.findMany({ orderBy: [{ hierarchyLevel: "asc" }, { title: "asc" }], take: 200 }),
      prisma.user.findMany({
        where: { role: { not: UserRole.CLIENT } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true, role: true, status: true },
        take: 500,
      }),
      prisma.materialItem.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.scoVendor.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.scoPurchaseRequest.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.scoInventoryItem.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.scoAsset.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.scoLogisticsEvent.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.cooOperation.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.cooTask.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.cooRecurringTask.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.cooDepartmentRequest.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.cooBlocker.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.cooMeeting.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.cooWorkflow.findMany({ orderBy: { updatedAt: "desc" }, include: { _count: { select: { shares: true } } }, take: 200 }),
      prisma.cooOperationalReport.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.ceoObjective.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.ceoSupervisionLog.findMany({ orderBy: { logDate: "desc" }, take: 200 }),
      prisma.mpoProject.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.mpoProjectRecord.findMany({ orderBy: { updatedAt: "desc" }, include: { project: { select: { title: true } } }, take: 200 }),
      prisma.ctoTechnicalProject.findMany({ orderBy: { updatedAt: "desc" }, include: { mpoProject: { select: { title: true } } }, take: 200 }),
      prisma.ctoTechnicalRecord.findMany({ orderBy: { updatedAt: "desc" }, include: { technicalProject: { select: { title: true } }, mpoProject: { select: { title: true } } }, take: 200 }),
      prisma.legalCase.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.legalContract.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.legalTemplate.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.legalRisk.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.legalDocument.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.legalDispute.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.legalRequest.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.legalReport.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
    ]);

  const totalTokens = usageLogs.reduce((sum, log) => sum + log.totalTokens, 0);
  const adminRoleAccess = parseAdminRoleAccess(settings.adminRoleAccess);
  const allowedAdminBlocks = new Set(
    (await Promise.all(
      adminSections
        .filter((item): item is { id: AdminBlockId; label: string; description: string; icon: typeof BarChart3 } => item.id !== "access")
        .map(async (item) => (await canAccessAdminSection(user, item.id, adminRoleAccess)) ? item.id : null)
    )).filter((item): item is AdminBlockId => Boolean(item))
  );
  const canView = (blockId: AdminBlockId) => allowedAdminBlocks.has(blockId);
  const canViewSection = (sectionId: AdminSectionId) => sectionId === "access" ? user.role === UserRole.ADMIN : canView(sectionId);
  const visibleSections = adminSections.filter((item) => canViewSection(item.id));
  const activeSection = visibleSections.some((item) => item.id === section)
    ? (section as AdminSectionId)
    : visibleSections[0]?.id || "overview";
  const sectionHref = (sectionId: AdminSectionId) => {
    const params = new URLSearchParams();
    params.set("section", sectionId);
    if (roleFilter) {
      params.set("role", roleFilter);
    }
    if (selectedDate) {
      params.set("date", selectedDate);
    } else {
      params.set("period", String(selectedPeriod));
    }
    if (selectedCeoStart) {
      params.set("ceoStart", selectedCeoStart);
    }
    if (selectedCeoEnd) {
      params.set("ceoEnd", selectedCeoEnd);
    }
    return `/admin?${params.toString()}`;
  };
  const chartLength = selectedDate ? 1 : Math.min(selectedPeriod, 60);
  const buildPoints = (rows: RawMetricRow[]): VisitPoint[] => {
    const countsByDate = new Map(
      rows.map((row) => {
      const key = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
      return [key, Number(row.count)];
      })
    );
    return [...Array(chartLength).keys()].map((index) => {
      const day = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
      if (!selectedDate) {
        day.setDate(day.getDate() - (chartLength - 1 - index));
      }
      const dateKey = day.toISOString().slice(0, 10);
      const count = countsByDate.get(dateKey) || 0;
      return {
        date: dateKey,
        label: day.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        count,
      };
    });
  };
  const visitPoints = buildPoints(visitRows);
  const messagePoints = buildPoints(messageRows);
  const tokenPoints = buildPoints(tokenRows);
  const overviewMetrics = {
    totals: {
      users: userCount,
      activeUsers: activeUserCount,
      conversations: conversationCount,
      messages: messageCount,
      tokens: totalTokens,
    },
    period: {
      users: usersInPeriod,
      conversations: conversationsInPeriod,
      messages: messagesInPeriod,
      tokens: tokensInPeriod._sum.totalTokens || 0,
      tickets: ticketsInPeriod,
      resolvedTickets: resolvedTicketsInPeriod,
      visits: visitTotal,
      contacts: contactsInPeriod,
      subscribers: subscribersInPeriod,
      payments: paidPaymentsInPeriod._count._all,
      revenue: Number(paidPaymentsInPeriod._sum.amount || 0),
      apiErrors: apiErrorsInPeriod,
      readyDocuments,
      publishedPublications: publishedPublicationsCount,
      draftPublications: draftPublicationsCount,
    },
    series: {
      visits: visitPoints.map((point) => ({ label: point.label, value: point.count })),
      messages: messagePoints.map((point) => ({ label: point.label, value: point.count })),
      tokens: tokenPoints.map((point) => ({ label: point.label, value: point.count })),
    },
    breakdowns: {
      roles: roleBreakdown.map((item) => ({ label: item.role, value: item._count._all })),
      tickets: ticketBreakdown.map((item) => ({ label: item.status, value: item._count._all })),
      payments: paymentBreakdown.map((item) => ({ label: item.status, value: item._count._all })),
    },
    topModels: topModels.map((item) => ({
      model: item.model,
      count: Number(item.count),
      tokens: Number(item.tokens),
    })),
  };
  const paymentAuditItems = payments.map((payment) => ({
    id: payment.id,
    reference: payment.reference,
    userEmail: payment.user.email,
    status: payment.status,
    amount: Number(payment.amount),
    currency: payment.currency,
    planName: payment.subscription?.plan.name || null,
    createdAt: payment.createdAt.toISOString(),
  }));
  const logAuditItems = [
    ...apiLogs.map((event) => ({
      id: event.id,
      source: "API" as const,
      title: `${event.method} · ${event.path}`,
      detail: event.userId ? `Utilisateur: ${event.userId}` : "Requête système ou publique",
      status: `HTTP ${event.statusCode}`,
      createdAt: event.createdAt.toISOString(),
    })),
    ...webhookEvents.map((event) => ({
      id: event.id,
      source: "Webhook" as const,
      title: `${event.provider} · ${event.eventType}`,
      detail: event.lastError || "Événement reçu et journalisé",
      status: event.status,
      createdAt: event.createdAt.toISOString(),
    })),
  ].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
  const hrcfoDatasets = buildHrcfoDatasets(JSON.parse(JSON.stringify({
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
  })));
  const scoDatasets = buildScoDatasets(JSON.parse(JSON.stringify({
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
  })));
  const cooDatasets = buildCooDatasets(JSON.parse(JSON.stringify({
    operations: cooOperations,
    tasks: cooTasks,
    recurringTasks: cooRecurringTasks,
    departmentRequests: cooDepartmentRequests,
    blockers: cooBlockers,
    meetings: cooMeetings,
    workflows: cooWorkflows.map((workflow) => ({ ...workflow, shareCount: workflow._count.shares })),
    reports: cooReports,
    departments: hrcfoDepartments,
    employees: hrcfoEmployees,
  })));
  const ceoDatasets = buildCeoDatasets(JSON.parse(JSON.stringify({
    objectives: ceoObjectives,
    supervisionLogs: ceoSupervisionLogs,
    departments: hrcfoDepartments,
    employees: hrcfoEmployees,
  })));
  const mpoDatasets = buildMpoDatasets(JSON.parse(JSON.stringify({
    projects: mpoProjects,
    records: mpoRecords.map((record) => ({ ...record, projectTitle: record.project?.title })),
    departments: hrcfoDepartments,
    employees: hrcfoEmployees,
  })));
  const ctoDatasets = buildCtoDatasets(JSON.parse(JSON.stringify({
    projects: ctoProjects.map((project) => ({ ...project, mpoProjectTitle: project.mpoProject?.title })),
    records: ctoRecords.map((record) => ({
      ...record,
      technicalProjectTitle: record.technicalProject?.title,
      mpoProjectTitle: record.mpoProject?.title,
    })),
    mpoProjects,
    departments: hrcfoDepartments,
    employees: hrcfoEmployees,
  })));
  const laDatasets = buildLaDatasets(JSON.parse(JSON.stringify({
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
  })));
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
        { label: "Attente CTO / budget / SCO", value: ceoMpoProjects.filter((project) => ["WAITING_CTO", "WAITING_BUDGET", "WAITING_SCO_RESOURCES"].includes(project.status)).length, detail: "Dépendances nécessitant suivi." },
        { label: "Bloqués ou en retard", value: ceoMpoProjects.filter((project) => project.status === "BLOCKED" || (project.dueDate && project.dueDate < now && !["DELIVERED", "CLOSED", "CANCELED"].includes(project.status))).length, detail: "Arbitrage ou relance possible." },
        { label: "Livrables validés", value: ceoMpoRecords.filter((record) => record.recordType === "DELIVERABLE" && record.status === "VALIDATED").length, detail: "Livrables MPO validés." },
        { label: "Risques critiques", value: ceoMpoProjects.filter((project) => project.riskLevel === "CRITICAL" || project.priority === "CRITICAL").length, detail: "Projets stratégiques ou critiques." },
      ],
    },
    {
      title: "Vue consolidée CTO",
      description: "Delivery technique, incidents, sécurité, production, documentation et besoins techniques.",
      metrics: [
        { label: "Projets techniques", value: ceoCtoProjects.length, detail: "Projets CTO filtrés." },
        { label: "Analyse / développement / test", value: ceoCtoProjects.filter((project) => ["TECH_ANALYSIS", "DEVELOPMENT", "TESTING", "REVIEW"].includes(project.status)).length, detail: "Pipeline technique actif." },
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

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <section className="dtsc-panel p-6">
          <p className="text-sm font-bold text-cyan-600">Administration</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Pilotage DTSC Platform</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Supervisez les utilisateurs, les rôles RBAC, les conversations, les tickets support et l&apos;usage IA.
          </p>
        </section>

        <nav className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sous-modules Administration">
          {visibleSections.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <Link
                key={item.id}
                href={sectionHref(item.id)}
                className={`rounded-2xl border p-4 shadow-[0_12px_34px_rgba(0,43,91,0.07)] transition ${
                  active
                    ? "border-cyan-300 bg-[#002b5b] text-white"
                    : "border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:border-cyan-300 hover:bg-dtsc-soft"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-white/10 text-cyan-200" : "bg-dtsc-soft text-dtsc-blue"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block font-black">{item.label}</span>
                    <span className={`mt-1 block text-xs leading-5 ${active ? "text-slate-200" : "text-dtsc-muted"}`}>{item.description}</span>
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        {activeSection === "overview" && canView("overview") && (
          <AdminOverviewMetrics
            selectedPeriod={selectedPeriod}
            selectedDate={selectedDate}
            totals={overviewMetrics.totals}
            period={overviewMetrics.period}
            series={overviewMetrics.series}
            breakdowns={overviewMetrics.breakdowns}
            topModels={overviewMetrics.topModels}
          />
        )}

        {activeSection === "access" && user.role === UserRole.ADMIN && (
          <AdminAccessPanel access={adminRoleAccess} />
        )}

        {activeSection === "settings" && canView("settings") && (
          <AdminSettingsPanel
            canEdit={user.role === UserRole.ADMIN}
            settings={{
              defaultDailyMessageLimit: settings.defaultDailyMessageLimit,
              defaultDailyTokenLimit: settings.defaultDailyTokenLimit,
              chatbotEnabled: settings.chatbotEnabled,
              maintenanceMode: settings.maintenanceMode,
              supportAutoCloseDays: settings.supportAutoCloseDays,
              allowClientAnnouncements: settings.allowClientAnnouncements,
              commentEditWindowMinutes: settings.commentEditWindowMinutes,
              notificationRetentionDays: settings.notificationRetentionDays,
              signUpOtpEnabled: settings.signUpOtpEnabled,
              signUpOtpExpirationMinutes: settings.signUpOtpExpirationMinutes,
            }}
          />
        )}

        {activeSection === "publications" && canView("publications") && (
          <PublicPublicationsManager publications={JSON.parse(JSON.stringify(publicPublications))} canEdit={user.role === UserRole.ADMIN} />
        )}

        {activeSection === "users" && canView("users") && (
          <div className="space-y-5">
            <section className="dtsc-card p-6">
              <div className="mb-5">
                <h2 className="font-black text-dtsc-ink">Créer un compte utilisateur</h2>
                <p className="text-sm text-dtsc-muted">L&apos;admin peut créer un compte avec n&apos;importe quel rôle et définir les limites journalières.</p>
              </div>
              {user.role === UserRole.ADMIN ? <CreateUserForm /> : <p className="text-sm text-dtsc-muted">Bloc visible en lecture, modification réservée au rôle ADMIN.</p>}
            </section>
            <NewsletterSubscribersManager canManage={user.role === UserRole.ADMIN} />
          </div>
        )}

        {activeSection === "hrCfo" && canView("hrCfo") && (
          <OperationsAdminPanel
            eyebrow="Gestion interne"
            title="Opérations HR & CFO"
            description="Centralisez les dossiers RH, budgets, dépenses, factures, alertes et contrôles internes de DTSC. Cette section suit les principes de reporting capital humain, contrôle interne, séparation des validations et pilotage financier utile aux décisions."
            playbook={["Dossier RH complet", "Budget cadré", "Dépense soumise", "Validation financière", "Paiement ou clôture", "Audit"]}
            datasets={hrcfoDatasets}
            canEdit={canView("hrCfo")}
          />
        )}

        {activeSection === "sco" && canView("sco") && (
          <OperationsAdminPanel
            eyebrow="Supply Chain Operations"
            title="Opérations SCO"
            description="Pilotez les fournisseurs, demandes d'achat, stocks, actifs et missions logistiques nécessaires aux formations, projets clients, événements, supports imprimés et opérations DTSC."
            playbook={["Besoin exprimé", "Budget vérifié", "Fournisseur comparé", "Commande", "Réception", "Stock ou actif", "Facture CFO"]}
            datasets={scoDatasets}
            canEdit={canView("sco")}
          />
        )}

        {activeSection === "coo" && canView("coo") && (
          <OperationsAdminPanel
            eyebrow="Chief Operating Officer"
            title="Pilotage COO"
            description="Organisez les opérations internes, distribuez les tâches, suivez les blocages, structurez les réunions et consolidez les rapports opérationnels DTSC."
            playbook={["Opération cadrée", "Tâches assignées", "Coordination", "Blocages traités", "Validation", "Rapport opérationnel"]}
            datasets={cooDatasets}
            canEdit={canView("coo")}
          />
        )}

        {activeSection === "ceo" && canView("ceo") && (
          <div className="space-y-5">
            <CeoExecutiveSummary groups={ceoExecutiveGroups} dateStart={selectedCeoStart} dateEnd={selectedCeoEnd} />
            <OperationsAdminPanel
              eyebrow="Chief Executive Officer"
              title="Supervision CEO"
              description="Consolidez la lecture stratégique de DTSC: finance, RH, opérations COO, performance SCO, alertes critiques, objectifs exécutifs et journal de supervision."
              playbook={["Synthèse exécutive", "Alertes critiques", "Objectifs", "Décisions", "Suivi responsable", "Rapport consolidé"]}
              datasets={ceoDatasets}
              canEdit={canView("ceo")}
            />
          </div>
        )}

        {activeSection === "mpo" && canView("mpo") && (
          <OperationsAdminPanel
            eyebrow="Management & Projects Officer"
            title="MPO — Management & Projets"
            description="Pilotez le portefeuille des projets numériques DTSC: cadrage des besoins, cahiers de charges, livrables, risques, besoins budgétaires, demandes SCO, coordination CTO/COO et projets santé digitale."
            playbook={["Besoin cadré", "Cahier de charges", "Transmission CTO", "Budget ou logistique", "Livrable suivi", "Validation", "Clôture projet"]}
            datasets={mpoDatasets}
            canEdit={canView("mpo")}
          />
        )}

        {activeSection === "cto" && canView("cto") && (
          <OperationsAdminPanel
            eyebrow="Chief Technical Officer"
            title="CTO — Technologie & Développement"
            description="Pilotez l'architecture, le développement, les APIs, bases de données, déploiements, sécurité, incidents, documentation technique, qualité, tests et collaboration avec MPO, COO, SCO, HR & CFO et CEO."
            playbook={["Analyse technique", "Architecture", "Tâches dev", "Tests et revue", "Déploiement", "Documentation", "Retour MPO"]}
            datasets={ctoDatasets}
            canEdit={canView("cto")}
          />
        )}

        {activeSection === "la" && canView("la") && (
          <div className="space-y-5">
            <LegalDashboardSummary metrics={legalMetrics} charts={legalCharts} />
            <OperationsAdminPanel
              eyebrow="Legal Advisor"
              title="LA — Legal Advisor"
              description="Pilotez les dossiers juridiques, contrats, conventions, modèles, risques de conformité, documents officiels, litiges, demandes internes et rapports juridiques DTSC avec confidentialité et traçabilité."
              playbook={["Demande juridique", "Analyse LA", "Contrat ou avis", "Validation LA", "Arbitrage CEO si requis", "Archivage confidentiel"]}
              datasets={laDatasets}
              canEdit={canView("la")}
            />
          </div>
        )}

        {activeSection === "visits" && canView("visits") && <SiteVisitsChart points={visitPoints} selectedPeriod={selectedPeriod} selectedDate={selectedDate} totalVisits={visitTotal} />}

        {activeSection === "users" && canView("users") && (
          <AdminDataTables
            users={JSON.parse(JSON.stringify(users))}
            conversations={JSON.parse(JSON.stringify(conversations))}
            tickets={JSON.parse(JSON.stringify(tickets))}
            showUsers={true}
            showActivity={false}
            canManageUsers={user.role === UserRole.ADMIN}
          />
        )}

        {activeSection === "activity" && canView("activity") && (
          <AdminDataTables
            users={JSON.parse(JSON.stringify(users))}
            conversations={JSON.parse(JSON.stringify(conversations))}
            tickets={JSON.parse(JSON.stringify(tickets))}
            showUsers={false}
            showActivity={true}
            canManageUsers={false}
          />
        )}

        {activeSection === "audits" && canView("audits") && <AdminAuditTables payments={paymentAuditItems} logs={logAuditItems} />}

        {activeSection === "overview" && (
          <section className="rounded-2xl border border-dtsc-border bg-[#001736] p-6 text-white">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
            <div>
              <h2 className="font-black">Politique RBAC active</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                ADMIN supervise la plateforme, MANAGER prépare la supervision métier, SUPPORT traite les tickets et CLIENT utilise le chatbot et son espace privé.
              </p>
            </div>
          </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
