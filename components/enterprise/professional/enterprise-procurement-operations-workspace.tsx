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

export function EnterpriseProcurementOperationsWorkspace({
  organizationId,
  organizationName,
  definition,
  canManage,
  locale,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  canManage: boolean;
  locale?: string | null;
}) {
  const [members, setMembers] = useState<Choice[]>([]);
  const [departments, setDepartments] = useState<Choice[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/professional-lookups?module=SUPPLIERS_PURCHASES`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Lookups & { message?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || "Les sélecteurs achats sont indisponibles.");
        if (!active) return;
        setMembers((body.members || []).map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` })));
        setDepartments((body.departments || []).map((department) => ({ id: department.id, label: department.labelFr || department.name || department.departmentCode || "Département" })));
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Les sélecteurs achats sont indisponibles.");
      });
    return () => { active = false; };
  }, [organizationId]);

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`Chaîne achats · ${organizationName}`}
        title="Fournisseurs, commandes et réceptions"
        description={`${definition.descriptionFr} La réception reste rattachée à la commande et prépare le rapprochement commande-réception-facture.`}
        count="Processus contrôlé"
      />
      <ModuleContent>
        {error ? <ProfessionalError message={error} /> : null}
        <ModuleSection title="Référentiel fournisseurs" description="Les organisations fournisseurs restent distinctes des comptes personnels de leurs représentants.">
          <EnterpriseSuppliersWorkspace organizationId={organizationId} canManage={canManage} locale={locale} />
        </ModuleSection>
        <ModuleSection title="Demandes, commandes et réceptions" description="Soumettre, approuver, commander et réceptionner partiellement ou complètement sans double comptabilisation.">
          <EnterprisePurchasesWorkspace organizationId={organizationId} members={members} departments={departments} canManage={canManage} locale={locale} />
        </ModuleSection>
        <ProfessionalHelp moduleCode="SUPPLIERS_PURCHASES" />
      </ModuleContent>
    </ModuleWorkspace>
  );
}
