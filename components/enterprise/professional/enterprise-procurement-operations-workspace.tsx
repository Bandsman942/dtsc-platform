"use client";

import { useEffect, useState } from "react";
import { EnterprisePurchasesWorkspace } from "@/components/enterprise/core-v2/enterprise-purchases-workspace";
import { EnterpriseSuppliersWorkspace } from "@/components/enterprise/core-v2/enterprise-suppliers-workspace";
import { ProfessionalError, ProfessionalHelp } from "@/components/enterprise/professional/professional-erp-ui";
import { ProfessionalTabs } from "@/components/enterprise/professional/professional-navigation";
import { ModuleContent, ModuleHeader, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Choice = { id: string; label: string };
type Lookups = {
  members?: Array<{ id: string; membershipId: string; label: string; role: string; positionTitle: string | null }>;
  departments?: Array<{ id: string; labelFr?: string; name?: string; departmentCode?: string }>;
};

export type ProcurementUiCapabilities = {
  canCreate: boolean;
  canSubmit: boolean;
  canWrite: boolean;
  canApprove: boolean;
  canManage: boolean;
};

export function EnterpriseProcurementOperationsWorkspace({
  organizationId,
  organizationName,
  definition,
  capabilities,
  locale,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  capabilities: ProcurementUiCapabilities;
  locale?: string | null;
}) {
  const [members, setMembers] = useState<Choice[]>([]);
  const [departments, setDepartments] = useState<Choice[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"PURCHASES" | "SUPPLIERS">("PURCHASES");
  const en = locale === "en";

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
    <ModuleWorkspace density="compact">
      <ModuleHeader
        eyebrow={`${en ? "Procurement chain" : "Chaîne achats"} · ${organizationName}`}
        title={en ? "Suppliers, orders and receipts" : "Fournisseurs, commandes et réceptions"}
        description={`${en ? definition.descriptionEn : definition.descriptionFr} ${en ? "Receipt remains linked to the purchase order and supports invoice matching." : "La réception reste liée à la commande et prépare le rapprochement commande-réception-facture."}`}
        count={en ? "Controlled workflow" : "Processus contrôlé"}
      />
      <ModuleToolbar controls={<ProfessionalTabs value={tab} onChange={(value) => setTab(value as "PURCHASES" | "SUPPLIERS")} label={en ? "Procurement navigation" : "Navigation des achats"}
        items={[{ id: "PURCHASES", label: en ? "Orders & receipts" : "Commandes & réceptions" }, { id: "SUPPLIERS", label: en ? "Suppliers" : "Fournisseurs" }]} />}
        summary={en ? "Canonical supplier → approved purchase → receipt → supplier invoice; no automatic payment." : "Fournisseur canonique → achat approuvé → réception → facture fournisseur ; aucun paiement automatique."} />
      <ModuleContent density="compact">
        {error ? <ProfessionalError message={error} /> : null}
        {tab === "SUPPLIERS" ? <section aria-label={en ? "Suppliers register" : "Référentiel des fournisseurs"}>
          <EnterpriseSuppliersWorkspace organizationId={organizationId} organizationName={organizationName} canManage={capabilities.canWrite} locale={locale} />
        </section> : <section aria-label={en ? "Purchases and receipts" : "Achats et réceptions"}>
          <EnterprisePurchasesWorkspace organizationId={organizationId} organizationName={organizationName} members={members} departments={departments} capabilities={capabilities} locale={locale} />
        </section>}
        <ProfessionalHelp moduleCode="SUPPLIERS_PURCHASES" />
      </ModuleContent>
    </ModuleWorkspace>
  );
}
