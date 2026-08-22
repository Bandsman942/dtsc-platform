"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { EnterpriseAdminSectionActivator } from "@/components/enterprise/enterprise-admin-section-activator";
import { EnterpriseRolesPermissionsPanel } from "@/components/enterprise/enterprise-governance-panels";
import { EnterpriseAdministrationSummary } from "@/components/enterprise/enterprise-administration-summary";
import {
  EnterpriseAdministrationAuditPanel,
  EnterpriseAdministrationBrandingPanel,
  EnterpriseAdministrationDepartmentsPanel,
  EnterpriseAdministrationModulesPanel,
  EnterpriseAdministrationSecurityPanel,
  EnterpriseConfigurationChecklistPanel,
  EnterprisePendingActionsPanel,
} from "@/components/enterprise/enterprise-admin-hotfix-panels";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import {
  EnterpriseCalendarPanel,
  EnterpriseMembersPanel,
  EnterprisePositionsPanel,
} from "@/components/enterprise/enterprise-admin-panels";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleContent, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import type { EnterpriseAdminDataset, EnterpriseModuleItem } from "@/lib/enterprise/enterprise-admin-types";
import { getIteration06UserGuide } from "@/lib/user-guides/iteration06-guides";

const ADMIN_SECTIONS = [
  { code: "overview", fr: "Vue d’ensemble", en: "Overview" },
  { code: "members", fr: "Collaborateurs", en: "Collaborators" },
  { code: "positions", fr: "Postes", en: "Positions" },
  { code: "departments", fr: "Départements", en: "Departments" },
  { code: "permissions", fr: "Rôles & permissions", en: "Roles & permissions" },
  { code: "modules", fr: "Modules", en: "Modules" },
  { code: "subscription", fr: "Abonnement & limites", en: "Subscription & limits" },
  { code: "settings", fr: "Paramètres entreprise", en: "Company settings" },
  { code: "security", fr: "Sécurité", en: "Security" },
  { code: "audit", fr: "Audit & historique", en: "Audit & history" },
  { code: "pending", fr: "Actions en cours", en: "Pending actions" },
] as const;

function tx(locale: string | null | undefined, fr: string, en: string) {
  return locale === "en" ? en : fr;
}

