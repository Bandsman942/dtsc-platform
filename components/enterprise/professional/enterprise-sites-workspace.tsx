"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Building2, MapPin, Pencil, Plus, Warehouse } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  professionalErpEnumLabel,
  professionalErpT,
  useProfessionalErpLocale,
} from "@/components/enterprise/professional/professional-erp-i18n";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalSearch,
  ProfessionalTabs,
  professionalMutation,
  useProfessionalCollection,
} from "@/components/enterprise/professional/professional-erp-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Location = { id: string; warehouseId: string; parentLocationId: string | null; code: string; name: string; locationType: string; status: string; revision: number; barcode: string | null; capacityValue: string | number | null; capacityUnit: string | null; warehouse: { id: string; code: string; name: string; site: { id: string; code: string; name: string } } };
type WarehouseItem = { id: string; siteId: string; code: string; name: string; warehouseType: string; status: string; revision: number; site: { id: string; code: string; name: string; city: string | null }; storageLocations: Location[] };
type Site = { id: string; code: string; name: string; siteType: string; city: string | null; countryCode: string | null; addressLine1: string | null; timezone: string | null; managerUserId: string | null; status: string; revision: number; warehouses: WarehouseItem[] };

const emptyParams = new URLSearchParams({ page: "1", pageSize: "200" });
const SITE_TYPES = ["HEADQUARTERS", "OFFICE", "BRANCH", "STORE", "PLANT", "OTHER"];
const WAREHOUSE_TYPES = ["GENERAL", "RETAIL", "TRANSIT", "SECURE", "COLD"];
const LOCATION_TYPES = ["ZONE", "AISLE", "RACK", "BIN", "STORAGE"];

