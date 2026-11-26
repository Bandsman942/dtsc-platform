"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowRightLeft, Plus, RefreshCw } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalError, ProfessionalLoading, professionalMutation, professionalRequest, useProfessionalCollection } from "@/components/enterprise/professional/professional-erp-ui";
import { professionalErpDate } from "@/components/enterprise/professional/professional-erp-i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notifyToast } from "@/lib/client-toast";
import { localizeInventoryQuantity } from "@/lib/enterprise/inventory/quantity-display";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { StatusBadge } from "@/components/workspace/status-badge";

type Locale = "fr" | "en";
type SourceUnit = { id: string; code: string; name: string; symbol: string | null; decimalScale: number };
type Conversion = { id: string; sourceUnitId: string; targetUnitId: string; version: number; factor: string; sourceScale: number; targetScale: number; sourceCode: string; targetCode: string; createdAt: string };
type CatalogExtra = {
  catalogItem?: { id: string; status: string; archivedAt: string | null; trackInventory: boolean; unitOfMeasure: { id: string; code: string; name: string; decimalScale: number; status: string; archivedAt: string | null } };
  sourceUnit?: Pick<SourceUnit, "id" | "code" | "decimalScale"> | null;
  currentConversionMatchesUnits?: boolean | null;
};
type Preview = { sourceQuantity: string; stockQuantity: string; sourceCode: string; targetCode: string; factor: string; version: number };

const labels = {
  fr: {
    title: "Conversions d’unités", intro: "Définissez les conditionnements de cet article vers son unité de stock. Les versions précédentes sont conservées.",
    search: "Rechercher une unité", source: "Unité d’achat ou de vente", choose: "Choisir une unité", all: "Toutes les unités", previous: "Précédent", next: "Suivant", page: "Page",
    stock: "Unité de stock actuelle", precision: "décimales", empty: "Aucune conversion enregistrée", emptyHelp: "Sélectionnez une unité source pour consulter son historique ou définir un facteur.",
    newVersion: "Nouvelle version", factor: "Facteur de conversion", factorHelp: "Nombre d’unités de stock pour une unité source entière. Exemple : 24 bouteilles pour 1 carton. Utilisez le point ou la virgule décimale.",
    save: "Enregistrer la version", saving: "Enregistrement…", saved: "Nouvelle version enregistrée", failed: "Impossible d’enregistrer la conversion.",
    version: "Version", refresh: "Actualiser", readOnly: "Consultation uniquement. La configuration nécessite le droit d’administration du Catalogue.",
    inactive: "Cet article doit être actif, suivi en stock et associé à une unité de stock active.", history: "Historique des conversions", old: "Historique", latest: "Dernière version", review: "Une unité, son code ou sa précision a changé. Enregistrez une nouvelle version.",
    unavailableSource: "Choisissez une unité source active et différente de l’unité de stock.",
    preview: "Simuler la conversion enregistrée", quantity: "Quantité source", calculate: "Calculer", calculating: "Calcul…", previewFailed: "Conversion impossible.", previewNote: "Simulation uniquement : aucune opération de stock n’est créée.",
    noUnits: "Aucune autre unité disponible. Créez une unité dans le Catalogue.",
    noMatch: "Aucune unité ne correspond à cette recherche.", invalidFactor: "Renseignez un facteur décimal strictement positif, avec au maximum 18 chiffres entiers et 12 décimales.",
    invalidQuantity: "Renseignez une quantité positive compatible avec l’unité source.",
    pendingIntegration: "La configuration ne modifie pas encore les quantités des achats, ventes ou POS. Ces parcours nécessitent leur intégration métier.",
  },
  en: {
    title: "Unit conversions", intro: "Define packaging conversions for this item into its stock unit. Previous versions are retained.",
    search: "Search units", source: "Purchase or sales unit", choose: "Choose a unit", all: "All units", previous: "Previous", next: "Next", page: "Page",
    stock: "Current stock unit", precision: "decimal places", empty: "No conversion recorded", emptyHelp: "Select a source unit to review its history or define a factor.",
    newVersion: "New version", factor: "Conversion factor", factorHelp: "Number of stock units per whole source unit. Example: 24 bottles per carton. Use a decimal point or comma.",
    save: "Save version", saving: "Saving…", saved: "New version saved", failed: "Unable to save conversion.",
    version: "Version", refresh: "Refresh", readOnly: "Read only. Configuration requires Catalog administration permission.",
    inactive: "This item must be active, tracked in inventory and linked to an active stock unit.", history: "Conversion history", old: "Historical", latest: "Latest version", review: "A unit, its code or its precision changed. Save a new version.",
    unavailableSource: "Choose an active source unit that differs from the stock unit.",
    preview: "Preview the saved conversion", quantity: "Source quantity", calculate: "Calculate", calculating: "Calculating…", previewFailed: "Unable to convert.", previewNote: "Simulation only: no stock operation is created.",
    noUnits: "No other unit available. Create a unit in Catalog.",
    noMatch: "No units match this search.", invalidFactor: "Enter a strictly positive decimal factor, with at most 18 integer digits and 12 decimal places.",
    invalidQuantity: "Enter a positive quantity compatible with the source unit.",
    pendingIntegration: "Configuration does not yet change purchase, sales or POS quantities. These flows require business integration.",
  },
} as const;

