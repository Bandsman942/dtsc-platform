"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Eye, PackageCheck, Plus, RefreshCcw, Send, ShoppingCart, XCircle } from "lucide-react";
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
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type QuoteLine = {
  id: string;
  catalogItemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountRate: string;
  taxRate: string;
};

type Quote = {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  businessPartyId: string;
  status: string;
  currency: string;
  subtotal: string | number;
  discountTotal: string | number;
  taxTotal: string | number;
  totalAmount: string | number;
  validUntil: string | null;
  revision: number;
  items: Array<{ id: string; description: string; quantity: string | number; unitPrice: string | number; lineTotal: string | number }>;
};

type SalesOrder = {
  id: string;
  reference: string;
  title: string;
  status: string;
  businessPartyId: string;
  currency: string;
  totalAmount: string | number;
  expectedFulfillmentAt: string | null;
  revision: number;
  items: Array<{ id: string; description: string; quantityOrdered: string | number; quantityFulfilled: string | number; quantityRemaining: string | number }>;
  fulfillments: Array<{ id: string; reference: string; status: string; createdAt: string }>;
};

type Party = { id: string; legalName: string; displayName: string | null; roles?: Array<{ roleCode: string }> };
type CatalogItem = { id: string; code: string; name: string; itemType: string; salesPrice: string | number | null; currency: string | null };
type Warehouse = { id: string; code: string; name: string };

type Lookups = {
  parties: Party[];
  warehouses: Warehouse[];
};

const QUOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  SENT: "Envoyé",
  ACCEPTED: "Accepté",
  REJECTED: "Refusé",
  EXPIRED: "Expiré",
  CONVERTED: "Converti en commande",
  CANCELLED: "Annulé",
};
const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  PENDING_APPROVAL: "En attente de validation",
  CONFIRMED: "À préparer",
  PARTIALLY_FULFILLED: "Partiellement livré",
  FULFILLED: "Livré",
  CLOSED: "Clôturé",
  CANCELLED: "Annulé",
};

