"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Building2, MapPin, Pencil, Plus, Warehouse } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
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

type Location = { id: string; warehouseId: string; parentLocationId: string | null; code: string; name: string; locationType: string; status: string; barcode: string | null; capacityValue: string | number | null; capacityUnit: string | null; warehouse: { id: string; code: string; name: string; site: { id: string; code: string; name: string } } };
type WarehouseItem = { id: string; siteId: string; code: string; name: string; warehouseType: string; status: string; revision: number; site: { id: string; code: string; name: string; city: string | null }; storageLocations: Location[] };
type Site = { id: string; code: string; name: string; siteType: string; city: string | null; countryCode: string | null; addressLine1: string | null; timezone: string | null; managerUserId: string | null; status: string; revision: number; warehouses: WarehouseItem[] };

const emptyParams = new URLSearchParams({ page: "1", pageSize: "200" });

export function EnterpriseSitesWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
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

  async function createSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget);
    try { await professionalMutation(`/api/enterprise/${organizationId}/sites`, { name: String(form.get("name") || ""), siteType: String(form.get("siteType") || "OFFICE"), addressLine1: String(form.get("addressLine1") || "") || null, addressLine2: String(form.get("addressLine2") || "") || null, city: String(form.get("city") || "") || null, stateProvince: String(form.get("stateProvince") || "") || null, postalCode: String(form.get("postalCode") || "") || null, countryCode: String(form.get("countryCode") || "") || null, timezone: String(form.get("timezone") || "") || null }); setDialogMode(null); setRefreshKey((value) => value + 1); } catch (error) { setMessage(error instanceof Error ? error.message : "Création impossible."); }
  }
  async function createWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget);
    try { await professionalMutation(`/api/enterprise/${organizationId}/warehouses`, { siteId: String(form.get("siteId") || ""), name: String(form.get("name") || ""), warehouseType: String(form.get("warehouseType") || "GENERAL") }); setDialogMode(null); setRefreshKey((value) => value + 1); } catch (error) { setMessage(error instanceof Error ? error.message : "Création impossible."); }
  }
  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget);
    try { await professionalMutation(`/api/enterprise/${organizationId}/storage-locations`, { warehouseId: String(form.get("warehouseId") || ""), parentLocationId: String(form.get("parentLocationId") || "") || null, name: String(form.get("name") || ""), code: String(form.get("code") || "") || undefined, locationType: String(form.get("locationType") || "STORAGE"), barcode: String(form.get("barcode") || "") || null, capacityValue: form.get("capacityValue") ? Number(form.get("capacityValue")) : null, capacityUnit: String(form.get("capacityUnit") || "") || null }); setDialogMode(null); setRefreshKey((value) => value + 1); } catch (error) { setMessage(error instanceof Error ? error.message : "Création impossible."); }
  }

  async function updateEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      let endpoint = `/api/enterprise/${organizationId}/storage-locations`;
      let payload: Record<string, unknown> = {
        locationId: edit.id,
        revision: edit.revision,
        name: String(form.get("name") || ""),
        status: String(form.get("status") || edit.status),
      };
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
      setEdit(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Modification impossible.");
    }
  }

  const hierarchySites = sites.items.filter((site) => !search.trim() || `${site.name} ${site.code} ${site.city || ""}`.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr")));
  return (
    <ModuleWorkspace>
      <ModuleHeader eyebrow={`Implantations · ${organizationName}`} title="Sites, entrepôts et emplacements" description={definition.descriptionFr} count={`${sites.pagination.total} site${sites.pagination.total > 1 ? "s" : ""}`} primaryAction={canManage ? <Button onClick={() => setDialogMode(tab === "WAREHOUSES" ? "WAREHOUSE" : tab === "LOCATIONS" ? "LOCATION" : "SITE")} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />Ajouter</Button> : undefined} />
      <ModuleMetrics label="Indicateurs des implantations"><ModuleMetric label="Sites actifs" value={sites.metrics.active || 0} /><ModuleMetric label="Entrepôts actifs" value={warehouses.metrics.active || 0} /><ModuleMetric label="Emplacements" value={locations.pagination.total || warehouses.metrics.locations || 0} /><ModuleMetric label="Hiérarchie" value="4 niveaux" hint="Entreprise → site → entrepôt → emplacement" /></ModuleMetrics>
      <ModuleToolbar search={<ProfessionalSearch value={search} onChange={setSearch} placeholder="Nom, code ou ville…" />} controls={<ProfessionalTabs value={tab} onChange={setTab} label="Navigation interne" items={[{ id: "SITES", label: "Sites", count: sites.pagination.total }, { id: "WAREHOUSES", label: "Entrepôts", count: warehouses.pagination.total }, { id: "LOCATIONS", label: "Emplacements", count: locations.pagination.total }, { id: "HIERARCHY", label: "Vue hiérarchique" }]} />} />
      <ModuleContent>
        <ModuleSection title={tab === "SITES" ? "Sites et agences" : tab === "WAREHOUSES" ? "Entrepôts" : tab === "LOCATIONS" ? "Zones et emplacements" : "Hiérarchie opérationnelle"} description="Toutes les références croisées sont filtrées par l’entreprise active. La vue mobile utilise une liste imbriquée sans arbre horizontal.">
          {sites.error || warehouses.error || locations.error ? <ProfessionalError message={sites.error || warehouses.error || locations.error} /> : sites.loading || warehouses.loading || locations.loading ? <ProfessionalLoading /> : tab === "SITES" ? (
            sites.items.length ? <BusinessList ariaLabel="Sites">{sites.items.map((site) => <BusinessListItem key={site.id} title={site.name} leading={<Building2 className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={site.status === "ACTIVE" ? "success" : "neutral"}>{site.status === "ACTIVE" ? "Actif" : "Inactif"}</StatusBadge>} meta={`${site.code} · ${site.siteType}`} description={[site.addressLine1, site.city, site.countryCode].filter(Boolean).join(" · ") || "Adresse à compléter"} onOpen={() => setDetail(site)} openLabel={`Ouvrir ${site.name}`} actions={<StatusBadge>{site.warehouses.length} entrepôt{site.warehouses.length > 1 ? "s" : ""}</StatusBadge>} />)}</BusinessList> : <EmptyState title="Aucun site" description="Créez le siège, une agence, un bureau ou un point d’exploitation." />
          ) : tab === "WAREHOUSES" ? (
            warehouses.items.length ? <BusinessList ariaLabel="Entrepôts">{warehouses.items.map((warehouse) => <BusinessListItem key={warehouse.id} title={warehouse.name} leading={<Warehouse className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={warehouse.status === "ACTIVE" ? "success" : "neutral"}>{warehouse.status === "ACTIVE" ? "Actif" : "Inactif"}</StatusBadge>} meta={`${warehouse.code} · ${warehouse.warehouseType}`} description={`${warehouse.site.name}${warehouse.site.city ? ` · ${warehouse.site.city}` : ""}`} onOpen={() => setDetail(warehouse)} openLabel={`Ouvrir ${warehouse.name}`} actions={<StatusBadge>{warehouse.storageLocations.length} emplacement{warehouse.storageLocations.length > 1 ? "s" : ""}</StatusBadge>} />)}</BusinessList> : <EmptyState title="Aucun entrepôt" description="Un entrepôt doit être rattaché à un site actif." />
          ) : tab === "LOCATIONS" ? (
            locations.items.length ? <BusinessList ariaLabel="Emplacements">{locations.items.filter((location) => !search.trim() || `${location.name} ${location.code} ${location.warehouse.name}`.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr"))).map((location) => <BusinessListItem key={location.id} title={location.name} leading={<MapPin className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={location.status === "ACTIVE" ? "success" : "neutral"}>{location.locationType}</StatusBadge>} meta={`${location.code} · ${location.warehouse.site.name} → ${location.warehouse.name}`} description={location.capacityValue != null ? `Capacité ${location.capacityValue} ${location.capacityUnit || ""}` : location.barcode || "Capacité non définie"} onOpen={() => setDetail(location)} openLabel={`Ouvrir ${location.name}`} />)}</BusinessList> : <EmptyState title="Aucun emplacement" description="Créez une zone, une allée, un rayon ou un emplacement dans un entrepôt." />
          ) : (
            hierarchySites.length ? <div className="grid gap-3">{hierarchySites.map((site) => <details key={site.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface px-4 py-3" open><summary className="cursor-pointer list-none font-black text-dtsc-ink">Entreprise → {site.name} <span className="ml-2 text-xs text-dtsc-muted">{site.code}</span></summary><div className="mt-3 grid gap-2 border-l-2 border-dtsc-border pl-3">{warehouses.items.filter((warehouse) => warehouse.siteId === site.id).map((warehouse) => <details key={warehouse.id} className="rounded-lg bg-dtsc-page px-3 py-2"><summary className="cursor-pointer list-none text-sm font-black">Entrepôt → {warehouse.name}</summary><div className="mt-2 grid gap-1 border-l border-dtsc-border pl-3">{locations.items.filter((location) => location.warehouseId === warehouse.id).map((location) => <button type="button" key={location.id} onClick={() => setDetail(location)} className="min-h-10 rounded-lg px-2 text-left text-sm hover:bg-dtsc-soft">Emplacement → {location.name} <span className="text-dtsc-muted">({location.code})</span></button>)}{!locations.items.some((location) => location.warehouseId === warehouse.id) ? <p className="py-2 text-xs text-dtsc-muted">Aucun emplacement configuré.</p> : null}</div></details>)}{!warehouses.items.some((warehouse) => warehouse.siteId === site.id) ? <p className="py-2 text-xs text-dtsc-muted">Aucun entrepôt configuré.</p> : null}</div></details>)}</div> : <EmptyState title="Hiérarchie vide" description="Commencez par créer un site." />
          )}
        </ModuleSection>
        <ModuleSection title="Première configuration" description="Créez un site, rattachez un entrepôt puis structurez ses emplacements."><ProfessionalHelp moduleCode="SITES_WAREHOUSES" /></ModuleSection>
      </ModuleContent>

      <Dialog open={dialogMode === "SITE"} onClose={() => setDialogMode(null)} title="Nouveau site" description="Siège, agence, bureau ou autre implantation de l’entreprise." className="h-[94dvh] max-w-4xl"><form onSubmit={createSite} className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title="Identité du site"><Field label="Nom"><Input name="name" required /></Field><Field label="Type"><NativeSelect name="siteType" defaultValue="OFFICE" items={[{ id: "HEADQUARTERS", label: "Siège" }, { id: "OFFICE", label: "Bureau" }, { id: "BRANCH", label: "Agence" }, { id: "STORE", label: "Point de vente" }, { id: "PLANT", label: "Site de production" }, { id: "OTHER", label: "Autre" }]} /></Field></ProfessionalFormSection><ProfessionalFormSection title="Adresse"><Field label="Adresse"><Input name="addressLine1" /></Field><Field label="Complément"><Input name="addressLine2" /></Field><Field label="Ville"><Input name="city" /></Field><Field label="Province / région"><Input name="stateProvince" /></Field><Field label="Code postal"><Input name="postalCode" /></Field><Field label="Pays (code)"><Input name="countryCode" maxLength={3} /></Field><Field label="Fuseau horaire"><Input name="timezone" placeholder="Africa/Kinshasa" /></Field></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setDialogMode(null)}>Annuler</Button><Button type="submit" className="bg-dtsc-blue text-white">Créer le site</Button></div></form></Dialog>
      <Dialog open={dialogMode === "WAREHOUSE"} onClose={() => setDialogMode(null)} title="Nouvel entrepôt" className="h-[90dvh] max-w-3xl"><form onSubmit={createWarehouse} className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title="Rattachement"><Field label="Site"><NativeSelect name="siteId" required items={sites.items.map((site) => ({ id: site.id, label: `${site.name} · ${site.code}` }))} /></Field><Field label="Nom"><Input name="name" required /></Field><Field label="Type"><NativeSelect name="warehouseType" defaultValue="GENERAL" items={[{ id: "GENERAL", label: "Général" }, { id: "RETAIL", label: "Point de vente" }, { id: "TRANSIT", label: "Transit" }, { id: "SECURE", label: "Sécurisé" }, { id: "COLD", label: "Froid" }]} /></Field></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setDialogMode(null)}>Annuler</Button><Button type="submit" disabled={!sites.items.length} className="bg-dtsc-blue text-white">Créer l’entrepôt</Button></div></form></Dialog>
      <Dialog open={dialogMode === "LOCATION"} onClose={() => setDialogMode(null)} title="Nouvel emplacement" description="La hiérarchie reste rattachée à un seul entrepôt et à la même entreprise." className="h-[94dvh] max-w-4xl"><form onSubmit={createLocation} className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title="Hiérarchie"><Field label="Entrepôt"><NativeSelect name="warehouseId" required items={warehouses.items.map((warehouse) => ({ id: warehouse.id, label: `${warehouse.site.name} → ${warehouse.name}` }))} /></Field><Field label="Emplacement parent"><NativeSelect name="parentLocationId" items={[{ id: "", label: "Aucun" }, ...locations.items.map((location) => ({ id: location.id, label: `${location.warehouse.name} → ${location.name}` }))]} /></Field></ProfessionalFormSection><ProfessionalFormSection title="Identification"><Field label="Nom"><Input name="name" required /></Field><Field label="Code"><Input name="code" /></Field><Field label="Type"><NativeSelect name="locationType" defaultValue="STORAGE" items={[{ id: "ZONE", label: "Zone" }, { id: "AISLE", label: "Allée" }, { id: "RACK", label: "Rayon" }, { id: "BIN", label: "Bac" }, { id: "STORAGE", label: "Stockage" }]} /></Field><Field label="Code-barres"><Input name="barcode" /></Field><Field label="Capacité"><Input name="capacityValue" type="number" min="0" step="0.001" /></Field><Field label="Unité de capacité"><Input name="capacityUnit" placeholder="m³, palettes, unités…" /></Field></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setDialogMode(null)}>Annuler</Button><Button type="submit" disabled={!warehouses.items.length} className="bg-dtsc-blue text-white">Créer l’emplacement</Button></div></form></Dialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail && "name" in detail ? detail.name : "Détail"} className="h-[94dvh] max-w-5xl">{detail ? <div className="grid gap-5"><div className="grid gap-4 md:grid-cols-2">{"siteType" in detail ? <><Info title="Référence" value={detail.code} /><Info title="Type" value={detail.siteType} /><Info title="Adresse" value={[detail.addressLine1, detail.city, detail.countryCode].filter(Boolean).join(" · ") || "Non renseignée"} /><Info title="Entrepôts" value={String(detail.warehouses.length)} /></> : "warehouseType" in detail ? <><Info title="Référence" value={detail.code} /><Info title="Site" value={detail.site.name} /><Info title="Type" value={detail.warehouseType} /><Info title="Emplacements" value={String(detail.storageLocations.length)} /></> : <><Info title="Référence" value={detail.code} /><Info title="Entrepôt" value={`${detail.warehouse.site.name} → ${detail.warehouse.name}`} /><Info title="Type" value={detail.locationType} /><Info title="Capacité" value={detail.capacityValue != null ? `${detail.capacityValue} ${detail.capacityUnit || ""}` : "Non définie"} /></>}</div><ModuleSection title="Historique et opérations liées"><div className="border-y border-dtsc-border py-4 text-sm text-dtsc-muted">Les mouvements de stock, actifs et opérations associés restent consultables dans leurs modules dédiés, sans exposer d’identifiant technique.</div></ModuleSection>{canManage ? <div className="flex justify-end"><Button variant="outline" onClick={() => setEdit(detail)}><Pencil className="h-4 w-4" />Modifier</Button></div> : null}</div> : null}</Dialog>
      <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title={edit && "name" in edit ? `Modifier ${edit.name}` : "Modifier"} className="h-[92dvh] max-w-4xl">{edit ? <form onSubmit={updateEntity} className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title="Informations professionnelles"><Field label="Nom"><Input name="name" required defaultValue={edit.name} /></Field>{"siteType" in edit ? <><Field label="Type"><NativeSelect name="siteType" defaultValue={edit.siteType} items={[{ id: "HEADQUARTERS", label: "Siège" }, { id: "OFFICE", label: "Bureau" }, { id: "BRANCH", label: "Agence" }, { id: "STORE", label: "Point de vente" }, { id: "PLANT", label: "Site de production" }, { id: "OTHER", label: "Autre" }]} /></Field><Field label="Adresse"><Input name="addressLine1" defaultValue={edit.addressLine1 || ""} /></Field><Field label="Ville"><Input name="city" defaultValue={edit.city || ""} /></Field><Field label="Pays"><Input name="countryCode" maxLength={3} defaultValue={edit.countryCode || ""} /></Field><Field label="Fuseau horaire"><Input name="timezone" defaultValue={edit.timezone || ""} /></Field></> : "warehouseType" in edit ? <Field label="Type"><NativeSelect name="warehouseType" defaultValue={edit.warehouseType} items={[{ id: "GENERAL", label: "Général" }, { id: "RETAIL", label: "Point de vente" }, { id: "TRANSIT", label: "Transit" }, { id: "SECURE", label: "Sécurisé" }, { id: "COLD", label: "Froid" }]} /></Field> : <><Field label="Type"><NativeSelect name="locationType" defaultValue={edit.locationType} items={[{ id: "ZONE", label: "Zone" }, { id: "AISLE", label: "Allée" }, { id: "RACK", label: "Rayon" }, { id: "BIN", label: "Bac" }, { id: "STORAGE", label: "Stockage" }]} /></Field><Field label="Code-barres"><Input name="barcode" defaultValue={edit.barcode || ""} /></Field><Field label="Capacité"><Input name="capacityValue" type="number" min="0" step="0.001" defaultValue={edit.capacityValue == null ? "" : String(edit.capacityValue)} /></Field><Field label="Unité de capacité"><Input name="capacityUnit" defaultValue={edit.capacityUnit || ""} /></Field></>}<Field label="Statut"><NativeSelect name="status" defaultValue={edit.status} items={[{ id: "ACTIVE", label: "Actif" }, { id: "INACTIVE", label: "Inactif / archivé logiquement" }]} /></Field></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setEdit(null)}>Annuler</Button><Button type="submit" className="bg-dtsc-blue text-white">Enregistrer les modifications</Button></div></form> : null}</Dialog>

    </ModuleWorkspace>
  );
}
function Info({ title, value }: { title: string; value: string }) { return <div className="border-y border-dtsc-border py-3"><p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{title}</p><p className="mt-1 break-words text-sm font-bold text-dtsc-ink">{value}</p></div>; }
