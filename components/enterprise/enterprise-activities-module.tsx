"use client";

import { useMemo, useState } from "react";
import { BookOpenCheck } from "lucide-react";
import { Accordion } from "@/components/ui/accordion";
import {
  EnterpriseActivitiesDashboard,
  EnterpriseActivityBlocksPanel,
  EnterpriseActivityFormDialog,
  EnterpriseHealthcareActivitiesPanel,
  EnterprisePharmacyActivitiesPanel,
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
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ITERATION04_USER_GUIDES } from "@/lib/user-guides/iteration04-guides";

const healthActivityModules = new Set(["CONSULTATIONS"]);

export function EnterpriseActivitiesModule({ organization, blocks, requests, members, sectorRecords, workflows }: EnterpriseActivitiesDataset) {
  const [selectedBlockCode, setSelectedBlockCode] = useState(blocks[0]?.blockCode || "");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  useToastMessage(message);
  const selectedBlock = useMemo(() => blocks.find((block) => block.blockCode === selectedBlockCode) || null, [blocks, selectedBlockCode]);

  if (organization.sectorCode === "PHARMACY") return <PharmacyActivitiesWorkspace organizationId={organization.id} />;

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden">
      <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-600"><BookOpenCheck className="h-4 w-4" /> Aide contextuelle</p>
            <h2 className="mt-2 break-words text-xl font-black text-dtsc-ink">Guide des activités de {organization.name}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">Le guide décrit les règles réelles de création, assignation, checklist, progression, commentaires, Kanban et transitions autorisées dans l'entreprise active.</p>
          </div>
          <ContextualUserGuide guide={ITERATION04_USER_GUIDES.ENTERPRISE_ACTIVITIES} compact />
        </div>
      </section>

      <EnterpriseActivitiesDashboard organization={organization} />
      {organization.sectorCode === "HEALTH_CARE" && <HealthAppointmentsWorkspace organizationId={organization.id} activeModuleCodes={healthActivityModules} />}
      {organization.sectorCode === "HEALTH_CARE" && <HealthConsultationsWorkspace organizationId={organization.id} />}
      {organization.sectorCode === "HEALTH_CARE" && <HealthMedicalRecordsWorkspace organizationId={organization.id} />}
      {organization.sectorCode === "HEALTH_CARE" && <HealthStaffWorkspace organizationId={organization.id} />}
      {organization.sectorCode === "HEALTH_CARE" && <HealthLaboratoryWorkspace organizationId={organization.id} />}
      {organization.sectorCode === "HEALTH_CARE" && <HealthPharmacyWorkspace organizationId={organization.id} />}
      {organization.sectorCode === "HEALTH_CARE" && <HealthMedicalBillingWorkspace organizationId={organization.id} />}
      {organization.sectorCode === "HEALTH_CARE" && <HealthInsuranceWorkspace organizationId={organization.id} />}
      {organization.sectorCode === "HEALTH_CARE" && <HealthQualityWorkspace organizationId={organization.id} activitiesOnly />}
      {organization.sectorCode === "HEALTH_CARE" && <HealthDocumentsWorkspace organizationId={organization.id} activitiesOnly />}

      <Accordion>
        <EnterpriseActivityBlocksPanel
          sectorCode={organization.sectorCode}
          blocks={blocks}
          selectedBlockCode={selectedBlockCode}
          selectedBlock={selectedBlock}
          onSelectBlock={setSelectedBlockCode}
          onOpenForm={() => setFormOpen(true)}
        />
        {organization.sectorCode === "HEALTH_CARE" && <EnterpriseHealthcareActivitiesPanel sectorRecords={sectorRecords} />}
        {organization.sectorCode === "PHARMACY" && <EnterprisePharmacyActivitiesPanel sectorRecords={sectorRecords} />}
        <EnterpriseWorkflowsPanel workflows={workflows} />
        <EnterpriseRequestsPanel requests={requests} />
      </Accordion>

      <EnterpriseActivityFormDialog
        organization={organization}
        selectedBlockCode={selectedBlockCode}
        selectedBlock={selectedBlock}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        members={members}
        sectorRecords={sectorRecords}
        onMessage={setMessage}
      />
    </div>
  );
}
