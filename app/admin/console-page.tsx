import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { PaymentStatus, TicketPriority, TicketStatus, UserRole, UserStatus } from "@prisma/client";
import { AdminAccessPanel } from "@/components/admin/admin-access-panel";
import { ConsoleAiOverview } from "@/components/admin/console-ai-overview";
import { ConsoleAiMcpPanel } from "@/components/admin/console-ai-mcp-panel";
import { ConsoleAiKnowledgeSecurityPanel } from "@/components/admin/console-ai-knowledge-security-panel";
import { ConsoleAiAlertPanel } from "@/components/admin/console-ai-alert-panel";
import { ConsoleAiConfigurationPanel } from "@/components/admin/console-ai-configuration-panel";
import { ConsoleAiPolicyManager } from "@/components/admin/console-ai-policy-manager";
import { AdminAuditTables } from "@/components/admin/admin-audit-tables";
import { AdminBillingSubscriptions } from "@/components/admin/admin-billing-subscriptions";
import { ManualSubscriptionPaymentsAdmin } from "@/components/admin/manual-subscription-payments-admin";
import { AdminDataTables } from "@/components/admin/admin-data-tables";
import { ConsoleWorkspaceShell } from "@/components/admin/console-workspace-shell";
import { InternalDepartmentWorkspace } from "@/components/admin/internal-department-workspace";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ConsoleJumpLinks, ConsoleSubsection } from "@/components/admin/console-subsection";
import { AdminOverviewMetrics } from "@/components/admin/admin-overview-metrics";
import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";
import { BillingPlanManager } from "@/components/admin/billing-plan-manager";
import { BillingReconciliationControl } from "@/components/admin/billing-reconciliation-control";
import { CeoExecutiveSummary } from "@/components/admin/ceo-executive-summary";
import { ClientOrganizationsPanel } from "@/components/admin/client-organizations-panel";
import { ConsoleFilterBar, ConsoleSelectFilter } from "@/components/admin/console-filter-bar";
import { ConsoleExportLinks } from "@/components/admin/console-export-links";
import { ConsoleSaasOverview } from "@/components/admin/console-saas-overview";
import { ConsoleServerPagination } from "@/components/admin/console-server-pagination";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { FeatureFlagManager } from "@/components/admin/feature-flag-manager";
import { HrcfoInvoiceList } from "@/components/admin/hrcfo-invoice-list";
import { LegalDashboardSummary } from "@/components/admin/legal-dashboard-summary";
import { NewsletterSubscribersManager } from "@/components/admin/newsletter-subscribers-manager";
import { OperationsAdminPanel } from "@/components/admin/operations-admin-panel";
import { PayrollApprovalPanel } from "@/components/admin/payroll-approval-panel";
import { PayrollWorkflowPanel } from "@/components/admin/payroll-workflow-panel";
import { PlatformIncidentManager } from "@/components/admin/platform-incident-manager";
import { PromotionalBannerManager } from "@/components/admin/promotional-banner-manager";
import { PublicPublicationsManager } from "@/components/admin/public-publications-manager";
import { SiteVisitsChart } from "@/components/admin/site-visits-chart";
import { WorkSubmissionReviewPanel } from "@/components/admin/work-submission-review-panel";
import { AppShell } from "@/components/layout/app-shell";
import { TicketBoard } from "@/components/support/ticket-board";
import { canAccessAdministration, parseAdminRoleAccess, type AdminBlockId } from "@/lib/admin-access";
import { getSession, requireUser } from "@/lib/auth";
import { canAccessAdminSection } from "@/lib/business-roles";
import { getConsoleAuditDataset } from "@/lib/console/console-audit";
import { getConsoleAiDataset } from "@/lib/console/console-ai";
import { getConsoleMcpGovernance } from "@/lib/console/console-ai-mcp";
import { getConsoleAiKnowledgeSecurity } from "@/lib/console/console-ai-knowledge-security";
import { getConsoleAiAlertSnapshot } from "@/lib/ai/governance-alerts";
import { getConsoleAiConfiguration } from "@/lib/console/console-ai-configuration";
import { getConsoleBillingDataset } from "@/lib/console/console-billing";
import { getConsoleAccessDecision, CONSOLE_CAPABILITIES, type ConsoleCapability } from "@/lib/console/console-capabilities";
import { getConsoleInternalModulesDataset } from "@/lib/console/console-internal-modules";
import { getConsoleClientOrganizationsDataset } from "@/lib/console/console-organizations";
import { getConsoleOverviewMetrics } from "@/lib/console/console-overview";
import { getConsolePublicationsDataset } from "@/lib/console/console-publications";
import { CONSOLE_SECTION_ADMIN_BLOCK, getConsoleSectionHref, resolveConsoleSection, type ConsoleSectionId } from "@/lib/console/console-routes";
import { getConsoleSupportDataset } from "@/lib/console/console-support";
import { toJsonSafe } from "@/lib/console/console-utils";
import { getConsoleUsersDataset } from "@/lib/console/console-users";
import { getDashboardUrl } from "@/lib/domains";
import { translate } from "@/lib/i18n";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