function statusTone(status: string) {
  if (["ACCEPTED", "CONVERTED", "FULFILLED", "CLOSED"].includes(status)) return "success" as const;
  if (["SENT", "PENDING_APPROVAL", "CONFIRMED", "PARTIALLY_FULFILLED"].includes(status)) return "warning" as const;
  if (["REJECTED", "EXPIRED", "CANCELLED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

function money(value: string | number, currency: string) {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency}`;
  }
}

function newLine(index: number): QuoteLine {
  return { id: `line-${Date.now()}-${index}`, catalogItemId: "", description: "", quantity: "1", unitPrice: "0", discountRate: "0", taxRate: "0" };
}

export function EnterpriseSalesOperationsWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  const [tab, setTab] = useState("QUOTES");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [quoteDetail, setQuoteDetail] = useState<Quote | null>(null);
  const [orderDetail, setOrderDetail] = useState<SalesOrder | null>(null);
  const [fulfillTarget, setFulfillTarget] = useState<SalesOrder | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([newLine(0)]);
  const [lookups, setLookups] = useState<Lookups>({ parties: [], warehouses: [] });
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch(`/api/enterprise/${organizationId}/professional-lookups?module=SALES_QUOTES_ORDERS`, { cache: "no-store" }).then((response) => response.json()) as Promise<Lookups>,
      fetch(`/api/enterprise/${organizationId}/catalog-items?page=1&pageSize=200&status=ACTIVE`, { cache: "no-store" }).then(async (response) => response.ok ? response.json() : ({ items: [] })) as Promise<{ items?: CatalogItem[] }>,
    ]).then(([lookupBody, catalogBody]) => {
      if (!active) return;
      setLookups({ parties: lookupBody.parties || [], warehouses: lookupBody.warehouses || [] });
      setCatalogItems(catalogBody.items || []);
    }).catch(() => {
      if (active) setMessage("Les sélecteurs commerciaux ne sont pas disponibles pour le moment.");
    });
    return () => { active = false; };
  }, [organizationId, refreshKey]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (search.trim()) value.set("search", search.trim());
    if (status) value.set("status", status);
    return value;
  }, [page, search, status]);
  const quotes = useProfessionalCollection<Quote>({ endpoint: `/api/enterprise/${organizationId}/quotes`, params, refreshKey });
  const orders = useProfessionalCollection<SalesOrder>({ endpoint: `/api/enterprise/${organizationId}/sales-orders`, params, refreshKey });
  const activeCollection = tab === "QUOTES" ? quotes : orders;

  function updateLine(lineId: string, key: keyof QuoteLine, value: string) {
    setLines((current) => current.map((line) => {
      if (line.id !== lineId) return line;
      const next = { ...line, [key]: value };
      if (key === "catalogItemId") {
        const item = catalogItems.find((candidate) => candidate.id === value);
        if (item) {
          next.description = item.name;
          next.unitPrice = String(item.salesPrice || 0);
        }
      }
      return next;
    }));
  }

  async function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/quotes`, {
        businessPartyId: String(form.get("businessPartyId") || ""),
        title: String(form.get("title") || ""),
        description: String(form.get("description") || "") || null,
        currency: String(form.get("currency") || "USD"),
        validUntil: String(form.get("validUntil") || "") || null,
        ownerUserId: String(form.get("ownerUserId") || "") || null,
        terms: String(form.get("terms") || "") || null,
        items: lines.map((line) => ({
          catalogItemId: line.catalogItemId || null,
          description: line.description,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          discountRate: Number(line.discountRate),
          taxRate: Number(line.taxRate),
        })),
      });
      setCreateOpen(false);
      setLines([newLine(0)]);
      setRefreshKey((value) => value + 1);
      setMessage("Le devis a été enregistré en brouillon.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La création du devis a échoué.");
    }
  }

  async function transitionQuote(quote: Quote, targetStatus: string) {
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/quotes/${quote.id}/transition`, { targetStatus, revision: quote.revision });
      setQuoteDetail(null);
      setRefreshKey((value) => value + 1);
      setMessage("Le statut du devis a été mis à jour.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La transition du devis a échoué.");
    }
  }

  async function convertQuote(quote: Quote) {
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/quotes/${quote.id}/convert`, { revision: quote.revision });
      setQuoteDetail(null);
      setTab("ORDERS");
      setRefreshKey((value) => value + 1);
      setMessage("Le devis accepté a été converti en commande une seule fois.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La conversion en commande a échoué.");
    }
  }

  async function fulfillOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fulfillTarget) return;
    const form = new FormData(event.currentTarget);
    const items = fulfillTarget.items.map((item) => ({
      salesOrderItemId: item.id,
      quantityFulfilled: Number(form.get(`quantity_${item.id}`) || 0),
      notes: String(form.get(`notes_${item.id}`) || "") || null,
    })).filter((item) => item.quantityFulfilled > 0);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/sales-orders/${fulfillTarget.id}/fulfill`, {
        fulfillmentType: "PRODUCT_DELIVERY",
        warehouseId: String(form.get("warehouseId") || "") || null,
        acceptedByCustomer: form.get("acceptedByCustomer") === "on",
        acceptanceNotes: String(form.get("acceptanceNotes") || "") || null,
        idempotencyKey: crypto.randomUUID(),
        notes: String(form.get("notes") || "") || null,
        revision: fulfillTarget.revision,
        items,
      });
      setFulfillTarget(null);
      setRefreshKey((value) => value + 1);
      setMessage("La livraison a été enregistrée sans dépasser les quantités commandées.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La livraison n’a pas pu être enregistrée.");
    }
  }

  function quoteActions(quote: Quote): BusinessContextAction[] {
    return [
      { id: "open", label: "Ouvrir", icon: Eye, onSelect: () => setQuoteDetail(quote) },
      ...(quote.status === "DRAFT" ? [{ id: "send", label: "Envoyer", icon: Send, onSelect: () => void transitionQuote(quote, "SENT") }] : []),
      ...(quote.status === "SENT" ? [
        { id: "accept", label: "Marquer accepté", icon: CheckCircle2, onSelect: () => void transitionQuote(quote, "ACCEPTED") },
        { id: "reject", label: "Marquer refusé", icon: XCircle, destructive: true, onSelect: () => void transitionQuote(quote, "REJECTED") },
      ] : []),
      ...(quote.status === "ACCEPTED" ? [{ id: "convert", label: "Convertir en commande", icon: ShoppingCart, onSelect: () => void convertQuote(quote) }] : []),
      ...(["DRAFT", "SENT", "ACCEPTED"].includes(quote.status) ? [{ id: "cancel", label: "Annuler", icon: XCircle, destructive: true, separatorBefore: true, onSelect: () => void transitionQuote(quote, "CANCELLED") }] : []),
    ];
  }

  function orderActions(order: SalesOrder): BusinessContextAction[] {
    return [
      { id: "open", label: "Ouvrir", icon: Eye, onSelect: () => setOrderDetail(order) },
      ...(["CONFIRMED", "PARTIALLY_FULFILLED"].includes(order.status) ? [{ id: "fulfill", label: "Enregistrer une livraison", icon: PackageCheck, onSelect: () => setFulfillTarget(order) }] : []),
    ];
  }

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`Chaîne ventes · ${organizationName}`}
        title="Devis, commandes et livraisons"
        description={`${definition.descriptionFr} Les montants restent calculés côté serveur et chaque livraison est idempotente.`}
        count={`${quotes.pagination.total} devis · ${orders.pagination.total} commandes`}
        primaryAction={quotes.canManage ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />Nouveau devis</Button> : undefined}
      />
      <ModuleMetrics label="Indicateurs commerciaux">
        <ModuleMetric label="Devis en brouillon" value={quotes.metrics.draft || 0} />
        <ModuleMetric label="Devis envoyés" value={quotes.metrics.sent || 0} />
        <ModuleMetric label="Devis acceptés" value={quotes.metrics.accepted || 0} />
        <ModuleMetric label="Commandes à préparer" value={orders.metrics.confirmed || 0} />
        <ModuleMetric label="Livraisons partielles" value={orders.metrics.partial || 0} />
      </ModuleMetrics>
      <ModuleToolbar
        search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Référence, titre ou client…" />}
        controls={<><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={[{ id: "QUOTES", label: "Devis", count: quotes.pagination.total }, { id: "ORDERS", label: "Commandes", count: orders.pagination.total }]} /><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: "Tous les statuts" }, ...Object.entries(tab === "QUOTES" ? QUOTE_STATUS_LABELS : ORDER_STATUS_LABELS).map(([id, label]) => ({ id, label }))]} /></>}
        summary="Aucun identifiant technique n’est demandé à l’utilisateur."
      />
      <ModuleContent>
        {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold text-dtsc-ink">{message}</div> : null}
        <ModuleSection title={tab === "QUOTES" ? "Devis commerciaux" : "Commandes clients"} description={tab === "QUOTES" ? "Réviser, envoyer, accepter puis convertir un devis en commande." : "Suivre les quantités commandées, livrées et restant à traiter."}>
          {activeCollection.error ? <ProfessionalError message={activeCollection.error} /> : activeCollection.loading ? <ProfessionalLoading /> : tab === "QUOTES" ? (
            quotes.items.length ? <BusinessList ariaLabel="Devis commerciaux">{quotes.items.map((quote) => <BusinessListItem key={quote.id} title={`${quote.reference} · ${quote.title}`} status={<StatusBadge tone={statusTone(quote.status)}>{QUOTE_STATUS_LABELS[quote.status] || quote.status}</StatusBadge>} meta={`${money(quote.totalAmount, quote.currency)}${quote.validUntil ? ` · Valable jusqu’au ${new Date(quote.validUntil).toLocaleDateString("fr-FR")}` : ""}`} description={`${quote.items.length} ligne${quote.items.length > 1 ? "s" : ""} · Remises ${money(quote.discountTotal, quote.currency)} · Taxes ${money(quote.taxTotal, quote.currency)}`} onOpen={() => setQuoteDetail(quote)} openLabel={`Ouvrir le devis ${quote.reference}`} actions={<ContextActions label="Actions du devis" actions={quoteActions(quote)} />} />)}</BusinessList> : <EmptyState compact title="Aucun devis" description="Vérifiez le catalogue et les tiers, puis créez le premier devis professionnel." />
          ) : orders.items.length ? <BusinessList ariaLabel="Commandes clients">{orders.items.map((order) => <BusinessListItem key={order.id} title={`${order.reference} · ${order.title}`} status={<StatusBadge tone={statusTone(order.status)}>{ORDER_STATUS_LABELS[order.status] || order.status}</StatusBadge>} meta={`${money(order.totalAmount, order.currency)} · ${order.items.length} ligne${order.items.length > 1 ? "s" : ""}`} description={`${order.fulfillments.length} livraison${order.fulfillments.length > 1 ? "s" : ""} enregistrée${order.fulfillments.length > 1 ? "s" : ""}`} onOpen={() => setOrderDetail(order)} openLabel={`Ouvrir la commande ${order.reference}`} actions={<ContextActions label="Actions de la commande" actions={orderActions(order)} />} />)}</BusinessList> : <EmptyState compact title="Aucune commande" description="Une commande apparaît après conversion contrôlée d’un devis accepté." />}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>Page {activeCollection.pagination.page}/{activeCollection.pagination.pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Précédent</Button><Button variant="outline" disabled={page >= activeCollection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>Suivant</Button></div></div>
        </ModuleSection>
        <ProfessionalHelp moduleCode="SALES_QUOTES_ORDERS" />
      </ModuleContent>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau devis" description="Les calculs définitifs sont recalculés et validés côté serveur." className="h-[96dvh] max-w-5xl">
        <form onSubmit={createQuote} className="grid gap-6">
          <ProfessionalFormSection title="Client et conditions">
            <Field label="Client ou prospect"><NativeSelect name="businessPartyId" required items={[{ id: "", label: "Sélectionner un tiers" }, ...lookups.parties.map((party) => ({ id: party.id, label: party.displayName || party.legalName }))]} /></Field>
            <Field label="Titre du devis"><Input name="title" required /></Field>
            <Field label="Devise"><Input name="currency" defaultValue="USD" maxLength={3} required /></Field>
            <Field label="Validité"><Input name="validUntil" type="date" /></Field>
            <Field label="Description"><textarea name="description" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field>
            <Field label="Conditions"><textarea name="terms" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title="Produits et services" description="Chaque ligne provient du catalogue canonique ou conserve une description métier explicite.">
            <div className="md:col-span-2 grid gap-4">
              {lines.map((line, index) => <div key={line.id} className="grid gap-3 rounded-2xl border border-dtsc-border p-3 md:grid-cols-6"><div className="md:col-span-2"><Field label={`Article ${index + 1}`}><NativeSelect value={line.catalogItemId} onChange={(value) => updateLine(line.id, "catalogItemId", value)} items={[{ id: "", label: "Description libre" }, ...catalogItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field></div><div className="md:col-span-2"><Field label="Description"><Input value={line.description} onChange={(event) => updateLine(line.id, "description", event.target.value)} required /></Field></div><Field label="Quantité"><Input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", event.target.value)} required /></Field><Field label="Prix unitaire"><Input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.id, "unitPrice", event.target.value)} required /></Field><Field label="Remise %"><Input type="number" min="0" max="100" step="0.01" value={line.discountRate} onChange={(event) => updateLine(line.id, "discountRate", event.target.value)} /></Field><Field label="Taxe %"><Input type="number" min="0" max="100" step="0.01" value={line.taxRate} onChange={(event) => updateLine(line.id, "taxRate", event.target.value)} /></Field>{lines.length > 1 ? <div className="md:col-span-2 flex items-end"><Button type="button" variant="outline" onClick={() => setLines((current) => current.filter((candidate) => candidate.id !== line.id))}>Retirer la ligne</Button></div> : null}</div>)}
              <Button type="button" variant="outline" onClick={() => setLines((current) => [...current, newLine(current.length)])}><Plus className="h-4 w-4" />Ajouter une ligne</Button>
            </div>
          </ProfessionalFormSection>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button><Button type="submit">Enregistrer le brouillon</Button></div>
        </form>
      </Dialog>

      <Dialog open={Boolean(quoteDetail)} onClose={() => setQuoteDetail(null)} title={quoteDetail ? `${quoteDetail.reference} · ${quoteDetail.title}` : "Détail du devis"} className="h-[92dvh] max-w-4xl">
        {quoteDetail ? <div className="grid gap-5"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(quoteDetail.status)}>{QUOTE_STATUS_LABELS[quoteDetail.status] || quoteDetail.status}</StatusBadge><StatusBadge>{money(quoteDetail.totalAmount, quoteDetail.currency)}</StatusBadge></div><BusinessList ariaLabel="Lignes du devis">{quoteDetail.items.map((item) => <BusinessListItem key={item.id} title={item.description} meta={`${item.quantity} × ${money(item.unitPrice, quoteDetail.currency)}`} status={<StatusBadge>{money(item.lineTotal, quoteDetail.currency)}</StatusBadge>} />)}</BusinessList><div data-responsive-actions>{quoteActions(quoteDetail).filter((action) => action.id !== "open").map((action) => <Button key={action.id} type="button" variant={action.destructive ? "outline" : "default"} onClick={() => action.onSelect?.()}>{action.label}</Button>)}</div></div> : null}
      </Dialog>

      <Dialog open={Boolean(orderDetail)} onClose={() => setOrderDetail(null)} title={orderDetail ? `${orderDetail.reference} · ${orderDetail.title}` : "Détail de la commande"} className="h-[92dvh] max-w-4xl">
        {orderDetail ? <div className="grid gap-5"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(orderDetail.status)}>{ORDER_STATUS_LABELS[orderDetail.status] || orderDetail.status}</StatusBadge><StatusBadge>{money(orderDetail.totalAmount, orderDetail.currency)}</StatusBadge></div><BusinessList ariaLabel="Quantités de la commande">{orderDetail.items.map((item) => <BusinessListItem key={item.id} title={item.description} meta={`Commandé : ${item.quantityOrdered} · Livré : ${item.quantityFulfilled}`} status={<StatusBadge tone={Number(item.quantityRemaining) > 0 ? "warning" : "success"}>Reste {item.quantityRemaining}</StatusBadge>} />)}</BusinessList>{["CONFIRMED", "PARTIALLY_FULFILLED"].includes(orderDetail.status) ? <Button onClick={() => { setFulfillTarget(orderDetail); setOrderDetail(null); }}><PackageCheck className="h-4 w-4" />Enregistrer une livraison</Button> : null}</div> : null}
      </Dialog>

      <Dialog open={Boolean(fulfillTarget)} onClose={() => setFulfillTarget(null)} title={fulfillTarget ? `Livrer ${fulfillTarget.reference}` : "Nouvelle livraison"} description="Les quantités supérieures au reliquat sont rejetées côté serveur." className="h-[94dvh] max-w-4xl">
        {fulfillTarget ? <form onSubmit={fulfillOrder} className="grid gap-5"><ProfessionalFormSection title="Origine et réception"><Field label="Entrepôt de sortie"><NativeSelect name="warehouseId" items={[{ id: "", label: "Aucun entrepôt pour un service" }, ...lookups.warehouses.map((warehouse) => ({ id: warehouse.id, label: `${warehouse.code} · ${warehouse.name}` }))]} /></Field><Field label="Référence idempotente"><Input value="Générée automatiquement à l’enregistrement" disabled /></Field></ProfessionalFormSection><ProfessionalFormSection title="Quantités livrées"><div className="md:col-span-2 grid gap-3">{fulfillTarget.items.map((item) => <div key={item.id} className="grid gap-3 rounded-xl border border-dtsc-border p-3 md:grid-cols-3"><div className="md:col-span-2"><p className="font-black text-dtsc-ink">{item.description}</p><p className="text-sm text-dtsc-muted">Reliquat : {item.quantityRemaining}</p></div><Field label="Quantité livrée"><Input name={`quantity_${item.id}`} type="number" min="0" max={Number(item.quantityRemaining)} step="0.01" defaultValue="0" /></Field></div>)}</div></ProfessionalFormSection><ProfessionalFormSection title="Preuve et confirmation"><Field label="Notes"><textarea name="notes" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field><Field label="Confirmation client"><label className="mt-3 flex min-h-11 items-center gap-2"><input name="acceptedByCustomer" type="checkbox" />Le destinataire confirme la réception</label></Field><Field label="Observations du destinataire"><Input name="acceptanceNotes" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setFulfillTarget(null)}>Annuler</Button><Button type="submit"><RefreshCcw className="h-4 w-4" />Enregistrer la livraison</Button></div></form> : null}
      </Dialog>
    </ModuleWorkspace>
  );
}
