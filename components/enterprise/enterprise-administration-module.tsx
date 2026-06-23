"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  EnterpriseBrandingSettingsPanel,
  EnterpriseCalendarPanel,
  EnterpriseDashboardSummary,
  EnterpriseDepartmentsPanel,
  EnterpriseHealthcareSection,
  EnterprisePharmacySection,
  EnterpriseMembersPanel,
  EnterpriseModulesPanel,
  EnterprisePositionsPanel,
  EnterpriseRecentRequestsPanel,
  EnterpriseWorkflowsPanel,
} from "@/components/enterprise/enterprise-admin-panels";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import type { EnterpriseAdminDataset, EnterpriseModuleItem } from "@/lib/enterprise/enterprise-admin-types";

import { useToastMessage } from "@/components/ui/use-toast-message";
export function EnterpriseAdministrationModule(props: EnterpriseAdminDataset & { locale?: string | null }) {
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
    locale,
  } = props;
  const router = useRouter();
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const activeMembers = useMemo(() => members.filter((member) => member.status === "ACTIVE"), [members]);
  const pendingMembers = useMemo(() => members.filter((member) => member.status === "INVITED"), [members]);
  const memberNameById = useMemo(() => new Map(activeMembers.map((member) => [member.user.id, member.user.name])), [activeMembers]);
  const visibleModules = useMemo(
    () => modules.filter((enterpriseModule) => enterpriseModule.isCore),
    [modules],
  );
  const activeHealthcareModuleCodes = useMemo(() => new Set(modules.filter((enterpriseModule) => enterpriseModule.isEnabled).map((enterpriseModule) => enterpriseModule.moduleCode)), [modules]);
  const activePharmacyModuleCodes = activeHealthcareModuleCodes;

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
    if (response.ok) {
      router.refresh();
    }
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
    if (response.ok) {
      router.refresh();
    }
  }

  async function removeMember(memberId: string) {
    await updateMember(memberId, { action: "remove" }, "Collaborateur retiré de l'entreprise.");
  }

  return (
    <div className="space-y-5">
      <EnterpriseDashboardSummary
        organization={organization}
        dashboard={dashboard}
        entitlements={entitlements}
        activeMembers={activeMembers}
        pendingMembers={pendingMembers}
        visibleModules={visibleModules}
      />

      <Accordion>
        <EnterpriseHealthcareSection
          organizationId={organization.id}
          sectorCode={organization.sectorCode}
          sectorRecords={sectorRecords}
          activeMembers={activeMembers}
          departments={departments}
          positions={positions}
          activeHealthcareModuleCodes={activeHealthcareModuleCodes}
          locale={locale}
        />
        <EnterprisePharmacySection organizationId={organization.id} sectorCode={organization.sectorCode} sectorRecords={sectorRecords} activeMembers={activeMembers} departments={departments} activePharmacyModuleCodes={activePharmacyModuleCodes} />

        <EnterpriseModulesPanel organization={organization} visibleModules={visibleModules} toggleModule={toggleModule} />

        <EnterpriseCalendarPanel organizationName={organization.name} calendarEvents={calendarEvents} locale={locale} />

        <AccordionItem title="Collaborateurs, postes et permissions" defaultOpen>
          <div className="grid gap-4">
            <EnterpriseMembersPanel
              members={members}
              pendingMembers={pendingMembers}
              activeMembers={activeMembers}
              positions={positions}
              inviteMember={inviteMember}
              updateMember={updateMember}
              removeMember={removeMember}
            />
            <EnterprisePositionsPanel
              sectorCode={organization.sectorCode}
              departments={departments}
              positions={positions}
              submitAdminMutation={submitAdminMutation}
            />
          </div>
        </AccordionItem>

        <EnterpriseDepartmentsPanel
          departments={departments}
          activeMembers={activeMembers}
          memberNameById={memberNameById}
          submitAdminMutation={submitAdminMutation}
        />

        <EnterpriseWorkflowsPanel
          sectorCode={organization.sectorCode}
          workflows={workflows}
          departments={departments}
          activeMembers={activeMembers}
          submitAdminMutation={submitAdminMutation}
        />

        <EnterpriseBrandingSettingsPanel sectorCode={organization.sectorCode} organization={organization} submitAdminMutation={submitAdminMutation} />
      </Accordion>

      <EnterpriseRecentRequestsPanel recentRequests={recentRequests} />


    </div>
  );
}