type ConsoleSearchParams = Record<string, string | string[] | undefined>;

const sectionIds: ConsoleSectionId[] = [
  "overview", "module-maturity", "access", "platform-settings", "ai-control-center", "promotions", "content", "users", "organizations", "subscriptions", "support", "visits", "security-audit", "hr-cfo", "sco", "coo", "ceo", "mpo", "cto", "legal"
];

const readCapability: Partial<Record<ConsoleSectionId, ConsoleCapability>> = {
  overview: CONSOLE_CAPABILITIES.OVERVIEW_READ,
  "module-maturity": CONSOLE_CAPABILITIES.MODULE_MATURITY_READ,
  "platform-settings": CONSOLE_CAPABILITIES.SETTINGS_READ,
  "ai-control-center": CONSOLE_CAPABILITIES.AI_READ,
  promotions: CONSOLE_CAPABILITIES.CONTENT_READ,
  content: CONSOLE_CAPABILITIES.CONTENT_READ,
  users: CONSOLE_CAPABILITIES.USERS_READ,
  organizations: CONSOLE_CAPABILITIES.ORGANIZATIONS_READ,
  subscriptions: CONSOLE_CAPABILITIES.SUBSCRIPTIONS_READ,
  support: CONSOLE_CAPABILITIES.SUPPORT_READ,
  visits: CONSOLE_CAPABILITIES.OVERVIEW_READ,
  "security-audit": CONSOLE_CAPABILITIES.SECURITY_READ,
};
const manageCapability: Partial<Record<ConsoleSectionId, ConsoleCapability>> = {
  "module-maturity": CONSOLE_CAPABILITIES.MODULE_MATURITY_MANAGE,
  "platform-settings": CONSOLE_CAPABILITIES.SETTINGS_MANAGE,
  "ai-control-center": CONSOLE_CAPABILITIES.AI_MANAGE,
  promotions: CONSOLE_CAPABILITIES.CONTENT_MANAGE,
  content: CONSOLE_CAPABILITIES.CONTENT_MANAGE,
  users: CONSOLE_CAPABILITIES.USERS_MANAGE,
  organizations: CONSOLE_CAPABILITIES.ORGANIZATIONS_MANAGE,
  subscriptions: CONSOLE_CAPABILITIES.SUBSCRIPTIONS_MANAGE,
  support: CONSOLE_CAPABILITIES.SUPPORT_MANAGE,
  "security-audit": CONSOLE_CAPABILITIES.SECURITY_MANAGE,
};

