"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Monitor, Plus, RefreshCw, Search, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { customerFacingDeviceType, customerFacingError } from "@/lib/customer-facing-language";
import { detectRetailBrowserDeviceCapabilities, evaluateRetailDeviceAvailability } from "@/lib/enterprise/retail/device-capabilities";

type Device = {
  id: string; code: string; name: string; siteId: string | null;
  deviceType: string; connectionMode: string; status: string;
  lastSeenAt: string | null; createdAt: string; updatedAt: string;
};
type Pagination = { page: number; pageSize: number; pageCount: number; total: number };
type DeviceResponse = { items: Device[]; pagination: Pagination; canManage: boolean };
type Site = { id: string; name: string };
type Props = { organizationId: string; locale?: "fr" | "en" };
type Form = { code: string; name: string; siteId: string; deviceType: string; connectionMode: string; status: "ACTIVE" | "DISABLED" };
const deviceTypes = ["BARCODE_SCANNER", "RECEIPT_PRINTER", "CASH_DRAWER", "PAYMENT_TERMINAL", "CUSTOMER_DISPLAY", "SCALE"] as const;
const connectionModes = ["BROWSER", "WEBUSB", "WEBBLUETOOTH", "WEBSERIAL", "NETWORK", "NATIVE_BRIDGE", "MANUAL"] as const;
const emptyForm: Form = { code: "", name: "", siteId: "", deviceType: "RECEIPT_PRINTER", connectionMode: "BROWSER", status: "ACTIVE" };

