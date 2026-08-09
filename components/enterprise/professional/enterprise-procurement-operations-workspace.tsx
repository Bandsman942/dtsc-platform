"use client";

import { useEffect, useState } from "react";
import { EnterprisePurchasesWorkspace } from "@/components/enterprise/core-v2/enterprise-purchases-workspace";
import { EnterpriseSuppliersWorkspace } from "@/components/enterprise/core-v2/enterprise-suppliers-workspace";
import { ProfessionalError, ProfessionalHelp } from "@/components/enterprise/professional/professional-erp-ui";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Choice = { id: string; label: string };
type Lookups = {
  members?: Array<{ id: string; membershipId: string; label: string; role: string; positionTitle: string | null }>;
  departments?: Array<{ id: string; labelFr?: string; name?: string; departmentCode?: string }>;
};
type Capabilities = { canRead: boolean; canSubmit: boolean; canWrite: boolean; canManage: boolean };

export function EnterpriseProcurementOperationsWorkspace({ organizationId, organizationName, definition, canManage: serverAdminFallback, locale }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition; canManage: boolean; locale?: string | null }) {
  const [members, setMembers] = useState<Choice[]>([]);
  const [departments, setDepartments] = useState<Choice[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities>({ canRead: true, canSubmit: false, canWrite: false, canManage: serverAdminFallback });
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch(`/api/enterprise/${organizationId}/professional-lookups?module=SUPPLIERS_PURCHASES`, { cache: "no-store" }),
      fetch(`/api/enterprise/${organizationId}/module-capabilities?module=SUPPLIERS_PURCHASES`, { cache: "no-store" }),
    ]).then(async ([lookupsResponse, capabilityResponse]) => {
      const body = await lookupsResponse.json().catch(() => null) as Lookups & { message?: string } | null;
      const capabilityBody = await capabilityResponse.json().catch(() => null) as { capabilities?: Capabilities; message?: string } | null;
      if (!lookupsResponse.ok || !body) throw new Error(body?.message || "Les sélecteurs achats sont indisponibles.");
      if (!capabilityResponse.ok || !capabilityBody?.capabilities) throw new Error(capabilityBody?.message || "Les autorisations achats sont indisponibles.");
      if (!active) return;
      setMembers((body.members || []).map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` })));
      setDepartments((body.departments || []).map((department) => ({ id: department.id, label: department.labelFr || department.name || department.departmentCode || "Département" })));
      setCapabilities(capabilityBody.capabilities);
    }).catch((requestError) => {
      if (active) setError(requestError instanceof Error ? requestError.message : "Les sélecteurs achats sont indisponibles.");
    });
    return () => { active = false; };
  }, [organizationId]);

  const canOperate = capabilities.canWrite || capabilities.canManage;

  return (
    <ModuleWorkspace>
      <ModuleHeader eyebrow={`Chaîne achats · ${organizationName}`} title="Fournisseurs, commandes et réceptions" description={`${definition.descriptionFr} La réception reste rattachée à la commande et prépare le rapprochement commande-réception-facture.`} count="Processus contrôlé" />
      <ModuleContent>
        {error ? <ProfessionalError message={error} /> : null}
        <ModuleSection title="Référentiel fournisseurs" description="Les organisations fournisseurs restent distinctes des comptes personnels de leurs représentants.">
          <EnterpriseSuppliersWorkspace organizationId={organizationId} canManage={canOperate} locale={locale} />
        </ModuleSection>
        <ModuleSection title="Demandes, commandes et réceptions" description="Soumettre, approuver, commander et réceptionner partiellement ou complètement sans double comptabilisation.">
          <EnterprisePurchasesWorkspace organizationId={organizationId} members={members} departments={departments} canManage={canOperate} locale={locale} />
        </ModuleSection>
        <ProfessionalHelp moduleCode="SUPPLIERS_PURCHASES" />
      </ModuleContent>
    </ModuleWorkspace>
  );
}
