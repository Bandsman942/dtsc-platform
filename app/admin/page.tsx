import Link from "next/link";
import { BarChart3, BriefcaseBusiness, Building2, Code2, CreditCard, Crown, FileText, FolderKanban, Megaphone, MessageSquare, PackageCheck, Scale, Settings, ShieldCheck, Users } from "lucide-react";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { AdminAccessPanel } from "@/components/admin/admin-access-panel";
import { AdminAuditTables } from "@/components/admin/admin-audit-tables";
import { AdminDataTables } from "@/components/admin/admin-data-tables";
import { AdminFloatingNav } from "@/components/admin/admin-floating-nav";
import { AdminOverviewMetrics } from "@/components/admin/admin-overview-metrics";
import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";
import { CeoExecutiveSummary } from "@/components/admin/ceo-executive-summary";
import { ClientOrganizationsPanel } from "@/components/admin/client-organizations-panel";
import { ConsoleSaasOverview } from "@/components/admin/console-saas-overview";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { LegalDashboardSummary } from "@/components/admin/legal-dashboard-summary";
import { NewsletterSubscribersManager } from "@/components/admin/newsletter-subscribers-manager";
import { OperationsAdminPanel } from "@/components/admin/operations-admin-panel";
import { PublicPublicationsManager } from "@/components/admin/public-publications-manager";
import { SiteVisitsChart } from "@/components/admin/site-visits-chart";
import { AppShell } from "@/components/layout/app-shell";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { canAccessAdministration, parseAdminRoleAccess, type AdminBlockId } from "@/lib/admin-access";
import { getSession, requireUser } from "@/lib/auth";
import { canAccessAdminSection, ensureDefaultPositions } from "@/lib/business-roles";
import { getConsoleAuditDataset } from "@/lib/console/console-audit";
import { getConsoleBillingDataset } from "@/lib/console/console-billing";
import { getConsoleInternalModulesDataset } from "@/lib/console/console-internal-modules";
import { getConsoleClientOrganizationsDataset } from "@/lib/console/console-organizations";
import { getConsoleOverviewMetrics } from "@/lib/console/console-overview";
import { getConsolePublicationsDataset } from "@/lib/console/console-publications";
import { getConsoleSupportDataset } from "@/lib/console/console-support";
import { isUserRole, toJsonSafe } from "@/lib/console/console-utils";
import { getConsoleUsersDataset } from "@/lib/console/console-users";
import { getDashboardUrl } from "@/lib/domains";
import { reconcileFinancialState, syncPaidSubscriptionIncomeTransactions } from "@/lib/hr-cfo-finance";
import { isDtscInternalSession } from "@/lib/organizations";
import { getAppSettings } from "@/lib/settings";

type AdminSectionId = AdminBlockId | "access";

