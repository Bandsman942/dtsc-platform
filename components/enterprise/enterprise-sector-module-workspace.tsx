"use client";

import { useMemo, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HealthAppointmentsWorkspace } from "@/components/enterprise/health-appointments-workspace";
import { HealthConsultationsWorkspace } from "@/components/enterprise/health-consultations-workspace";
import { HealthDocumentsWorkspace } from "@/components/enterprise/health-documents-workspace";
import { HealthInsuranceWorkspace } from "@/components/enterprise/health-insurance-workspace";
import { HealthLaboratoryWorkspace } from "@/components/enterprise/health-laboratory-workspace";
import { HealthMedicalBillingWorkspace } from "@/components/enterprise/health-medical-billing-workspace";
import { HealthMedicalRecordsWorkspace } from "@/components/enterprise/health-medical-records-workspace";
import { HealthPatientsWorkspace } from "@/components/enterprise/health-patients-workspace";
import { HealthPharmacyWorkspace } from "@/components/enterprise/health-pharmacy-workspace";
import { HealthQualityWorkspace } from "@/components/enterprise/health-quality-workspace";
import { HealthStaffWorkspace } from "@/components/enterprise/health-staff-workspace";
import { PharmacyAlertsWorkspace } from "@/components/enterprise/pharmacy-alerts-workspace";
import { PharmacyBatchesWorkspace } from "@/components/enterprise/pharmacy-batches-workspace";
import { PharmacyCashWorkspace } from "@/components/enterprise/pharmacy-cash-workspace";
import { PharmacyDocumentsWorkspace } from "@/components/enterprise/pharmacy-documents-workspace";
import { PharmacyProductsWorkspace } from "@/components/enterprise/pharmacy-products-workspace";
import { PharmacyPrescriptionsWorkspace } from "@/components/enterprise/pharmacy-prescriptions-workspace";
import { PharmacyPurchasesWorkspace } from "@/components/enterprise/pharmacy-purchases-workspace";
import { PharmacyQualityWorkspace } from "@/components/enterprise/pharmacy-quality-workspace";
import { PharmacyReceiptsWorkspace } from "@/components/enterprise/pharmacy-receipts-workspace";
import { PharmacyReportsWorkspace } from "@/components/enterprise/pharmacy-reports-workspace";
import { PharmacyReturnLossWorkspace } from "@/components/enterprise/pharmacy-return-loss-workspace";
import { PharmacySalesWorkspace } from "@/components/enterprise/pharmacy-sales-workspace";
import { PharmacySettingsWorkspace } from "@/components/enterprise/pharmacy-settings-workspace";
import { PharmacyStockWorkspace } from "@/components/enterprise/pharmacy-stock-workspace";
import { ProfessionalHelp } from "@/components/enterprise/professional/professional-erp-ui";
import { EmptyState } from "@/components/workspace/empty-state";
import type { EnterpriseSectorRecordItem } from "@/lib/enterprise/enterprise-admin-types";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type HealthRelatedModule = "APPOINTMENTS" | "CONSULTATIONS" | "MEDICAL_RECORDS" | "MEDICAL_DOCUMENTS";