export async function DtscConsolePage({ forcedSection, searchParams }: { forcedSection?: string; searchParams: Promise<ConsoleSearchParams> }) {
  const user = await requireUser();
  const session = await getSession();
  if (!isDtscInternalSession(session) || !canAccessAdministration(user.role)) redirect(getDashboardUrl());
  const raw = await searchParams;
  const stringParams = normalizeSearchParams(raw);
  const requested = resolveConsoleSection(forcedSection || stringParams.section || "overview");
  if (!requested.known) redirect(getConsoleSectionHref("overview"));
  if (!forcedSection && stringParams.section && requested.section !== "overview") redirect(getConsoleSectionHref(requested.section, retainedParams(stringParams)));
  if (forcedSection && requested.aliasUsed) redirect(getConsoleSectionHref(requested.section, retainedParams(stringParams)));

  const settings = await getAppSettings();
  const adminRoleAccess = parseAdminRoleAccess(settings.adminRoleAccess);
  const allowedMap = new Map<ConsoleSectionId, boolean>();
  await Promise.all(sectionIds.map(async (id) => {
    if (id === "access") { allowedMap.set(id, user.role === UserRole.ADMIN); return; }
    const capability = readCapability[id];
    if (capability) { allowedMap.set(id, (await getConsoleAccessDecision({ user, capability, adminRoleAccess })).allowed); return; }
    const block = CONSOLE_SECTION_ADMIN_BLOCK[id];
    allowedMap.set(id, block ? await canAccessAdminSection(user, block, adminRoleAccess) : false);
  }));
  const visibleSections = sectionIds.filter((id) => allowedMap.get(id));
  const activeSection = requested.section;
  if (!allowedMap.get(activeSection)) redirect(getConsoleSectionHref(visibleSections[0] || "overview"));

  const activeManageCapability = manageCapability[activeSection];
  const canManage = activeManageCapability
    ? (await getConsoleAccessDecision({ user, capability: activeManageCapability, adminRoleAccess })).allowed
    : Boolean(CONSOLE_SECTION_ADMIN_BLOCK[activeSection] && await canAccessAdminSection(user, CONSOLE_SECTION_ADMIN_BLOCK[activeSection] as AdminBlockId, adminRoleAccess));
  const t = (key: string) => translate(user.locale, key);
  const locale = user.locale === "en" ? "en" : "fr";
  const pathname = activeSection === "overview" ? "/admin" : `/admin/${activeSection}`;
  const page = stringParams.page;
  const pageSize = stringParams.pageSize;
  const search = stringParams.search;

  const period = parsePeriod(stringParams.period, stringParams.date);

  let content: ReactNode = null;
  if (activeSection === "overview") {
    const overview = await getConsoleOverviewMetrics({ selectedDate: period.selectedDate, selectedPeriod: period.days, visitStart: period.start, visitEnd: period.end });
    content = <div className="space-y-5"><ConsoleSaasOverview {...overview.consoleSaasOverview} /><ConsoleSubsection id="platform-indicators" title={t("console.detailSections.platformIndicators")}><AdminOverviewMetrics selectedPeriod={period.days} selectedDate={period.selectedDate} {...overview.overviewMetrics} /></ConsoleSubsection></div>;
  } else if (activeSection === "access") {
    content = <AdminAccessPanel access={adminRoleAccess} />;
  } else if (activeSection === "ai-control-center") {
    // The section is already guarded by CONSOLE_AI_READ and DTSC_INTERNAL.
    // This service contains only global, aggregated operational metadata.
    const snapshot = await getConsoleAiDataset({ from: period.start, to: new Date(period.end.getTime() + 1) });
    const configuration = await getConsoleAiConfiguration();
    const knowledgeSecurity = await getConsoleAiKnowledgeSecurity({ from: period.start, to: new Date(period.end.getTime() + 1) });
    const aiAlerts = await getConsoleAiAlertSnapshot({ from: period.start, to: new Date(period.end.getTime() + 1) });
    const [mcp, mcpCapability] = await Promise.all([
      getConsoleMcpGovernance(),
      getConsoleAccessDecision({ user, capability: CONSOLE_CAPABILITIES.MCP_MANAGE, adminRoleAccess }),
    ]);
    content = <div className="min-w-0 space-y-5"><ConsoleAiOverview data={snapshot} locale={locale} days={period.days} /><ConsoleJumpLinks label={t("console.detailSections.jumpNav")} items={[{ id: "ai-models", label: t("console.detailSections.aiModels") }, { id: "ai-connectors", label: t("console.detailSections.aiConnectors") }, { id: "ai-safety", label: t("console.detailSections.aiSafety") }]} /><ConsoleSubsection id="ai-models" title={t("console.detailSections.aiModels")}><div className="space-y-4"><ConsoleAiConfigurationPanel data={configuration} locale={locale} /><ConsoleAiPolicyManager initialPolicy={configuration.policy} providerCodes={configuration.providers.map((provider) => provider.code)} modelCodes={configuration.models.map((model) => model.code)} canManage={canManage} locale={locale} /></div></ConsoleSubsection><ConsoleSubsection id="ai-connectors" title={t("console.detailSections.aiConnectors")}><ConsoleAiMcpPanel initial={mcp} locale={locale} canManage={mcpCapability.allowed} /></ConsoleSubsection><ConsoleSubsection id="ai-safety" title={t("console.detailSections.aiSafety")}><div className="min-w-0 space-y-4"><ConsoleAiKnowledgeSecurityPanel data={knowledgeSecurity} locale={locale} /><ConsoleAiAlertPanel initial={aiAlerts} locale={locale} canManage={canManage} /></div></ConsoleSubsection></div>;
  } else if (activeSection === "platform-settings") {
    const flags = await prisma.featureFlag.findMany({ orderBy: [{ environment: "asc" }, { code: "asc" }], take: 100 });
    content = <div className="space-y-5"><ConsoleJumpLinks label={t("console.detailSections.jumpNav")} items={[{ id: "platform-preferences", label: t("console.detailSections.platformPreferences") }, { id: "platform-flags", label: t("console.detailSections.platformFlags") }]} /><ConsoleSubsection id="platform-preferences" title={t("console.detailSections.platformPreferences")}><AdminSettingsPanel canEdit={canManage} settings={{ defaultDailyMessageLimit: settings.defaultDailyMessageLimit, defaultDailyTokenLimit: settings.defaultDailyTokenLimit, chatbotEnabled: settings.chatbotEnabled, publicAgentEnabled: settings.publicAgentEnabled, allowNonClientPublicationDrafts: settings.allowNonClientPublicationDrafts, maintenanceMode: settings.maintenanceMode, supportAutoCloseDays: settings.supportAutoCloseDays, allowClientAnnouncements: settings.allowClientAnnouncements, commentEditWindowMinutes: settings.commentEditWindowMinutes, notificationRetentionDays: settings.notificationRetentionDays, signUpOtpEnabled: settings.signUpOtpEnabled, signUpOtpExpirationMinutes: settings.signUpOtpExpirationMinutes }} /></ConsoleSubsection><ConsoleSubsection id="platform-flags" title={t("console.detailSections.platformFlags")}><FeatureFlagManager flags={toJsonSafe(flags)} canManage={canManage} locale={locale} /></ConsoleSubsection></div>;
  } else if (activeSection === "promotions") {
    const paging = parseSimplePaging(page, pageSize, 25);
    const [banners, total] = await Promise.all([prisma.promotionalBanner.findMany({ orderBy: [{ archivedAt: "asc" }, { priority: "desc" }, { createdAt: "desc" }], include: { _count: { select: { dismissals: true } } }, skip: paging.skip, take: paging.take }), prisma.promotionalBanner.count()]);
    const pagination = simplePagination(total, paging.page, paging.take);
    content = <><PromotionalBannerManager banners={toJsonSafe(banners)} canManage={canManage} /><ConsoleServerPagination pagination={pagination} pathname={pathname} searchParams={{ pageSize: String(paging.take) }} /></>;
  } else if (activeSection === "content") {
    const published = stringParams.published === "true" ? true : stringParams.published === "false" ? false : null;
    const dataset = await getConsolePublicationsDataset({ page, pageSize, search, published, category: stringParams.category });
    content = <div className="space-y-4"><ConsoleFilterBar action={pathname} search={search} hidden={{ pageSize }}><ConsoleSelectFilter name="published" label={t("console.filters.status")} value={stringParams.published} options={[{ value: "true", label: locale === "en" ? "Published" : "Publié" }, { value: "false", label: locale === "en" ? "Draft" : "Brouillon" }]} /></ConsoleFilterBar><PublicPublicationsManager publications={toJsonSafe(dataset.publicPublications)} currentUserId={user.id} canCreateDrafts={canManage || settings.allowNonClientPublicationDrafts} canPublish={canManage} canDelete={canManage} /><ConsoleServerPagination pagination={dataset.pagination} pathname={pathname} searchParams={{ search, published: stringParams.published, category: stringParams.category, pageSize }} /></div>;
  } else if (activeSection === "users") {
    const role = isEnumValue(UserRole, stringParams.role) ? stringParams.role as UserRole : undefined;
    const status = isEnumValue(UserStatus, stringParams.status) ? stringParams.status as UserStatus : undefined;
    const dataset = await getConsoleUsersDataset({ page, pageSize, search, role, status, organizationId: stringParams.organizationId });
    content = <div className="space-y-4"><ConsoleFilterBar action={pathname} search={search} hidden={{ pageSize }}><ConsoleSelectFilter name="role" label={t("console.filters.role")} value={role} options={Object.values(UserRole).map((value) => ({ value, label: value }))} /><ConsoleSelectFilter name="status" label={t("console.filters.status")} value={status} options={Object.values(UserStatus).map((value) => ({ value, label: value }))} /></ConsoleFilterBar><ConsoleExportLinks locale={locale} links={[{ href: `/api/admin/exports/users?role=${encodeURIComponent(role || "")}&status=${encodeURIComponent(status || "")}`, label: locale === "en" ? "Export users" : "Exporter les utilisateurs" }]} />{canManage ? <><ConsoleJumpLinks label={t("console.detailSections.jumpNav")} items={[{ id: "users-create", label: t("console.detailSections.createUser") }, { id: "users-newsletter", label: t("console.detailSections.newsletter") }, { id: "users-list", label: t("console.detailSections.userList") }]} /><ConsoleSubsection id="users-create" title={t("console.detailSections.createUser")}><CreateUserForm /></ConsoleSubsection><ConsoleSubsection id="users-newsletter" title={t("console.detailSections.newsletter")}><NewsletterSubscribersManager canManage={canManage} /></ConsoleSubsection></> : null}<ConsoleSubsection id="users-list" title={t("console.detailSections.userList")}><AdminDataTables users={toJsonSafe(dataset.users)} conversations={[]} tickets={[]} showUsers showActivity={false} canManageUsers={canManage} /></ConsoleSubsection><ConsoleServerPagination pagination={dataset.pagination} pathname={pathname} searchParams={{ search, role, status, organizationId: stringParams.organizationId, pageSize }} /></div>;
  } else if (activeSection === "organizations") {
    const dataset = await getConsoleClientOrganizationsDataset({ page, pageSize, search, status: stringParams.status, sectorId: stringParams.sectorId, planId: stringParams.planId });
    const users = canManage ? await prisma.user.findMany({ where: { status: UserStatus.ACTIVE }, select: { id: true, name: true, email: true, role: true }, orderBy: { name: "asc" }, take: 100 }) : [];
    content = <div className="space-y-4"><ConsoleFilterBar action={pathname} search={search} hidden={{ pageSize }}><ConsoleSelectFilter name="status" label={t("console.filters.status")} value={stringParams.status} options={["DRAFT", "PENDING", "ACTIVE", "SUSPENDED", "ARCHIVED"].map((value) => ({ value, label: value }))} /></ConsoleFilterBar><ConsoleExportLinks locale={locale} links={[{ href: `/api/admin/exports/organizations?status=${encodeURIComponent(stringParams.status || "")}`, label: locale === "en" ? "Export organizations" : "Exporter les entreprises" }]} /><ClientOrganizationsPanel organizations={toJsonSafe(dataset.clientOrganizations)} users={users} plans={dataset.billingPlans} sectors={dataset.businessSectors} /><ConsoleServerPagination pagination={dataset.pagination} pathname={pathname} searchParams={{ search, status: stringParams.status, sectorId: stringParams.sectorId, planId: stringParams.planId, pageSize }} /></div>;
  } else if (activeSection === "subscriptions") {
    const paymentStatus = isEnumValue(PaymentStatus, stringParams.paymentStatus) ? stringParams.paymentStatus as PaymentStatus : undefined;
    const [dataset, reconcileDecision] = await Promise.all([
      getConsoleBillingDataset({ page, paymentPage: stringParams.paymentPage, pageSize, search, status: stringParams.status, planId: stringParams.planId, paymentStatus }),
      getConsoleAccessDecision({ user, capability: CONSOLE_CAPABILITIES.RECONCILE_BILLING, adminRoleAccess }),
    ]);
    content = <div className="space-y-4"><ConsoleFilterBar action={pathname} search={search} hidden={{ pageSize }}><ConsoleSelectFilter name="status" label={t("console.filters.status")} value={stringParams.status} options={["ACTIVE", "TRIAL", "PAST_DUE", "PENDING_PAYMENT", "SUSPENDED", "CANCELED", "EXPIRED"].map((value) => ({ value, label: value }))} /><ConsoleSelectFilter name="paymentStatus" label={locale === "en" ? "Payment" : "Paiement"} value={paymentStatus} options={Object.values(PaymentStatus).map((value) => ({ value, label: value }))} /></ConsoleFilterBar><ConsoleExportLinks locale={locale} links={[{ href: `/api/admin/exports/payments?status=${encodeURIComponent(paymentStatus || "")}`, label: locale === "en" ? "Export payments" : "Exporter les paiements" }]} /><BillingReconciliationControl canReconcile={reconcileDecision.allowed} locale={locale} /><div className="space-y-6"><ConsoleJumpLinks label={t("console.detailSections.jumpNav")} items={[{ id: "billing-plans", label: t("console.detailSections.billingPlans") }, { id: "billing-manual", label: t("console.detailSections.billingManual") }, { id: "billing-subscriptions", label: t("console.detailSections.billingSubscriptions") }]} /><ConsoleSubsection id="billing-plans" title={t("console.detailSections.billingPlans")}><BillingPlanManager plans={dataset.billingPlans} canManage={canManage} locale={user.locale} /></ConsoleSubsection><ConsoleSubsection id="billing-manual" title={t("console.detailSections.billingManual")}><ManualSubscriptionPaymentsAdmin canManage={canManage} currentUserId={user.id} /></ConsoleSubsection><ConsoleSubsection id="billing-subscriptions" title={t("console.detailSections.billingSubscriptions")}><AdminBillingSubscriptions subscriptions={dataset.organizationSubscriptionItems} plans={dataset.billingPlanOptions} summary={dataset.billingSummary} payments={dataset.paymentAuditItems} /></ConsoleSubsection></div><ConsoleServerPagination pagination={dataset.organizationPagination} pathname={pathname} searchParams={{ search, status: stringParams.status, planId: stringParams.planId, paymentStatus, pageSize }} /></div>;
  } else if (activeSection === "support") {
    const status = isEnumValue(TicketStatus, stringParams.status) ? stringParams.status as TicketStatus : undefined;
    const priority = isEnumValue(TicketPriority, stringParams.priority) ? stringParams.priority as TicketPriority : undefined;
    const dataset = await getConsoleSupportDataset({ page, pageSize, search, status, priority, organizationId: stringParams.organizationId, assignedToDtscUserId: stringParams.assignedTo, overdueOnly: stringParams.overdue === "true" });
    content = <div className="space-y-4"><ConsoleFilterBar action={pathname} search={search} hidden={{ pageSize }}><ConsoleSelectFilter name="status" label={t("console.filters.status")} value={status} options={Object.values(TicketStatus).map((value) => ({ value, label: value }))} /><ConsoleSelectFilter name="priority" label={t("console.filters.priority")} value={priority} options={Object.values(TicketPriority).map((value) => ({ value, label: value }))} /></ConsoleFilterBar><SupportSummary summary={dataset.summary} locale={locale} /><TicketBoard tickets={toJsonSafe(dataset.tickets)} canManage={canManage} currentUserId={user.id} assignees={dataset.assignees} /><ConsoleServerPagination pagination={dataset.pagination} pathname={pathname} searchParams={{ search, status, priority, organizationId: stringParams.organizationId, assignedTo: stringParams.assignedTo, overdue: stringParams.overdue, pageSize }} /></div>;
  } else if (activeSection === "visits") {
    const overview = await getConsoleOverviewMetrics({ selectedDate: period.selectedDate, selectedPeriod: period.days, visitStart: period.start, visitEnd: period.end });
    content = <SiteVisitsChart points={overview.visitPoints} selectedPeriod={period.days} selectedDate={period.selectedDate} totalVisits={overview.visitTotal} />;
  } else if (activeSection === "security-audit") {
    const source = ["AUDIT", "API", "WEBHOOK"].includes(stringParams.source || "") ? stringParams.source as "AUDIT" | "API" | "WEBHOOK" : "AUDIT";
    const dataset = await getConsoleAuditDataset({ page, pageSize, search, source, result: stringParams.result, organizationId: stringParams.organizationId, userId: stringParams.userId, statusCode: stringParams.statusCode ? Number(stringParams.statusCode) : null, provider: stringParams.provider, requestId: stringParams.requestId });
    const [billing, incidents, webhookRetryDecision] = await Promise.all([
      getConsoleBillingDataset({ page: 1, pageSize: 10, paymentPage: 1 }),
      prisma.platformIncident.findMany({ orderBy: [{ status: "asc" }, { startedAt: "desc" }], take: 100 }),
      getConsoleAccessDecision({ user, capability: CONSOLE_CAPABILITIES.WEBHOOK_RETRY, adminRoleAccess }),
    ]);
    content = <div className="space-y-4"><ConsoleFilterBar action={pathname} search={search} hidden={{ pageSize }}><ConsoleSelectFilter name="source" label={t("console.filters.source")} value={source} options={[{ value: "AUDIT", label: "Audit" }, { value: "API", label: "API" }, { value: "WEBHOOK", label: "Webhook" }]} /></ConsoleFilterBar><ConsoleExportLinks locale={locale} links={[{ href: `/api/admin/exports/audit?result=${encodeURIComponent(stringParams.result || "")}`, label: locale === "en" ? "Export audit" : "Exporter l’audit" }]} /><ConsoleJumpLinks label={t("console.detailSections.jumpNav")} items={[{ id: "security-incidents", label: t("console.detailSections.incidents") }, { id: "security-traces", label: t("console.detailSections.auditLogs") }]} /><ConsoleSubsection id="security-incidents" title={t("console.detailSections.incidents")}><PlatformIncidentManager incidents={toJsonSafe(incidents)} canManage={canManage} locale={locale} /></ConsoleSubsection><ConsoleSubsection id="security-traces" title={t("console.detailSections.auditLogs")}><AdminAuditTables payments={billing.paymentAuditItems} logs={toJsonSafe(dataset.logAuditItems)} canRetryWebhooks={webhookRetryDecision.allowed} /></ConsoleSubsection><ConsoleServerPagination pagination={dataset.pagination} pathname={pathname} searchParams={{ search, source, result: stringParams.result, organizationId: stringParams.organizationId, userId: stringParams.userId, provider: stringParams.provider, requestId: stringParams.requestId, pageSize }} /></div>;
  } else if (isInternalSection(activeSection)) {
    const ceoStart = validDate(stringParams.ceoStart) ? stringParams.ceoStart : undefined;
    const ceoEnd = validDate(stringParams.ceoEnd) ? stringParams.ceoEnd : undefined;
    const invoiceReadDecision = activeSection === "hr-cfo"
      ? await getConsoleAccessDecision({ user, capability: CONSOLE_CAPABILITIES.HR_CFO_INVOICES_READ, adminRoleAccess })
      : null;
    const [internal, hrcfoInvoices] = await Promise.all([
      getConsoleInternalModulesDataset({ section: activeSection, pageSize: Number(pageSize || 60), selectedCeoStart: ceoStart, selectedCeoEnd: ceoEnd, ceoStartDate: ceoStart ? new Date(`${ceoStart}T00:00:00`) : undefined, ceoEndDate: ceoEnd ? new Date(`${ceoEnd}T23:59:59.999`) : undefined }),
      activeSection === "hr-cfo" && invoiceReadDecision?.allowed
        ? prisma.invoice.findMany({
            where: { category: "HR_CFO_TRANSACTION" },
            orderBy: { issuedAt: "desc" },
            take: 100,
            include: { user: { select: { name: true, email: true } }, hrcfoTransaction: { select: { id: true, title: true } } },
          })
        : Promise.resolve([]),
    ]);
    content = renderInternalSection(
      activeSection,
      internal,
      canManage,
      user.locale,
      ceoStart,
      ceoEnd,
      hrcfoInvoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        planName: invoice.planName,
        amount: Number(invoice.amount),
        currency: invoice.currency,
        status: invoice.status,
        issuedAt: invoice.issuedAt.toISOString(),
        beneficiary: invoice.user.name || invoice.user.email,
        transactionReference: invoice.hrcfoTransaction?.title || invoice.hrcfoTransaction?.id || null,
      })),
      Boolean(invoiceReadDecision?.allowed),
    );
  }

  return (
    <AppShell user={user}>
      <ConsoleWorkspaceShell
        activeSection={activeSection}
        locale={locale}
        sections={visibleSections.map((id) => ({
          id,
          label: t(`console.sections.${id}.label`),
          description: t(`console.sections.${id}.description`),
          href: getConsoleSectionHref(id, retainedParams(stringParams)),
        }))}
      >
        {content}
      </ConsoleWorkspaceShell>
    </AppShell>
  );
}