export function EnterpriseAdministrationModule(
  props: EnterpriseAdminDataset & { locale?: string | null; initialSection?: string | null },
) {
  const {
    organization,
    dashboard,
    modules,
    members,
    departments,
    positions,
    roles,
    securityPolicy,
    auditItems,
    configurationChecklist,
    pendingActions,
    calendarEvents,
    entitlements,
    configurationIssues,
    locale,
    initialSection,
  } = props;
  const router = useRouter();
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const activeMembers = useMemo(() => members.filter((member) => member.status === "ACTIVE"), [members]);
  const pendingMembers = useMemo(() => members.filter((member) => member.status === "INVITED"), [members]);
  const visibleModules = useMemo(
    () => modules.filter((enterpriseModule) =>
      enterpriseModule.registryKnown &&
      ["ACTIVE", "BETA"].includes(enterpriseModule.implementationStatus || "") &&
      enterpriseModule.routeKind !== "ADMIN_SECTION" &&
      enterpriseModule.routeKind !== "HIDDEN" &&
      enterpriseModule.sectorCompatible !== false,
    ),
    [modules],
  );

  async function submitAdminMutation(event: FormEvent<HTMLFormElement>, successMessage: string) {
    event.preventDefault();
    setMessage("");
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const payload: Record<string, unknown> = Object.fromEntries(formData.entries());
    payload.permissions = formData.getAll("permissions").map(String);
    payload.responsibleUserIds = formData.getAll("responsibleUserIds").map(String).filter(Boolean);
    payload.recipientUserIds = formData.getAll("recipientUserIds").map(String).filter(Boolean);
    payload.isActive = formData.getAll("isActive").includes("on");
    payload.isEnabled = formData.getAll("isEnabled").includes("on") || !formData.has("isEnabled");
    payload.isKeyPosition = formData.getAll("isKeyPosition").includes("on");
    const response = await fetch(`/api/enterprise/${organization.id}/administration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? successMessage : body?.message || tx(locale, "Enregistrement impossible. Corrigez les informations et réessayez.", "Unable to save. Correct the information and try again."));
    if (response.ok) {
      formElement.reset();
      router.refresh();
    }
  }

  async function toggleModule(enterpriseModule: EnterpriseModuleItem) {
    setMessage("");
    if (!enterpriseModule.registryKnown || !["ACTIVE", "BETA"].includes(enterpriseModule.implementationStatus || "")) {
      setMessage(tx(locale, "Ce module n’est pas disponible pour activation.", "This module is not available for activation."));
      return;
    }
    if (!enterpriseModule.accessAllowed && !enterpriseModule.isEnabled) {
      setMessage(enterpriseModule.accessMessage || tx(locale, "Ce module n’est pas inclus dans le plan actif.", "This module is not included in the active plan."));
      return;
    }
    const response = await fetch(`/api/enterprise/${organization.id}/modules/${enterpriseModule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !enterpriseModule.isEnabled }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok
      ? (enterpriseModule.isEnabled ? tx(locale, "Module désactivé. Les données restent conservées.", "Module disabled. Data remains preserved.") : tx(locale, "Module activé pour l’entreprise.", "Module enabled for the company."))
      : body?.message || tx(locale, "Mise à jour du module impossible.", "Unable to update the module."));
    if (response.ok) router.refresh();
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const formElement = event.currentTarget;
    const payload = Object.fromEntries(new FormData(formElement).entries());
    const response = await fetch(`/api/enterprise/${organization.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? tx(locale, "Invitation envoyée. Le collaborateur devra l’accepter avant intégration.", "Invitation sent. The collaborator must accept it before joining.") : body?.message || tx(locale, "Invitation impossible.", "Unable to send invitation."));
    if (response.ok) {
      formElement.reset();
      router.refresh();
    }
  }

  async function updateMember(memberId: string, payload: Record<string, unknown>, successMessage: string) {
    setMessage("");
    const response = await fetch(`/api/enterprise/${organization.id}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? successMessage : body?.message || tx(locale, "Mise à jour du collaborateur impossible.", "Unable to update collaborator."));
    if (response.ok) router.refresh();
  }

  async function removeMember(memberId: string) {
    await updateMember(memberId, { action: "remove" }, tx(locale, "Collaborateur retiré de l’entreprise.", "Collaborator removed from company."));
  }

  return (
    <ModuleWorkspace>
      <EnterpriseAdminSectionActivator section={initialSection} />
      <div className="flex justify-end"><ContextualUserGuide guide={getIteration06UserGuide("ENTERPRISE_ADMINISTRATION", locale)} compact /></div>
      <nav aria-label={tx(locale, "Sections administration entreprise", "Company administration sections")} className="flex snap-x gap-2 overflow-x-auto pb-2">
        {ADMIN_SECTIONS.map((item) => (
          <Link key={item.code} href={`/enterprise-admin?section=${item.code}`} className="min-h-11 shrink-0 snap-start rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2.5 text-xs font-black text-dtsc-muted hover:border-[var(--dtsc-product-accent)] hover:text-dtsc-ink">
            {locale === "en" ? item.en : item.fr}
          </Link>
        ))}
      </nav>

      <div id="enterprise-admin-overview" className="scroll-mt-24 outline-none">
        <EnterpriseAdministrationSummary organization={organization} dashboard={dashboard} entitlements={entitlements} activeMembers={activeMembers} pendingMembers={pendingMembers} visibleModules={visibleModules} />
      </div>
      <EnterpriseConfigurationChecklistPanel items={configurationChecklist} locale={locale} />

      <ModuleContent>
        <div id="enterprise-admin-subscription" className="scroll-mt-24 outline-none">
          <ModuleSection title={tx(locale, "Abonnement & limites", "Subscription & limits")} description={tx(locale, "Limites réellement résolues depuis le plan et l’abonnement actifs. Aucun module ne peut se débloquer depuis le frontend.", "Limits are resolved from the active plan and subscription. No module can be unlocked from the frontend.")}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AdminMetric label={tx(locale, "Plan", "Plan")} value={entitlements.planLabel} />
              <AdminMetric label={tx(locale, "Statut", "Status")} value={entitlements.subscriptionStatus} />
              <AdminMetric label={tx(locale, "Utilisateurs", "Users")} value={`${activeMembers.length}/${entitlements.limits.maxUsers}`} />
              <AdminMetric label={tx(locale, "Modules actifs", "Active modules")} value={`${dashboard.activeModulesCount}/${entitlements.limits.maxActiveModules}`} />
            </div>
          </ModuleSection>
        </div>

        <div id="enterprise-admin-modules" className="scroll-mt-24 outline-none">
          <ModuleSection title={tx(locale, "Modules", "Modules")} description={tx(locale, "Ouvrez un module, consultez ses utilisateurs et actions autorisées, gérez une restriction temporaire ou consultez ses informations générales.", "Open a module, review users and allowed actions, manage a temporary restriction, or view general module information.")}>
            <EnterpriseAdministrationModulesPanel organizationId={organization.id} modules={visibleModules} toggleModule={toggleModule} locale={locale} />
            <div className="mt-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
              <p className="font-black text-dtsc-ink">Workflow Engine v2</p>
              <p className="mt-1 text-sm text-dtsc-muted">{tx(locale, "La création et l’exécution des workflows se font dans le moteur versionné. Les anciennes définitions restent archivées en lecture seule.", "Workflow creation and execution use the versioned engine. Legacy definitions remain archived as read-only.")}</p>
              <Link href="/enterprise-modules/WORKFLOWS" className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-dtsc-border px-3 text-sm font-black text-dtsc-ink">{tx(locale, "Ouvrir les workflows", "Open workflows")}</Link>
            </div>
          </ModuleSection>
        </div>

        <div id="enterprise-admin-members" className="scroll-mt-24 outline-none">
          <ModuleSection title={tx(locale, "Collaborateurs", "Collaborators")} description={tx(locale, "Invitations, membres actifs et retraits non destructifs.", "Invitations, active members and non-destructive removals.")}>
            <Accordion>
              <AccordionItem title={tx(locale, "Collaborateurs", "Collaborators")} defaultOpen>
                <EnterpriseMembersPanel members={members} pendingMembers={pendingMembers} activeMembers={activeMembers} positions={positions} inviteMember={inviteMember} updateMember={updateMember} removeMember={removeMember} />
              </AccordionItem>
            </Accordion>
          </ModuleSection>
        </div>

        <div id="enterprise-admin-positions" className="scroll-mt-24 outline-none">
          <ModuleSection title={tx(locale, "Postes", "Positions")} description={tx(locale, "Les postes structurent les responsabilités et fournissent des permissions héritées explicables.", "Positions structure responsibilities and provide explainable inherited permissions.")}>
            <Accordion><AccordionItem title={tx(locale, "Postes et permissions héritées", "Positions and inherited permissions")} defaultOpen><EnterprisePositionsPanel sectorCode={organization.sectorCode} departments={departments} positions={positions} submitAdminMutation={submitAdminMutation} /></AccordionItem></Accordion>
          </ModuleSection>
        </div>

        <div id="enterprise-admin-permissions" className="scroll-mt-24 outline-none">
          <ModuleSection title={tx(locale, "Rôles & permissions", "Roles & permissions")} description={tx(locale, "Rôles personnalisés propres à l’entreprise, affectations auditées et simulation sans mutation.", "Company-scoped custom roles, audited assignments and non-mutating simulation.")}>
            <EnterpriseRolesPermissionsPanel organizationId={organization.id} roles={roles} members={members} modules={visibleModules} />
          </ModuleSection>
        </div>

        <div id="enterprise-admin-departments" className="scroll-mt-24 outline-none">
          <ModuleSection title={tx(locale, "Départements", "Departments")} description={tx(locale, "CRUD professionnel, hiérarchie, responsables et détail plein écran, toujours dans l’entreprise active.", "Professional CRUD, hierarchy, owners and full-screen details, always scoped to the active company.")}>
            <EnterpriseAdministrationDepartmentsPanel organizationId={organization.id} departments={departments} members={members} locale={locale} />
          </ModuleSection>
        </div>

        <div id="enterprise-admin-settings" className="scroll-mt-24 outline-none">
          <ModuleSection title={tx(locale, "Paramètres entreprise", "Company settings")} description={tx(locale, "Identité, logo depuis l’appareil, couleur visuelle et paramètres généraux persistés.", "Identity, device logo upload, visual color choice and persistent general settings.")}>
            <EnterpriseAdministrationBrandingPanel organization={organization} locale={locale} />
            <div className="mt-4"><Accordion><EnterpriseCalendarPanel organizationName={organization.name} calendarEvents={calendarEvents} locale={locale} /></Accordion></div>
          </ModuleSection>
        </div>

        <div id="enterprise-admin-security" className="scroll-mt-24 outline-none">
          <ModuleSection title={tx(locale, "Sécurité de l’organisation", "Organization security")} description={tx(locale, "Règles locales à l’entreprise, expliquées en langage clair et contrôlées côté serveur.", "Company-local rules explained in clear language and enforced server-side.")}>
            <EnterpriseAdministrationSecurityPanel organizationId={organization.id} policy={securityPolicy} locale={locale} />
          </ModuleSection>
        </div>

        <div id="enterprise-admin-audit" className="scroll-mt-24 outline-none">
          <ModuleSection title={tx(locale, "Audit & cohérence des modules", "Audit & module consistency")} count={`${configurationIssues.length}`} description={tx(locale, "Historique compréhensible avec noms des utilisateurs et aucune variable d’implémentation exposée.", "Understandable history with user names and no implementation variables exposed.")}>
            <EnterpriseAdministrationAuditPanel items={auditItems} members={members} issues={configurationIssues} locale={locale} />
          </ModuleSection>
        </div>

        <div id="enterprise-admin-pending" className="scroll-mt-24 outline-none">
          <ModuleSection title={tx(locale, "Centre des actions en cours", "Pending action center")} count={`${pendingActions.length}`} description={tx(locale, "Uniquement les éléments réellement ouverts, en traitement, en attente de votre action ou d’une validation, selon vos droits réels.", "Only truly open items that are in progress, waiting for your action or approval, based on your actual rights.")}>
            <EnterprisePendingActionsPanel items={pendingActions} locale={locale} />
          </ModuleSection>
        </div>
      </ModuleContent>
    </ModuleWorkspace>
  );
}

function AdminMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted">{label}</p>
      <p className="mt-2 text-xl font-black text-dtsc-ink">{value}</p>
    </div>
  );
}