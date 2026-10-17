"use client";

import { useMemo, useState } from "react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { notifyToast } from "@/lib/client-toast";
import { ITERATION04_USER_GUIDES } from "@/lib/user-guides/iteration04-guides";
import { ModuleWorkspace, ModuleHeader, ModuleContent, ModuleSection, ModuleToolbar } from "@/components/workspace/module-workspace";
import { ModuleMetrics, ModuleMetric } from "@/components/workspace/module-metrics";
import { ProfessionalTabs } from "@/components/enterprise/professional/professional-erp-ui";
import {
  EnterpriseActivityBlocksPanel,
  EnterpriseActivityFormDialog,
  EnterpriseRequestsPanel,
  EnterpriseWorkflowsPanel,
} from "@/components/enterprise/enterprise-activities-panels";
import type { EnterpriseActivitiesDataset } from "@/lib/enterprise/enterprise-activities-types";
import { PharmacyActivitiesWorkspace } from "@/components/enterprise/pharmacy-activities-workspace";
import { HealthAppointmentsWorkspace } from "@/components/enterprise/health-appointments-workspace";
import { HealthConsultationsWorkspace } from "@/components/enterprise/health-consultations-workspace";
import { HealthMedicalRecordsWorkspace } from "@/components/enterprise/health-medical-records-workspace";
import { HealthStaffWorkspace } from "@/components/enterprise/health-staff-workspace";
import { HealthLaboratoryWorkspace } from "@/components/enterprise/health-laboratory-workspace";
import { HealthPharmacyWorkspace } from "@/components/enterprise/health-pharmacy-workspace";
import { HealthMedicalBillingWorkspace } from "@/components/enterprise/health-medical-billing-workspace";
import { HealthInsuranceWorkspace } from "@/components/enterprise/health-insurance-workspace";
import { HealthQualityWorkspace } from "@/components/enterprise/health-quality-workspace";
import { HealthDocumentsWorkspace } from "@/components/enterprise/health-documents-workspace";

const healthActivityModules = new Set(["CONSULTATIONS"]);
type ActivityView = "ACTIONS" | "REQUESTS" | "WORKFLOWS";

