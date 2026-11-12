"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Settings2, Search, X } from "lucide-react";
import { detectRetailBrowserDeviceCapabilities, evaluateRetailDeviceAvailability } from "@/lib/enterprise/retail/device-capabilities";
import { customerFacingDeviceType } from "@/lib/customer-facing-language";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { pairRetailBrowserDevice } from "@/lib/enterprise/retail/browser-device-connect";
import { downloadProfessionalCsv, downloadProfessionalXlsx, downloadProfessionalPdf, type ProfessionalReportExportModel } from "@/lib/reporting/professional-export";

type DeviceType = "BARCODE_SCANNER" | "RECEIPT_PRINTER" | "CASH_DRAWER" | "PAYMENT_TERMINAL" | "CUSTOMER_DISPLAY" | "SCALE";
type ConnectionMode = "BROWSER" | "WEBUSB" | "WEBBLUETOOTH" | "WEBSERIAL" | "NETWORK" | "NATIVE_BRIDGE" | "MANUAL";
type Device = { id: string; code: string; name: string; deviceType: DeviceType; connectionMode: ConnectionMode; status: "ACTIVE" | "DISABLED"; siteId: string | null };
type Form = { id?: string; siteId?: string | null; code: string; name: string; deviceType: DeviceType; connectionMode: ConnectionMode; status: "ACTIVE" | "DISABLED" };
const EMPTY: Form = { code: "", name: "", deviceType: "RECEIPT_PRINTER", connectionMode: "BROWSER", status: "ACTIVE" };
const types: DeviceType[] = ["RECEIPT_PRINTER", "BARCODE_SCANNER", "CASH_DRAWER", "PAYMENT_TERMINAL", "CUSTOMER_DISPLAY", "SCALE"];
const modes: ConnectionMode[] = ["BROWSER", "WEBUSB", "WEBBLUETOOTH", "WEBSERIAL", "NETWORK", "NATIVE_BRIDGE", "MANUAL"];
const optionLabels: Record<ConnectionMode, string> = {
  BROWSER: "Navigateur / clavier / impression système",
  WEBUSB: "WebUSB", WEBBLUETOOTH: "WebBluetooth", WEBSERIAL: "WebSerial",
  NETWORK: "Réseau — adaptateur requis", NATIVE_BRIDGE: "Logiciel compagnon — adaptateur requis", MANUAL: "Manuel",
};

