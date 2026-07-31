"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Settings2 } from "lucide-react";
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
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseSectorRecordItem } from "@/lib/enterprise/enterprise-admin-types";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

export function EnterpriseSectorModuleWorkspace({
  organizationId,
  definition,
  enabledModuleCodes,
  records,
}: {
  organizationId: string;
  definition: EnterpriseModuleDefinition;
  enabledModuleCodes: string[];
  records: EnterpriseSectorRecordItem[];
}) {
  const router = useRouter();
  const activeModuleCodes = useMemo(() => new Set(enabledModuleCodes), [enabledModuleCodes]);

  if (definition.routeKind === "SECTOR_HEALTH") {
    if (definition.code === "PATIENTS") {
      return (
        <HealthPatientsWorkspace
          organizationId={organizationId}
          activeModuleCodes={activeModuleCodes}
          onOpenRelated={(moduleCode) => router.push(`/enterprise-modules/${encodeURIComponent(moduleCode)}`)}
        />
      );
    }
    if (definition.code === "APPOINTMENTS") {
      return (
        <HealthAppointmentsWorkspace
          organizationId={organizationId}
          initialPatientLegacyRecordId=""
          activeModuleCodes={activeModuleCodes}
          onOpenPatients={() => router.push("/enterprise-modules/PATIENTS")}
        />
      );
    }
    if (definition.code === "CONSULTATIONS") {
      return (
        <HealthConsultationsWorkspace
          organizationId={organizationId}
          initialPatientLegacyRecordId=""
          onOpenPatients={() => router.push("/enterprise-modules/PATIENTS")}
        />
      );
    }
    if (definition.code === "MEDICAL_RECORDS") {
      return <HealthMedicalRecordsWorkspace organizationId={organizationId} initialPatientLegacyRecordId="" />;
    }
    if (definition.code === "CARE_TEAM") return <HealthStaffWorkspace organizationId={organizationId} />;
    if (definition.code === "LABORATORY") return <HealthLaboratoryWorkspace organizationId={organizationId} />;
    if (definition.code === "INTERNAL_PHARMACY") return <HealthPharmacyWorkspace organizationId={organizationId} />;
    if (definition.code === "MEDICAL_BILLING") return <HealthMedicalBillingWorkspace organizationId={organizationId} />;
    if (definition.code === "INSURANCE_COVERAGE") return <HealthInsuranceWorkspace organizationId={organizationId} />;
    if (definition.code === "QUALITY_INCIDENTS") return <HealthQualityWorkspace organizationId={organizationId} />;
    if (definition.code === "MEDICAL_DOCUMENTS") return <HealthDocumentsWorkspace organizationId={organizationId} />;
    return <LegacySectorRecords definition={definition} records={records} />;
  }

  if (definition.routeKind === "SECTOR_PHARMACY") {
    if (definition.code === "MEDICINES_PRODUCTS") return <PharmacyProductsWorkspace organizationId={organizationId} />;
    if (definition.code === "BATCH_EXPIRY") return <PharmacyBatchesWorkspace organizationId={organizationId} />;
    if (definition.code === "STOCK_INVENTORY") return <PharmacyStockWorkspace organizationId={organizationId} />;
    if (definition.code === "STOCK_RECEIPTS") return <PharmacyReceiptsWorkspace organizationId={organizationId} />;
    if (definition.code === "SALES_DISPENSATION") return <PharmacySalesWorkspace organizationId={organizationId} />;
    if (definition.code === "PRESCRIPTIONS") return <PharmacyPrescriptionsWorkspace organizationId={organizationId} />;
    if (definition.code === "SUPPLIERS_ORDERS") return <PharmacyPurchasesWorkspace organizationId={organizationId} />;
    if (definition.code === "CASH_INVOICES_PAYMENTS") return <PharmacyCashWorkspace organizationId={organizationId} />;
    if (definition.code === "RETURNS_ADJUSTMENTS_LOSSES") return <PharmacyReturnLossWorkspace organizationId={organizationId} />;
    if (definition.code === "ALERTS_EXPIRY_LOW_STOCK") return <PharmacyAlertsWorkspace organizationId={organizationId} />;
    if (definition.code === "QUALITY_PHARMACOVIGILANCE") return <PharmacyQualityWorkspace organizationId={organizationId} />;
    if (definition.code === "PHARMACY_DOCUMENTS") return <PharmacyDocumentsWorkspace organizationId={organizationId} />;
    if (definition.code === "PHARMACY_REPORTS") return <PharmacyReportsWorkspace organizationId={organizationId} />;
    if (definition.code === "PHARMACY_SETTINGS") return <PharmacySettingsWorkspace organizationId={organizationId} />;
  }

  return (
    <EmptyState
      compact
      title="Workspace sectoriel non résolu"
      description="Le registre connaît ce module mais aucun renderer allow-listé ne correspond à son workspaceKey."
    />
  );
}

function LegacySectorRecords({
  definition,
  records,
}: {
  definition: EnterpriseModuleDefinition;
  records: EnterpriseSectorRecordItem[];
}) {
  const visibleRecords = records.filter((record) => record.moduleCode === definition.code);
  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow="Module sectoriel beta"
        title={definition.labelFr}
        count={`${visibleRecords.length}`}
        description={`${definition.descriptionFr} Les mutations restent dans l’administration sectorielle existante jusqu’à la création d’un modèle métier dédié.`}
        primaryAction={(
          <Link href="/enterprise-admin" className="inline-flex h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-black text-dtsc-blue">
            <Settings2 className="h-4 w-4" /> Administration
          </Link>
        )}
      />
      <ModuleContent>
        <ModuleSection title="Éléments autorisés" description="Lecture directe des données beta existantes, sans réintroduire un CRUD générique pour les domaines dédiés.">
          {visibleRecords.length ? (
            <BusinessList ariaLabel={definition.labelFr}>
              {visibleRecords.map((record) => (
                <BusinessListItem
                  key={record.id}
                  title={record.title}
                  description={record.summary || "Aucun résumé renseigné."}
                  status={<StatusBadge>{record.status}</StatusBadge>}
                />
              ))}
            </BusinessList>
          ) : (
            <EmptyState compact title="Aucun élément" description="Aucune donnée beta n’est actuellement visible dans ce module." />
          )}
        </ModuleSection>
        <Link href="/enterprise-modules" className="inline-flex items-center gap-2 text-sm font-black text-dtsc-blue">
          <ArrowLeft className="h-4 w-4" /> Retour aux modules ERP
        </Link>
      </ModuleContent>
    </ModuleWorkspace>
  );
}