const adminSections: Array<{ id: AdminSectionId; label: string; description: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Vue générale", description: "KPIs et synthèse plateforme", icon: BarChart3 },
  { id: "access", label: "Accès RBAC", description: "Droits des rôles non-client", icon: ShieldCheck },
  { id: "settings", label: "Paramètres plateforme", description: "Limites, OTP, diffusions", icon: Settings },
  { id: "publications", label: "Publications & contenus", description: "Articles et ressources publiques", icon: FileText },
  { id: "users", label: "Utilisateurs & accès", description: "Comptes, rôles et limites", icon: Users },
  { id: "clientOrganizations", label: "Entreprises clientes", description: "Espaces client et admins", icon: Building2 },
  { id: "billing", label: "Abonnements & facturation", description: "Plans, paiements et revenus", icon: CreditCard },
  { id: "hrCfo", label: "HR & CFO", description: "RH, finance et contrôle", icon: BriefcaseBusiness },
  { id: "sco", label: "SCO", description: "Achats, stocks et logistique", icon: PackageCheck },
  { id: "coo", label: "COO", description: "Opérations, tâches et workflows", icon: BarChart3 },
  { id: "ceo", label: "CEO", description: "Supervision exécutive", icon: Crown },
  { id: "mpo", label: "MPO", description: "Management & projets", icon: FolderKanban },
  { id: "cto", label: "CTO", description: "Technologie & développement", icon: Code2 },
  { id: "la", label: "LA", description: "Legal Advisor", icon: Scale },
  { id: "visits", label: "Visites", description: "Audience du site public", icon: BarChart3 },
  { id: "activity", label: "Support client", description: "Conversations et tickets", icon: MessageSquare },
  { id: "audits", label: "Sécurité & audit", description: "Paiements, API et webhooks", icon: Megaphone },
];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; period?: string; date?: string; section?: string; ceoStart?: string; ceoEnd?: string }>;
}) {
  const user = await requireUser();
  const session = await getSession();
  if (!isDtscInternalSession(session) || !canAccessAdministration(user.role)) {
    redirect(getDashboardUrl());
  }

  const { role, period, date, section, ceoStart, ceoEnd } = await searchParams;
  const parsedPeriod = Number(period || 30);
  const selectedPeriod = Number.isFinite(parsedPeriod) ? Math.min(Math.max(parsedPeriod, 7), 200) : 30;
  const selectedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  const visitStart = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
  const visitEnd = selectedDate ? new Date(`${selectedDate}T23:59:59`) : new Date();
  if (!selectedDate) {
    visitStart.setDate(visitStart.getDate() - selectedPeriod);
  }
  const roleFilter = isUserRole(role) ? role : undefined;
  const selectedCeoStart = ceoStart && /^\d{4}-\d{2}-\d{2}$/.test(ceoStart) ? ceoStart : undefined;
  const selectedCeoEnd = ceoEnd && /^\d{4}-\d{2}-\d{2}$/.test(ceoEnd) ? ceoEnd : undefined;
  const ceoStartDate = selectedCeoStart ? new Date(`${selectedCeoStart}T00:00:00`) : undefined;
  const ceoEndDate = selectedCeoEnd ? new Date(`${selectedCeoEnd}T23:59:59.999`) : undefined;

  await ensureDefaultPositions();
  await syncPaidSubscriptionIncomeTransactions();
  await reconcileFinancialState();

  const settings = await getAppSettings();
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

  const loadUserDetails = activeSection === "users" || activeSection === "clientOrganizations";
  const loadClientOrganizationDetails = activeSection === "clientOrganizations";
  const loadActivityDetails = activeSection === "activity";
  const loadBillingDetails = activeSection === "billing" || activeSection === "audits";
  const loadAuditDetails = activeSection === "audits";
  const loadPublicationDetails = activeSection === "publications";
  const loadInternalOperations =
    activeSection === "hrCfo" ||
    activeSection === "sco" ||
    activeSection === "coo" ||
    activeSection === "ceo" ||
    activeSection === "mpo" ||
    activeSection === "cto" ||
    activeSection === "la";

  const usersDataset = await getConsoleUsersDataset({ loadUserDetails, roleFilter });
  const totalTokens = usersDataset.usageLogs.reduce((sum, log) => sum + log.totalTokens, 0);
  const [
    overviewDataset,
    organizationsDataset,
    supportDataset,
    billingDataset,
    auditDataset,
    publicationsDataset,
    internalModulesDataset,
  ] = await Promise.all([
    getConsoleOverviewMetrics({
      activeUserCount: usersDataset.activeUserCount,
      conversationCount: usersDataset.conversationCount,
      messageCount: usersDataset.messageCount,
      selectedDate,
      selectedPeriod,
      totalTokens,
      userCount: usersDataset.userCount,
      visitEnd,
      visitStart,
    }),
    getConsoleClientOrganizationsDataset({ loadClientOrganizationDetails }),
    getConsoleSupportDataset({ loadActivityDetails }),
    getConsoleBillingDataset({ loadBillingDetails }),
    getConsoleAuditDataset({ loadAuditDetails }),
    getConsolePublicationsDataset({ loadPublicationDetails }),
    getConsoleInternalModulesDataset({ ceoEndDate, ceoStartDate, loadInternalOperations, selectedCeoEnd, selectedCeoStart }),
  ]);

  return (
    <AppShell user={user}>
      <div className="min-w-0 space-y-6">
        <section className="dtsc-panel min-w-0 overflow-hidden p-4 sm:p-6">
          <p className="text-sm font-bold text-cyan-600">Console DTSC SaaS</p>
          <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-dtsc-ink sm:text-4xl">Centre de pilotage DTSC Platform</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Pilotez les entreprises clientes, les abonnements, le support, les accès, la sécurité, les contenus publics et les modules internes DTSC depuis une console unique.
          </p>
        </section>

        <AdminFloatingNav
          activeSection={activeSection}
          sections={visibleSections.map((item) => ({
            id: item.id,
            label: item.label,
            description: item.description,
            href: sectionHref(item.id),
          }))}
        />

        <nav className="hidden min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4 lg:grid" aria-label="Sous-modules Administration">
          {visibleSections.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <Link
                key={item.id}
                href={sectionHref(item.id)}
                className={`min-w-0 overflow-hidden rounded-2xl border p-4 shadow-[0_12px_34px_rgba(0,43,91,0.07)] transition ${
                  active
                    ? "border-cyan-300 bg-[#002b5b] text-white"
                    : "border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:border-cyan-300 hover:bg-dtsc-soft"
                }`}
              >
                <span className="flex min-w-0 items-start gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-white/10 text-cyan-200" : "bg-dtsc-soft text-dtsc-blue"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words font-black">{item.label}</span>
                    <span className={`mt-1 block break-words text-xs leading-5 ${active ? "text-slate-200" : "text-dtsc-muted"}`}>{item.description}</span>
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        {activeSection === "overview" && canView("overview") && (
          <div className="space-y-5">
            <ConsoleSaasOverview
              metrics={overviewDataset.consoleSaasOverview.metrics}
              incidents={overviewDataset.consoleSaasOverview.incidents}
              sensitiveAudits={overviewDataset.consoleSaasOverview.sensitiveAudits}
              securityEvents={overviewDataset.consoleSaasOverview.securityEvents}
            />
            <Accordion>
              <AccordionItem title="Indicateurs détaillés plateforme" defaultOpen>
                <AdminOverviewMetrics
                  selectedPeriod={selectedPeriod}
                  selectedDate={selectedDate}
                  totals={overviewDataset.overviewMetrics.totals}
                  period={overviewDataset.overviewMetrics.period}
                  series={overviewDataset.overviewMetrics.series}
                  breakdowns={overviewDataset.overviewMetrics.breakdowns}
                  topModels={overviewDataset.overviewMetrics.topModels}
                />
              </AccordionItem>
            </Accordion>
          </div>
        )}

        {activeSection === "access" && user.role === UserRole.ADMIN && (
          <Accordion>
            <AccordionItem title="Accès RBAC" defaultOpen>
              <AdminAccessPanel access={adminRoleAccess} />
            </AccordionItem>
          </Accordion>
        )}

        {activeSection === "settings" && canView("settings") && (
          <Accordion>
            <AccordionItem title="Paramètres globaux" defaultOpen>
              <AdminSettingsPanel
                canEdit={user.role === UserRole.ADMIN}
                settings={{
                  defaultDailyMessageLimit: settings.defaultDailyMessageLimit,
                  defaultDailyTokenLimit: settings.defaultDailyTokenLimit,
                  chatbotEnabled: settings.chatbotEnabled,
                  publicAgentEnabled: settings.publicAgentEnabled,
                  allowNonClientPublicationDrafts: settings.allowNonClientPublicationDrafts,
                  maintenanceMode: settings.maintenanceMode,
                  supportAutoCloseDays: settings.supportAutoCloseDays,
                  allowClientAnnouncements: settings.allowClientAnnouncements,
                  commentEditWindowMinutes: settings.commentEditWindowMinutes,
                  notificationRetentionDays: settings.notificationRetentionDays,
                  signUpOtpEnabled: settings.signUpOtpEnabled,
                  signUpOtpExpirationMinutes: settings.signUpOtpExpirationMinutes,
                }}
              />
            </AccordionItem>
          </Accordion>
        )}

        {activeSection === "publications" && canView("publications") && (
          <Accordion>
            <AccordionItem title="Publications publiques" defaultOpen>
              <PublicPublicationsManager
                publications={toJsonSafe(publicationsDataset.publicPublications)}
                currentUserId={user.id}
                canCreateDrafts={
                  user.role === UserRole.ADMIN ||
                  (settings.allowNonClientPublicationDrafts && (user.role === UserRole.MANAGER || user.role === UserRole.SUPPORT))
                }
                canPublish={user.role === UserRole.ADMIN}
                canDelete={user.role === UserRole.ADMIN}
              />
            </AccordionItem>
          </Accordion>
        )}

        {activeSection === "users" && canView("users") && (
          <Accordion>
            <AccordionItem title="Créer un compte utilisateur">
              <section className="rounded-2xl border border-dtsc-border bg-[color-mix(in_srgb,var(--dtsc-surface)_72%,transparent)] p-4 backdrop-blur-xl sm:p-5">
                <p className="mb-5 text-sm text-dtsc-muted">L&apos;admin peut créer un compte avec n&apos;importe quel rôle et définir les limites journalières.</p>
                {user.role === UserRole.ADMIN ? <CreateUserForm /> : <p className="text-sm text-dtsc-muted">Bloc visible en lecture, modification réservée au rôle ADMIN.</p>}
              </section>
            </AccordionItem>
            <AccordionItem title="Newsletter et prospects">
              <NewsletterSubscribersManager canManage={user.role === UserRole.ADMIN} />
            </AccordionItem>
          </Accordion>
        )}

        {activeSection === "clientOrganizations" && canView("clientOrganizations") && (
          <Accordion>
            <AccordionItem title="Entreprises clientes" defaultOpen>
              <ClientOrganizationsPanel
                organizations={toJsonSafe(organizationsDataset.clientOrganizations)}
                users={usersDataset.users.map((item) => ({ id: item.id, name: item.name, email: item.email, role: item.role }))}
                plans={organizationsDataset.billingPlans}
                sectors={organizationsDataset.businessSectors}
              />
            </AccordionItem>
          </Accordion>
        )}

        {activeSection === "billing" && canView("billing") && (
          <Accordion>
            <AccordionItem title="Abonnements & facturation" defaultOpen>
              <AdminAuditTables payments={billingDataset.paymentAuditItems} logs={[]} />
            </AccordionItem>
          </Accordion>
        )}

        {activeSection === "hrCfo" && canView("hrCfo") && (
          <OperationsAdminPanel
            eyebrow="Gestion interne"
            title="Opérations HR & CFO"
            description="Centralisez les dossiers RH, budgets, dépenses, factures, alertes et contrôles internes de DTSC. Cette section suit les principes de reporting capital humain, contrôle interne, séparation des validations et pilotage financier utile aux décisions."
            playbook={["Dossier RH complet", "Budget cadré", "Dépense soumise", "Validation financière", "Paiement ou clôture", "Audit"]}
            datasets={internalModulesDataset.hrcfoDatasets}
            canEdit={canView("hrCfo")}
          />
        )}

        {activeSection === "sco" && canView("sco") && (
          <OperationsAdminPanel
            eyebrow="Supply Chain Operations"
            title="Opérations SCO"
            description="Pilotez les fournisseurs, demandes d'achat, stocks, actifs et missions logistiques nécessaires aux formations, projets clients, événements, supports imprimés et opérations DTSC."
            playbook={["Besoin exprimé", "Budget vérifié", "Fournisseur comparé", "Commande", "Réception", "Stock ou actif", "Facture CFO"]}
            datasets={internalModulesDataset.scoDatasets}
            canEdit={canView("sco")}
          />
        )}

        {activeSection === "coo" && canView("coo") && (
          <OperationsAdminPanel
            eyebrow="Chief Operating Officer"
            title="Pilotage COO"
            description="Organisez les opérations internes, distribuez les tâches, suivez les blocages, structurez les réunions et consolidez les rapports opérationnels DTSC."
            playbook={["Opération cadrée", "Tâches assignées", "Coordination", "Blocages traités", "Validation", "Rapport opérationnel"]}
            datasets={internalModulesDataset.cooDatasets}
            canEdit={canView("coo")}
          />
        )}

        {activeSection === "ceo" && canView("ceo") && (
          <div className="space-y-5">
            <CeoExecutiveSummary groups={internalModulesDataset.ceoExecutiveGroups} dateStart={selectedCeoStart} dateEnd={selectedCeoEnd} />
            <OperationsAdminPanel
              eyebrow="Chief Executive Officer"
              title="Supervision CEO"
              description="Consolidez la lecture stratégique de DTSC: finance, RH, opérations COO, performance SCO, alertes critiques, objectifs exécutifs et journal de supervision."
              playbook={["Synthèse exécutive", "Alertes critiques", "Objectifs", "Décisions", "Suivi responsable", "Rapport consolidé"]}
              datasets={internalModulesDataset.ceoDatasets}
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
            datasets={internalModulesDataset.mpoDatasets}
            canEdit={canView("mpo")}
          />
        )}

        {activeSection === "cto" && canView("cto") && (
          <OperationsAdminPanel
            eyebrow="Chief Technical Officer"
            title="CTO — Technologie & Développement"
            description="Pilotez l'architecture, le développement, les APIs, bases de données, déploiements, sécurité, incidents, documentation technique, qualité, tests et collaboration avec MPO, COO, SCO, HR & CFO et CEO."
            playbook={["Analyse technique", "Architecture", "Tâches dev", "Tests et revue", "Déploiement", "Documentation", "Retour MPO"]}
            datasets={internalModulesDataset.ctoDatasets}
            canEdit={canView("cto")}
          />
        )}

        {activeSection === "la" && canView("la") && (
          <div className="space-y-5">
            <LegalDashboardSummary metrics={internalModulesDataset.legalMetrics} charts={internalModulesDataset.legalCharts} />
            <OperationsAdminPanel
              eyebrow="Legal Advisor"
              title="LA — Legal Advisor"
              description="Pilotez les dossiers juridiques, contrats, conventions, modèles, risques de conformité, documents officiels, litiges, demandes internes et rapports juridiques DTSC avec confidentialité et traçabilité."
              playbook={["Demande juridique", "Analyse LA", "Contrat ou avis", "Validation LA", "Arbitrage CEO si requis", "Archivage confidentiel"]}
              datasets={internalModulesDataset.laDatasets}
              canEdit={canView("la")}
            />
          </div>
        )}

        {activeSection === "visits" && canView("visits") && (
          <Accordion>
            <AccordionItem title="Visites du site public" defaultOpen>
              <SiteVisitsChart points={overviewDataset.visitPoints} selectedPeriod={selectedPeriod} selectedDate={selectedDate} totalVisits={overviewDataset.visitTotal} />
            </AccordionItem>
          </Accordion>
        )}

        {activeSection === "users" && canView("users") && (
          <Accordion>
            <AccordionItem title="Utilisateurs, conversations et tickets" defaultOpen>
              <AdminDataTables
                users={toJsonSafe(usersDataset.users)}
                conversations={toJsonSafe(supportDataset.conversations)}
                tickets={toJsonSafe(supportDataset.tickets)}
                showUsers={true}
                showActivity={false}
                canManageUsers={user.role === UserRole.ADMIN}
              />
            </AccordionItem>
          </Accordion>
        )}

        {activeSection === "activity" && canView("activity") && (
          <Accordion>
            <AccordionItem title="Activité plateforme" defaultOpen>
              <AdminDataTables
                users={toJsonSafe(usersDataset.users)}
                conversations={toJsonSafe(supportDataset.conversations)}
                tickets={toJsonSafe(supportDataset.tickets)}
                showUsers={false}
                showActivity={true}
                canManageUsers={false}
              />
            </AccordionItem>
          </Accordion>
        )}

        {activeSection === "audits" && canView("audits") && (
          <Accordion>
            <AccordionItem title="Journaux d'audit" defaultOpen>
              <AdminAuditTables payments={billingDataset.paymentAuditItems} logs={auditDataset.logAuditItems} />
            </AccordionItem>
          </Accordion>
        )}

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
