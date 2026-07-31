"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { EnterpriseAdminSectionActivator } from "@/components/enterprise/enterprise-admin-section-activator";
import { EnterpriseAdministrationSummary } from "@/components/enterprise/enterprise-administration-summary";
import { HealthcareAdminWorkspace } from "@/components/enterprise/healthcare-admin-workspace";
import { PharmacyAdminWorkspace } from "@/components/enterprise/pharmacy-admin-workspace";
import {
  EnterpriseBrandingSettingsPanel,
  EnterpriseCalendarPanel,
  EnterpriseDepartmentsPanel,
  EnterpriseMembersPanel,
  EnterpriseModulesPanel,
  EnterprisePositionsPanel,
  EnterpriseRecentRequestsPanel,
  EnterpriseWorkflowsPanel,
} from "@/components/enterprise/enterprise-admin-panels";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleContent, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { SectorWorkspaceFrame } from "@/components/workspace/sector-workspace-frame";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseAdminDataset, EnterpriseModuleItem } from "@/lib/enterprise/enterprise-admin-types";
import { normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";

const ADMIN_SECTIONS = [
  ["overview", "Vue d’ensemble"],
  ["members", "Collaborateurs"],
  ["positions", "Postes"],
  ["departments", "Départements"],
  ["permissions", "Rôles & permissions"],
  ["modules", "Modules"],
  ["subscription", "Abonnement & limites"],
  ["settings", "Paramètres entreprise"],
  ["audit", "Audit & historique"],
  ["templates", "Templates sectoriels"],
] as const;

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
    workflows,
    recentRequests,
    calendarEvents,
    sectorRecords,
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
  const memberNameById = useMemo(() => new Map(activeMembers.map((member) => [member.user.id, member.user.name])), [activeMembers]);
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
  const activeModuleCodes = useMemo(
    () => new Set(
      visibleModules
        .filter((enterpriseModule) => enterpriseModule.isEnabled && enterpriseModule.accessAllowed !== false)
        .map((enterpriseModule) => normalizeEnterpriseModuleCode(enterpriseModule.moduleCode)),
    ),
    [visibleModules],
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
    payload.enhancedMedicalPrivacy = formData.getAll("enhancedMedicalPrivacy").includes("on") || !formData.has("enhancedMedicalPrivacy");
    payload.pharmacyFefoEnabled = formData.getAll("pharmacyFefoEnabled").includes("on") || !formData.has("pharmacyFefoEnabled");
    payload.pharmacyNegativeStockBlocked = formData.getAll("pharmacyNegativeStockBlocked").includes("on") || !formData.has("pharmacyNegativeStockBlocked");
    const response = await fetch(`/api/enterprise/${organization.id}/administration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? successMessage : body?.message || "Enregistrement impossible.");
    if (response.ok) {
      formElement.reset();
      router.refresh();
    }
  }

  async function toggleModule(enterpriseModule: EnterpriseModuleItem) {
    setMessage("");
    if (!enterpriseModule.registryKnown || !["ACTIVE", "BETA"].includes(enterpriseModule.implementationStatus || "")) {
      setMessage("Ce code ne peut pas être activé car il n’est pas implémenté dans le registre canonique.");
      return;
    }
    if (!enterpriseModule.accessAllowed && !enterpriseModule.isEnabled) {
      setMessage(enterpriseModule.accessMessage || "Ce module n'est pas inclus dans le plan actif.");
      return;
    }
    const response = await fetch(`/api/enterprise/${organization.id}/modules/${enterpriseModule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !enterpriseModule.isEnabled }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Module mis à jour." : body?.message || "Mise à jour impossible.");
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
    setMessage(response.ok ? "Invitation envoyée. Le collaborateur devra l'accepter avant intégration." : body?.message || "Invitation impossible.");
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
    setMessage(response.ok ? successMessage : body?.message || "Mise à jour du collaborateur impossible.");
    if (response.ok) router.refresh();
  }

  async function removeMember(memberId: string) {
    await updateMember(memberId, { action: "remove" }, "Collaborateur retiré de l'entreprise.");
  }

  return (
    <ModuleWorkspace>
      <EnterpriseAdminSectionActivator section={initialSection} />

      <nav aria-label="Sections administration entreprise" className="flex snap-x gap-2 overflow-x-auto pb-2">
        {ADMIN_SECTIONS.map(([code, label]) => (
          <Link
            key={code}
            href={`/enterprise-admin?section=${code}`}
            className="min-h-11 shrink-0 snap-start rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2.5 text-xs font-black text-dtsc-muted hover:border-cyan-400/40 hover:text-dtsc-blue"
          >
            {label}
          </Link>
        ))}
      </nav>

      <div id="enterprise-admin-overview" className="scroll-mt-24 outline-none">
        <EnterpriseAdministrationSummary
          organization={organization}
          dashboard={dashboard}
          entitlements={entitlements}
          activeMembers={activeMembers}
          pendingMembers={pendingMembers}
          visibleModules={visibleModules}
        />
      </div>

      <ModuleContent>
        <div id="enterprise-admin-subscription" className="scroll-mt-24 outline-none">
          <ModuleSection
            title="Abonnement & limites"
            description="Limites réellement résolues depuis le plan et l’abonnement actifs. Aucun module ne peut se débloquer depuis le frontend."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AdminMetric label="Plan" value={entitlements.planLabel} />
              <AdminMetric label="Statut" value={entitlements.subscriptionStatus} />
              <AdminMetric label="Utilisateurs" value={`${activeMembers.length}/${entitlements.limits.maxUsers}`} />
              <AdminMetric label="Modules actifs" value={`${dashboard.activeModulesCount}/${entitlements.limits.maxActiveModules}`} />
            </div>
          </ModuleSection>
        </div>

        <div id="enterprise-admin-modules" className="scroll-mt-24 outline-none">
          <ModuleSection title="Modules" description="Modules Core et sectoriels connus du registre, compatibles avec le secteur et réellement implémentés.">
            <Accordion>
              <EnterpriseModulesPanel organization={organization} visibleModules={visibleModules} toggleModule={toggleModule} />
              <EnterpriseWorkflowsPanel sectorCode={organization.sectorCode} workflows={workflows} departments={departments} activeMembers={activeMembers} submitAdminMutation={submitAdminMutation} />
            </Accordion>
          </ModuleSection>
        </div>

        <div id="enterprise-admin-members" className="scroll-mt-24 outline-none">
          <ModuleSection title="Collaborateurs" description="Invitations, memberships actifs et retraits non destructifs.">
            <Accordion>
              <AccordionItem title="Collaborateurs" defaultOpen>
                <EnterpriseMembersPanel
                  members={members}
                  pendingMembers={pendingMembers}
                  activeMembers={activeMembers}
                  positions={positions}
                  inviteMember={inviteMember}
                  updateMember={updateMember}
                  removeMember={removeMember}
                />
              </AccordionItem>
            </Accordion>
          </ModuleSection>
        </div>

        <div id="enterprise-admin-positions" className="scroll-mt-24 outline-none">
          <span id="enterprise-admin-permissions" className="scroll-mt-24" />
          <ModuleSection title="Postes, rôles & permissions" description="Les permissions de poste restent l’autorité métier sans élargissement automatique du rôle Manager.">
            <Accordion>
              <AccordionItem title="Postes et permissions" defaultOpen>
                <EnterprisePositionsPanel
                  sectorCode={organization.sectorCode}
                  departments={departments}
                  positions={positions}
                  submitAdminMutation={submitAdminMutation}
                />
              </AccordionItem>
            </Accordion>
          </ModuleSection>
        </div>

        <div id="enterprise-admin-departments" className="scroll-mt-24 outline-none">
          <ModuleSection title="Départements" description="Structure organisationnelle isolée dans le tenant actif.">
            <Accordion>
              <EnterpriseDepartmentsPanel departments={departments} activeMembers={activeMembers} memberNameById={memberNameById} submitAdminMutation={submitAdminMutation} />
            </Accordion>
          </ModuleSection>
        </div>

        <div id="enterprise-admin-settings" className="scroll-mt-24 outline-none">
          <ModuleSection title="Paramètres entreprise" description="Branding, paramètres généraux et options sectorielles persistées.">
            <Accordion>
              <EnterpriseBrandingSettingsPanel sectorCode={organization.sectorCode} organization={organization} submitAdminMutation={submitAdminMutation} />
              <EnterpriseCalendarPanel organizationName={organization.name} calendarEvents={calendarEvents} locale={locale} />
            </Accordion>
          </ModuleSection>
        </div>

        <div id="enterprise-admin-audit" className="scroll-mt-24 outline-none">
          <ModuleSection
            title="Audit & cohérence des modules"
            count={`${configurationIssues.length}`}
            description="Incohérences compréhensibles pour les responsables autorisés, sans bruit de log sur les rendus normaux."
          >
            {configurationIssues.length ? (
              <BusinessList ariaLabel="Incohérences des modules">
                {configurationIssues.map((issue, index) => (
                  <BusinessListItem
                    key={`${issue.code}-${issue.moduleCode || "global"}-${index}`}
                    title={issue.moduleCode || issue.code}
                    description={issue.message}
                    status={<StatusBadge tone={issue.severity === "ERROR" ? "danger" : "warning"}>{issue.severity}</StatusBadge>}
                  />
                ))}
              </BusinessList>
            ) : (
              <EmptyState compact title="Configuration cohérente" description="Aucune incohérence de registre, secteur ou dépendance n’a été détectée pour cette organisation." />
            )}
          </ModuleSection>
        </div>

        <div id="enterprise-admin-templates" className="scroll-mt-24 outline-none">
          {organization.sectorCode === "HEALTH_CARE" ? (
            <ModuleSection title="Templates sectoriels Health" description="Workspace Health existant conservé, avec données et permissions inchangées.">
              <SectorWorkspaceFrame variant="health">
                <HealthcareAdminWorkspace
                  organizationId={organization.id}
                  records={sectorRecords}
                  members={activeMembers}
                  departments={departments}
                  positions={positions}
                  activeModuleCodes={activeModuleCodes}
                  locale={locale}
                />
              </SectorWorkspaceFrame>
            </ModuleSection>
          ) : null}

          {organization.sectorCode === "PHARMACY" ? (
            <ModuleSection title="Templates sectoriels Pharmacy" description="Workspace Pharmacy existant conservé, sans migration de ses sources métier.">
              <PharmacyAdminWorkspace
                organizationId={organization.id}
                records={sectorRecords}
                members={activeMembers}
                departments={departments}
                activeModuleCodes={activeModuleCodes}
              />
            </ModuleSection>
          ) : null}

          {!['HEALTH_CARE', 'PHARMACY'].includes(organization.sectorCode || "") ? (
            <ModuleSection title="Templates sectoriels" description="Les secteurs futurs restent planifiés et ne sont pas provisionnés comme modules disponibles.">
              <EmptyState compact title="Aucun template fonctionnel actif" description="Le socle commun reste disponible. Les modules sectoriels futurs seront livrés dans des itérations dédiées." />
            </ModuleSection>
          ) : null}
        </div>

        <ModuleSection title="Demandes récentes" description="Suivi des demandes administratives visibles dans l’organisation active.">
          <EnterpriseRecentRequestsPanel recentRequests={recentRequests} />
        </ModuleSection>
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
