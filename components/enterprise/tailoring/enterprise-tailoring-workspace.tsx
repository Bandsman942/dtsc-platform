"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Ruler, Scissors } from "lucide-react";
import { Field, NativeSelect, priorityChoices, statusTone } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  ProfessionalError,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalTabs,
  professionalMutation,
} from "@/components/enterprise/professional/professional-erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import {
  TAILORING_MODULE_CODES,
  type TailoringModuleCode,
} from "@/lib/enterprise/tailoring/constants";
import { getTailoringUiCopy, tailoringStatusLabel } from "@/lib/enterprise/tailoring/i18n";
import {
  tailoringAlterationAreaChoices,
  tailoringAlterationTypeChoices,
  tailoringBundleStatusChoices,
  tailoringCuttingStatusChoices,
  tailoringFinishingStatusChoices,
  tailoringFittingResultChoices,
  tailoringGarmentTypeChoices,
  tailoringGrainDirectionChoices,
  tailoringMaterialProfileTypeChoices,
  tailoringMeasurementCodeChoices,
  tailoringMeasurementUnitChoices,
  tailoringOperatingModeChoices,
} from "@/lib/enterprise/tailoring/options";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Numeric = string | number;
type Customer = { id: string; code: string; legalName: string; displayName: string | null; primaryPhone: string | null; primaryEmail: string | null };
type CatalogItem = { id: string; code: string; name: string; itemType: string; trackInventory: boolean; unitOfMeasure: { code: string; name: string; symbol: string | null } };
type ProductionOrder = { id: string; reference: string; title: string; status: string; outputCatalogItemId: string; salesOrderId: string | null; plannedQuantity: Numeric; producedQuantity: Numeric; bomId: string; routingId: string | null };
type Employee = { id: string; employeeNumber: string; displayName: string; siteId: string | null };
type WorkCenter = { id: string; code: string; name: string; siteId: string | null; assetId: string | null };
type Bom = { id: string; code: string; name: string; catalogItemId: string; version: number };
type Routing = { id: string; code: string; name: string; catalogItemId: string | null; version: number };
type QualityCheck = { id: string; productionOrderId: string; checkType: string; result: string; quantityChecked: Numeric; quantityAccepted: Numeric; quantityRejected: Numeric; createdAt: string };
type MeasurementReference = { id: string; businessPartyId: string; label: string; version: number; measuredAt: string };
type Configuration = { id: string; operatingMode: string; defaultMeasurementUnit: string; revision: number };
type MeasurementProfile = { id: string; businessPartyId: string; label: string; version: number; status: string; measuredAt: string; notes: string | null; values: Array<{ id: string; measurementCode: string; value: Numeric; unit: string }> };
type SizeGrade = { id: string; sizeCode: string; baseSizeCode: string | null; sequence: number; notes: string | null; rules: Array<{ id: string; measurementCode: string; deltaValue: Numeric; unit: string }> };
type Style = { id: string; code: string; name: string; catalogItemId: string; garmentType: string; operatingMode: string; patternReference: string | null; patternVersion: number; bomId: string | null; routingId: string | null; status: string; revision: number; sizeGrades: SizeGrade[] };
type MaterialProfile = { id: string; catalogItemId: string; profileType: string; fabricWidthCm: Numeric | null; usableWidthCm: Numeric | null; shrinkageRate: Numeric | null; grainDirection: string | null; colorFamily: string | null; revision: number };
type CuttingPlan = { id: string; reference: string; productionOrderId: string; styleId: string | null; materialRequirementId: string | null; fabricCatalogItemId: string; fabricWidthCm: Numeric | null; markerLengthCm: Numeric | null; layers: number; plannedQuantity: Numeric; cutQuantity: Numeric; wasteQuantity: Numeric; markerEfficiency: Numeric | null; status: string; revision: number; style: { id: string; code: string; name: string; garmentType: string; operatingMode: string } | null };
type Alteration = { id: string; reference: string; fittingId: string; alterationType: string; areaCode: string | null; priority: string; assignedEmployeeId: string | null; status: string; dueAt: string | null; notes: string | null; revision: number; fitting?: { id: string; reference: string; result: string; status: string; sequence: number } };
type Fitting = { id: string; reference: string; productionOrderId: string; measurementProfileId: string | null; sequence: number; scheduledAt: string | null; fittedAt: string | null; fittedByEmployeeId: string | null; status: string; result: string; notes: string | null; revision: number; measurementProfile: { id: string; businessPartyId: string; label: string; version: number; measuredAt: string } | null; alterations: Alteration[] };
type GarmentBundle = { id: string; bundleCode: string; productionOrderId: string; cuttingPlanId: string | null; sizeCode: string | null; quantity: Numeric; currentWorkCenterId: string | null; status: string; notes: string | null; revision: number; cuttingPlan: { id: string; reference: string; status: string } | null; finishingRecords: Array<{ id: string; status: string; completedAt: string | null }> };
type FinishingRecord = { id: string; productionOrderId: string; garmentBundleId: string; qualityCheckId: string | null; status: string; pressed: boolean; threadTrimmed: boolean; fasteningsChecked: boolean; packaged: boolean; completedByEmployeeId: string | null; completedAt: string | null; notes: string | null; revision: number; garmentBundle: { id: string; bundleCode: string; quantity: Numeric; sizeCode: string | null; status: string } };
type TailoringOverview = {
  measurementProfiles: number;
  activeStyles: number;
  cuttingPlans: Array<{ status: string; _count: { _all: number }; _sum: { plannedQuantity: Numeric | null; cutQuantity: Numeric | null; wasteQuantity: Numeric | null } }>;
  scheduledFittings: number;
  openAlterations: number;
  bundlesByStatus: Array<{ status: string; _count: { _all: number }; _sum: { quantity: Numeric | null } }>;
  finishingByStatus: Array<{ status: string; _count: { _all: number } }>;
};
type TailoringReferences = {
  configuration: Configuration | null;
  customers: Customer[];
  catalogItems: CatalogItem[];
  productionOrders: ProductionOrder[];
  employees: Employee[];
  workCenters: WorkCenter[];
  boms: Bom[];
  routings: Routing[];
  qualityChecks: QualityCheck[];
  measurementProfiles: MeasurementReference[];
};
type TailoringPayload = {
  moduleCode: TailoringModuleCode;
  capabilities: { canWrite: boolean; canApprove: boolean; canManage: boolean };
  overview: TailoringOverview;
  references: TailoringReferences;
  measurementProfiles?: MeasurementProfile[];
  styles?: Style[];
  materialProfiles?: MaterialProfile[];
  cuttingPlans?: CuttingPlan[];
  fittings?: Fitting[];
  alterations?: Alteration[];
  garmentBundles?: GarmentBundle[];
  finishingRecords?: FinishingRecord[];
};
type MeasurementRow = { measurementCode: string; value: string; unit: string };