function decimalInput(value: string) { return value.trim().replace(",", "."); }
function isPositiveDecimal(value: string, integer: number, fraction: number) {
  return new RegExp(`^\\d{1,${integer}}${fraction ? `(?:\\.\\d{1,${fraction}})?` : ""}$`).test(value) && /[1-9]/.test(value);
}
function Paging({ page, count, onChange, locale }: { page: number; count: number; onChange: (page: number) => void; locale: Locale }) {
  const t = labels[locale];
  return count > 1 ? <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-dtsc-muted">
    <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>{t.previous}</Button>
    <span aria-live="polite">{t.page} {page} / {count}</span>
    <Button type="button" variant="outline" size="sm" disabled={page >= count} onClick={() => onChange(page + 1)}>{t.next}</Button>
  </div> : null;
}

export function CatalogUnitConversionPanel({ organizationId, catalogItemId, locale }: { organizationId: string; catalogItemId: string; locale: Locale }) {
  const t = labels[locale];
  const endpoint = `/api/enterprise/${organizationId}/catalog/unit-conversions`;
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [unitPage, setUnitPage] = useState(1);
  const [source, setSource] = useState<SourceUnit | null>(null);
  const units = useProfessionalCollection<SourceUnit>({ endpoint, params: new URLSearchParams({ catalogItemId, unitSearch: searchTerm, page: String(unitPage), pageSize: "20" }) });
  const options = source && !units.items.some(unit => unit.id === source.id) ? [source, ...units.items] : units.items;
  return <section className="grid min-w-0 gap-3 border-t border-dtsc-border pt-4" aria-label={t.title}>
    <h3 className="flex min-w-0 items-center gap-2 text-base font-bold text-dtsc-ink"><ArrowRightLeft className="h-4 w-4 shrink-0 text-dtsc-blue" />{t.title}</h3>
    <p className="text-sm text-dtsc-muted">{t.intro}</p>
    <p className="text-xs text-dtsc-muted">{t.pendingIntegration}</p>
    <form className="flex min-w-0 flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); setSearchTerm(search.trim()); setUnitPage(1); }}>
      <div className="min-w-0 flex-1"><Field label={t.search}><Input value={search} onChange={event => setSearch(event.target.value)} maxLength={120} /></Field></div>
      <Button type="submit" variant="outline">{t.search}</Button>
    </form>
    {units.error ? <><ProfessionalError message={units.error} notify={false} /><Button type="button" variant="outline" onClick={() => void units.reload()}>{t.refresh}</Button></> : units.loading ? <ProfessionalLoading /> : <>
      <Field label={t.source}><NativeSelect value={source?.id || ""} items={[{ id: "", label: t.all }, ...options.map(unit => ({ id: unit.id, label: `${unit.name} · ${unit.code}${unit.symbol ? ` (${unit.symbol})` : ""}` }))]} onChange={id => setSource(options.find(unit => unit.id === id) || null)} /></Field>
      {!units.items.length ? <p className="text-sm text-dtsc-muted">{searchTerm ? t.noMatch : t.noUnits}</p> : null}
      <Paging page={unitPage} count={units.pagination.pageCount} onChange={setUnitPage} locale={locale} />
    </>}
    <ConversionHistory key={source?.id || "all"} endpoint={endpoint} catalogItemId={catalogItemId} source={source} locale={locale} />
  </section>;
}

