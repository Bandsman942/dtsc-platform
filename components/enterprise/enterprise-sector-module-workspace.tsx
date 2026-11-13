"use client";

import { useMemo, useState, type ReactNode } from "react";
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

const HEALTH_SECTOR_MODULES = [
  {code:"PATIENTS",fr:"Patients",en:"Patients"},
  {code:"APPOINTMENTS",fr:"Rendez-vous",en:"Appointments"},
  {code:"CONSULTATIONS",fr:"Consultations",en:"Consultations"},
  {code:"MEDICAL_RECORDS",fr:"Dossiers médicaux",en:"Medical records"},
  {code:"CARE_TEAM",fr:"Équipe médicale",en:"Medical team"},
  {code:"LABORATORY",fr:"Laboratoire",en:"Laboratory"},
  {code:"INTERNAL_PHARMACY",fr:"Pharmacie interne",en:"Internal pharmacy"},
  {code:"MEDICAL_BILLING",fr:"Facturation médicale",en:"Medical billing"},
  {code:"INSURANCE_COVERAGE",fr:"Assurances & prises en charge",en:"Insurance & coverage"},
  {code:"QUALITY_INCIDENTS",fr:"Incidents qualité",en:"Quality incidents"},
  {code:"MEDICAL_DOCUMENTS",fr:"Documents médicaux",en:"Medical documents"},
] as const;

function HealthSectorNavigation({moduleCode,enabledModuleCodes,locale,onOpen}:{
  moduleCode:string;enabledModuleCodes:string[];locale?:string|null;
  onOpen:(code:string)=>void;
}){
  const [expanded,setExpanded]=useState(false);
  const [search,setSearch]=useState("");
  const en=locale?.toLowerCase().startsWith("en")===true;
  const available=HEALTH_SECTOR_MODULES.filter(m=>enabledModuleCodes.includes(m.code));
  const active=available.find(m=>m.code===moduleCode);
  const shown=available.filter(m=>(en?m.en:m.fr).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const panelId="health-sector-module-switcher";
  return <nav data-health-sector-nav aria-label={en?"Healthcare navigation":"Navigation des modules Santé"}
    className="sticky top-0 z-20 min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface/95 p-2 shadow-sm backdrop-blur-xl sm:p-3">
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <a href="/enterprise-modules" className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-dtsc-border px-3 text-xs font-bold text-dtsc-ink hover:bg-dtsc-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500">
        <span aria-hidden className="mr-1">←</span>{en?"All modules":"Tous les modules"}
      </a>
      <p className="min-w-0 flex-1 break-words text-sm font-black text-dtsc-ink">{active?(en?active.en:active.fr):moduleCode}</p>
      <button type="button" aria-expanded={expanded} aria-controls={panelId}
        onClick={()=>setExpanded(v=>!v)}
        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-cyan-600 px-3 text-xs font-black text-white hover:bg-cyan-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500">
        {expanded?(en?"Close navigation":"Fermer"):(en?"Change module":"Changer de module")}
        <span aria-hidden className="ml-2">{expanded?"×":"☰"}</span>
      </button>
    </div>
    {expanded&&<div id={panelId} className="mt-3 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-2 sm:p-3">
      <label className="block min-w-0 text-xs font-bold text-dtsc-muted">
        {en?"Find a healthcare module":"Rechercher un module Santé"}
        <input type="search" value={search} onChange={event=>setSearch(event.target.value)}
          aria-label={en?"Find a healthcare module":"Rechercher un module Santé"}
          className="mt-1 min-h-10 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
          placeholder={en?"Patient, laboratory, billing…":"Patients, laboratoire, facturation…"} />
      </label>
      <div className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {shown.map(module=><button key={module.code} type="button"
          aria-current={module.code===moduleCode?"page":undefined}
          disabled={module.code===moduleCode}
          onClick={()=>onOpen(module.code)}
          className="min-h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-left text-xs font-bold text-dtsc-ink transition hover:border-cyan-400 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:border-cyan-500 disabled:bg-cyan-500/10 disabled:text-cyan-700">
          <span className="block break-words">{en?module.en:module.fr}</span>
        </button>)}
      </div>
      {!shown.length&&<p role="status" className="p-3 text-sm text-dtsc-muted">{en?"No enabled healthcare module matches.":"Aucun module Santé actif ne correspond."}</p>}
    </div>}
  </nav>;
}

type HealthRelatedModule = "APPOINTMENTS" | "CONSULTATIONS" | "MEDICAL_RECORDS" | "MEDICAL_DOCUMENTS";

export function EnterpriseSectorModuleWorkspace(props: {
  organizationId: string;
  organizationName: string;
  organizationLogoUrl?: string | null;
  locale?: string | null;
  definition: EnterpriseModuleDefinition;
  enabledModuleCodes: string[];
  records: EnterpriseSectorRecordItem[];
}) {
  const { organizationId, organizationName, organizationLogoUrl, locale, definition, enabledModuleCodes } = props;
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
        {definition.routeKind === "SECTOR_HEALTH" && <HealthSectorNavigation
          moduleCode={definition.code}
          enabledModuleCodes={enabledModuleCodes}
          locale={locale}
          onOpen={code=>router.push(`/enterprise-modules/${encodeURIComponent(code)}`)}
        />}
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
    if (definition.code === "PHARMACY_REPORTS") return withHelp(<PharmacyReportsWorkspace organizationId={organizationId} organizationName={organizationName} organizationLogoUrl={organizationLogoUrl} locale={locale} />);
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