type RecordCardProps = {
  title: string;
  subtitle?: string;
  status?: string;
  locale?: string | null;
  children?: ReactNode;
};

function RecordCard({ title, subtitle, status, locale, children }: RecordCardProps) {
  return (
    <article className="grid min-w-0 gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-black text-dtsc-ink">{title}</h3>
          {subtitle ? <p className="mt-1 break-words text-sm leading-6 text-dtsc-muted">{subtitle}</p> : null}
        </div>
        {status ? <StatusBadge tone={statusTone(status)}>{tailoringStatusLabel(locale, status)}</StatusBadge> : null}
      </div>
      {children}
    </article>
  );
}

function TextArea({ name, defaultValue, placeholder }: { name: string; defaultValue?: string | null; placeholder?: string }) {
  return <textarea name={name} defaultValue={defaultValue || ""} placeholder={placeholder} className="min-h-24 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-dtsc-blue md:text-sm" />;
}

function selected<T extends { id: string }>(items: T[] | undefined, id: FormDataEntryValue | null) {
  return (items || []).find((item) => item.id === String(id || "")) || null;
}

export function EnterpriseTailoringWorkspace({
  organizationId,
  organizationName,
  definition,
  initialFocus,
  locale,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  initialFocus: TailoringModuleCode;
  locale?: string | null;
}) {
  const router = useRouter();
  const copy = getTailoringUiCopy(locale);
  const [data, setData] = useState<TailoringPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mutationMessage, setMutationMessage] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [measurementRows, setMeasurementRows] = useState<MeasurementRow[]>([{ measurementCode: "CHEST", value: "", unit: "CM" }]);
  useToastMessage(mutationMessage || mutationError);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    fetch(`/api/enterprise/${organizationId}/tailoring?moduleCode=${encodeURIComponent(initialFocus)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as (TailoringPayload & { message?: string; error?: string }) | null;
        if (!response.ok || !body) throw new Error(body?.message || body?.error || copy.loadFailed);
        if (active) setData(body);
      })
      .catch((error) => { if (active) setLoadError(error instanceof Error ? error.message : copy.loadFailed); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [copy.loadFailed, initialFocus, organizationId, refreshKey]);

  async function mutate(action: string, payload: unknown, entityId?: string) {
    setSubmitting(true);
    setMutationMessage("");
    setMutationError("");
    try {
      const result = await professionalMutation(`/api/enterprise/${organizationId}/tailoring?moduleCode=${encodeURIComponent(initialFocus)}`, { action, payload, entityId });
      setMutationMessage(copy.saved);
      setRefreshKey((value) => value + 1);
      return result;
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : copy.actionFailed);
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  const tabs = useMemo(() => {
    const labels: Record<TailoringModuleCode, string> = {
      TAILORING_OVERVIEW: copy.overview,
      TAILORING_MEASUREMENTS: copy.measurements,
      TAILORING_STYLES_PATTERNS: copy.styles,
      TAILORING_SIZE_GRADING: copy.grading,
      TAILORING_MATERIAL_PROFILES: copy.materials,
      TAILORING_CUTTING_PLANS: copy.cutting,
      TAILORING_FITTINGS: copy.fittings,
      TAILORING_ALTERATIONS: copy.alterations,
      TAILORING_GARMENT_TRACKING: copy.garments,
      TAILORING_FINISHING: copy.finishing,
    };
    return TAILORING_MODULE_CODES.map((id) => ({ id, label: labels[id] }));
  }, [copy]);

  if (loading && !data) return <ModuleWorkspace><ProfessionalLoading rows={7} /></ModuleWorkspace>;
  if (loadError || !data) return <ModuleWorkspace><ProfessionalError message={loadError || copy.unavailable} /></ModuleWorkspace>;

  const references = data.references;
  const customerChoices = references.customers.map((item) => ({ id: item.id, label: `${item.code} · ${item.displayName || item.legalName}` }));
  const catalogChoices = references.catalogItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));
  const inventoryCatalogChoices = references.catalogItems.filter((item) => item.trackInventory).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));
  const orderChoices = references.productionOrders.map((item) => ({ id: item.id, label: `${item.reference} · ${item.title}` }));
  const employeeChoices = references.employees.map((item) => ({ id: item.id, label: `${item.employeeNumber} · ${item.displayName}` }));
  const workCenterChoices = references.workCenters.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));
  const bomChoices = references.boms.map((item) => ({ id: item.id, label: `${item.code} v${item.version} · ${item.name}` }));
  const routingChoices = references.routings.map((item) => ({ id: item.id, label: `${item.code} v${item.version} · ${item.name}` }));
  const measurementProfileChoices = references.measurementProfiles.map((item) => ({ id: item.id, label: `${item.label} · v${item.version}` }));
  const styleChoices = (data.styles || []).filter((item) => item.status !== "RETIRED").map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));
  const cuttingPlanChoices = (data.cuttingPlans || []).map((item) => ({ id: item.id, label: `${item.reference} · ${tailoringStatusLabel(locale, item.status)}` }));
  const fittingChoices = (data.fittings || []).map((item) => ({ id: item.id, label: `${item.reference} · ${tailoringStatusLabel(locale, item.status)}` }));
  const adjustmentFittingChoices = (data.fittings || []).filter((item) => item.status === "COMPLETED" && item.result === "ADJUSTMENTS_REQUIRED").map((item) => ({ id: item.id, label: `${item.reference} · ${copy.adjustmentRequired}` }));
  const alterationChoices = (data.alterations || []).map((item) => ({ id: item.id, label: `${item.reference} · ${tailoringStatusLabel(locale, item.status)}` }));
  const bundleChoices = (data.garmentBundles || []).map((item) => ({ id: item.id, label: `${item.bundleCode} · ${tailoringStatusLabel(locale, item.status)}` }));
  const qualityChoices = references.qualityChecks.filter((item) => item.result === "PASS").map((item) => ({ id: item.id, label: `${item.checkType} · ${item.quantityAccepted}/${item.quantityChecked}` }));

  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const configuration = references.configuration;
    if (!configuration) return;
    const form = new FormData(event.currentTarget);
    await mutate("SAVE_CONFIGURATION", {
      operatingMode: form.get("operatingMode"),
      defaultMeasurementUnit: form.get("defaultMeasurementUnit"),
      revision: configuration.revision,
    });
  }

  async function createMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("CREATE_MEASUREMENT_PROFILE", {
      businessPartyId: form.get("businessPartyId"),
      label: form.get("label"),
      measuredAt: form.get("measuredAt") || undefined,
      measuredByEmployeeId: form.get("measuredByEmployeeId") || null,
      notes: form.get("notes") || null,
      values: measurementRows.map((row) => ({ measurementCode: row.measurementCode, value: Number(row.value), unit: row.unit })),
    });
  }

  async function createStyle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("CREATE_STYLE", {
      code: form.get("code"), name: form.get("name"), catalogItemId: form.get("catalogItemId"), garmentType: form.get("garmentType"),
      operatingMode: form.get("operatingMode"), patternReference: form.get("patternReference") || null, patternVersion: Number(form.get("patternVersion") || 1),
      bomId: form.get("bomId") || null, routingId: form.get("routingId") || null, notes: form.get("notes") || null,
    });
  }

  async function createGrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const measurementCode = String(form.get("measurementCode") || "");
    const deltaValue = String(form.get("deltaValue") || "");
    await mutate("CREATE_SIZE_GRADE", {
      styleId: form.get("styleId"), sizeCode: form.get("sizeCode"), baseSizeCode: form.get("baseSizeCode") || null,
      sequence: Number(form.get("sequence") || 0), notes: form.get("notes") || null,
      rules: measurementCode && deltaValue ? [{ measurementCode, deltaValue: Number(deltaValue), unit: form.get("unit") || "CM" }] : [],
    });
  }

  async function createMaterialProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("CREATE_MATERIAL_PROFILE", {
      catalogItemId: form.get("catalogItemId"), profileType: form.get("profileType"),
      fabricWidthCm: form.get("fabricWidthCm") ? Number(form.get("fabricWidthCm")) : null,
      usableWidthCm: form.get("usableWidthCm") ? Number(form.get("usableWidthCm")) : null,
      shrinkageRate: form.get("shrinkageRate") ? Number(form.get("shrinkageRate")) : null,
      grainDirection: form.get("grainDirection") || null, colorFamily: form.get("colorFamily") || null, notes: form.get("notes") || null,
    });
  }

  async function createCuttingPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("CREATE_CUTTING_PLAN", {
      productionOrderId: form.get("productionOrderId"), styleId: form.get("styleId") || null, materialRequirementId: null,
      fabricCatalogItemId: form.get("fabricCatalogItemId"), fabricWidthCm: form.get("fabricWidthCm") ? Number(form.get("fabricWidthCm")) : null,
      markerLengthCm: form.get("markerLengthCm") ? Number(form.get("markerLengthCm")) : null,
      layers: Number(form.get("layers") || 1), plannedQuantity: Number(form.get("plannedQuantity") || 0), notes: form.get("notes") || null,
    });
  }

  async function updateCuttingPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const plan = selected(data.cuttingPlans, form.get("entityId"));
    if (!plan) return;
    await mutate("UPDATE_CUTTING_PLAN", {
      revision: plan.revision, status: form.get("status"), cutQuantity: Number(form.get("cutQuantity") || 0), wasteQuantity: Number(form.get("wasteQuantity") || 0),
      markerEfficiency: form.get("markerEfficiency") ? Number(form.get("markerEfficiency")) : null, notes: form.get("notes") || null,
    }, plan.id);
  }

  async function createFitting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("CREATE_FITTING", {
      productionOrderId: form.get("productionOrderId"), measurementProfileId: form.get("measurementProfileId") || null,
      scheduledAt: form.get("scheduledAt") || null, fittedByEmployeeId: form.get("fittedByEmployeeId") || null, notes: form.get("notes") || null,
    });
  }

  async function completeFitting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fitting = selected(data.fittings, form.get("entityId"));
    if (!fitting) return;
    await mutate("COMPLETE_FITTING", {
      revision: fitting.revision, status: "COMPLETED", result: form.get("result"), fittedByEmployeeId: form.get("fittedByEmployeeId") || null, notes: form.get("notes") || null,
    }, fitting.id);
  }

  async function createAlteration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("CREATE_ALTERATION", {
      fittingId: form.get("fittingId"), alterationType: form.get("alterationType"), areaCode: form.get("areaCode") || null,
      priority: form.get("priority") || "NORMAL", assignedEmployeeId: form.get("assignedEmployeeId") || null,
      dueAt: form.get("dueAt") || null, notes: form.get("notes") || null,
    });
  }

  async function updateAlteration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const alteration = selected(data.alterations, form.get("entityId"));
    if (!alteration) return;
    await mutate("UPDATE_ALTERATION", {
      revision: alteration.revision, status: form.get("status"), assignedEmployeeId: form.get("assignedEmployeeId") || null,
      dueAt: form.get("dueAt") || null, notes: form.get("notes") || null,
    }, alteration.id);
  }

  async function createBundle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("CREATE_GARMENT_BUNDLE", {
      productionOrderId: form.get("productionOrderId"), cuttingPlanId: form.get("cuttingPlanId") || null,
      sizeCode: form.get("sizeCode") || null, quantity: Number(form.get("quantity") || 0), currentWorkCenterId: form.get("currentWorkCenterId") || null,
      notes: form.get("notes") || null,
    });
  }

  async function updateBundle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const bundle = selected(data.garmentBundles, form.get("entityId"));
    if (!bundle) return;
    await mutate("UPDATE_GARMENT_BUNDLE", {
      revision: bundle.revision, status: form.get("status"), currentWorkCenterId: form.get("currentWorkCenterId") || null, notes: form.get("notes") || null,
    }, bundle.id);
  }

  async function saveFinishing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const bundle = selected(data.garmentBundles, form.get("garmentBundleId"));
    const existing = (data.finishingRecords || []).find((item) => item.garmentBundleId === bundle?.id) || null;
    await mutate("UPSERT_FINISHING", {
      productionOrderId: form.get("productionOrderId"), garmentBundleId: form.get("garmentBundleId"), qualityCheckId: form.get("qualityCheckId") || null,
      status: form.get("status"), pressed: form.get("pressed") === "on", threadTrimmed: form.get("threadTrimmed") === "on",
      fasteningsChecked: form.get("fasteningsChecked") === "on", packaged: form.get("packaged") === "on",
      completedByEmployeeId: form.get("completedByEmployeeId") || null, notes: form.get("notes") || null, revision: existing?.revision,
    });
  }

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={copy.sectorEyebrow}
        title={locale === "en" ? definition.labelEn : definition.labelFr}
        description={`${organizationName} · ${locale === "en" ? definition.descriptionEn : definition.descriptionFr}`}
        count={data.overview.activeStyles ? `${data.overview.activeStyles} ${copy.styles.toLowerCase()}` : undefined}
      />
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1"><ProfessionalTabs value={initialFocus} onChange={(value) => router.push(`/enterprise-modules/${value}`)} items={tabs} /></div>
        <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={() => setRefreshKey((value) => value + 1)} aria-label={copy.refresh} title={copy.refresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      {mutationError ? <ProfessionalError message={mutationError} /> : null}
      <ModuleMetrics>
        <ModuleMetric label={copy.activeMeasurements} value={data.overview.measurementProfiles} />
        <ModuleMetric label={copy.activeStyles} value={data.overview.activeStyles} />
        <ModuleMetric label={copy.scheduledFittings} value={data.overview.scheduledFittings} />
        <ModuleMetric label={copy.openAlterations} value={data.overview.openAlterations} />
      </ModuleMetrics>
      <ModuleContent>
        {initialFocus === "TAILORING_OVERVIEW" ? <>
          <ModuleSection title={copy.configuration} description={copy.configurationHint}>
            {data.capabilities.canManage && references.configuration ? (
              <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={saveConfiguration}>
                <Field label={copy.operatingMode}><NativeSelect name="operatingMode" required defaultValue={references.configuration.operatingMode} items={tailoringOperatingModeChoices(locale)} /></Field>
                <Field label={copy.measurementUnit}><NativeSelect name="defaultMeasurementUnit" required defaultValue={references.configuration.defaultMeasurementUnit} items={tailoringMeasurementUnitChoices()} /></Field>
                <div className="md:col-span-2"><Button type="submit" disabled={submitting}>{copy.save}</Button></div>
              </form>
            ) : <p className="text-sm text-dtsc-muted">{copy.noData}</p>}
          </ModuleSection>
          <ModuleSection title={copy.overview} description={copy.canonicalHint}>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.overview.cuttingPlans.map((item) => <RecordCard key={item.status} title={copy.cutting} subtitle={`${Number(item._sum.cutQuantity || 0)} / ${Number(item._sum.plannedQuantity || 0)}`} status={item.status} locale={locale} />)}
              {data.overview.bundlesByStatus.map((item) => <RecordCard key={item.status} title={copy.garments} subtitle={`${Number(item._sum.quantity || 0)} · ${item._count._all}`} status={item.status} locale={locale} />)}
              {data.overview.finishingByStatus.map((item) => <RecordCard key={item.status} title={copy.finishing} subtitle={String(item._count._all)} status={item.status} locale={locale} />)}
            </div>
          </ModuleSection>
        </> : null}

        {initialFocus === "TAILORING_MEASUREMENTS" ? <>
          {data.capabilities.canWrite ? <ModuleSection title={copy.measurementNew} description={copy.canonicalHint}>
            <form className="grid min-w-0 gap-4" onSubmit={createMeasurement}>
              <div className="grid min-w-0 gap-4 md:grid-cols-2">
                <Field label={copy.customer}><NativeSelect name="businessPartyId" required items={customerChoices} /></Field>
                <Field label={copy.measurementLabel}><Input name="label" required /></Field>
                <Field label={copy.measuredAt}><Input name="measuredAt" type="datetime-local" /></Field>
                <Field label={copy.employee}><NativeSelect name="measuredByEmployeeId" items={employeeChoices} /></Field>
              </div>
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-2"><h3 className="font-black text-dtsc-ink">{copy.measurements}</h3><Button type="button" variant="outline" className="min-h-11" aria-label={copy.measurementCode} title={copy.measurementCode} onClick={() => setMeasurementRows((rows) => [...rows, { measurementCode: "WAIST", value: "", unit: references.configuration?.defaultMeasurementUnit || "CM" }])}><Plus className="h-4 w-4" /></Button></div>
                {measurementRows.map((row, index) => <div key={index} className="grid min-w-0 gap-3 rounded-xl border border-dtsc-border p-3 md:grid-cols-3">
                  <Field label={copy.measurementCode}><NativeSelect value={row.measurementCode} onChange={(value) => setMeasurementRows((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, measurementCode: value } : item))} items={tailoringMeasurementCodeChoices(locale)} /></Field>
                  <Field label={copy.measurementValue}><Input type="number" min="0.01" step="0.01" required value={row.value} onChange={(event) => setMeasurementRows((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} /></Field>
                  <Field label={copy.measurementUnit}><NativeSelect value={row.unit} onChange={(value) => setMeasurementRows((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, unit: value } : item))} items={tailoringMeasurementUnitChoices()} /></Field>
                </div>)}
              </div>
              <Field label={copy.notes}><TextArea name="notes" /></Field>
              <Button type="submit" disabled={submitting || !customerChoices.length}><Ruler className="mr-2 h-4 w-4" />{copy.create}</Button>
            </form>
          </ModuleSection> : null}
          <ModuleSection title={copy.measurementHistory} count={(data.measurementProfiles || []).length}>
            <div className="grid gap-3">{(data.measurementProfiles || []).map((item) => <RecordCard key={item.id} title={`${item.label} · v${item.version}`} subtitle={`${item.values.length} ${copy.measurements.toLowerCase()}`} status={item.status} locale={locale}><div className="flex flex-wrap gap-2 text-sm text-dtsc-muted">{item.values.map((value) => <span key={value.id} className="rounded-full bg-dtsc-soft px-2.5 py-1">{tailoringMeasurementCodeChoices(locale).find((choice) => choice.id === value.measurementCode)?.label || value.measurementCode}: {Number(value.value)} {value.unit.toLowerCase()}</span>)}</div></RecordCard>)}</div>
          </ModuleSection>
        </> : null}

        {initialFocus === "TAILORING_STYLES_PATTERNS" ? <>
          {data.capabilities.canWrite ? <ModuleSection title={copy.styleNew} description={copy.canonicalHint}>
            <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={createStyle}>
              <Field label={copy.styleCode}><Input name="code" required /></Field><Field label={copy.styleName}><Input name="name" required /></Field>
              <Field label={copy.product}><NativeSelect name="catalogItemId" required items={catalogChoices} /></Field><Field label={copy.garmentType}><NativeSelect name="garmentType" required items={tailoringGarmentTypeChoices(locale)} /></Field>
              <Field label={copy.operatingMode}><NativeSelect name="operatingMode" required defaultValue={references.configuration?.operatingMode || "MIXED"} items={tailoringOperatingModeChoices(locale)} /></Field><Field label={copy.patternReference}><Input name="patternReference" /></Field>
              <Field label={copy.patternVersion}><Input name="patternVersion" type="number" min="1" defaultValue="1" /></Field><Field label={copy.bom}><NativeSelect name="bomId" items={bomChoices} /></Field>
              <Field label={copy.routing}><NativeSelect name="routingId" items={routingChoices} /></Field><Field label={copy.notes}><TextArea name="notes" /></Field>
              <div className="md:col-span-2"><Button type="submit" disabled={submitting || !catalogChoices.length}><Scissors className="mr-2 h-4 w-4" />{copy.create}</Button></div>
            </form>
          </ModuleSection> : null}
          <ModuleSection title={copy.styles} count={(data.styles || []).length}><div className="grid gap-3">{(data.styles || []).map((item) => <RecordCard key={item.id} title={`${item.code} · ${item.name}`} subtitle={`${copy.garmentType}: ${getTailoringUiCopy(locale).garmentTypeLabels[item.garmentType as keyof typeof getTailoringUiCopy(locale).garmentTypeLabels] || item.garmentType}`} status={item.status} locale={locale}>{data.capabilities.canManage && item.status !== "RETIRED" ? <div className="flex flex-wrap gap-2">{item.status === "DRAFT" ? <Button type="button" disabled={submitting} onClick={() => void mutate("CHANGE_STYLE_STATUS", { revision: item.revision, action: "ACTIVATE" }, item.id)}>{copy.activate}</Button> : null}<Button type="button" variant="outline" disabled={submitting} onClick={() => void mutate("CHANGE_STYLE_STATUS", { revision: item.revision, action: "RETIRE" }, item.id)}>{copy.retire}</Button></div> : null}</RecordCard>)}</div></ModuleSection>
        </> : null}

        {initialFocus === "TAILORING_SIZE_GRADING" ? <>
          {data.capabilities.canWrite ? <ModuleSection title={copy.gradeNew}>
            <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={createGrade}>
              <Field label={copy.style}><NativeSelect name="styleId" required items={styleChoices} /></Field><Field label={copy.size}><Input name="sizeCode" required /></Field>
              <Field label={copy.baseSize}><Input name="baseSizeCode" /></Field><Field label={copy.gradeRule}><NativeSelect name="measurementCode" items={tailoringMeasurementCodeChoices(locale)} /></Field>
              <Field label={copy.delta}><Input name="deltaValue" type="number" step="0.01" /></Field><Field label={copy.measurementUnit}><NativeSelect name="unit" defaultValue={references.configuration?.defaultMeasurementUnit || "CM"} items={tailoringMeasurementUnitChoices()} /></Field>
              <Field label={copy.notes}><TextArea name="notes" /></Field><input type="hidden" name="sequence" value="0" />
              <div className="md:col-span-2"><Button type="submit" disabled={submitting || !styleChoices.length}>{copy.create}</Button></div>
            </form>
          </ModuleSection> : null}
          <ModuleSection title={copy.grading}><div className="grid gap-3">{(data.styles || []).flatMap((style) => style.sizeGrades.map((grade) => <RecordCard key={grade.id} title={`${style.code} · ${grade.sizeCode}`} subtitle={`${copy.baseSize}: ${grade.baseSizeCode || "—"} · ${grade.rules.length} ${copy.gradeRule.toLowerCase()}`} />))}</div></ModuleSection>
        </> : null}

        {initialFocus === "TAILORING_MATERIAL_PROFILES" ? <>
          {data.capabilities.canWrite ? <ModuleSection title={copy.materialNew} description={copy.canonicalHint}>
            <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={createMaterialProfile}>
              <Field label={copy.product}><NativeSelect name="catalogItemId" required items={inventoryCatalogChoices} /></Field><Field label={copy.profileType}><NativeSelect name="profileType" required defaultValue="FABRIC" items={tailoringMaterialProfileTypeChoices(locale)} /></Field>
              <Field label={copy.fabricWidth}><Input name="fabricWidthCm" type="number" min="0.01" step="0.01" /></Field><Field label={copy.usableWidth}><Input name="usableWidthCm" type="number" min="0.01" step="0.01" /></Field>
              <Field label={copy.shrinkage}><Input name="shrinkageRate" type="number" min="0" max="100" step="0.01" /></Field><Field label={copy.grainDirection}><NativeSelect name="grainDirection" items={tailoringGrainDirectionChoices(locale)} /></Field>
              <Field label={copy.colorFamily}><Input name="colorFamily" /></Field><Field label={copy.notes}><TextArea name="notes" /></Field>
              <div className="md:col-span-2"><Button type="submit" disabled={submitting || !inventoryCatalogChoices.length}>{copy.create}</Button></div>
            </form>
          </ModuleSection> : null}
          <ModuleSection title={copy.materials} count={(data.materialProfiles || []).length}><div className="grid gap-3 sm:grid-cols-2">{(data.materialProfiles || []).map((item) => <RecordCard key={item.id} title={catalogChoices.find((choice) => choice.id === item.catalogItemId)?.label || copy.product} subtitle={`${item.profileType === "FABRIC" ? copy.fabric : copy.trim}${item.fabricWidthCm ? ` · ${copy.fabricWidth}: ${Number(item.fabricWidthCm)}` : ""}`} />)}</div></ModuleSection>
        </> : null}

        {initialFocus === "TAILORING_CUTTING_PLANS" ? <>
          {data.capabilities.canWrite ? <ModuleSection title={copy.cuttingNew} description={copy.physicalWasteHint}>
            <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={createCuttingPlan}>
              <Field label={copy.productionOrder}><NativeSelect name="productionOrderId" required items={orderChoices} /></Field><Field label={copy.style}><NativeSelect name="styleId" items={styleChoices} /></Field>
              <Field label={copy.fabric}><NativeSelect name="fabricCatalogItemId" required items={inventoryCatalogChoices} /></Field><Field label={copy.fabricWidth}><Input name="fabricWidthCm" type="number" min="0.01" step="0.01" /></Field>
              <Field label={copy.layers}><Input name="layers" type="number" min="1" defaultValue="1" required /></Field><Field label={copy.plannedQuantity}><Input name="plannedQuantity" type="number" min="0.001" step="0.001" required /></Field>
              <Field label={copy.markerEfficiency}><Input name="markerLengthCm" type="number" min="0.01" step="0.01" /></Field><Field label={copy.notes}><TextArea name="notes" /></Field>
              <div className="md:col-span-2"><Button type="submit" disabled={submitting || !orderChoices.length || !inventoryCatalogChoices.length}>{copy.create}</Button></div>
            </form>
          </ModuleSection> : null}
          {data.capabilities.canWrite && (data.cuttingPlans || []).length ? <ModuleSection title={copy.update}>
            <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={updateCuttingPlan}>
              <Field label={copy.cuttingPlan}><NativeSelect name="entityId" required items={cuttingPlanChoices} /></Field><Field label={copy.status}><NativeSelect name="status" required items={tailoringCuttingStatusChoices(locale)} /></Field>
              <Field label={copy.cutQuantity}><Input name="cutQuantity" type="number" min="0" step="0.001" required /></Field><Field label={copy.wasteQuantity}><Input name="wasteQuantity" type="number" min="0" step="0.001" required /></Field>
              <Field label={copy.markerEfficiency}><Input name="markerEfficiency" type="number" min="0" max="100" step="0.01" /></Field><Field label={copy.notes}><TextArea name="notes" /></Field>
              <div className="md:col-span-2"><Button type="submit" disabled={submitting}>{copy.update}</Button></div>
            </form>
          </ModuleSection> : null}
          <ModuleSection title={copy.cutting} count={(data.cuttingPlans || []).length}><div className="grid gap-3">{(data.cuttingPlans || []).map((item) => <RecordCard key={item.id} title={item.reference} subtitle={`${Number(item.cutQuantity)} / ${Number(item.plannedQuantity)} · ${copy.wasteQuantity}: ${Number(item.wasteQuantity)}`} status={item.status} locale={locale} />)}</div></ModuleSection>
        </> : null}

        {initialFocus === "TAILORING_FITTINGS" ? <>
          {data.capabilities.canWrite ? <ModuleSection title={copy.fittingNew}>
            <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={createFitting}>
              <Field label={copy.productionOrder}><NativeSelect name="productionOrderId" required items={orderChoices} /></Field><Field label={copy.measurementProfile}><NativeSelect name="measurementProfileId" items={measurementProfileChoices} /></Field>
              <Field label={copy.scheduleDate}><Input name="scheduledAt" type="datetime-local" /></Field><Field label={copy.employee}><NativeSelect name="fittedByEmployeeId" items={employeeChoices} /></Field>
              <Field label={copy.notes}><TextArea name="notes" /></Field><div className="md:col-span-2"><Button type="submit" disabled={submitting || !orderChoices.length}>{copy.create}</Button></div>
            </form>
          </ModuleSection> : null}
          {data.capabilities.canWrite && (data.fittings || []).some((item) => item.status === "SCHEDULED") ? <ModuleSection title={copy.complete}>
            <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={completeFitting}>
              <Field label={copy.fittings}><NativeSelect name="entityId" required items={fittingChoices.filter((choice) => (data.fittings || []).find((item) => item.id === choice.id)?.status === "SCHEDULED")} /></Field><Field label={copy.fittingResult}><NativeSelect name="result" required items={tailoringFittingResultChoices(locale)} /></Field>
              <Field label={copy.employee}><NativeSelect name="fittedByEmployeeId" items={employeeChoices} /></Field><Field label={copy.notes}><TextArea name="notes" /></Field>
              <div className="md:col-span-2"><Button type="submit" disabled={submitting}>{copy.complete}</Button></div>
            </form>
          </ModuleSection> : null}
          <ModuleSection title={copy.fittings} count={(data.fittings || []).length}><div className="grid gap-3">{(data.fittings || []).map((item) => <RecordCard key={item.id} title={item.reference} subtitle={`${copy.fittingResult}: ${tailoringStatusLabel(locale, item.result)}`} status={item.status} locale={locale} />)}</div></ModuleSection>
        </> : null}

        {initialFocus === "TAILORING_ALTERATIONS" ? <>
          {data.capabilities.canWrite ? <ModuleSection title={copy.alterationNew}>
            <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={createAlteration}>
              <Field label={copy.fittings}><NativeSelect name="fittingId" required items={adjustmentFittingChoices} /></Field><Field label={copy.alterationType}><NativeSelect name="alterationType" required items={tailoringAlterationTypeChoices(locale)} /></Field>
              <Field label={copy.alterationArea}><NativeSelect name="areaCode" items={tailoringAlterationAreaChoices(locale)} /></Field><Field label={copy.priority}><NativeSelect name="priority" defaultValue="NORMAL" items={priorityChoices(locale)} /></Field>
              <Field label={copy.employee}><NativeSelect name="assignedEmployeeId" items={employeeChoices} /></Field><Field label={copy.dueAt}><Input name="dueAt" type="datetime-local" /></Field>
              <Field label={copy.notes}><TextArea name="notes" /></Field><div className="md:col-span-2"><Button type="submit" disabled={submitting || !adjustmentFittingChoices.length}>{copy.create}</Button></div>
            </form>
          </ModuleSection> : null}
          {data.capabilities.canWrite && (data.alterations || []).length ? <ModuleSection title={copy.update}>
            <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={updateAlteration}>
              <Field label={copy.alterations}><NativeSelect name="entityId" required items={alterationChoices} /></Field><Field label={copy.status}><NativeSelect name="status" required items={["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((id) => ({ id, label: tailoringStatusLabel(locale, id) }))} /></Field>
              <Field label={copy.employee}><NativeSelect name="assignedEmployeeId" items={employeeChoices} /></Field><Field label={copy.dueAt}><Input name="dueAt" type="datetime-local" /></Field>
              <Field label={copy.notes}><TextArea name="notes" /></Field><div className="md:col-span-2"><Button type="submit" disabled={submitting}>{copy.update}</Button></div>
            </form>
          </ModuleSection> : null}
          <ModuleSection title={copy.alterations} count={(data.alterations || []).length}><div className="grid gap-3">{(data.alterations || []).map((item) => <RecordCard key={item.id} title={item.reference} subtitle={`${copy.alterationType}: ${tailoringAlterationTypeChoices(locale).find((choice) => choice.id === item.alterationType)?.label || item.alterationType}`} status={item.status} locale={locale} />)}</div></ModuleSection>
        </> : null}

        {initialFocus === "TAILORING_GARMENT_TRACKING" ? <>
          {data.capabilities.canWrite ? <ModuleSection title={copy.bundleNew} description={copy.deliveryHint}>
            <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={createBundle}>
              <Field label={copy.productionOrder}><NativeSelect name="productionOrderId" required items={orderChoices} /></Field><Field label={copy.cuttingPlan}><NativeSelect name="cuttingPlanId" items={cuttingPlanChoices} /></Field>
              <Field label={copy.size}><Input name="sizeCode" /></Field><Field label={copy.quantity}><Input name="quantity" type="number" min="0.001" step="0.001" required /></Field>
              <Field label={copy.workCenter}><NativeSelect name="currentWorkCenterId" items={workCenterChoices} /></Field><Field label={copy.notes}><TextArea name="notes" /></Field>
              <div className="md:col-span-2"><Button type="submit" disabled={submitting || !orderChoices.length}>{copy.create}</Button></div>
            </form>
          </ModuleSection> : null}
          {data.capabilities.canWrite && (data.garmentBundles || []).length ? <ModuleSection title={copy.update}>
            <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={updateBundle}>
              <Field label={copy.garments}><NativeSelect name="entityId" required items={bundleChoices} /></Field><Field label={copy.status}><NativeSelect name="status" required items={tailoringBundleStatusChoices(locale)} /></Field>
              <Field label={copy.workCenter}><NativeSelect name="currentWorkCenterId" items={workCenterChoices} /></Field><Field label={copy.notes}><TextArea name="notes" /></Field>
              <div className="md:col-span-2"><Button type="submit" disabled={submitting}>{copy.update}</Button></div>
            </form>
          </ModuleSection> : null}
          <ModuleSection title={copy.garments} count={(data.garmentBundles || []).length}><div className="grid gap-3">{(data.garmentBundles || []).map((item) => <RecordCard key={item.id} title={item.bundleCode} subtitle={`${copy.quantity}: ${Number(item.quantity)}${item.sizeCode ? ` · ${copy.size}: ${item.sizeCode}` : ""}`} status={item.status} locale={locale} />)}</div></ModuleSection>
        </> : null}

        {initialFocus === "TAILORING_FINISHING" ? <>
          {data.capabilities.canWrite ? <ModuleSection title={copy.finishingChecklist} description={copy.deliveryHint}>
            <form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={saveFinishing}>
              <Field label={copy.productionOrder}><NativeSelect name="productionOrderId" required items={orderChoices} /></Field><Field label={copy.garments}><NativeSelect name="garmentBundleId" required items={bundleChoices} /></Field>
              <Field label={copy.qualityCheck}><NativeSelect name="qualityCheckId" items={qualityChoices} /></Field><Field label={copy.status}><NativeSelect name="status" required defaultValue="IN_PROGRESS" items={tailoringFinishingStatusChoices(locale)} /></Field>
              <Field label={copy.employee}><NativeSelect name="completedByEmployeeId" items={employeeChoices} /></Field><Field label={copy.notes}><TextArea name="notes" /></Field>
              <div className="grid gap-3 md:col-span-2 sm:grid-cols-2 lg:grid-cols-4">
                {[["pressed", copy.pressed], ["threadTrimmed", copy.threadTrimmed], ["fasteningsChecked", copy.fasteningsChecked], ["packaged", copy.packaged]].map(([name, label]) => <label key={name} className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-semibold text-dtsc-ink"><input name={name} type="checkbox" />{label}</label>)}
              </div>
              <div className="md:col-span-2"><Button type="submit" disabled={submitting || !bundleChoices.length}>{copy.save}</Button></div>
            </form>
          </ModuleSection> : null}
          <ModuleSection title={copy.finishing} count={(data.finishingRecords || []).length}><div className="grid gap-3">{(data.finishingRecords || []).map((item) => <RecordCard key={item.id} title={item.garmentBundle.bundleCode} subtitle={`${copy.finishingChecklist}: ${[item.pressed, item.threadTrimmed, item.fasteningsChecked, item.packaged].filter(Boolean).length}/4`} status={item.status} locale={locale} />)}</div></ModuleSection>
        </> : null}

        <ProfessionalHelp moduleCode={initialFocus} />
      </ModuleContent>
    </ModuleWorkspace>
  );
}