function ConversionHistory({ endpoint, catalogItemId, source, locale }: { endpoint: string; catalogItemId: string; source: SourceUnit | null; locale: Locale }) {
  const t = labels[locale];
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [factor, setFactor] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const saveLock = useRef(false);
  const previewLock = useRef(false);
  const history = useProfessionalCollection<Conversion, CatalogExtra>({ endpoint, params: new URLSearchParams({ catalogItemId, page: String(page), pageSize: "20", ...(source ? { sourceUnitId: source.id } : {}) }), refreshKey: revision });
  const catalog = history.extra.catalogItem;
  const sourceUnit = history.extra.sourceUnit;
  const current = source && page === 1 ? history.items[0] : undefined;
  const settled = !history.loading && !history.error && history.pagination.page === page;
  const active = Boolean(catalog?.status === "ACTIVE" && !catalog.archivedAt && catalog.trackInventory
    && catalog.unitOfMeasure.status === "ACTIVE" && !catalog.unitOfMeasure.archivedAt);
  const canSave = settled && active && history.canManage && Boolean(sourceUnit) && page === 1;
  const canSimulate = settled && active && Boolean(sourceUnit && current && history.extra.currentConversionMatchesUnits);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sourceUnit || !canSave || saveLock.current) return;
    const value = decimalInput(factor);
    if (!isPositiveDecimal(value, 18, 12)) { setError(t.invalidFactor); return; }
    saveLock.current = true; setBusy(true); setError(""); setPreview(null); setPreviewError("");
    try {
      await professionalMutation(endpoint, { catalogItemId, sourceUnitId: sourceUnit.id, factor: value, expectedVersion: current?.version ?? 0 });
      setFactor(""); notifyToast(t.saved, "success");
      // Keep submission locked until the fresh version is loaded.
      await history.reload();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : t.failed;
      setError(message); notifyToast({ title: t.failed, description: message, tone: "error" });
    } finally { saveLock.current = false; setBusy(false); }
  }
  async function simulate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sourceUnit || !canSimulate || previewLock.current || busy) return;
    const value = decimalInput(quantity);
    if (!isPositiveDecimal(value, 15, sourceUnit.decimalScale)) { setPreview(null); setPreviewError(t.invalidQuantity); return; }
    previewLock.current = true; setPreviewBusy(true); setPreview(null); setPreviewError("");
    try {
      const result = await professionalRequest<{ preview: Preview }>(`${endpoint}?${new URLSearchParams({ catalogItemId, sourceUnitId: sourceUnit.id, quantity: value })}`);
      setPreview(result.preview);
    } catch (failure) { setPreviewError(failure instanceof Error ? failure.message : t.previewFailed); }
    finally { previewLock.current = false; setPreviewBusy(false); }
  }
  return <div className="grid min-w-0 gap-3">
    {catalog ? <p className="break-words text-sm"><strong>{t.stock} :</strong> {catalog.unitOfMeasure.name} ({catalog.unitOfMeasure.code}) · {catalog.unitOfMeasure.decimalScale} {t.precision}</p> : null}
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-dtsc-ink">{t.history}</h4><Button type="button" variant="outline" size="sm" disabled={history.loading || busy || previewBusy} onClick={() => { setPreview(null); setPage(1); setRevision(value => value + 1); }}><RefreshCw className="h-4 w-4" />{t.refresh}</Button></div>
    {history.error ? <ProfessionalError message={history.error} notify={false} /> : !settled ? <ProfessionalLoading /> : <>
      {history.items.length ? <BusinessList ariaLabel={t.history}>{history.items.map((row, index) => <BusinessListItem key={row.id}
        title={`1 ${row.sourceCode} = ${localizeInventoryQuantity(row.factor, locale)} ${row.targetCode}`}
        meta={`${t.version} ${row.version} · ${professionalErpDate(row.createdAt, locale)}`}
        status={source && page === 1 ? <StatusBadge tone={index === 0 ? "success" : "neutral"}>{index === 0 ? t.latest : t.old}</StatusBadge> : undefined}
        description={`${row.sourceScale} → ${row.targetScale} ${t.precision}`} />)}</BusinessList> : <EmptyState compact title={t.empty} description={t.emptyHelp} />}
      <Paging page={page} count={history.pagination.pageCount} onChange={next => { if (!busy && !previewBusy) { setPage(next); setPreview(null); } }} locale={locale} />
      {!active ? <p className="text-sm text-dtsc-muted">{t.inactive}</p> : !history.canManage ? <p className="text-sm text-dtsc-muted">{t.readOnly}</p> : null}
      {source && !sourceUnit ? <p role="status" className="text-sm text-dtsc-muted">{t.unavailableSource}</p> : null}
      {active && history.extra.currentConversionMatchesUnits === false ? <p role="status" className="break-words text-sm font-medium text-amber-700 dark:text-amber-300">{t.review}</p> : null}
      {canSave ? <form className="grid min-w-0 gap-3 border-t border-dtsc-border pt-3" onSubmit={save}>
        <h4 className="font-semibold text-dtsc-ink">{t.newVersion}</h4>
        {error ? <ProfessionalError message={error} notify={false} /> : null}
        <Field label={t.factor} help={t.factorHelp} required><Input value={factor} inputMode="decimal" maxLength={31} required disabled={busy || previewBusy} onChange={event => setFactor(event.target.value)} /></Field>
        <Button type="submit" disabled={busy || previewBusy}><Plus className="h-4 w-4" />{busy ? t.saving : t.save}</Button>
      </form> : null}
      {sourceUnit && canSimulate ? <form className="grid min-w-0 gap-2 border-t border-dtsc-border pt-3" onSubmit={simulate}>
        <h4 className="font-semibold text-dtsc-ink">{t.preview}</h4>
        <Field label={`${t.quantity} (${sourceUnit.code})`} required><Input value={quantity} inputMode="decimal" maxLength={22} required disabled={previewBusy || busy} onChange={event => { setQuantity(event.target.value); setPreview(null); }} /></Field>
        <Button type="submit" variant="outline" disabled={previewBusy || busy}>{previewBusy ? t.calculating : t.calculate}</Button>
        {previewError ? <ProfessionalError message={previewError} notify={false} /> : null}
        {preview ? <p aria-live="polite" className="break-words rounded-xl border border-dtsc-border p-3 font-semibold tabular-nums text-dtsc-ink">{localizeInventoryQuantity(preview.sourceQuantity, locale)} {preview.sourceCode} = {localizeInventoryQuantity(preview.stockQuantity, locale)} {preview.targetCode} · {t.version} {preview.version}</p> : null}
        <p className="text-xs text-dtsc-muted">{t.previewNote}</p>
      </form> : null}
    </>}
  </div>;
}
