"use client";

import type * as React from "react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { BadgeCheck, CircleHelp, Eye, Plus, Send, Undo2 } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { actionFeedback } from "@/lib/client-action-feedback";
import { translate } from "@/lib/i18n";
import type { ToastNotice } from "@/lib/client-toast";

type Opt = {
  id: string;
  name?: string;
  labelFr?: string;
  title?: string;
  productId?: string;
  batchNumber?: string;
  expiryDate?: string;
  availableQuantity?: string;
  stockUnit?: string;
  referenceSalePrice?: string | null;
  prescriptionRequired?: boolean;
  pharmacistValidationRequired?: boolean;
  controlledProduct?: boolean;
};
type SaleReference = { id: string; title: string; stockUnit?: string; referenceSalePrice?: string | null };
type SaleReferenceResult = { items: SaleReference[]; selected: SaleReference | null; page: number; pageCount: number; total: number };
type Line = { id: string; productId: string; batchId: string; quantity: string; unit: string; unitPrice: string; totalLine: string; requiresPrescription: boolean; requiresPharmacistValidation: boolean };
type Sale = { id: string; saleNumber: string; saleType: string; customerName: string | null; prescriptionId: string | null; cashierId: string; saleDate: string; currency: string; totalAmount: string; paidAmount: string; remainingAmount: string; paymentMethod: string | null; paymentStatus: string; pharmacistValidationStatus: string; status: string; stockImpactApplied: boolean; lines: Line[]; refunds: unknown[]; anomalies: unknown[] };
type Data = { metrics: Record<string, number | null>; financialKpiReliable: { today: boolean; month: boolean }; currency: string; sales: Sale[]; pagination: { page: number; pageSize: number; total: number; totalUnfiltered: number; pageCount: number }; products: Opt[]; members: Opt[]; departments: Opt[]; movements: Array<{ id: string; movementType: string; quantity: string; createdAt: string }> };
type FLine = { productId: string; batchId: string; quantity: string; unit: string; unitPrice: string; lineDiscount: string; notes: string };
type Form = { saleNumber: string; saleType: string; customerName: string; customerPhone: string; customerType: string; prescriptionId: string; prescriberName: string; cashierId: string; departmentId: string; saleDate: string; currency: string; globalDiscount: string; taxAmount: string; paidAmount: string; paymentMethod: string; paymentReference: string; notes: string; lines: FLine[] };
type Tab = "dashboard" | "new" | "today" | "history" | "lines" | "validation" | "refunds" | "exceptional" | "receipts" | "anomalies" | "movements";

const LABELS: Record<string, string> = {
  COUNTER: "Vente comptoir",
  PRESCRIPTION: "Dispensation sur ordonnance",
  INSURANCE: "Assurance / prise en charge",
  CREDIT: "Vente à crédit",
  INTERNAL_EXIT: "Sortie interne",
  EXCEPTIONAL_EXIT: "Sortie exceptionnelle",
  OTHER: "Autre",
  DRAFT: "Brouillon",
  PHARMACIST_VALIDATION: "En validation pharmacien",
  VALIDATED: "Validée",
  PAID: "Payée",
  PARTIALLY_PAID: "Partiellement payée",
  UNPAID: "Non payée",
  CANCELLED: "Annulée",
  REFUNDED: "Remboursée",
  REJECTED: "Rejetée",
  PENDING: "En attente",
  SALE: "Vente",
  SALE_CANCELLATION: "Annulation de vente",
  CASH: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  CARD: "Carte",
  TRANSFER: "Virement",
};
const HELP: Record<string, string> = {
  saleType: "Nature de la vente ou dispensation.",
  currency: "Devise saisie pour cette vente, convertie côté serveur vers la devise principale.",
  cashierId: "Collaborateur responsable de la vente.",
  prescriptionId: "Ordonnance liée, si disponible.",
  productId: "Produit actif à vendre.",
  batchId: "Lot vendable proposé selon l'ordre FEFO.",
  quantity: "Quantité à sortir du stock.",
  unitPrice: "Prix unitaire appliqué.",
  paidAmount: "Montant déjà encaissé.",
};

const emptyLine = (product?: Opt): FLine => ({
  productId: product?.id || "",
  batchId: "",
  quantity: "1",
  unit: product?.stockUnit || "unité",
  unitPrice: product?.referenceSalePrice || "0",
  lineDiscount: "0",
  notes: "",
});
const emptyForm = (data: Data | null): Form => ({
  saleNumber: "",
  saleType: "COUNTER",
  customerName: "",
  customerPhone: "",
  customerType: "COUNTER",
  prescriptionId: "",
  prescriberName: "",
  cashierId: data?.members[0]?.id || "",
  departmentId: "",
  saleDate: new Date().toISOString().slice(0, 10),
  currency: data?.currency || "",
  globalDiscount: "0",
  taxAmount: "0",
  paidAmount: "0",
  paymentMethod: "CASH",
  paymentReference: "",
  notes: "",
  lines: [emptyLine()],
});

