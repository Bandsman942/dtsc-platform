import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { BadgePercent, BarChart3, BriefcaseBusiness, Building2, Code2, CreditCard, Crown, FileText, FolderKanban, Megaphone, MessageSquare, PackageCheck, Scale, Settings, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { PaymentStatus, TicketPriority, TicketStatus, UserRole, UserStatus } from "@prisma/client";
import { AdminAccessPanel } from "@/components/admin/admin-access-panel";
import { AdminAuditTables } from "@/components/admin/admin-audit-tables";
import { AdminBillingSubscriptions } from "@/components/admin/admin-billing-subscriptions";
import { AdminDataTables } from "@/components/admin/admin-data-tables";
import { AdminFloatingNav } from "@/components/admin/admin-floating-nav";
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
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { AppShell } from "@/components/layout/app-shell";
import { TicketBoard } from "@/components/support/ticket-board";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { canAccessAdministration, parseAdminRoleAccess, type AdminBlockId } from "@/lib/admin-access";
import { getSession, requireUser } from "@/lib/auth";
import { canAccessAdminSection } from "@/lib/business-roles";
import { getConsoleAuditDataset } from "@/lib/console/console-audit";
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
import { getIteration07UserGuide, type Iteration07GuideCode } from "@/lib/user-guides/iteration07-guides";

type ConsoleSearchParams = Record<string, string | string[] | undefined>;

type SectionMeta = { id: ConsoleSectionId; icon: LucideIcon };
const sectionMeta: SectionMeta[] = [
  { id: "overview", icon: BarChart3 }, { id: "module-maturity", icon: BarChart3 }, { id: "access", icon: ShieldCheck },
  { id: "platform-settings", icon: Settings }, { id: "promotions", icon: BadgePercent }, { id: "content", icon: FileText },
  { id: "users", icon: Users }, { id: "organizations", icon: Building2 }, { id: "subscriptions", icon: CreditCard },
  { id: "support", icon: MessageSquare }, { id: "visits", icon: BarChart3 }, { id: "security-audit", icon: Megaphone },
  { id: "hr-cfo", icon: BriefcaseBusiness }, { id: "sco", icon: PackageCheck }, { id: "coo", icon: BarChart3 },
  { id: "ceo", icon: Crown }, { id: "mpo", icon: FolderKanban }, { id: "cto", icon: Code2 }, { id: "legal", icon: Scale },
];

const readCapability: Partial<Record<ConsoleSectionId, ConsoleCapability>> = {
  overview: CONSOLE_CAPABILITIES.OVERVIEW_READ,
  "module-maturity": CONSOLE_CAPABILITIES.MODULE_MATURITY_READ,
  "platform-settings": CONSOLE_CAPABILITIES.SETTINGS_READ,
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
  promotions: CONSOLE_CAPABILITIES.CONTENT_MANAGE,
  content: CONSOLE_CAPABILITIES.CONTENT_MANAGE,
  users: CONSOLE_CAPABILITIES.USERS_MANAGE,
  organizations: CONSOLE_CAPABILITIES.ORGANIZATIONS_MANAGE,
  subscriptions: CONSOLE_CAPABILITIES.SUBSCRIPTIONS_MANAGE,
  support: CONSOLE_CAPABILITIES.SUPPORT_MANAGE,
  "security-audit": CONSOLE_CAPABILITIES.SECURITY_MANAGE,
};

const guideBySection: Record<Exclude<ConsoleSectionId, "module-maturity">, Iteration07GuideCode> = {
  overview: "CONSOLE_OVERVIEW", access: "CONSOLE_RBAC", "platform-settings": "CONSOLE_PLATFORM_SETTINGS", promotions: "CONSOLE_CONTENT",
  content: "CONSOLE_CONTENT", users: "CONSOLE_USERS", organizations: "CONSOLE_CLIENT_ENTERPRISES", subscriptions: "CONSOLE_SUBSCRIPTIONS",
  support: "CONSOLE_SUPPORT", visits: "CONSOLE_VISITS", "security-audit": "CONSOLE_SECURITY_AUDIT", "hr-cfo": "DTSC_HR_CFO",
  sco: "DTSC_SCO", coo: "DTSC_COO", ceo: "DTSC_CEO", mpo: "DTSC_MPO", cto: "DTSC_CTO", legal: "DTSC_LEGAL",
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
  await Promise.all(sectionMeta.map(async ({ id }) => {
    if (id === "access") { allowedMap.set(id, user.role === UserRole.ADMIN); return; }
    const capability = readCapability[id];
    if (capability) { allowedMap.set(id, (await getConsoleAccessDecision({ user, capability, adminRoleAccess })).allowed); return; }
    const block = CONSOLE_SECTION_ADMIN_BLOCK[id];
    allowedMap.set(id, block ? await canAccessAdminSection(user, block, adminRoleAccess) : false);
  }));
  const visibleSections = sectionMeta.filter(({ id }) => allowedMap.get(id));
  const activeSection = requested.section;
  if (!allowedMap.get(activeSection)) redirect(getConsoleSectionHref(visibleSections[0]?.id || "overview"));

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
  const guide = activeSection === "module-maturity" ? null : getIteration07UserGuide(guideBySection[activeSection], locale);

  let content: ReactNode = null;
  if (activeSection === "overview") {
    const overview = await getConsoleOverviewMetrics({ selectedDate: period.selectedDate, selectedPeriod: period.days, visitStart: period.start, visitEnd: period.end });
    content = <div className="space-y-5"><ConsoleSaasOverview {...overview.consoleSaasOverview} /><Accordion><AccordionItem title={locale === "en" ? "Detailed platform indicators" : "Indicateurs détaillés plateforme"} defaultOpen><AdminOverviewMetrics selectedPeriod={period.days} selectedDate={period.selectedDate} {...overview.overviewMetrics} /></AccordionItem></Accordion></div>;
  } else if (activeSection === "access") {
    content = <Accordion><AccordionItem title={t("console.sections.access.label")} defaultOpen><AdminAccessPanel access={adminRoleAccess} /></AccordionItem></Accordion>;
  } else if (activeSection === "platform-settings") {
    const flags = await prisma.featureFlag.findMany({ orderBy: [{ environment: "asc" }, { code: "asc" }], take: 100 });
    content = <div className="space-y-5"><Accordion><AccordionItem title={t("console.sections.platform-settings.label")} defaultOpen><AdminSettingsPanel canEdit={canManage} settings={{ defaultDailyMessageLimit: settings.defaultDailyMessageLimit, defaultDailyTokenLimit: settings.defaultDailyTokenLimit, chatbotEnabled: settings.chatbotEnabled, publicAgentEnabled: settings.publicAgentEnabled, allowNonClientPublicationDrafts: settings.allowNonClientPublicationDrafts, maintenanceMode: settings.maintenanceMode, supportAutoCloseDays: settings.supportAutoCloseDays, allowClientAnnouncements: settings.allowClientAnnouncements, commentEditWindowMinutes: settings.commentEditWindowMinutes, notificationRetentionDays: settings.notificationRetentionDays, signUpOtpEnabled: settings.signUpOtpEnabled, signUpOtpExpirationMinutes: settings.signUpOtpExpirationMinutes }} /></AccordionItem></Accordion><FeatureFlagManager flags={toJsonSafe(flags)} canManage={canManage} locale={locale} /></div>;
  } else if (activeSection === "promotions") {
    const paging = parseSimplePaging(page, pageSize, 25);
    const [banners, total] = await Promise.all([prisma.promotionalBanner.findMany({ orderBy: [{ archivedAt: "asc" }, { priority: "desc" }, { createdAt: "desc" }], include: { _count: { select: { dismissals: true } } }, skip: paging.skip, take: paging.take }), prisma.promotionalBanner.count()]);
    const pagination = simplePagination(total, paging.page, paging.take);
    content = <><Accordion><AccordionItem title={t("console.sections.promotions.label")} defaultOpen><PromotionalBannerManager banners={toJsonSafe(banners)} canManage={canManage} /></AccordionItem></Accordion><ConsoleServerPagination pagination={pagination} pathname={pathname} searchParams={{ pageSize: String(paging.take) }} /></>;
  } else if (activeSection === "content") {
    const published = stringParams.published === "true" ? true : stringParams.published === "false" ? false : null;
    const dataset = await getConsolePublicationsDataset({ page, pageSize, search, published, category: stringParams.category });
    content = <div className="space-y-4"><ConsoleFilterBar action={pathname} search={search} hidden={{ pageSize }}><ConsoleSelectFilter name="published" label={t("console.filters.status")} value={stringParams.published} options={[{ value: "true", label: locale === "en" ? "Published" : "Publié" }, { value: "false", label: locale === "en" ? "Draft" : "Brouillon" }]} /></ConsoleFilterBar><Accordion><AccordionItem title={t("console.sections.content.label")} defaultOpen><PublicPublicationsManager publications={toJsonSafe(dataset.publicPublications)} currentUserId={user.id} canCreateDrafts={canManage || settings.allowNonClientPublicationDrafts} canPublish={canManage} canDelete={canManage} /></AccordionItem></Accordion><ConsoleServerPagination pagination={dataset.pagination} pathname={pathname} searchParams={{ search, published: stringParams.published, category: stringParams.category, pageSize }} /></div>;
  } else if (activeSection === "users") {
    const role = isEnumValue(UserRole, stringParams.role) ? stringParams.role as UserRole : undefined;
    const status = isEnumValue(UserStatus, stringParams.status) ? stringParams.status as UserStatus : undefined;
    const dataset = await getConsoleUsersDataset({ page, pageSize, search, role, status, organizationId: stringParams.organizationId });
    content = <div className="space-y-4"><ConsoleFilterBar action={pathname} search={search} hidden={{ pageSize }}><ConsoleSelectFilter name="role" label={t("console.filters.role")} value={role} options={Object.values(UserRole).map((value) => ({ value, label: value }))} /><ConsoleSelectFilter name="status" label={t("console.filters.status")} value={status} options={Object.values(UserStatus).map((value) => ({ value, label: value }))} /></ConsoleFilterBar><ConsoleExportLinks locale={locale} links={[{ href: `/api/admin/exports/users?role=${encodeURIComponent(role || "")}&status=${encodeURIComponent(status || "")}`, label: locale === "en" ? "Export users" : "Exporter les utilisateurs" }]} />{canManage ? <Accordion><AccordionItem title={locale === "en" ? "Create a user account" : "Créer un compte utilisateur"}><CreateUserForm /></AccordionItem><AccordionItem title="Newsletter"><NewsletterSubscribersManager canManage={canManage} /></AccordionItem></Accordion> : null}<Accordion><AccordionItem title={t("console.sections.users.label")} defaultOpen><AdminDataTables users={toJsonSafe(dataset.users)} conversations={[]} tickets={[]} showUsers showActivity={false} canManageUsers={canManage} /></AccordionItem></Accordion><ConsoleServerPagination pagination={dataset.pagination} pathname={pathname} searchParams={{ search, role, status, organizationId: stringParams.organizationId, pageSize }} /></div>;
  } else if (activeSection === "organizations") {
    const dataset = await getConsoleClientOrganizationsDataset({ page, pageSize, search, status: stringParams.status, sectorId: stringParams.sectorId, planId: stringParams.planId });
    const users = canManage ? await prisma.user.findMany({ where: { status: UserStatus.ACTIVE }, select: { id: true, name: true, email: true, role: true }, orderBy: { name: "asc" }, take: 100 }) : [];
    content = <div className="space-y-4"><ConsoleFilterBar action={pathname} search={search} hidden={{ pageSize }}><ConsoleSelectFilter name="status" label={t("console.filters.status")} value={stringParams.status} options={["DRAFT", "PENDING", "ACTIVE", "SUSPENDED", "ARCHIVED"].map((value) => ({ value, label: value }))} /></ConsoleFilterBar><ConsoleExportLinks locale={locale} links={[{ href: `/api/admin/exports/organizations?status=${encodeURIComponent(stringParams.status || "")}`, label: locale === "en" ? "Export organizations" : "Exporter les entreprises" }]} /><Accordion><AccordionItem title={t("console.sections.organizations.label")} defaultOpen><ClientOrganizationsPanel organizations={toJsonSafe(dataset.clientOrganizations)} users={users} plans={dataset.billingPlans} sectors={dataset.businessSectors} /></AccordionItem></Accordion><ConsoleServerPagination pagination={dataset.pagination} pathname={pathname} searchParams={{ search, status: stringParams.status, sectorId: stringParams.sectorId, planId: stringParams.planId, pageSize }} /></div>;
  } else if (activeSection === "subscriptions") {
    const paymentStatus = isEnumValue(PaymentStatus, stringParams.paymentStatus) ? stringParams.paymentStatus as PaymentStatus : undefined;
    const [dataset, reconcileDecision] = await Promise.all([
      getConsoleBillingDataset({ page, paymentPage: stringParams.paymentPage, pageSize, search, status: stringParams.status, planId: stringParams.planId, paymentStatus }),
      getConsoleAccessDecision({ user, capability: CONSOLE_CAPABILITIES.RECONCILE_BILLING, adminRoleAccess }),
    ]);
    content = <div className="space-y-4"><ConsoleFilterBar action={pathname} search={search} hidden={{ pageSize }}><ConsoleSelectFilter name="status" label={t("console.filters.status")} value={stringParams.status} options={["ACTIVE", "TRIAL", "PAST_DUE", "PENDING_PAYMENT", "SUSPENDED", "CANCELED", "EXPIRED"].map((value) => ({ value, label: value }))} /><ConsoleSelectFilter name="paymentStatus" label={locale === "en" ? "Payment" : "Paiement"} value={paymentStatus} options={Object.values(PaymentStatus).map((value) => ({ value, label: value }))} /></ConsoleFilterBar><ConsoleExportLinks locale={locale} links={[{ href: `/api/admin/exports/payments?status=${encodeURIComponent(paymentStatus || "")}`, label: locale === "en" ? "Export payments" : "Exporter les paiements" }]} /><BillingReconciliationControl canReconcile={reconcileDecision.allowed} locale={locale} /><Accordion><AccordionItem title={t("console.sections.subscriptions.label")} defaultOpen><div className="space-y-6"><BillingPlanManager plans={dataset.billingPlans} canManage={canManage} locale={user.locale} /><AdminBillingSubscriptions subscriptions={dataset.organizationSubscriptionItems} plans={dataset.billingPlanOptions} summary={dataset.billingSummary} payments={dataset.paymentAuditItems} /></div></AccordionItem></Accordion><ConsoleServerPagination pagination={dataset.organizationPagination} pathname={pathname} searchParams={{ search, status: stringParams.status, planId: stringParams.planId, paymentStatus, pageSize }} /></div>;
  } else if (activeSection === "support") {
    const status = isEnumValue(TicketStatus, stringParams.status) ? stringParams.status as TicketStatus : undefined;
    const priority = isEnumValue(TicketPriority, stringParams.priority) ? stringParams.priority as TicketPriority : undefined;
    const dataset = await getConsoleSupportDataset({ page, pageSize, search, status, priority, organizationId: stringParams.organizationId, assignedToDtscUserId: stringParams.assignedTo, overdueOnly: stringParams.overdue === "true" });
    content = <div className="space-y-4"><ConsoleFilterBar action={pathname} search={search} hidden={{ pageSize }}><ConsoleSelectFilter name="status" label={t("console.filters.status")} value={status} options={Object.values(TicketStatus).map((value) => ({ value, label: value }))} /><ConsoleSelectFilter name="priority" label={t("console.filters.priority")} value={priority} options={Object.values(TicketPriority).map((value) => ({ value, label: value }))} /></ConsoleFilterBar><SupportSummary summary={dataset.summary} /><Accordion><AccordionItem title={t("console.sections.support.label")} defaultOpen><TicketBoard tickets={toJsonSafe(dataset.tickets)} canManage={canManage} currentUserId={user.id} assignees={dataset.assignees} /></AccordionItem></Accordion><ConsoleServerPagination pagination={dataset.pagination} pathname={pathname} searchParams={{ search, status, priority, organizationId: stringParams.organizationId, assignedTo: stringParams.assignedTo, overdue: stringParams.overdue, pageSize }} /></div>;
  } else if (activeSection === "visits") {
    const overview = await getConsoleOverviewMetrics({ selectedDate: period.selectedDate, selectedPeriod: period.days, visitStart: period.start, visitEnd: period.end });
    content = <Accordion><AccordionItem title={t("console.sections.visits.label")} defaultOpen><SiteVisitsChart points={overview.visitPoints} selectedPeriod={period.days} selectedDate={period.selectedDate} totalVisits={overview.visitTotal} /></AccordionItem></Accordion>;
  } else if (activeSection === "security-audit") {
    const source = ["AUDIT", "API", "WEBHOOK"].includes(stringParams.source || "") ? stringParams.source as "AUDIT" | "API" | "WEBHOOK" : "AUDIT";
    const dataset = await getConsoleAuditDataset({ page, pageSize, search, source, result: stringParams.result, organizationId: stringParams.organizationId, userId: stringParams.userId, statusCode: stringParams.statusCode ? Number(stringParams.statusCode) : null, provider: stringParams.provider, requestId: stringParams.requestId });
    const [billing, incidents, webhookRetryDecision] = await Promise.all([
      getConsoleBillingDataset({ page: 1, pageSize: 10, paymentPage: 1 }),
      prisma.platformIncident.findMany({ orderBy: [{ status: "asc" }, { startedAt: "desc" }], take: 100 }),
      getConsoleAccessDecision({ user, capability: CONSOLE_CAPABILITIES.WEBHOOK_RETRY, adminRoleAccess }),
    ]);
    content = <div className="space-y-4"><ConsoleFilterBar action={pathname} search={search} hidden={{ pageSize }}><ConsoleSelectFilter name="source" label={t("console.filters.source")} value={source} options={[{ value: "AUDIT", label: "Audit" }, { value: "API", label: "API" }, { value: "WEBHOOK", label: "Webhook" }]} /></ConsoleFilterBar><ConsoleExportLinks locale={locale} links={[{ href: `/api/admin/exports/audit?result=${encodeURIComponent(stringParams.result || "")}`, label: locale === "en" ? "Export audit" : "Exporter l’audit" }]} /><PlatformIncidentManager incidents={toJsonSafe(incidents)} canManage={canManage} locale={locale} /><Accordion><AccordionItem title={t("console.sections.security-audit.label")} defaultOpen><AdminAuditTables payments={billing.paymentAuditItems} logs={toJsonSafe(dataset.logAuditItems)} canRetryWebhooks={webhookRetryDecision.allowed} /></AccordionItem></Accordion><ConsoleServerPagination pagination={dataset.pagination} pathname={pathname} searchParams={{ search, source, result: stringParams.result, organizationId: stringParams.organizationId, userId: stringParams.userId, provider: stringParams.provider, requestId: stringParams.requestId, pageSize }} /></div>;
  } else if (isInternalSection(activeSection)) {
    const ceoStart = validDate(stringParams.ceoStart) ? stringParams.ceoStart : undefined;
    const ceoEnd = validDate(stringParams.ceoEnd) ? stringParams.ceoEnd : undefined;
    const internal = await getConsoleInternalModulesDataset({ section: activeSection, pageSize: Number(pageSize || 60), selectedCeoStart: ceoStart, selectedCeoEnd: ceoEnd, ceoStartDate: ceoStart ? new Date(`${ceoStart}T00:00:00`) : undefined, ceoEndDate: ceoEnd ? new Date(`${ceoEnd}T23:59:59.999`) : undefined });
    content = renderInternalSection(activeSection, internal, canManage, user.locale, ceoStart, ceoEnd);
  }

  return (
    <AppShell user={user}>
      <div className="w-full min-w-0 max-w-full space-y-6">
        <section className="dtsc-panel min-w-0 max-w-full overflow-hidden p-4 sm:p-6">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0"><p className="text-sm font-bold text-cyan-600">{t("console.eyebrow")}</p><h1 className="mt-2 break-words text-3xl font-black tracking-tight text-dtsc-ink sm:text-4xl">{t("console.title")}</h1><p className="mt-3 max-w-3xl break-words leading-7 text-dtsc-muted">{t("console.description")}</p></div>
            {guide ? <ContextualUserGuide guide={guide} /> : null}
          </div>
        </section>
        <AdminFloatingNav activeSection={activeSection} sections={visibleSections.map(({ id }) => ({ id, label: t(`console.sections.${id}.label`), description: t(`console.sections.${id}.description`), href: getConsoleSectionHref(id, retainedParams(stringParams)) }))} />
        <nav className="hidden min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-3 lg:grid xl:grid-cols-[repeat(4,minmax(0,1fr))]" aria-label="Sections Console DTSC">
          {visibleSections.map(({ id, icon: Icon }) => <Link key={id} href={getConsoleSectionHref(id, retainedParams(stringParams))} className={`min-w-0 overflow-hidden rounded-2xl border p-4 shadow-[0_12px_34px_rgba(0,43,91,0.07)] transition ${activeSection === id ? "border-cyan-300 bg-[#002b5b] text-white" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:border-cyan-300 hover:bg-dtsc-soft"}`}><span className="flex min-w-0 items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${activeSection === id ? "bg-white/10 text-cyan-200" : "bg-dtsc-soft text-dtsc-blue"}`}><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block break-words font-black">{t(`console.sections.${id}.label`)}</span><span className={`mt-1 block break-words text-xs leading-5 ${activeSection === id ? "text-slate-200" : "text-dtsc-muted"}`}>{t(`console.sections.${id}.description`)}</span></span></span></Link>)}
        </nav>
        {content}
      </div>
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

function SupportSummary({ summary }: { summary: { open: number; urgent: number; overdue: number; averageResolutionHours: number | null } }) { return <div className="max-w-full overflow-x-auto pb-2"><div className="flex min-w-max gap-3 lg:grid lg:min-w-0 lg:grid-cols-4">{[["Ouverts", summary.open], ["Urgents", summary.urgent], ["SLA dépassé", summary.overdue], ["Résolution moyenne", summary.averageResolutionHours === null ? "—" : `${summary.averageResolutionHours} h`]].map(([label, value]) => <div key={String(label)} className="dtsc-card w-56 shrink-0 p-4 lg:w-auto"><p className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{label}</p><p className="mt-2 text-2xl font-black text-dtsc-ink">{value}</p></div>)}</div></div>; }

function renderInternalSection(section: Extract<ConsoleSectionId, "hr-cfo" | "sco" | "coo" | "ceo" | "mpo" | "cto" | "legal">, data: Awaited<ReturnType<typeof getConsoleInternalModulesDataset>>, canManage: boolean, locale: string, ceoStart?: string, ceoEnd?: string) {
  if (section === "hr-cfo") return <div className="space-y-5"><PayrollWorkflowPanel locale={locale} /><OperationsAdminPanel eyebrow="Gestion interne" title="Opérations HR & CFO" description="Dossiers RH, budgets, dépenses, comptes et contrôles depuis les moteurs canoniques." playbook={["Dossier RH", "Budget", "Dépense", "Validation", "Paiement", "Audit"]} datasets={data.hrcfoDatasets.filter((item) => item.id !== "payrolls")} canEdit={canManage} /></div>;
  if (section === "sco") return <OperationsAdminPanel eyebrow="Supply Chain Operations" title="Opérations SCO" description="Fournisseurs, achats, stocks, actifs et logistique." playbook={["Besoin", "Budget", "Fournisseur", "Commande", "Réception", "Audit"]} datasets={data.scoDatasets} canEdit={canManage} />;
  if (section === "coo") return <div className="space-y-5"><PayrollApprovalPanel approverRole="COO" locale={locale} /><WorkSubmissionReviewPanel reviewerRole="COO" locale={locale} /><OperationsAdminPanel eyebrow="Chief Operating Officer" title="Pilotage COO" description="Opérations, tâches, demandes, blocages, réunions et rapports." playbook={["Cadrage", "Assignation", "Coordination", "Validation", "Rapport"]} datasets={data.cooDatasets} canEdit={canManage} /></div>;
  if (section === "ceo") return <div className="space-y-5"><CeoExecutiveSummary groups={data.ceoExecutiveGroups} dateStart={ceoStart} dateEnd={ceoEnd} /><PayrollApprovalPanel approverRole="CEO" locale={locale} /><WorkSubmissionReviewPanel reviewerRole="CEO" locale={locale} /><OperationsAdminPanel eyebrow="Chief Executive Officer" title="Supervision CEO" description="Objectifs, décisions, risques et indicateurs réels consolidés." playbook={["Synthèse", "Alerte", "Décision", "Arbitrage", "Suivi"]} datasets={data.ceoDatasets} canEdit={canManage} /></div>;
  if (section === "mpo") return <OperationsAdminPanel eyebrow="Management & Projects Officer" title="MPO — Management & Projets" description="Projets, livrables, risques, jalons et dépendances." playbook={["Cadrage", "Plan", "Livrable", "Risque", "Validation", "Clôture"]} datasets={data.mpoDatasets} canEdit={canManage} />;
  if (section === "cto") return <OperationsAdminPanel eyebrow="Chief Technical Officer" title="CTO — Technologie & Développement" description="Projets techniques, qualité, sécurité, API et incidents." playbook={["Analyse", "Architecture", "Développement", "Test", "Déploiement", "Documentation"]} datasets={data.ctoDatasets} canEdit={canManage} />;
  return <div className="space-y-5"><LegalDashboardSummary metrics={data.legalMetrics} charts={data.legalCharts} /><OperationsAdminPanel eyebrow="Legal Advisor" title="Legal Advisor" description="Dossiers, contrats, risques, litiges, documents et échéances." playbook={["Demande", "Analyse", "Avis", "Validation", "Arbitrage", "Archivage"]} datasets={data.laDatasets} canEdit={canManage} /></div>;
}