export function EnterpriseActivitiesModule({ organization, blocks, requests, members, departments, sectorRecords, workflows, gamingReferences }: EnterpriseActivitiesDataset) {
  const locale = useAppLocale();
  const english = locale === "en";
  const [view, setView] = useState<ActivityView>("ACTIONS");
  const [selectedBlockCode, setSelectedBlockCode] = useState(blocks[0]?.blockCode || "");
  const [formOpen, setFormOpen] = useState(false);
  const selectedBlock = useMemo(() => blocks.find((block) => block.blockCode === selectedBlockCode) || null, [blocks, selectedBlockCode]);
  const gaming = organization.businessSubtypeCode === "GAMING_LOUNGE";
  const sectorLabel = english
    ? organization.businessSubtypeLabelEn || organization.businessSector?.labelEn || organization.sector || (english ? "Common activities" : "Activités communes")
    : organization.businessSubtypeLabelFr || organization.businessSector?.labelFr || organization.sector || "Socle commun";
  const pending = requests.filter((item) => !["CLOSED", "CANCELLED", "REJECTED", "COMPLETED", "FULFILLED", "RESOLVED"].includes(item.workflowLink?.canonicalRequestStatus || item.status)).length;
  const tabs = [
    { id: "ACTIONS", label: english ? "Available actions" : "Actions disponibles", count: blocks.length },
    { id: "REQUESTS", label: english ? "Requests" : "Demandes", count: requests.length },
    { id: "WORKFLOWS", label: english ? "Workflows" : "Workflows", count: workflows.length },
  ];
  if (organization.sectorCode === "PHARMACY") return <PharmacyActivitiesWorkspace organizationId={organization.id} />;

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={english ? "Enterprise activities" : "Activités entreprise"}
        title={`${english ? "Activities" : "Activités"} ${organization.name}`}
        description={english
          ? `Submit requests and business reports within ${sectorLabel} without accessing restricted administration data.`
          : `Soumettez des demandes et rapports professionnels pour « ${sectorLabel} » sans accéder aux données d'administration sensibles.`}
        count={sectorLabel}
      />
      <ModuleMetrics label={english ? "Enterprise activity indicators" : "Indicateurs des activités entreprise"}>
        <ModuleMetric label={english ? "Available actions" : "Actions disponibles"} value={blocks.length} />
        <ModuleMetric label={english ? "Pending requests" : "Demandes à traiter"} value={pending} />
        <ModuleMetric label={english ? "My requests" : "Demandes visibles"} value={requests.length} />
        <ModuleMetric label={english ? "Workflows" : "Workflows"} value={workflows.length} />
      </ModuleMetrics>
      <ModuleToolbar
        controls={<ProfessionalTabs value={view} onChange={(value) => setView(value as ActivityView)} items={tabs} label={english ? "Activity views" : "Vues des activités"} />}
        summary={english ? "Actions create a tracked request, not an automatic business transaction." : "Chaque action crée une demande suivie, jamais une transaction métier implicite."}
      />
      <ModuleContent>
        {view === "ACTIONS" && (
          <ModuleSection title={english ? "Submit an activity" : "Soumettre une activité"} description={english ? "Choose the specific action, then complete its dedicated fields." : "Sélectionnez une action et complétez son formulaire métier adapté."}>
            <EnterpriseActivityBlocksPanel
              sectorCode={organization.sectorCode}
              blocks={blocks}
              selectedBlockCode={selectedBlockCode}
              selectedBlock={selectedBlock}
              onSelectBlock={setSelectedBlockCode}
              onOpenForm={() => setFormOpen(true)}
            />
            <div className="mt-5">
              <ContextualUserGuide guide={ITERATION04_USER_GUIDES.ENTERPRISE_ACTIVITIES} compact />
            </div>
          </ModuleSection>
        )}
        {view === "REQUESTS" && (
          <ModuleSection title={english ? "Submitted requests" : "Demandes soumises"} description={english ? "Follow their real server-side status." : "Suivez leur état réel après soumission."}>
            <EnterpriseRequestsPanel requests={requests} />
          </ModuleSection>
        )}
        {view === "WORKFLOWS" && (
          <ModuleSection title={english ? "Shared workflows" : "Workflows partagés"} description={english ? "Only workflows authorized for your organization are listed." : "Seuls les workflows autorisés pour votre entreprise sont présentés."}>
            <EnterpriseWorkflowsPanel workflows={workflows} />
          </ModuleSection>
        )}
        {view === "ACTIONS" && organization.sectorCode === "HEALTH_CARE" && (
          <ModuleSection title={english ? "Healthcare operations" : "Opérations Santé"} description={english ? "Specialized workspaces remain subject to medical permissions." : "Ces espaces spécialisés restent soumis aux permissions médicales."}>
            <HealthAppointmentsWorkspace organizationId={organization.id} activeModuleCodes={healthActivityModules} />
            <HealthConsultationsWorkspace organizationId={organization.id} />
            <HealthMedicalRecordsWorkspace organizationId={organization.id} />
            <HealthStaffWorkspace organizationId={organization.id} />
            <HealthLaboratoryWorkspace organizationId={organization.id} />
            <HealthPharmacyWorkspace organizationId={organization.id} />
            <HealthMedicalBillingWorkspace organizationId={organization.id} />
            <HealthInsuranceWorkspace organizationId={organization.id} />
            <HealthQualityWorkspace organizationId={organization.id} activitiesOnly />
            <HealthDocumentsWorkspace organizationId={organization.id} activitiesOnly />
          </ModuleSection>
        )}
      </ModuleContent>
      <EnterpriseActivityFormDialog
        organization={organization}
        selectedBlockCode={selectedBlockCode}
        selectedBlock={selectedBlock}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        members={members}
        departments={departments}
        sectorRecords={sectorRecords}
        gamingReferences={gaming ? gamingReferences : {}}
        onMessage={(message, tone = "error") => { if (message) notifyToast(message, tone); }}
      />
    </ModuleWorkspace>
  );
}