export function EnterpriseSectorModuleWorkspace(props: {
  organizationId: string;
  definition: EnterpriseModuleDefinition;
  enabledModuleCodes: string[];
  records: EnterpriseSectorRecordItem[];
}) {
  const { organizationId, definition, enabledModuleCodes } = props;
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeModuleCodes = useMemo(() => new Set(enabledModuleCodes), [enabledModuleCodes]);
  const initialPatientLegacyRecordId = searchParams.get("patientLegacyRecordId") || "";

  function openHealthRelated(moduleCode: HealthRelatedModule, patientLegacyRecordId?: string) {
    const params = new URLSearchParams();
    if (patientLegacyRecordId) params.set("patientLegacyRecordId", patientLegacyRecordId);
    const query = params.toString();
    router.push(`/enterprise-modules/${encodeURIComponent(moduleCode)}${query ? `?${query}` : ""}`);
  }

  function withHelp(workspace: ReactNode) {
    return (
      <div className="min-w-0 space-y-4">
        {workspace}
        <ProfessionalHelp moduleCode={definition.code} />
      </div>
    );
  }

  if (definition.routeKind === "SECTOR_HEALTH") {
    if (definition.code === "PATIENTS") {
      return withHelp(
        <HealthPatientsWorkspace
          organizationId={organizationId}
          activeModuleCodes={activeModuleCodes}
          onOpenRelated={openHealthRelated}
        />,
      );
    }
    if (definition.code === "APPOINTMENTS") {
      return withHelp(
        <HealthAppointmentsWorkspace
          organizationId={organizationId}
          initialPatientLegacyRecordId={initialPatientLegacyRecordId}
          activeModuleCodes={activeModuleCodes}
          onOpenPatients={() => router.push("/enterprise-modules/PATIENTS")}
        />,
      );
    }
    if (definition.code === "CONSULTATIONS") {
      return withHelp(
        <HealthConsultationsWorkspace
          organizationId={organizationId}
          initialPatientLegacyRecordId={initialPatientLegacyRecordId}
          onOpenPatients={() => router.push("/enterprise-modules/PATIENTS")}
        />,
      );
    }
    if (definition.code === "MEDICAL_RECORDS") {
      return withHelp(
        <HealthMedicalRecordsWorkspace
          organizationId={organizationId}
          initialPatientLegacyRecordId={initialPatientLegacyRecordId}
        />,
      );
    }
    if (definition.code === "CARE_TEAM") return withHelp(<HealthStaffWorkspace organizationId={organizationId} />);
    if (definition.code === "LABORATORY") return withHelp(<HealthLaboratoryWorkspace organizationId={organizationId} />);
    if (definition.code === "INTERNAL_PHARMACY") return withHelp(<HealthPharmacyWorkspace organizationId={organizationId} />);
    if (definition.code === "MEDICAL_BILLING") return withHelp(<HealthMedicalBillingWorkspace organizationId={organizationId} />);
    if (definition.code === "INSURANCE_COVERAGE") return withHelp(<HealthInsuranceWorkspace organizationId={organizationId} />);
    if (definition.code === "QUALITY_INCIDENTS") return withHelp(<HealthQualityWorkspace organizationId={organizationId} />);
    if (definition.code === "MEDICAL_DOCUMENTS") return withHelp(<HealthDocumentsWorkspace organizationId={organizationId} />);
  }

  if (definition.routeKind === "SECTOR_PHARMACY") {
    if (definition.code === "MEDICINES_PRODUCTS") return withHelp(<PharmacyProductsWorkspace organizationId={organizationId} />);
    if (definition.code === "BATCH_EXPIRY") return withHelp(<PharmacyBatchesWorkspace organizationId={organizationId} />);
    if (definition.code === "STOCK_INVENTORY") return withHelp(<PharmacyStockWorkspace organizationId={organizationId} />);
    if (definition.code === "STOCK_RECEIPTS") return withHelp(<PharmacyReceiptsWorkspace organizationId={organizationId} />);
    if (definition.code === "SALES_DISPENSATION") return withHelp(<PharmacySalesWorkspace organizationId={organizationId} />);
    if (definition.code === "PRESCRIPTIONS") return withHelp(<PharmacyPrescriptionsWorkspace organizationId={organizationId} />);
    if (definition.code === "SUPPLIERS_ORDERS") return withHelp(<PharmacyPurchasesWorkspace organizationId={organizationId} />);
    if (definition.code === "CASH_INVOICES_PAYMENTS") return withHelp(<PharmacyCashWorkspace organizationId={organizationId} />);
    if (definition.code === "RETURNS_ADJUSTMENTS_LOSSES") return withHelp(<PharmacyReturnLossWorkspace organizationId={organizationId} />);
    if (definition.code === "ALERTS_EXPIRY_LOW_STOCK") return withHelp(<PharmacyAlertsWorkspace organizationId={organizationId} />);
    if (definition.code === "QUALITY_PHARMACOVIGILANCE") return withHelp(<PharmacyQualityWorkspace organizationId={organizationId} />);
    if (definition.code === "PHARMACY_DOCUMENTS") return withHelp(<PharmacyDocumentsWorkspace organizationId={organizationId} />);
    if (definition.code === "PHARMACY_REPORTS") return withHelp(<PharmacyReportsWorkspace organizationId={organizationId} />);
    if (definition.code === "PHARMACY_SETTINGS") return withHelp(<PharmacySettingsWorkspace organizationId={organizationId} />);
  }

  return (
    <EmptyState
      compact
      title="Module indisponible"
      description="Ce module ne possède pas encore de contrat métier dédié. Il reste masqué jusqu’à son implémentation complète."
    />
  );
}