function normalizeSearchParams(raw: ConsoleSearchParams) { return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])) as Record<string, string | undefined>; }
function retainedParams(params: Record<string, string | undefined>) { const next = { ...params }; delete next.section; delete next.page; return next; }
function validDate(value?: string) { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)); }
function parsePeriod(period?: string, date?: string) { const days = [1, 7, 30, 90, 365].includes(Number(period)) ? Number(period) : 30; const selectedDate = validDate(date) ? date : undefined; const end = selectedDate ? new Date(`${selectedDate}T23:59:59.999`) : new Date(); const start = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date(end.getTime() - days * 24 * 60 * 60 * 1000); return { days, selectedDate, start, end }; }
function isEnumValue<T extends Record<string, string>>(enumObject: T, value?: string): value is T[keyof T] { return Boolean(value && Object.values(enumObject).includes(value)); }
function isInternalSection(value: ConsoleSectionId): value is Extract<ConsoleSectionId, "hr-cfo" | "sco" | "coo" | "ceo" | "mpo" | "cto" | "legal"> { return ["hr-cfo", "sco", "coo", "ceo", "mpo", "cto", "legal"].includes(value); }
function parseSimplePaging(page?: string, pageSize?: string, defaultSize = 25) { const normalizedPage = Math.max(1, Number(page) || 1); const take = Math.min(100, Math.max(1, Number(pageSize) || defaultSize)); return { page: normalizedPage, take, skip: (normalizedPage - 1) * take }; }
function simplePagination(total: number, page: number, pageSize: number) { const totalPages = Math.max(1, Math.ceil(total / pageSize)); return { page: Math.min(page, totalPages), pageSize, total, totalPages, hasPreviousPage: page > 1, hasNextPage: page < totalPages }; }