export function RetailDeviceReadiness({ organizationId, locale = "fr" }: Props) {
  const en = locale === "en";
  const [data, setData] = useState<DeviceResponse | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [siteId, setSiteId] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const capabilities = useMemo(() => detectRetailBrowserDeviceCapabilities(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: "12" });
      if (search.trim()) query.set("search", search.trim());
      if (siteId) query.set("siteId", siteId);
      if (deviceType) query.set("deviceType", deviceType);
      if (dateFrom) query.set("from", dateFrom);
      if (dateTo) query.set("to", dateTo);
      const response = await fetch("/api/enterprise/" + encodeURIComponent(organizationId) + "/retail/devices?" + query.toString(), { cache: "no-store" });
      const body = await response.json().catch(() => null) as (DeviceResponse & { error?: string; message?: string }) | null;
      if (!response.ok || !body?.items) throw new Error(body?.message || body?.error || "RETAIL_DEVICE_LIST_FAILED");
      setData(body);
    } catch (caught) {
      setError(customerFacingError(caught, locale));
      setData(null);
    } finally { setLoading(false); }
  }, [organizationId, locale, page, search, siteId, deviceType, dateFrom, dateTo]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, search ? 250 : 0); return () => window.clearTimeout(timer); }, [load, search]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/enterprise/" + encodeURIComponent(organizationId) + "/retail/dashboard?moduleCode=RETAIL_POS", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (cancelled) return;
        const map = new Map<string, Site>();
        for (const warehouse of body?.warehouses || []) if (warehouse.site?.id) map.set(warehouse.site.id, warehouse.site);
        setSites([...map.values()]);
      }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [organizationId]);

  function startCreate() { setEditingId(null); setForm(emptyForm); setFormOpen(true); }
  function startEdit(device: Device) {
    setEditingId(device.id);
    setForm({ code: device.code, name: device.name, siteId: device.siteId || "",
      deviceType: device.deviceType, connectionMode: device.connectionMode, status: device.status === "DISABLED" ? "DISABLED" : "ACTIVE" });
    setFormOpen(true);
  }
  async function saveDevice(next: Form, id: string | null) {
    setSaving(true);
    try {
      const response = await fetch("/api/enterprise/" + encodeURIComponent(organizationId) + "/retail/devices", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(id ? { id } : {}), siteId: next.siteId || null,
          code: next.code, name: next.name, deviceType: next.deviceType, connectionMode: next.connectionMode, status: next.status }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || body?.error || "RETAIL_DEVICE_SAVE_FAILED");
      toastSuccess(en ? "Equipment profile saved." : "Profil d’équipement enregistré.");
      setFormOpen(false);
      await load();
    } catch (caught) { toastError(customerFacingError(caught, locale)); }
    finally { setSaving(false); }
  }

  function testDevice(device: Device) {
    const state = evaluateRetailDeviceAvailability(device, capabilities);
    const bridge = ["NETWORK", "NATIVE_BRIDGE"].includes(device.connectionMode);
    const browserApi = ["WEBUSB", "WEBBLUETOOTH", "WEBSERIAL"].includes(device.connectionMode);
    const label = device.status !== "ACTIVE"
      ? (en ? "Disabled device." : "Équipement désactivé.")
      : bridge ? (en ? "A companion driver and an actual connection test are required; this profile is not proof of connectivity." : "Un logiciel compagnon et un véritable test de liaison sont nécessaires ; le profil ne prouve pas la connexion.")
      : browserApi ? (state.available
        ? (en ? "Browser interface available. Pairing and device-specific protocol still require validation." : "Interface navigateur disponible. L’appairage et le protocole spécifique restent à vérifier.")
        : (en ? "Browser interface unavailable." : "Interface navigateur indisponible."))
      : state.available ? (en ? "Browser/manual mode available; equipment operation is not yet certified." : "Mode navigateur/manuel disponible ; le fonctionnement physique n’est pas encore attesté.")
        : (en ? "Device interface unavailable." : "Interface de l’équipement indisponible.");
    setTestResults((current) => ({ ...current, [device.id]: label }));
  }

  const siteName = (id: string | null) => sites.find((site) => site.id === id)?.name || (id ? (en ? "Assigned store" : "Boutique affectée") : (en ? "Company-wide" : "Toutes boutiques"));
  return <section data-testid="retail-device-readiness" className="space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-black text-dtsc-ink"><Monitor className="h-5 w-5 text-cyan-500" />{en ? "Checkout equipment" : "Équipements d’encaissement"}</h2>
        <p className="mt-1 text-xs leading-5 text-dtsc-muted">{en ? "Configure equipment by store. A saved profile is not proof that a physical device is connected." : "Configurez vos appareils par boutique. Un profil enregistré ne garantit pas la connexion physique d’un appareil."}</p></div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className="h-4 w-4" />{en ? "Refresh" : "Actualiser"}</Button>
        {data?.canManage ? <Button type="button" onClick={startCreate}><Plus className="h-4 w-4" />{en ? "Add equipment" : "Ajouter un équipement"}</Button> : null}</div>
    </header>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      <label className="min-w-0 text-xs font-semibold text-dtsc-muted xl:col-span-2">{en ? "Smart search" : "Recherche intelligente"}<div className="mt-1 flex items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-3"><Search className="h-4 w-4" /><Input className="border-0 bg-transparent shadow-none" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder={en ? "Code, name, type" : "Code, nom, type"} /></div></label>
      <label className="text-xs font-semibold text-dtsc-muted">{en ? "Store" : "Boutique"}<select className="mt-1 h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2" value={siteId} onChange={(event) => { setPage(1); setSiteId(event.target.value); }}><option value="">{en ? "All stores" : "Toutes"}</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
      <label className="text-xs font-semibold text-dtsc-muted">{en ? "Equipment type" : "Type"}<select className="mt-1 h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2" value={deviceType} onChange={(event) => { setPage(1); setDeviceType(event.target.value); }}><option value="">{en ? "All types" : "Tous"}</option>{deviceTypes.map((type) => <option key={type} value={type}>{customerFacingDeviceType(type, locale)}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-dtsc-muted">{en ? "From" : "Du"}<input type="date" className="mt-1 h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-2" value={dateFrom} onChange={(event) => { setPage(1); setDateFrom(event.target.value); }} /></label><label className="text-xs font-semibold text-dtsc-muted">{en ? "To" : "Au"}<input type="date" className="mt-1 h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-2" value={dateTo} onChange={(event) => { setPage(1); setDateTo(event.target.value); }} /></label></div>
    </div>
    {error ? <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">{error}</p> : null}
    {loading ? <p role="status" className="text-sm text-dtsc-muted">{en ? "Loading equipment…" : "Chargement des équipements…"}</p> : null}
    {!loading && data?.items.length === 0 ? <div className="rounded-xl border border-dashed border-dtsc-border p-5 text-sm text-dtsc-muted"><AlertTriangle className="mb-2 h-5 w-5 text-amber-500" />{en ? "No equipment matches the selected filters." : "Aucun équipement ne correspond aux filtres sélectionnés."}{data.canManage ? <Button type="button" variant="outline" className="ml-3" onClick={startCreate}>{en ? "Configure now" : "Configurer maintenant"}</Button> : null}</div> : null}
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{data?.items.map((device) => {
      const state = evaluateRetailDeviceAvailability(device, capabilities);
      const integrationPending = ["NETWORK", "NATIVE_BRIDGE", "WEBUSB", "WEBBLUETOOTH", "WEBSERIAL"].includes(device.connectionMode);
      return <article key={device.id} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-bold text-dtsc-ink">{device.name}</p><p className="mt-1 break-words text-xs text-dtsc-muted">{device.code} · {siteName(device.siteId)}</p></div>
          <details className="relative shrink-0"><summary aria-label={en ? "Equipment actions" : "Actions de l’équipement"} className="cursor-pointer list-none rounded-lg border border-dtsc-border px-2 py-1.5 text-lg font-bold text-dtsc-ink">⋯</summary><div className="absolute right-0 z-20 mt-1 min-w-44 space-y-1 rounded-xl border border-dtsc-border bg-dtsc-surface p-2 shadow-xl">
            <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-dtsc-soft" onClick={() => testDevice(device)}>{en ? "Check compatibility" : "Vérifier la compatibilité"}</button>
            {data.canManage ? <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-dtsc-soft" onClick={() => startEdit(device)}>{en ? "Edit profile" : "Modifier le profil"}</button> : null}
            {data.canManage && device.status === "ACTIVE" ? <button type="button" disabled={saving} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-amber-600 hover:bg-dtsc-soft" onClick={() => void saveDevice({ code: device.code, name: device.name, siteId: device.siteId || "", deviceType: device.deviceType, connectionMode: device.connectionMode, status: "DISABLED" }, device.id)}>{en ? "Disable" : "Désactiver"}</button> : null}
          </div></details></div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-cyan-500/10 px-2 py-1 text-cyan-700 dark:text-cyan-300">{customerFacingDeviceType(device.deviceType, locale)}</span><span className="rounded-lg bg-violet-500/10 px-2 py-1 text-violet-700 dark:text-violet-300">{device.connectionMode}</span></div>
        <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-dtsc-muted">{device.status !== "ACTIVE" ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : integrationPending || state.degraded ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}{device.status !== "ACTIVE" ? (en ? "Disabled" : "Désactivé") : integrationPending ? (en ? "Physical connection not verified" : "Connexion physique non vérifiée") : (en ? "Profile active — check the device" : "Profil actif — appareil à vérifier")}</p>
        {testResults[device.id] ? <p role="status" className="mt-2 rounded-lg bg-amber-500/10 p-2 text-xs text-dtsc-ink">{testResults[device.id]}</p> : null}
      </article>;
    })}</div>
    {data && data.pagination.pageCount > 1 ? <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-dtsc-muted"><span>{data.pagination.total} · {en ? "Page" : "Page"} {data.pagination.page}/{data.pagination.pageCount}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>{en ? "Previous" : "Précédente"}</Button><Button type="button" variant="outline" disabled={page >= data.pagination.pageCount || loading} onClick={() => setPage((value) => value + 1)}>{en ? "Next" : "Suivante"}</Button></div></div> : null}
    {formOpen && data?.canManage ? <div className="rounded-2xl border border-cyan-500/40 bg-dtsc-page p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-black"><Settings2 className="h-4 w-4 text-cyan-500" />{editingId ? (en ? "Edit equipment" : "Modifier l’équipement") : (en ? "Add equipment" : "Ajouter un équipement")}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-dtsc-muted">{en ? "Equipment code" : "Code équipement"} *<Input className="mt-1" value={form.code} maxLength={80} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} /></label>
        <label className="text-xs font-semibold text-dtsc-muted">{en ? "Name" : "Nom"} *<Input className="mt-1" value={form.name} maxLength={160} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
        <label className="text-xs font-semibold text-dtsc-muted">{en ? "Store" : "Boutique"}<select className="mt-1 h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2" value={form.siteId} onChange={(event) => setForm((current) => ({ ...current, siteId: event.target.value }))}><option value="">{en ? "Company-wide" : "Toute l’entreprise"}</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-dtsc-muted">{en ? "Type" : "Type"}<select className="mt-1 h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2" value={form.deviceType} onChange={(event) => setForm((current) => ({ ...current, deviceType: event.target.value }))}>{deviceTypes.map((type) => <option key={type} value={type}>{customerFacingDeviceType(type, locale)}</option>)}</select></label>
        <label className="text-xs font-semibold text-dtsc-muted">{en ? "Connection" : "Connexion"}<select className="mt-1 h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2" value={form.connectionMode} onChange={(event) => setForm((current) => ({ ...current, connectionMode: event.target.value }))}>{connectionModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
        <label className="text-xs font-semibold text-dtsc-muted">{en ? "Status" : "Statut"}<select className="mt-1 h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as Form["status"] }))}><option value="ACTIVE">{en ? "Active" : "Actif"}</option><option value="DISABLED">{en ? "Disabled" : "Désactivé"}</option></select></label>
      </div>
      <p className="mt-3 text-xs text-dtsc-muted">{en ? "This creates the configuration profile. Real USB, serial, Bluetooth, network and payment terminal connections require a supported adapter and explicit device pairing." : "Ce formulaire crée le profil. Les connexions réelles USB, série, Bluetooth, réseau et terminaux de paiement nécessitent un adaptateur compatible et l’appairage de l’appareil."}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>{en ? "Cancel" : "Annuler"}</Button><Button type="button" disabled={saving || form.code.trim().length < 2 || form.name.trim().length < 2} onClick={() => void saveDevice(form, editingId)}>{saving ? "…" : (en ? "Save profile" : "Enregistrer le profil")}</Button></div>
    </div> : null}
  </section>;
}