export function EnterpriseSitesWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const suffix = (count: number) => (count === 1 ? "" : "s");
  const [tab, setTab] = useState("SITES");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialogMode, setDialogMode] = useState<"SITE" | "WAREHOUSE" | "LOCATION" | null>(null);
  const [detail, setDetail] = useState<Site | WarehouseItem | Location | null>(null);
  const [edit, setEdit] = useState<Site | WarehouseItem | Location | null>(null);
  const [message, setMessage] = useState("");
  const siteParams = useMemo(() => { const value = new URLSearchParams({ page: "1", pageSize: "100" }); if (search.trim() && tab === "SITES") value.set("search", search.trim()); return value; }, [search, tab]);
  const warehouseParams = useMemo(() => { const value = new URLSearchParams({ page: "1", pageSize: "100" }); if (search.trim() && tab === "WAREHOUSES") value.set("search", search.trim()); return value; }, [search, tab]);
  const sites = useProfessionalCollection<Site>({ endpoint: `/api/enterprise/${organizationId}/sites`, params: siteParams, refreshKey });
  const warehouses = useProfessionalCollection<WarehouseItem>({ endpoint: `/api/enterprise/${organizationId}/warehouses`, params: warehouseParams, refreshKey });
  const locations = useProfessionalCollection<Location>({ endpoint: `/api/enterprise/${organizationId}/storage-locations`, params: emptyParams, refreshKey });
  const canManage = sites.canManage || warehouses.canManage || locations.canManage;
  const siteTypeItems = SITE_TYPES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "siteType", id) }));
  const warehouseTypeItems = WAREHOUSE_TYPES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "warehouseType", id) }));
  const locationTypeItems = LOCATION_TYPES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "locationType", id) }));
  const statusItems = ["ACTIVE", "INACTIVE"].map((id) => ({ id, label: id === "INACTIVE" ? t("sites.inactiveArchived") : professionalErpEnumLabel(locale, "siteStatus", id) }));

  async function createSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget);
    try { await professionalMutation(`/api/enterprise/${organizationId}/sites`, { name: String(form.get("name") || ""), siteType: String(form.get("siteType") || "OFFICE"), addressLine1: String(form.get("addressLine1") || "") || null, addressLine2: String(form.get("addressLine2") || "") || null, city: String(form.get("city") || "") || null, stateProvince: String(form.get("stateProvince") || "") || null, postalCode: String(form.get("postalCode") || "") || null, countryCode: String(form.get("countryCode") || "") || null, timezone: String(form.get("timezone") || "") || null }); setDialogMode(null); setRefreshKey((value) => value + 1); } catch (error) { setMessage(error instanceof Error ? error.message : t("common.createFailed")); }
  }
  async function createWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget);
    try { await professionalMutation(`/api/enterprise/${organizationId}/warehouses`, { siteId: String(form.get("siteId") || ""), name: String(form.get("name") || ""), warehouseType: String(form.get("warehouseType") || "GENERAL") }); setDialogMode(null); setRefreshKey((value) => value + 1); } catch (error) { setMessage(error instanceof Error ? error.message : t("common.createFailed")); }
  }
  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget);
    try { await professionalMutation(`/api/enterprise/${organizationId}/storage-locations`, { warehouseId: String(form.get("warehouseId") || ""), parentLocationId: String(form.get("parentLocationId") || "") || null, name: String(form.get("name") || ""), code: String(form.get("code") || "") || undefined, locationType: String(form.get("locationType") || "STORAGE"), barcode: String(form.get("barcode") || "") || null, capacityValue: form.get("capacityValue") ? Number(form.get("capacityValue")) : null, capacityUnit: String(form.get("capacityUnit") || "") || null }); setDialogMode(null); setRefreshKey((value) => value + 1); } catch (error) { setMessage(error instanceof Error ? error.message : t("common.createFailed")); }
  }

  async function updateEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      let endpoint = `/api/enterprise/${organizationId}/storage-locations`;
      let payload: Record<string, unknown> = { locationId: edit.id, revision: edit.revision, name: String(form.get("name") || ""), status: String(form.get("status") || edit.status) };
      if ("siteType" in edit) {
        endpoint = `/api/enterprise/${organizationId}/sites`;
        payload = { siteId: edit.id, revision: edit.revision, name: String(form.get("name") || ""), siteType: String(form.get("siteType") || edit.siteType), addressLine1: String(form.get("addressLine1") || "") || null, city: String(form.get("city") || "") || null, countryCode: String(form.get("countryCode") || "") || null, timezone: String(form.get("timezone") || "") || null, status: String(form.get("status") || edit.status) };
      } else if ("warehouseType" in edit) {
        endpoint = `/api/enterprise/${organizationId}/warehouses`;
        payload = { warehouseId: edit.id, revision: edit.revision, name: String(form.get("name") || ""), warehouseType: String(form.get("warehouseType") || edit.warehouseType), status: String(form.get("status") || edit.status) };
      } else {
        payload = { locationId: edit.id, revision: edit.revision, name: String(form.get("name") || ""), locationType: String(form.get("locationType") || edit.locationType), barcode: String(form.get("barcode") || "") || null, capacityValue: form.get("capacityValue") ? Number(form.get("capacityValue")) : null, capacityUnit: String(form.get("capacityUnit") || "") || null, status: String(form.get("status") || edit.status) };
      }
      await professionalMutation(endpoint, payload, "PATCH");
      setEdit(null); setDetail(null); setRefreshKey((value) => value + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.updateFailed")); }
  }

  const languageTag = locale === "en" ? "en" : "fr";
  const hierarchySites = sites.items.filter((site) => !search.trim() || `${site.name} ${site.code} ${site.city || ""}`.toLocaleLowerCase(languageTag).includes(search.toLocaleLowerCase(languageTag)));
  return (
    <ModuleWorkspace>
      <ModuleHeader eyebrow={t("sites.eyebrow", { organization: organizationName })} title={t("sites.title")} description={locale === "en" ? definition.descriptionEn : definition.descriptionFr} count={t("sites.count", { count: sites.pagination.total, suffix: suffix(sites.pagination.total) })} primaryAction={canManage ? <Button onClick={() => setDialogMode(tab === "WAREHOUSES" ? "WAREHOUSE" : tab === "LOCATIONS" ? "LOCATION" : "SITE")} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{t("sites.add")}</Button> : undefined} />
      <ModuleMetrics label={t("sites.metrics")}><ModuleMetric label={t("sites.activeSites")} value={sites.metrics.active || 0} /><ModuleMetric label={t("sites.activeWarehouses")} value={warehouses.metrics.active || 0} /><ModuleMetric label={t("sites.locations")} value={locations.pagination.total || warehouses.metrics.locations || 0} /><ModuleMetric label={t("sites.hierarchy")} value={t("sites.fourLevels")} hint={t("sites.hierarchyHint")} /></ModuleMetrics>
      <ModuleToolbar search={<ProfessionalSearch value={search} onChange={setSearch} placeholder={t("sites.search")} />} controls={<ProfessionalTabs value={tab} onChange={setTab} label={t("sites.navigation")} items={[{ id: "SITES", label: t("sites.tabSites"), count: sites.pagination.total }, { id: "WAREHOUSES", label: t("sites.tabWarehouses"), count: warehouses.pagination.total }, { id: "LOCATIONS", label: t("sites.tabLocations"), count: locations.pagination.total }, { id: "HIERARCHY", label: t("sites.tabHierarchy") }]} />} />
      <ModuleContent>
        <ModuleSection title={tab === "SITES" ? t("sites.sectionSites") : tab === "WAREHOUSES" ? t("sites.sectionWarehouses") : tab === "LOCATIONS" ? t("sites.sectionLocations") : t("sites.sectionHierarchy")} description={t("sites.sectionDescription")}>
          {sites.error || warehouses.error || locations.error ? <ProfessionalError message={sites.error || warehouses.error || locations.error} /> : sites.loading || warehouses.loading || locations.loading ? <ProfessionalLoading /> : tab === "SITES" ? (
            sites.items.length ? <BusinessList ariaLabel={t("sites.tabSites")}>{sites.items.map((site) => <BusinessListItem key={site.id} title={site.name} leading={<Building2 className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={site.status === "ACTIVE" ? "success" : "neutral"}>{professionalErpEnumLabel(locale, "siteStatus", site.status)}</StatusBadge>} meta={`${site.code} · ${professionalErpEnumLabel(locale, "siteType", site.siteType)}`} description={[site.addressLine1, site.city, site.countryCode].filter(Boolean).join(" · ") || t("sites.addressToComplete")} onOpen={() => setDetail(site)} openLabel={t("sites.open", { name: site.name })} actions={<StatusBadge>{t("sites.warehouseCount", { count: site.warehouses.length, suffix: suffix(site.warehouses.length) })}</StatusBadge>} />)}</BusinessList> : <EmptyState title={t("sites.noSite")} description={t("sites.noSiteDescription")} />
          ) : tab === "WAREHOUSES" ? (
            warehouses.items.length ? <BusinessList ariaLabel={t("sites.tabWarehouses")}>{warehouses.items.map((warehouse) => <BusinessListItem key={warehouse.id} title={warehouse.name} leading={<Warehouse className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={warehouse.status === "ACTIVE" ? "success" : "neutral"}>{professionalErpEnumLabel(locale, "siteStatus", warehouse.status)}</StatusBadge>} meta={`${warehouse.code} · ${professionalErpEnumLabel(locale, "warehouseType", warehouse.warehouseType)}`} description={`${warehouse.site.name}${warehouse.site.city ? ` · ${warehouse.site.city}` : ""}`} onOpen={() => setDetail(warehouse)} openLabel={t("sites.open", { name: warehouse.name })} actions={<StatusBadge>{t("sites.locationCount", { count: warehouse.storageLocations.length, suffix: suffix(warehouse.storageLocations.length) })}</StatusBadge>} />)}</BusinessList> : <EmptyState title={t("sites.noWarehouse")} description={t("sites.noWarehouseDescription")} />
          ) : tab === "LOCATIONS" ? (
            locations.items.length ? <BusinessList ariaLabel={t("sites.tabLocations")}>{locations.items.filter((location) => !search.trim() || `${location.name} ${location.code} ${location.warehouse.name}`.toLocaleLowerCase(languageTag).includes(search.toLocaleLowerCase(languageTag))).map((location) => <BusinessListItem key={location.id} title={location.name} leading={<MapPin className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={location.status === "ACTIVE" ? "success" : "neutral"}>{professionalErpEnumLabel(locale, "locationType", location.locationType)}</StatusBadge>} meta={`${location.code} · ${location.warehouse.site.name} → ${location.warehouse.name}`} description={location.capacityValue != null ? t("sites.capacity", { value: `${location.capacityValue} ${location.capacityUnit || ""}`.trim() }) : location.barcode || t("sites.capacityUndefined")} onOpen={() => setDetail(location)} openLabel={t("sites.open", { name: location.name })} />)}</BusinessList> : <EmptyState title={t("sites.noLocation")} description={t("sites.noLocationDescription")} />
          ) : (
            hierarchySites.length ? <div className="grid gap-3">{hierarchySites.map((site) => <details key={site.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface px-4 py-3" open><summary className="cursor-pointer list-none font-black text-dtsc-ink">{t("sites.companyNode", { name: site.name })} <span className="ml-2 text-xs text-dtsc-muted">{site.code}</span></summary><div className="mt-3 grid gap-2 border-l-2 border-dtsc-border pl-3">{warehouses.items.filter((warehouse) => warehouse.siteId === site.id).map((warehouse) => <details key={warehouse.id} className="rounded-lg bg-dtsc-page px-3 py-2"><summary className="cursor-pointer list-none text-sm font-black">{t("sites.warehouseNode", { name: warehouse.name })}</summary><div className="mt-2 grid gap-1 border-l border-dtsc-border pl-3">{locations.items.filter((location) => location.warehouseId === warehouse.id).map((location) => <button type="button" key={location.id} onClick={() => setDetail(location)} className="min-h-10 rounded-lg px-2 text-left text-sm hover:bg-dtsc-soft">{t("sites.locationNode", { name: location.name })} <span className="text-dtsc-muted">({location.code})</span></button>)}{!locations.items.some((location) => location.warehouseId === warehouse.id) ? <p className="py-2 text-xs text-dtsc-muted">{t("sites.noConfiguredLocation")}</p> : null}</div></details>)}{!warehouses.items.some((warehouse) => warehouse.siteId === site.id) ? <p className="py-2 text-xs text-dtsc-muted">{t("sites.noConfiguredWarehouse")}</p> : null}</div></details>)}</div> : <EmptyState title={t("sites.emptyHierarchy")} description={t("sites.emptyHierarchyDescription")} />
          )}
        </ModuleSection>
        <ModuleSection title={t("sites.firstConfiguration")} description={t("sites.firstConfigurationDescription")}><ProfessionalHelp moduleCode="SITES_WAREHOUSES" /></ModuleSection>
      </ModuleContent>

      <Dialog open={dialogMode === "SITE"} onClose={() => setDialogMode(null)} title={t("sites.newSite")} description={t("sites.newSiteDescription")} className="h-[94dvh] max-w-4xl"><form onSubmit={createSite} className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title={t("sites.siteIdentity")}><Field label={t("sites.name")}><Input name="name" required /></Field><Field label={t("sites.type")}><NativeSelect name="siteType" defaultValue="OFFICE" items={siteTypeItems} /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("sites.address")}><Field label={t("sites.address")}><Input name="addressLine1" /></Field><Field label={t("sites.addressComplement")}><Input name="addressLine2" /></Field><Field label={t("sites.city")}><Input name="city" /></Field><Field label={t("sites.region")}><Input name="stateProvince" /></Field><Field label={t("sites.postalCode")}><Input name="postalCode" /></Field><Field label={t("sites.countryCode")}><Input name="countryCode" maxLength={3} /></Field><Field label={t("sites.timezone")}><Input name="timezone" placeholder="Africa/Kinshasa" /></Field></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setDialogMode(null)}>{t("common.cancel")}</Button><Button type="submit" className="bg-dtsc-blue text-white">{t("sites.createSite")}</Button></div></form></Dialog>
      <Dialog open={dialogMode === "WAREHOUSE"} onClose={() => setDialogMode(null)} title={t("sites.newWarehouse")} className="h-[90dvh] max-w-3xl"><form onSubmit={createWarehouse} className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title={t("sites.attachment")}><Field label={t("sites.site")}><NativeSelect name="siteId" required items={sites.items.map((site) => ({ id: site.id, label: `${site.name} · ${site.code}` }))} /></Field><Field label={t("sites.name")}><Input name="name" required /></Field><Field label={t("sites.type")}><NativeSelect name="warehouseType" defaultValue="GENERAL" items={warehouseTypeItems} /></Field></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setDialogMode(null)}>{t("common.cancel")}</Button><Button type="submit" disabled={!sites.items.length} className="bg-dtsc-blue text-white">{t("sites.createWarehouse")}</Button></div></form></Dialog>
      <Dialog open={dialogMode === "LOCATION"} onClose={() => setDialogMode(null)} title={t("sites.newLocation")} description={t("sites.newLocationDescription")} className="h-[94dvh] max-w-4xl"><form onSubmit={createLocation} className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title={t("sites.hierarchy")}><Field label={t("sites.tabWarehouses")}><NativeSelect name="warehouseId" required items={warehouses.items.map((warehouse) => ({ id: warehouse.id, label: `${warehouse.site.name} → ${warehouse.name}` }))} /></Field><Field label={t("sites.parentLocation")}><NativeSelect name="parentLocationId" items={[{ id: "", label: t("projects.none") }, ...locations.items.map((location) => ({ id: location.id, label: `${location.warehouse.name} → ${location.name}` }))]} /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("sites.identification")}><Field label={t("sites.name")}><Input name="name" required /></Field><Field label={t("sites.code")}><Input name="code" /></Field><Field label={t("sites.type")}><NativeSelect name="locationType" defaultValue="STORAGE" items={locationTypeItems} /></Field><Field label={t("sites.barcode")}><Input name="barcode" /></Field><Field label={t("sites.capacityLabel")}><Input name="capacityValue" type="number" min="0" step="0.001" /></Field><Field label={t("sites.capacityUnit")}><Input name="capacityUnit" placeholder={locale === "en" ? "m³, pallets, units…" : "m³, palettes, unités…"} /></Field></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setDialogMode(null)}>{t("common.cancel")}</Button><Button type="submit" disabled={!warehouses.items.length} className="bg-dtsc-blue text-white">{t("sites.createLocation")}</Button></div></form></Dialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail && "name" in detail ? detail.name : t("common.details")} className="h-[94dvh] max-w-5xl">{detail ? <div className="grid gap-5"><div className="grid gap-4 md:grid-cols-2">{"siteType" in detail ? <><Info title={t("sites.reference")} value={detail.code} /><Info title={t("sites.type")} value={professionalErpEnumLabel(locale, "siteType", detail.siteType)} /><Info title={t("sites.address")} value={[detail.addressLine1, detail.city, detail.countryCode].filter(Boolean).join(" · ") || t("sites.notProvided")} /><Info title={t("sites.tabWarehouses")} value={String(detail.warehouses.length)} /></> : "warehouseType" in detail ? <><Info title={t("sites.reference")} value={detail.code} /><Info title={t("sites.site")} value={detail.site.name} /><Info title={t("sites.type")} value={professionalErpEnumLabel(locale, "warehouseType", detail.warehouseType)} /><Info title={t("sites.locations")} value={String(detail.storageLocations.length)} /></> : <><Info title={t("sites.reference")} value={detail.code} /><Info title={t("sites.tabWarehouses")} value={`${detail.warehouse.site.name} → ${detail.warehouse.name}`} /><Info title={t("sites.type")} value={professionalErpEnumLabel(locale, "locationType", detail.locationType)} /><Info title={t("sites.capacityLabel")} value={detail.capacityValue != null ? `${detail.capacityValue} ${detail.capacityUnit || ""}` : t("sites.capacityUndefined")} /></>}</div><ModuleSection title={t("sites.relatedHistory")}><div className="border-y border-dtsc-border py-4 text-sm text-dtsc-muted">{t("sites.relatedHistoryDescription")}</div></ModuleSection>{canManage ? <div className="flex justify-end"><Button variant="outline" onClick={() => setEdit(detail)}><Pencil className="h-4 w-4" />{t("sites.edit")}</Button></div> : null}</div> : null}</Dialog>
      <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title={edit && "name" in edit ? t("sites.editTitle", { name: edit.name }) : t("sites.edit")} className="h-[92dvh] max-w-4xl">{edit ? <form onSubmit={updateEntity} className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title={t("sites.professionalInformation")}><Field label={t("sites.name")}><Input name="name" required defaultValue={edit.name} /></Field>{"siteType" in edit ? <><Field label={t("sites.type")}><NativeSelect name="siteType" defaultValue={edit.siteType} items={siteTypeItems} /></Field><Field label={t("sites.address")}><Input name="addressLine1" defaultValue={edit.addressLine1 || ""} /></Field><Field label={t("sites.city")}><Input name="city" defaultValue={edit.city || ""} /></Field><Field label={t("sites.country")}><Input name="countryCode" maxLength={3} defaultValue={edit.countryCode || ""} /></Field><Field label={t("sites.timezone")}><Input name="timezone" defaultValue={edit.timezone || ""} /></Field></> : "warehouseType" in edit ? <Field label={t("sites.type")}><NativeSelect name="warehouseType" defaultValue={edit.warehouseType} items={warehouseTypeItems} /></Field> : <><Field label={t("sites.type")}><NativeSelect name="locationType" defaultValue={edit.locationType} items={locationTypeItems} /></Field><Field label={t("sites.barcode")}><Input name="barcode" defaultValue={edit.barcode || ""} /></Field><Field label={t("sites.capacityLabel")}><Input name="capacityValue" type="number" min="0" step="0.001" defaultValue={edit.capacityValue == null ? "" : String(edit.capacityValue)} /></Field><Field label={t("sites.capacityUnit")}><Input name="capacityUnit" defaultValue={edit.capacityUnit || ""} /></Field></>}<Field label={t("sites.status")}><NativeSelect name="status" defaultValue={edit.status} items={statusItems} /></Field></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setEdit(null)}>{t("common.cancel")}</Button><Button type="submit" className="bg-dtsc-blue text-white">{t("sites.saveChanges")}</Button></div></form> : null}</Dialog>
    </ModuleWorkspace>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return <div className="border-y border-dtsc-border py-3"><p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{title}</p><p className="mt-1 break-words text-sm font-bold text-dtsc-ink">{value}</p></div>;
}