export function RetailDeviceReadiness({ organizationId, locale = "fr" }: { organizationId: string; locale?: "fr" | "en" }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 12, total: 0, pageCount: 1 });
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [search, setSearch] = useState("");
  const [testingScannerId, setTestingScannerId] = useState<string | null>(null);
  const [scannerValue, setScannerValue] = useState("");
  const [scannerResult, setScannerResult] = useState("");
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [pairingResult, setPairingResult] = useState<Record<string, string>>({});
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const capabilities = useMemo(() => detectRetailBrowserDeviceCapabilities(), []);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: "12" });
      if (search.trim()) query.set("search", search.trim());
      if (typeFilter) query.set("type", typeFilter);
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/retail/devices?${query}`, { cache: "no-store" });
      if (response.status === 403) { setForbidden(true); setDevices([]); return; }
      if (!response.ok) throw new Error("RETAIL_DEVICE_READ_FAILED");
      const payload = await response.json() as { items?: Device[]; pagination?: { page: number; pageSize: number; total: number; pageCount: number } };
      setDevices(Array.isArray(payload.items) ? payload.items : []);
      if (payload.pagination) setPagination(payload.pagination);
      setForbidden(false);
    } catch { setFailed(true); }
    finally { setLoaded(true); }
  }, [organizationId, page, search, typeFilter]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, search ? 250 : 0); return () => clearTimeout(timer); }, [load, search]);
  useEffect(() => {
    let active = true;
    fetch(`/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_POS`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { warehouses?: Array<{ site: { id: string; name: string } }> } | null) => {
        if (!active) return;
        const unique = new Map<string, { id: string; name: string }>();
        for (const item of data?.warehouses || []) if (item.site) unique.set(item.site.id, item.site);
        setSites([...unique.values()]);
      }).catch(() => undefined);
    return () => { active = false; };
  }, [organizationId]);

  const pageCount = pagination.pageCount;
  const visible = devices;

  async function save() {
    if (!form || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/retail/devices`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, siteId: form.siteId || null }),
      });
      const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      if (!response.ok) throw new Error(body?.message || body?.error || "Impossible d’enregistrer cet équipement.");
      toastSuccess(form.id ? "Profil équipement mis à jour." : "Profil équipement créé. Testez ensuite la connexion physique.");
      setForm(null);
      await load();
    } catch (error) { toastError(error instanceof Error ? error.message : "Enregistrement impossible."); }
    finally { setSaving(false); }
  }
  async function exportDevices(format: "csv" | "xlsx" | "pdf") {
    if (exporting || forbidden) return;
    setExporting(true);
    try {
      const records: Device[] = [];
      for (let currentPage = 1; ; currentPage++) {
        const params = new URLSearchParams({ page: String(currentPage), pageSize: "50" });
        if (search.trim()) params.set("search", search.trim());
        if (typeFilter) params.set("type", typeFilter);
        const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/retail/devices?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error(locale === "en" ? "Device export access was refused." : "L'accès à l'export des équipements est refusé.");
        const body = await response.json() as { items?: Device[]; pagination?: { total: number; pageCount: number } };
        if ((body.pagination?.total ?? 0) > 5000) throw new Error(locale === "en"
          ? "More than 5,000 device profiles. Narrow the filters before exporting."
          : "Plus de 5 000 profils. Affinez les filtres avant l'export.");
        if (!Array.isArray(body.items)) throw new Error("RETAIL_DEVICE_EXPORT_INVALID");
        records.push(...body.items);
        if (!body.pagination || currentPage >= body.pagination.pageCount) break;
      }
      const siteById = new Map(sites.map((site) => [site.id, site.name]));
      const model: ProfessionalReportExportModel = {
        title: locale === "en" ? "Retail equipment inventory" : "Inventaire des équipements du commerce de détail",
        subtitle: locale === "en"
          ? "DTSC Platform · registered device profiles, not certified physical connections"
          : "DTSC Platform · profils enregistrés, connexions physiques non certifiées",
        filenameBase: `dtsc-retail-equipment-${new Date().toLocaleDateString("sv-SE")}`,
        generatedLabel: new Date().toLocaleString(locale === "en" ? "en-US" : "fr-FR"),
        columns: [
          { key: "code", label: "Code" }, { key: "name", label: locale === "en" ? "Name" : "Nom" },
          { key: "type", label: "Type" }, { key: "connection", label: locale === "en" ? "Connection" : "Connexion" },
          { key: "site", label: locale === "en" ? "Store" : "Boutique" }, { key: "status", label: locale === "en" ? "Profile status" : "Statut du profil" },
        ],
        rows: records.map((device) => ({
          code: device.code, name: device.name, type: customerFacingDeviceType(device.deviceType, locale),
          connection: device.connectionMode,
          site: device.siteId ? siteById.get(device.siteId) || device.siteId : (locale === "en" ? "Company-wide" : "Commun à l'entreprise"),
          status: device.status === "ACTIVE" ? (locale === "en" ? "Active profile" : "Profil actif") : (locale === "en" ? "Disabled" : "Désactivé"),
        })),
        kpis: [{ label: locale === "en" ? "Profiles" : "Profils", value: String(records.length) }],
        chart: [],
        insights: [{ title: locale === "en" ? "Connectivity" : "Connectivité", body: locale === "en"
          ? "Active profiles do not demonstrate a connected or certified hardware device."
          : "Un profil actif ne démontre ni une connexion matérielle ni une certification." }],
        filters: [{ label: locale === "en" ? "Search" : "Recherche", value: search || "—" },
          { label: "Type", value: typeFilter || (locale === "en" ? "All" : "Tous") }],
      };
      if (format === "csv") downloadProfessionalCsv(model);
      else if (format === "xlsx") downloadProfessionalXlsx(model);
      else downloadProfessionalPdf(model);
      toastSuccess(locale === "en" ? "Equipment report generated." : "Rapport des équipements généré.");
    } catch (error) {
      toastError(error instanceof Error ? error.message : "RETAIL_DEVICE_EXPORT_FAILED");
    } finally {
      setExporting(false);
    }
  }

  const commonField = "mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink";
  return (
    <section className="space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5" aria-label="Équipements d'encaissement">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-black text-dtsc-ink">{locale === "en" ? "Retail equipment" : "Équipements du commerce de détail"}</h2>
          <p className="text-xs font-bold text-dtsc-blue">{locale === "en" ? "Checkout equipment" : "Équipements d’encaissement"}</p>
          <p className="text-sm text-dtsc-muted">{locale === "en" ? "Register device profiles, then verify real hardware connectivity." : "Enregistrez les profils des appareils puis vérifiez leur connexion matérielle réelle."}</p></div>
        <div className="flex flex-wrap gap-2">
          {!forbidden && (["csv", "xlsx", "pdf"] as const).map((format) => (
            <button key={format} type="button" disabled={exporting || !loaded || failed}
              onClick={() => void exportDevices(format)}
              className="min-h-10 rounded-xl border border-dtsc-border px-3 text-xs font-black uppercase text-dtsc-blue disabled:opacity-50"
              aria-label={locale === "en" ? `Export equipment as ${format.toUpperCase()}` : `Exporter les équipements en ${format.toUpperCase()}`}>{format}</button>
          ))}
          <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm text-dtsc-ink"><RefreshCw className="h-4 w-4" />Actualiser</button>
          {!forbidden && <button type="button" onClick={() => setForm({ ...EMPTY })} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-dtsc-blue px-3 text-sm font-bold text-white"><Plus className="h-4 w-4" />Ajouter</button>}
        </div>
      </header>
      <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-dtsc-ink">Un profil actif ou une API navigateur détectée ne prouve pas que le périphérique est connecté. Les connexions réseau et logiciel compagnon exigent un adaptateur réellement installé et testé ; aucun paiement n’est confirmé ici.</p>
      {forbidden ? <p role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm">Administration réservée aux responsables autorisés. Consultez votre administrateur pour l’affectation des appareils.</p> : null}
      {failed ? <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">Impossible de charger les équipements. Vérifiez les droits et réessayez.</p> : null}
      {!loaded ? <p role="status" className="text-sm text-dtsc-muted">Chargement des équipements…</p> : null}
      {!forbidden && <>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
          <label className="text-xs font-semibold text-dtsc-muted">Recherche intelligente<div className="relative"><Search className="absolute left-3 top-4 h-4 w-4" /><input className={commonField + " pl-9"} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Nom, code, type…" /></div></label>
          <label className="text-xs font-semibold text-dtsc-muted">Type<select className={commonField} value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}><option value="">Tous</option>{types.map((value) => <option key={value} value={value}>{customerFacingDeviceType(value, locale)}</option>)}</select></label>
        </div>
        {loaded && devices.length === 0 ? <p className="rounded-xl border border-dashed border-dtsc-border p-4 text-sm text-dtsc-muted">Aucun équipement ne correspond aux filtres. Ajoutez un profil, modifiez les filtres ou actualisez la liste.</p> : null}
        <div className="grid gap-2 md:grid-cols-2">{visible.map((device) => {
          const state = evaluateRetailDeviceAvailability(device, capabilities);
          return <article key={device.id} className="rounded-xl border border-dtsc-border bg-dtsc-page p-3">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><strong className="block truncate text-sm text-dtsc-ink">{device.name}</strong><p className="text-xs text-dtsc-muted">{device.code} · {customerFacingDeviceType(device.deviceType, locale)}</p></div>
              <button type="button" aria-label={`Configurer ${device.name}`} className="rounded-lg border border-dtsc-border p-2 text-dtsc-blue" onClick={() => setForm({ id: device.id, siteId: device.siteId, code: device.code, name: device.name, deviceType: device.deviceType, connectionMode: device.connectionMode, status: device.status })}><Settings2 className="h-4 w-4" /></button>
            </div>
            {device.status === "ACTIVE" && (["WEBUSB","WEBSERIAL","WEBBLUETOOTH"] as const).some((mode) => mode === device.connectionMode)
              ? <button type="button" disabled={pairingId === device.id} className="mt-2 rounded-lg border border-dtsc-border px-3 py-2 text-xs font-bold text-dtsc-blue disabled:opacity-50"
                onClick={async () => {
                  setPairingId(device.id);
                  try {
                    const result = await pairRetailBrowserDevice(device.connectionMode as "WEBUSB" | "WEBSERIAL" | "WEBBLUETOOTH");
                    setPairingResult((current) => ({ ...current, [device.id]: `${result.name} — ${result.message}` }));
                    toastSuccess(locale === "en" ? "Browser permission granted, protocol test still required." : "Autorisation navigateur accordée, test de protocole toujours nécessaire.");
                  } catch (error) { toastError(error instanceof Error ? error.message : "Autorisation matérielle refusée."); }
                  finally { setPairingId(null); }
                }}>{pairingId === device.id ? "…" : locale === "en" ? "Grant browser access" : "Autoriser le périphérique"}</button>
              : null}
            {pairingResult[device.id] ? <p role="status" className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-dtsc-ink">{pairingResult[device.id]}</p> : null}
            {device.status === "ACTIVE" && device.connectionMode === "BROWSER" && device.deviceType === "BARCODE_SCANNER"
              ? <button type="button" className="mt-2 rounded-lg border border-dtsc-border px-3 py-2 text-xs font-bold text-dtsc-blue" onClick={() => { setTestingScannerId(device.id); setScannerValue(""); setScannerResult(""); }}>Tester la lecture clavier</button>
              : null}
            {device.status === "ACTIVE" && device.connectionMode === "BROWSER" && device.deviceType === "RECEIPT_PRINTER"
              ? <button type="button" className="mt-2 rounded-lg border border-dtsc-border px-3 py-2 text-xs font-bold text-dtsc-blue" onClick={() => window.print()}>Ouvrir l’impression système</button>
              : null}
            {testingScannerId === device.id && <div className="mt-2 rounded-xl border border-cyan-500/30 bg-dtsc-surface p-3 text-xs">
              <label className="block font-bold">Scanner un code-barres et terminer par Entrée<input autoFocus className="mt-2 h-11 w-full rounded-lg border border-dtsc-border bg-dtsc-page px-3" value={scannerValue} onChange={(event) => setScannerValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setScannerResult(scannerValue.trim()); } }} /></label>
              {scannerResult ? <p role="status" className="mt-2 font-bold text-emerald-700">Lecture reçue : {scannerResult}. Cela ne certifie pas la disponibilité de toutes les fonctions du scanner.</p> : null}
              <button type="button" className="mt-2 rounded-lg border px-3 py-1" onClick={() => setTestingScannerId(null)}>Fermer le test</button>
            </div>}
            <p className="mt-2 text-xs text-dtsc-muted">{optionLabels[device.connectionMode]} · {device.status === "ACTIVE" ? "Profil actif" : "Désactivé"}</p>
            <span className={`mt-2 inline-flex rounded-lg px-2 py-1 text-xs font-bold ${state.reason === "DISABLED" ? "bg-slate-500/10 text-dtsc-muted" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>{state.reason === "AVAILABLE" ? "Interface disponible — connexion non testée" : state.reason === "EXTERNAL_BRIDGE" ? "Adaptateur externe à vérifier" : state.reason === "MANUAL_FALLBACK" ? "Utilisation manuelle possible" : state.reason === "DISABLED" ? "Désactivé" : "Interface non disponible sur ce navigateur"}</span>
          </article>;
        })}</div>
        {pagination.total > pagination.pageSize && <div className="flex items-center justify-between text-xs text-dtsc-muted"><span>{pagination.total} équipements · Page {Math.min(page, pageCount)}/{pageCount}</span><div className="flex gap-2"><button type="button" className="rounded-lg border border-dtsc-border px-3 py-2" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>Précédent</button><button type="button" className="rounded-lg border border-dtsc-border px-3 py-2" disabled={page >= pageCount} onClick={() => setPage((v) => v + 1)}>Suivant</button></div></div>}
      </>}
      {form && <div className="rounded-2xl border border-cyan-500/40 bg-dtsc-page p-4">
        <div className="flex items-center justify-between"><h3 className="font-black text-dtsc-ink">{form.id ? "Modifier un équipement" : "Ajouter un équipement"}</h3><button type="button" aria-label="Fermer" onClick={() => setForm(null)}><X className="h-5 w-5" /></button></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Code *<input className={commonField} maxLength={80} required value={form.code} onChange={(e) => setForm((v) => v && { ...v, code: e.target.value.toUpperCase() })} /></label>
          <label className="text-xs font-semibold">Nom *<input className={commonField} required value={form.name} onChange={(e) => setForm((v) => v && { ...v, name: e.target.value })} /></label>
          <label className="text-xs font-semibold">Type *<select className={commonField} value={form.deviceType} onChange={(e) => setForm((v) => v && { ...v, deviceType: e.target.value as DeviceType })}>{types.map((t) => <option key={t} value={t}>{customerFacingDeviceType(t, locale)}</option>)}</select></label>
          <label className="text-xs font-semibold">Connexion *<select className={commonField} value={form.connectionMode} onChange={(e) => setForm((v) => v && { ...v, connectionMode: e.target.value as ConnectionMode })}>{modes.map((m) => <option key={m} value={m}>{optionLabels[m]}</option>)}</select></label>
          <label className="text-xs font-semibold">Boutique<select className={commonField} value={form.siteId || ""} onChange={(e) => setForm((v) => v && { ...v, siteId: e.target.value || null })}><option value="">Commun à l’entreprise</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
          <label className="text-xs font-semibold">Statut<select className={commonField} value={form.status} onChange={(e) => setForm((v) => v && { ...v, status: e.target.value as Form["status"] })}><option value="ACTIVE">Actif</option><option value="DISABLED">Désactivé</option></select></label>
        </div>
        <p className="mt-3 text-xs text-dtsc-muted">Les paramètres spécifiques au modèle et à la boutique seront pris en charge par les adaptateurs compatibles. Aucun périphérique inconnu n’est automatiquement piloté par ce formulaire.</p>
        <div className="mt-4 flex justify-end gap-2"><button className="rounded-lg border border-dtsc-border px-4 py-2 text-sm" type="button" onClick={() => setForm(null)}>Annuler</button><button type="button" className="rounded-lg bg-dtsc-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={saving || !form.code.trim() || form.name.trim().length < 2} onClick={() => void save()}>{saving ? "Enregistrement…" : "Enregistrer le profil"}</button></div>
      </div>}
    </section>
  );
}