function SupportSummary({ summary, locale }: { summary: { open: number; urgent: number; overdue: number; averageResolutionHours: number | null }; locale: "fr" | "en" }) {
  return (
    <ModuleMetrics label={translate(locale, "console.detailSections.supportIndicators")}>
      <ModuleMetric label={translate(locale, "console.detailSections.supportOpen")} value={summary.open} />
      <ModuleMetric label={translate(locale, "console.detailSections.supportUrgent")} value={summary.urgent} />
      <ModuleMetric label={translate(locale, "console.detailSections.supportOverdue")} value={summary.overdue} />
      <ModuleMetric label={translate(locale, "console.detailSections.supportResolution")} value={summary.averageResolutionHours === null ? "—" : `${summary.averageResolutionHours} h`} />
    </ModuleMetrics>
  );
}

function renderInternalSection(
  section: Extract<ConsoleSectionId, "hr-cfo" | "sco" | "coo" | "ceo" | "mpo" | "cto" | "legal">,
  data: Awaited<ReturnType<typeof getConsoleInternalModulesDataset>>,
  canManage: boolean,
  locale: string,
  ceoStart?: string,
  ceoEnd?: string,
  hrcfoInvoices: Array<{ id: string; number: string; planName: string; amount: number; currency: string; status: string; issuedAt: string; beneficiary: string; transactionReference: string | null }> = [],
  canReadHrcfoInvoices = false,
) {
  if (section === "hr-cfo") return (
    <InternalDepartmentWorkspace locale={locale} sections={[
      { id: "payroll", titleKey: "payroll", content: <PayrollWorkflowPanel locale={locale} embedded /> },
      { id: "invoices", titleKey: "invoices", content: <HrcfoInvoiceList invoices={hrcfoInvoices} canRead={canReadHrcfoInvoices} /> },
      { id: "operations", titleKey: "operations", content: <OperationsAdminPanel eyebrow="Gestion interne" title="Opérations HR & CFO" description="Dossiers RH, budgets, dépenses, comptes et contrôles depuis les moteurs canoniques." playbook={["Dossier RH", "Budget", "Dépense", "Validation", "Paiement", "Audit"]} datasets={data.hrcfoDatasets.filter((item) => item.id !== "payrolls")} canEdit={canManage} embedded /> },
    ]} />
  );
  if (section === "sco") return (
    <InternalDepartmentWorkspace locale={locale} sections={[
      { id: "operations", titleKey: "supplyChain", content: <OperationsAdminPanel eyebrow="Supply Chain Operations" title="Opérations SCO" description="Fournisseurs, achats, stocks, actifs et logistique." playbook={["Besoin", "Budget", "Fournisseur", "Commande", "Réception", "Audit"]} datasets={data.scoDatasets} canEdit={canManage} embedded /> },
    ]} />
  );
  if (section === "coo") return (
    <InternalDepartmentWorkspace locale={locale} sections={[
      { id: "payroll-approvals", titleKey: "payrollApprovals", content: <PayrollApprovalPanel approverRole="COO" locale={locale} embedded /> },
      { id: "work-approvals", titleKey: "workApprovals", content: <WorkSubmissionReviewPanel reviewerRole="COO" locale={locale} embedded /> },
      { id: "operations", titleKey: "operations", content: <OperationsAdminPanel eyebrow="Chief Operating Officer" title="Pilotage COO" description="Opérations, tâches, demandes, blocages, réunions et rapports." playbook={["Cadrage", "Assignation", "Coordination", "Validation", "Rapport"]} datasets={data.cooDatasets} canEdit={canManage} embedded /> },
    ]} />
  );
  if (section === "ceo") return (
    <InternalDepartmentWorkspace locale={locale} sections={[
      { id: "executive", titleKey: "executive", content: <CeoExecutiveSummary groups={data.ceoExecutiveGroups} dateStart={ceoStart} dateEnd={ceoEnd} embedded /> },
      { id: "payroll-approvals", titleKey: "payrollApprovals", content: <PayrollApprovalPanel approverRole="CEO" locale={locale} embedded /> },
      { id: "work-approvals", titleKey: "workApprovals", content: <WorkSubmissionReviewPanel reviewerRole="CEO" locale={locale} embedded /> },
      { id: "operations", titleKey: "operations", content: <OperationsAdminPanel eyebrow="Chief Executive Officer" title="Supervision CEO" description="Objectifs, décisions, risques et indicateurs réels consolidés." playbook={["Synthèse", "Alerte", "Décision", "Arbitrage", "Suivi"]} datasets={data.ceoDatasets} canEdit={canManage} embedded /> },
    ]} />
  );
  if (section === "mpo") return (
    <InternalDepartmentWorkspace locale={locale} sections={[
      { id: "operations", titleKey: "projects", content: <OperationsAdminPanel eyebrow="Management & Projects Officer" title="MPO — Management & Projets" description="Projets, livrables, risques, jalons et dépendances." playbook={["Cadrage", "Plan", "Livrable", "Risque", "Validation", "Clôture"]} datasets={data.mpoDatasets} canEdit={canManage} embedded /> },
    ]} />
  );
  if (section === "cto") return (
    <InternalDepartmentWorkspace locale={locale} sections={[
      { id: "operations", titleKey: "technology", content: <OperationsAdminPanel eyebrow="Chief Technical Officer" title="CTO — Technologie & Développement" description="Projets techniques, qualité, sécurité, API et incidents." playbook={["Analyse", "Architecture", "Développement", "Test", "Déploiement", "Documentation"]} datasets={data.ctoDatasets} canEdit={canManage} embedded /> },
    ]} />
  );
  return (
    <InternalDepartmentWorkspace locale={locale} sections={[
      { id: "legal-overview", titleKey: "legalOverview", content: <LegalDashboardSummary metrics={data.legalMetrics} charts={data.legalCharts} embedded /> },
      { id: "operations", titleKey: "legalOperations", content: <OperationsAdminPanel eyebrow="Legal Advisor" title="Legal Advisor" description="Dossiers, contrats, risques, litiges, documents et échéances." playbook={["Demande", "Analyse", "Avis", "Validation", "Arbitrage", "Archivage"]} datasets={data.laDatasets} canEdit={canManage} embedded /> },
    ]} />
  );
}