export function PharmacySalesWorkspace({ organizationId }: { organizationId: string }) {
  const locale = useAppLocale() || "fr";
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Sale | null>(null);
  const [form, setForm] = useState<Form>(() => emptyForm(null));
  const [notice, setNotice] = useState<ToastNotice | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  useToastMessage(notice);

  useEffect(() => {
    const timeout = setTimeout(() => { setPage(1); setDebouncedQuery(query); }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "12", q: debouncedQuery, view: tab });
      const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/sales?${params.toString()}`, { cache: "no-store", signal });
      const body = await response.json().catch(() => null) as Data | null;
      if (signal?.aborted) return;
      if (response.ok && body) setData(body);
      else setNotice({ description: "Chargement des ventes impossible. Vérifiez votre connexion ou réessayez.", tone: "error" });
    } catch {
      if (!signal?.aborted) setNotice({ description: "Impossible de charger les ventes. Vérifiez votre connexion.", tone: "error" });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [organizationId, page, debouncedQuery, tab]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const productMap = useMemo(() => new Map((data?.products || []).map((product) => [product.id, product])), [data]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/sales`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setNotice(actionFeedback(response.ok, body, { success: "Vente enregistrée.", failure: "Enregistrement impossible." }));
    if (response.ok) {
      setOpen(false);
      await load();
    }
  }

  async function action(sale: Sale, actionName: string, extra: Record<string, unknown> = {}) {
    const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/sales/${sale.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, ...extra }) });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setNotice(actionFeedback(response.ok, body, { success: "Action de vente enregistrée.", failure: "Action impossible." }));
    if (response.ok) {
      setDetail(null);
      await load();
    }
  }

  function updateLine(index: number, key: keyof FLine, value: string) {
    setForm((current) => ({ ...current, lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line) }));
  }

  const sales = data?.sales || [];
  const pagination = data?.pagination;
  const changeTab = (next: Tab) => { setPage(1); setTab(next); };

  return <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4">
    <div className="flex flex-wrap justify-between gap-3">
      <div>
        <h3 className="text-lg font-black text-dtsc-ink">Sorties, ventes & dispensation</h3>
        <p className="text-sm text-dtsc-muted">Panier, contrôle pharmacien, paiement léger et sortie stock FEFO.</p>
      </div>
      <Button disabled={!data?.currency} onClick={() => { setForm(emptyForm(data)); setOpen(true); }} className="w-full bg-[#002b5b] text-white sm:w-auto"><Plus />Nouvelle vente</Button>
    </div>
    {data && !data.currency && <p role="alert" className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Configurez la devise principale de la pharmacie avant de créer une vente.</p>}
    <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
      {([
        ["dashboard", "Tableau de bord"],
        ["new", "Nouvelle vente / dispensation"],
        ["today", "Ventes du jour"],
        ["history", "Historique des ventes"],
        ["lines", "Lignes de vente"],
        ["validation", "Validations pharmacien"],
        ["refunds", "Annulations & remboursements"],
        ["exceptional", "Sorties exceptionnelles"],
        ["receipts", "Reçus / factures"],
        ["anomalies", "Anomalies de vente"],
        ["movements", "Historique des mouvements"],
      ] as Array<[Tab, string]>).map(([code, title]) => <button key={code} type="button" disabled={code === "new" && !data?.currency} onClick={() => code === "new" ? (setForm(emptyForm(data)), setOpen(true)) : changeTab(code)} aria-current={tab === code ? "page" : undefined} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50 ${tab === code ? "border-emerald-400 text-emerald-700" : "border-dtsc-border text-dtsc-muted"}`}>{title}</button>)}
    </div>
    {loading && <p className="py-2 text-xs text-dtsc-muted" role="status">Actualisation des ventes…</p>}
    {tab === "dashboard" ? <>
        {data && (!data.financialKpiReliable?.today || !data.financialKpiReliable?.month) &&
          <p role="alert" className="my-3 min-w-0 break-words rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
            {translate(locale, "pharmacySaleKpis.currencyWarning")}
          </p>}
        <Metrics metrics={data?.metrics || {}} currency={data?.currency || ""} locale={locale} />
      </>
      : tab === "movements" ? <><p className="mb-2 text-xs text-dtsc-muted">100 derniers mouvements (historique récent).</p><Grid>{(data?.movements || []).map((movement) => <Card key={movement.id} title={label(movement.movementType)} text={`${movement.quantity} · ${formatDate(movement.createdAt)}`} />)}</Grid></>
      : <>
        <ListControls query={query} onQueryChange={setQuery} page={page} pageCount={pagination?.pageCount || 1} totalCount={pagination?.totalUnfiltered || 0} filteredCount={pagination?.total || 0} onPageChange={setPage} placeholder="Numéro, client ou statut..." />
        {tab === "lines" ?
        <Grid>{sales.flatMap((sale) => sale.lines.map((line) => <Card key={line.id} title={productMap.get(line.productId)?.name || "Produit"} text={`${line.quantity} ${line.unit} · ${line.totalLine} ${sale.currency || data?.currency || "—"}`} />))}</Grid> :
          <Grid>{sales.map((sale) => <SaleCard key={sale.id} sale={sale} actions={actions(sale, setDetail, action)} />)}</Grid>}
        {!loading && !sales.length && <p className="py-6 text-center text-sm text-dtsc-muted">Aucune vente pour ces critères.</p>}
      </>}
    <SaleForm organizationId={organizationId} open={open} close={() => setOpen(false)} form={form} setForm={setForm} data={data} updateLine={updateLine} save={save} />
    <Dialog open={Boolean(detail)} title={detail?.saleNumber || "Détail vente"} description="Traçabilité de la vente et actions contrôlées." onClose={() => setDetail(null)} className="h-[94dvh] max-w-5xl">
      {detail && <Detail sale={detail} products={productMap} action={action} />}
    </Dialog>
  </section>;
}

function Metrics({ metrics, currency, locale }: { metrics: Record<string, number | null>; currency: string; locale: string }) {
  const amount = (value: number | null | undefined) => value === null
    ? translate(locale, "pharmacySaleKpis.unavailable")
    : `${new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 2 }).format(value ?? 0)} ${currency}`;
  return <Grid>{[
    ["Ventes du jour", metrics.today],
    ["Ventes du mois", metrics.month],
    [translate(locale, "pharmacySaleKpis.todayAmount"), amount(metrics.todayAmount)],
    [translate(locale, "pharmacySaleKpis.monthAmount"), amount(metrics.monthAmount)],
    ["Ventes payées", metrics.paid],
    ["Partiellement payées", metrics.partial],
    ["Annulées", metrics.cancelled],
    ["Remboursements", metrics.refunds],
    ["Validations en attente", metrics.pendingValidation],
    ["Liées à ordonnance", metrics.prescriptions],
    ["Anomalies ouvertes", metrics.anomalies],
    ["Stock impacté aujourd'hui", metrics.stockImpacted],
  ].map(([title, value]) => <Card key={String(title)} title={String(title)} text={String(value ?? 0)} />)}</Grid>;
}

function SaleCard({ sale, actions: menuActions }: { sale: Sale; actions: ActionMenuItem[] }) {
  return <article className="dtsc-glass-list-item min-w-0 rounded-2xl p-4">
    <div className="flex justify-between gap-2">
      <div className="min-w-0">
        <Badge value={sale.status} />
        <h4 className="mt-2 truncate font-black">{sale.saleNumber}</h4>
        <p className="text-xs text-dtsc-muted">{sale.customerName || "Vente anonyme"} · {formatDate(sale.saleDate)}</p>
      </div>
      <ActionMenu items={menuActions} />
    </div>
    <p className="mt-2 text-xs text-dtsc-muted">{sale.lines.length} ligne(s) · {sale.totalAmount} {sale.currency || "—"} · {label(sale.paymentStatus)} · {sale.stockImpactApplied ? "Stock impacté" : "Stock non impacté"}</p>
  </article>;
}

function actions(sale: Sale, setDetail: (sale: Sale) => void, action: (sale: Sale, actionName: string, extra?: Record<string, unknown>) => Promise<void>): ActionMenuItem[] {
  const items: ActionMenuItem[] = [{ key: "view", label: "Voir détail", icon: Eye, onSelect: () => setDetail(sale) }];
  if (sale.pharmacistValidationStatus === "PENDING") items.push({ key: "validate", label: "Valider comme pharmacien", icon: BadgeCheck, onSelect: () => void action(sale, "pharmacist-validate") });
  if (!sale.stockImpactApplied && sale.pharmacistValidationStatus !== "PENDING") items.push({ key: "confirm", label: "Valider et sortir du stock", icon: Send, onSelect: () => void action(sale, "confirm") });
  return items;
}

function Detail({ sale, products, action }: { sale: Sale; products: Map<string, Opt>; action: (sale: Sale, actionName: string, extra?: Record<string, unknown>) => Promise<void> }) {
  const [reason, setReason] = useState("");
  return <div className="grid gap-3">
    {sale.lines.map((line) => <Card key={line.id} title={products.get(line.productId)?.name || "Produit"} text={`${line.quantity} ${line.unit} · ${line.totalLine} ${sale.currency || "—"}`} />)}
    {sale.stockImpactApplied && <div className="rounded-xl border border-red-300 p-3">
      <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motif obligatoire" />
      <Button className="mt-2" variant="outline" disabled={!reason} onClick={() => void action(sale, "cancel", { reason })}><Undo2 />Annuler et restaurer le stock</Button>
    </div>}
  </div>;
}

function SaleForm({ organizationId, open, close, form, setForm, data, updateLine, save }: { organizationId: string; open: boolean; close: () => void; form: Form; setForm: React.Dispatch<React.SetStateAction<Form>>; data: Data | null; updateLine: (index: number, key: keyof FLine, value: string) => void; save: (event: FormEvent) => Promise<void> }) {
  return <Dialog open={open} title="Nouvelle vente / dispensation" description="Formulaire plein écran avec lots vendables FEFO." onClose={close} className="h-[96dvh] max-w-6xl">
    <form onSubmit={save} className="grid min-w-0 gap-4 overflow-x-hidden">
      <Section title="Informations vente">
        <GridFields>
          <Choice name="saleType" labelText="Type de vente" value={form.saleType} onChange={(value) => setForm((current) => ({ ...current, saleType: value }))} options={["COUNTER", "PRESCRIPTION", "INSURANCE", "CREDIT", "INTERNAL_EXIT", "EXCEPTIONAL_EXIT", "OTHER"].map((value) => [value, label(value)])} />
          <Choice name="currency" labelText="Devise de vente" value={form.currency} onChange={(value) => setForm((current) => ({ ...current, currency: value }))} options={[["USD", "Dollar américain (USD)"], ["CDF", "Franc congolais (CDF)"], ["EUR", "Euro (EUR)"]]} />
          <Choice name="cashierId" labelText="Caissier" value={form.cashierId} onChange={(value) => setForm((current) => ({ ...current, cashierId: value }))} options={(data?.members || []).map((member) => [member.id, member.name || "Collaborateur"])} />
          <ReferenceChoice organizationId={organizationId} open={open} kind="prescriptions" labelText="Ordonnance liée" value={form.prescriptionId} onChange={(value) => setForm((current) => ({ ...current, prescriptionId: value }))} />
          <Field name="customerName" labelText="Client ou patient"><Input value={form.customerName} onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))} /></Field>
        </GridFields>
      </Section>
      <Section title="Panier et lots FEFO">
        {form.lines.map((line, index) => <div key={index} className="grid min-w-0 gap-3 rounded-xl border p-3 md:grid-cols-2 xl:grid-cols-3">
          <ReferenceChoice organizationId={organizationId} open={open} kind="products" labelText="Produit" value={line.productId} onChange={(value, product) => {
            setForm((current) => ({ ...current, lines: current.lines.map((item, lineIndex) => lineIndex === index ? {
              ...item, productId: value, batchId: "", unit: product?.stockUnit || "unité", unitPrice: product?.referenceSalePrice || "0",
            } : item) }));
          }} />
          <ReferenceChoice key={`batch-${index}-${line.productId}`} organizationId={organizationId} open={open} kind="batches" labelText="Lot vendable FEFO" productId={line.productId} value={line.batchId} onChange={(value) => updateLine(index, "batchId", value)} />
          <Field name="quantity" labelText="Quantité"><Input required type="number" min="0.001" step="any" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} /></Field>
          <Field name="unitPrice" labelText={`Prix unitaire (${form.currency})`}><Input required type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} /></Field>
        </div>)}
        <Button type="button" variant="outline" onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, emptyLine()] }))}><Plus />Ajouter un produit</Button>
      </Section>
      <Section title="Encaissement">
        <p className="text-sm text-dtsc-muted">La vente est créée non payée. Enregistrez ensuite chaque encaissement dans le module Caisse, factures & paiements afin de conserver la session, le mode et l&apos;audit.</p>
      </Section>
      <div className="grid gap-2 sm:flex">
        <Button className="bg-[#002b5b] text-white">Enregistrer brouillon</Button>
        <Button type="button" variant="outline" onClick={close}>Retour</Button>
      </div>
    </form>
  </Dialog>;
}

function ReferenceChoice({ organizationId, open, kind, labelText, value, onChange, productId }: {
  organizationId: string;
  open: boolean;
  kind: "products" | "batches" | "prescriptions";
  labelText: string;
  value: string;
  productId?: string;
  onChange: (value: string, selected: SaleReference | null) => void;
}) {
  const locale = useAppLocale() || "fr";
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SaleReferenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => { setPage(1); setDebouncedQuery(query); }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!open || (kind === "batches" && !productId)) {
      setResult(null);
      setError(false);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ kind, q: debouncedQuery, page: String(page), pageSize: "20", selectedId: value });
    if (kind === "batches" && productId) params.set("productId", productId);
    setLoading(true);
    setError(false);
    void fetch(`/api/enterprise/${organizationId}/pharmacy/sales/references?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("REFERENCE_SEARCH_UNAVAILABLE");
        return response.json() as Promise<SaleReferenceResult>;
      })
      .then((next) => { if (!controller.signal.aborted) setResult(next); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [organizationId, kind, open, productId, debouncedQuery, page, value]);

  const selected = result?.selected;
  const options = new Map((result?.items || []).map((item) => [item.id, item]));
  if (selected) options.set(selected.id, selected);
  // Keep the selected ID visible during search, even before a response arrives.
  if (value && !options.has(value)) options.set(value, { id: value, title: translate(locale, loading ? "pharmacySaleReferences.loading" : "pharmacySaleReferences.unavailable") });
  const disabled = !open || (kind === "batches" && !productId);

  return <div className="grid min-w-0 gap-2">
    <Input value={query} disabled={disabled} onChange={(event) => setQuery(event.target.value)}
      aria-label={`${labelText} — ${translate(locale, "pharmacySaleReferences.search")}`}
      placeholder={translate(locale, "pharmacySaleReferences.search")} />
    <Choice name={kind} labelText={labelText} value={value} disabled={disabled}
      onChange={(next) => onChange(next, options.get(next) || null)}
      options={[...options.values()].map((item) => [item.id, item.title])} />
    {disabled && kind === "batches" ? <p className="text-xs text-dtsc-muted">{translate(locale, "pharmacySaleReferences.chooseProduct")}</p> : null}
    {loading ? <p role="status" className="text-xs text-dtsc-muted">{translate(locale, "pharmacySaleReferences.loading")}</p> : null}
    {error ? <p role="alert" className="text-xs text-red-600 dark:text-red-400">{translate(locale, "pharmacySaleReferences.error")}</p> : null}
    {!loading && !error && result?.total === 0 && !disabled ? <p className="text-xs text-dtsc-muted">{translate(locale, "pharmacySaleReferences.empty")}</p> : null}
    {result && result.pageCount > 1 ? <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
      <Button type="button" size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>{translate(locale, "pharmacySaleReferences.previous")}</Button>
      <span aria-live="polite">{page} / {result.pageCount}</span>
      <Button type="button" size="sm" variant="outline" disabled={page >= result.pageCount || loading} onClick={() => setPage((current) => current + 1)}>{translate(locale, "pharmacySaleReferences.next")}</Button>
    </div> : null}
  </div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 space-y-3 overflow-hidden rounded-2xl border p-3"><h4 className="font-black text-emerald-600">{title}</h4>{children}</section>;
}
function GridFields({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}
function Grid({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}
function Card({ title, text }: { title: string; text: string }) {
  return <article className="rounded-2xl border bg-dtsc-surface p-4"><p className="font-black text-dtsc-ink">{title}</p><p className="mt-1 text-sm text-dtsc-muted">{text}</p></article>;
}
function Field({ name, labelText, children }: { name: string; labelText: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1">
    <span className="flex items-center gap-1 text-xs font-black uppercase text-dtsc-muted">{labelText}{HELP[name] && <span title={HELP[name]} aria-label={HELP[name]}><CircleHelp className="h-3.5 w-3.5" /></span>}</span>
    {children}
  </label>;
}
function Choice({ name, labelText, value, onChange, options, disabled = false }: { name: string; labelText: string; value: string; onChange: (value: string) => void; options: string[][]; disabled?: boolean }) {
  return <Field name={name} labelText={labelText}><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-11 w-full min-w-0 truncate rounded-xl border bg-dtsc-surface px-3 disabled:opacity-60"><option value="">Sélectionner...</option>{options.map(([id, optionLabel]) => <option key={id} value={id}>{optionLabel}</option>)}</select></Field>;
}
function Badge({ value }: { value: string }) {
  return <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-xs font-black text-emerald-700">{label(value)}</span>;
}
function label(value: string) {
  return LABELS[value] || value.replaceAll("_", " ").toLocaleLowerCase("fr");
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}
