"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FileClock, Printer, RefreshCw, Search, Send, ShieldAlert, ShoppingBasket, XCircle } from "lucide-react";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { RetailActiveCustomerBar } from "@/components/enterprise/professional/retail-active-customer-bar";
import { RetailInvoiceReturnDialog } from "@/components/enterprise/professional/retail-invoice-return-dialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { customerFacingError } from "@/lib/customer-facing-language";
import { browserCivilDate } from "@/lib/enterprise/retail/civil-date";

type Store = { id: string; code: string; name: string; warehouses: { id: string; code: string; name: string }[] };
type InvoiceItem = { id: string; description: string; quantity: string; totalAmount: string };
type Checkout = {
  id: string;
  siteId: string;
  warehouseId: string;
  lines: { id: string; invoiceItemId: string; inventoryItemId: string | null }[];
  stockPostedAt: string | null;
  canCancel: boolean;
  canSubmit: boolean;
  canCollect: boolean;
  invoice: { id: string; revision: number; number: string; status: string; pendingApproverName?: string | null; currencyCode: string; grandTotal: string; outstandingAmount: string; items: InvoiceItem[] };
  site: { id: string; name: string; code: string };
};
type InvoiceResponse = {
  items: Checkout[];
  sites: Store[];
  checkoutReady: boolean;
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  message?: string;
};
type Product = { id: string; name: string; code: string; sku?: string | null; currency: string | null; indicativeSalePrice: string | null; inventoryItemId: string | null; trackInventory: boolean; availableQuantity: string | null };
type Line = { catalogItemId: string; name: string; code: string; quantity: number; currencyCode: string; unitPrice: string; inventoryItemId: string | null; stockLotId: string | null };
type Lot = { id: string; inventoryItemId: string; lotNumber: string; expiryDate: string | null; quantityAvailable: string };
type PricePreview = { subtotal: string; discountTotal: string; taxTotal: string; grandTotal: string; currencyCode: string; lines: { catalogItemId: string; resolvedUnitPrice: string; discountAmount: string; lineTotal: string }[] };

const language = {
  fr: {
    title: "Facturation au comptoir", lead: "Sélectionnez le client et les articles. Prévisualisez la facture avant de la préparer, sans encaisser dans ce panier.",
    disabled: "Ce circuit est encore en validation. Les tickets POS actuels ne sont pas modifiés ; la préparation de nouvelles factures demeure désactivée.",
    warehouse: "Boutique et dépôt", chooseWarehouse: "Choisir un dépôt", product: "Rechercher un article", search: "Nom, référence ou code article", quantity: "Quantité", add: "Ajouter l'article", lines: "Articles à facturer", prepare: "Préparer la facture impayée", preparing: "Préparation…", clear: "Vider le panier", removed: "Retirer", lot: "Lot de stock", chooseLot: "Choisir un lot", noLines: "Ajoutez un ou plusieurs articles.",
    list: "Factures Retail", all: "Toutes les boutiques", refresh: "Actualiser", loading: "Chargement du registre…", empty: "Aucune facture Retail préparée pour cette sélection.",
    date: "Préparée", outstanding: "Reste dû", paid: "Payée", draft: "Brouillon", pending: "À valider", approved: "Approuvée", issued: "Émise", partial: "Partiellement payée", cancelled: "Annulée", voided: "Invalidée", overdue: "Échue", credited: "Avoir comptabilisé", unknown: "Statut à vérifier", delivered: "Stock délivré", stockPending: "Stock non encore délivré", finance: "Les validations et affectations de paiement sont réalisées dans le module Finance commun, avec les droits de chaque intervenant.",
    pagePrev: "Précédente", pageNext: "Suivante", currencyMismatch: "Une facture ne peut pas mélanger plusieurs devises. Préparez un autre panier pour cet article.", ready: "Circuit en cours d'activation contrôlée", failed: "Impossible de consulter les factures Retail.", saved: "Facture préparée. Elle attend les étapes de validation Finance.", duplicate: "Une facture existe déjà pour cette référence ; son état a été actualisé.",
    cancelDraft: "Annuler le brouillon", cancelTitle: "Confirmer l’annulation de la facture", cancelHint: "Cette opération annule uniquement le brouillon Finance. Elle ne génère ni remboursement ni mouvement de stock.", cancelReason: "Motif de l’annulation", cancelReasonHelp: "Précisez au moins quatre caractères pour conserver une trace de la décision.", cancelConfirm: "Confirmer l’annulation", cancelAbort: "Garder la facture", cancelSuccess: "Le brouillon a été annulé et conservé dans l’historique.", cancelFailed: "L’annulation n’a pas pu être enregistrée.",
    submitDraft: "Soumettre à validation", submitTitle: "Soumettre au validateur Finance", submitHint: "Un responsable indépendant, autorisé dans Finance, doit approuver la facture avant son émission. Aucun encaissement ni stock ne sera enregistré à cette étape.", submitConfirm: "Soumettre la facture", submitSuccess: "Facture soumise au validateur Finance. Son approbation est désormais attendue.", submitFailed: "La facture n’a pas pu être transmise à Finance.", submitNote: "Commentaire de soumission (facultatif)", submitApprover: "Responsable chargé de la validation", submitAbort: "Conserver en brouillon",
    printA4: "Facture A4", printThermal: "Ticket 80 mm", printProforma: "Imprimer la pro-forma A4",
    preview: "Prévisualiser la facture", previewTitle: "Aperçu avant confirmation", previewHint: "PRO FORMA — document non émis. Les prix et taxes sont recalculés par le serveur lors de la confirmation.",
    previewError: "Le calcul des prix et taxes est indisponible. Actualisez la sélection avant de confirmer.", client: "Client au comptoir", subtotal: "Sous-total", discounts: "Remises", tax: "Taxes", total: "Total", confirm: "Confirmer et préparer la facture", invoiceOnly: "Le paiement sera effectué dans Encaissements, par un caissier autorisé.",
  },
  en: {
    title: "Counter invoicing", lead: "Choose a customer and items. Preview the invoice before preparing it, without taking payment in the basket.",
    disabled: "This workflow is still under validation. Existing POS receipts are unaffected; new invoice preparation remains disabled.",
    warehouse: "Store and warehouse", chooseWarehouse: "Choose a warehouse", product: "Find an item", search: "Item name, reference or code", quantity: "Quantity", add: "Add item", lines: "Invoice items", prepare: "Prepare unpaid invoice", preparing: "Preparing…", clear: "Clear basket", removed: "Remove", lot: "Stock batch", chooseLot: "Choose a batch", noLines: "Add one or more items.",
    list: "Retail invoices", all: "All stores", refresh: "Refresh", loading: "Loading invoices…", empty: "No Retail invoices in this selection.",
    date: "Prepared", outstanding: "Outstanding", paid: "Paid", draft: "Draft", pending: "Awaiting approval", approved: "Approved", issued: "Issued", partial: "Partially paid", cancelled: "Cancelled", voided: "Voided", overdue: "Overdue", credited: "Credit note posted", unknown: "Check status", delivered: "Inventory delivered", stockPending: "Inventory not yet delivered", finance: "Approvals and payment allocations are performed in the common Finance module under each actor's permissions.",
    pagePrev: "Previous", pageNext: "Next", currencyMismatch: "An invoice cannot mix currencies. Create another basket for this item.", ready: "Controlled activation in progress", failed: "Retail invoices are unavailable.", saved: "Invoice prepared. It is awaiting Finance approval stages.", duplicate: "An invoice already exists for this reference; its status has been refreshed.",
    cancelDraft: "Cancel draft", cancelTitle: "Confirm invoice cancellation", cancelHint: "Only the Finance draft will be cancelled. No refund or inventory movement is created.", cancelReason: "Cancellation reason", cancelReasonHelp: "Enter at least four characters to preserve the decision trail.", cancelConfirm: "Confirm cancellation", cancelAbort: "Keep invoice", cancelSuccess: "The draft was cancelled and retained in the history.", cancelFailed: "Cancellation could not be recorded.",
    submitDraft: "Submit for approval", submitTitle: "Submit to Finance approver", submitHint: "An independent approver with Finance permissions must approve the invoice before it can be issued. No payment or inventory movement occurs now.", submitConfirm: "Submit invoice", submitSuccess: "Invoice submitted for Finance approval.", submitFailed: "The invoice could not be submitted to Finance.", submitNote: "Submission comment (optional)", submitApprover: "Finance approver", submitAbort: "Keep as draft",
    printA4: "A4 invoice", printThermal: "80 mm receipt", printProforma: "Print A4 pro forma",
    preview: "Preview invoice", previewTitle: "Preview before confirmation", previewHint: "PRO FORMA — not an issued invoice. The server recalculates prices and taxes when you confirm.",
    previewError: "Pricing and tax calculations are unavailable. Refresh before confirming.", client: "Customer at checkout", subtotal: "Subtotal", discounts: "Discounts", tax: "Tax", total: "Total", confirm: "Confirm and prepare invoice", invoiceOnly: "Payment will be collected in Collections by an authorized cashier.",
  },
} as const;

function invoiceStatus(status: string, lang: typeof language.fr | typeof language.en) {
  const values: Record<string, string> = {
    DRAFT: lang.draft, PENDING_APPROVAL: lang.pending, APPROVED: lang.approved, ISSUED: lang.issued,
    PARTIALLY_PAID: lang.partial, PAID: lang.paid, CANCELLED: lang.cancelled, VOIDED: lang.voided, OVERDUE: lang.overdue, CREDIT_NOTE: lang.credited,
  };
  return values[status] || lang.unknown;
}

function money(value: string, currency: string, locale: "fr" | "en") {
  return `${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 2 }).format(Number(value))} ${currency}`;
}

export function RetailInvoiceFlowWorkbench({ organizationId, organizationName, locale, preferredSiteId, mode = "invoices" }: {
  organizationId: string; organizationName?: string; locale: "fr" | "en"; preferredSiteId?: string; mode?: "checkout" | "invoices";
}) {
  const copy = language[locale];
  const [data, setData] = useState<InvoiceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [siteFilter, setSiteFilter] = useState(preferredSiteId || "");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  useEffect(() => {
    if (mode !== "invoices") return;
    const targetNumber = new URLSearchParams(window.location.search).get("q")?.trim();
    if (targetNumber) setInvoiceSearch(targetNumber.slice(0, 100));
  }, [mode]);
  const [invoiceDateFrom, setInvoiceDateFrom] = useState("");
  const [invoiceDateTo, setInvoiceDateTo] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [pricing, setPricing] = useState<PricePreview | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [lots, setLots] = useState<Lot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Checkout | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<Checkout | null>(null);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const idempotencyKey = useRef<string>("");
  const warehouses = useMemo(() => (data?.sites || []).flatMap((site) => site.warehouses.map((warehouse) => ({ ...warehouse, siteId: site.id, siteName: site.name }))), [data?.sites]);
  useEffect(() => {
    if (!preferredSiteId) return;
    setWarehouseId((current) => warehouses.some((warehouse) => warehouse.id === current)
      ? current : warehouses.find((warehouse) => warehouse.siteId === preferredSiteId)?.id || "");
  }, [preferredSiteId, warehouses]);
  const chosenWarehouse = useMemo(() => warehouses.find((warehouse) => warehouse.id === warehouseId), [warehouseId, warehouses]);
  const currencyCode = lines[0]?.currencyCode || "CDF";

  const load = useCallback(async (nextPage = page, site = siteFilter) => {
    setLoading(true);
    try {
      const queryString = new URLSearchParams({ page: String(nextPage), pageSize: "10", ...(site ? { siteId: site } : {}), ...(invoiceSearch.trim() ? { q: invoiceSearch.trim() } : {}), ...(invoiceDateFrom ? { dateFrom: invoiceDateFrom } : {}), ...(invoiceDateTo ? { dateTo: invoiceDateTo } : {}) });
      const response = await fetch(`/api/enterprise/${organizationId}/retail/invoices?${queryString}`, { cache: "no-store" });
      if (response.status === 403) {
        const denied = await response.json().catch(() => null) as { error?: string } | null;
        setError(denied?.error === "RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE"
          ? copy.disabled
          : locale === "fr" ? "Accès refusé : votre profil ne permet pas de consulter le registre des factures de cette boutique." : "Access denied: your profile cannot read this store's invoice register.");
        setForbidden(true);
        return;
      }
      const payload = await response.json().catch(() => null) as InvoiceResponse | null;
      if (!response.ok || !payload?.items || !payload.sites) throw new Error(payload?.message || copy.failed);
      setData(payload);
      setForbidden(false);
      setError("");
    } catch (caught) { setError(customerFacingError(caught, locale)); }
    finally { setLoading(false); }
  }, [copy.disabled, copy.failed, invoiceSearch, invoiceDateFrom, invoiceDateTo, locale, organizationId, page, siteFilter]);
  useEffect(() => { const timeout = window.setTimeout(() => { void load(); }, invoiceSearch ? 220 : 0); return () => window.clearTimeout(timeout); }, [load, invoiceSearch]);

  useEffect(() => {
    if (mode !== "checkout") return;
    let active = true;
    const refreshCustomer = async () => {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/active-customer`, { cache: "no-store" }).catch(() => null);
      if (!active || !response?.ok) return;
      const payload = await response.json().catch(() => null) as { customer?: { id?: string; displayName?: string | null; legalName?: string } | null } | null;
      if (active) { setCustomerId(payload?.customer?.id || null); setCustomerName(payload?.customer?.displayName || payload?.customer?.legalName || ""); }
    };
    const onChange = (event: Event) => {
      if ((event as CustomEvent<{ organizationId: string }>).detail?.organizationId === organizationId) void refreshCustomer();
    };
    void refreshCustomer();
    window.addEventListener("dtsc-retail-customer-changed", onChange);
    return () => { active = false; window.removeEventListener("dtsc-retail-customer-changed", onChange); };
  }, [mode, organizationId]);

  useEffect(() => {
    if (mode !== "checkout" || !data?.checkoutReady || !chosenWarehouse || !lines.length) {
      setPricing(null); setPricingError(""); return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPricingLoading(true);
      try {
        const response = await fetch(`/api/enterprise/${organizationId}/retail/pricing/preview`, {
          method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ siteId: chosenWarehouse.siteId, customerBusinessPartyId: customerId, currencyCode, channelCode: "POS", lines: lines.map((line) => ({ catalogItemId: line.catalogItemId, quantity: line.quantity })) }),
        });
        const payload = await response.json().catch(() => null) as (PricePreview & { message?: string }) | null;
        if (!response.ok || !payload?.grandTotal) throw new Error(payload?.message || copy.previewError);
        if (!controller.signal.aborted) { setPricing(payload); setPricingError(""); }
      } catch (caught) {
        if (!controller.signal.aborted) { setPricing(null); setPricingError(customerFacingError(caught, locale)); }
      } finally { if (!controller.signal.aborted) setPricingLoading(false); }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [chosenWarehouse, copy.previewError, currencyCode, customerId, data?.checkoutReady, lines, locale, mode, organizationId]);

  useEffect(() => {
    if (!data?.checkoutReady || !warehouseId || !query.trim()) { setProducts([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      void fetch(`/api/enterprise/${organizationId}/retail/products/search?${new URLSearchParams({ q: query.trim(), warehouseId, pageSize: "20" })}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => { const payload = await response.json() as { items?: Product[] }; if (!response.ok) throw new Error(); if (!controller.signal.aborted) setProducts(payload.items || []); })
        .catch(() => { if (!controller.signal.aborted) setProducts([]); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [data?.checkoutReady, organizationId, warehouseId, query]);

  useEffect(() => {
    const ids = [...new Set(lines.map((line) => line.inventoryItemId).filter((id): id is string => Boolean(id)))];
    if (!ids.length || !warehouseId) { setLots([]); return; }
    const controller = new AbortController();
    void fetch(`/api/enterprise/${organizationId}/retail/stock-lots?${new URLSearchParams({ warehouseId, inventoryItemIds: ids.join(",") })}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const payload = await response.json() as { items?: Lot[] }; if (!response.ok) throw new Error(); if (!controller.signal.aborted) setLots(payload.items || []); })
      .catch(() => { if (!controller.signal.aborted) setLots([]); });
    return () => controller.abort();
  }, [lines, organizationId, warehouseId]);

  function addProduct(product: Product) {
    if (lines.length && lines[0].currencyCode !== (product.currency || "CDF")) {
      setError(copy.currencyMismatch); return;
    }
    if (product.trackInventory && Number(product.availableQuantity || "0") <= 0) return;
    setLines((current) => current.some((line) => line.catalogItemId === product.id)
      ? current.map((line) => line.catalogItemId === product.id ? { ...line, quantity: line.quantity + 1 } : line)
      : [...current, { catalogItemId: product.id, inventoryItemId: product.inventoryItemId, code: product.sku || product.code, name: product.name, quantity: 1, currencyCode: product.currency || "CDF", unitPrice: product.indicativeSalePrice || "0", stockLotId: null }]);
    idempotencyKey.current = "";
    setPreviewOpen(false);
    setQuery(""); setProducts([]);
  }

  function printProforma() {
    if (!pricing || !chosenWarehouse) return;
    const esc = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
    const rows = lines.map((line) => {
      const priced = pricing.lines.find((item) => item.catalogItemId === line.catalogItemId);
      return `<tr><td>${esc(line.name)}<small>${esc(line.code)}</small></td><td class="num">${esc(line.quantity)}</td><td class="num">${esc(priced?.resolvedUnitPrice || line.unitPrice)}</td><td class="num">${esc(priced?.lineTotal || "0")}</td></tr>`;
    }).join("");
    const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(copy.previewTitle)}</title><style>*{box-sizing:border-box}body{font-family:system-ui,Arial,sans-serif;max-width:790px;margin:0 auto;padding:24px;color:#14314c;background:white}.brand{border-bottom:3px solid #147ab7;padding-bottom:15px}.brand strong{color:#116da9;font-size:21px}.muted{color:#68788a;font-size:12px}.watermark{margin:18px 0;padding:10px;text-align:center;border:2px solid #d97706;color:#92400e;font-weight:800}table{width:100%;border-collapse:collapse;margin-top:20px;font-size:13px}td,th{border-bottom:1px solid #dce5ed;padding:9px 6px;text-align:left}th{background:#eaf4fc}small{display:block;color:#68788a}.num{text-align:right;font-variant-numeric:tabular-nums}.totals{max-width:310px;margin:20px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:5px 0}.grand{font-size:18px;font-weight:800;border-top:2px solid #147ab7}.print{background:#147ab7;color:white;padding:10px 18px;border:0;border-radius:9px;cursor:pointer}@page{size:A4;margin:12mm}@media print{body{padding:0}.print{display:none}}</style></head><body><header class="brand"><strong>${esc(organizationName || "DTSC Retail")}</strong><p>${esc(chosenWarehouse.siteName)} · ${esc(chosenWarehouse.name)}</p><p class="muted">${esc(customerName || (locale === "fr" ? "Client de passage" : "Walk-in customer"))}</p></header><div class="watermark">PRO FORMA · ${esc(copy.previewHint)}</div><table><thead><tr><th>${esc(copy.product)}</th><th class="num">${esc(copy.quantity)}</th><th class="num">${esc(locale === "fr" ? "Prix unitaire" : "Unit price")}</th><th class="num">${esc(copy.total)}</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>${esc(copy.subtotal)}</span><strong>${esc(money(pricing.subtotal, currencyCode, locale))}</strong></div><div><span>${esc(copy.discounts)}</span><strong>${esc(money(pricing.discountTotal, currencyCode, locale))}</strong></div><div><span>${esc(copy.tax)}</span><strong>${esc(money(pricing.taxTotal, currencyCode, locale))}</strong></div><div class="grand"><span>${esc(copy.total)}</span><strong>${esc(money(pricing.grandTotal, currencyCode, locale))}</strong></div></div><p class="muted">${esc(copy.invoiceOnly)}</p><button class="print" onclick="window.print()">${esc(locale === "fr" ? "Imprimer" : "Print")}</button></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function prepare() {
    if (!data?.checkoutReady || !chosenWarehouse || !lines.length || !pricing || pricingLoading || submitting) return;
    setSubmitting(true);
    try {
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
      const response = await fetch(`/api/enterprise/${organizationId}/retail/invoices`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current, siteId: chosenWarehouse.siteId, warehouseId,
          businessPartyId: customerId,
          currencyCode,
          lines: lines.map((line) => ({ catalogItemId: line.catalogItemId, stockLotId: line.stockLotId, quantity: line.quantity })),
        }),
      });
      const payload = await response.json().catch(() => null) as { message?: string; idempotent?: boolean } | null;
      if (!response.ok) throw new Error(payload?.message || copy.failed);
      toastSuccess(payload?.idempotent ? copy.duplicate : copy.saved);
      setLines([]); setLots([]); idempotencyKey.current = "";
      setPreviewOpen(false);
      await fetch(`/api/enterprise/${organizationId}/retail/active-customer`, { method: "DELETE" }).catch(() => null);
      window.dispatchEvent(new CustomEvent("dtsc-retail-customer-changed", { detail: { organizationId } }));
      await load(1, siteFilter);
    } catch (caught) { const message = customerFacingError(caught, locale); setError(message); toastError(message); }
    finally { setSubmitting(false); }
  }

  async function cancelDraft() {
    if (!cancelTarget?.canCancel || cancelling || cancelReason.trim().length < 4) return;
    setCancelling(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/invoices/${encodeURIComponent(cancelTarget.invoice.id)}/transition`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "CANCEL", revision: cancelTarget.invoice.revision, reason: cancelReason.trim() }),
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || copy.cancelFailed);
      toastSuccess(copy.cancelSuccess);
      setCancelTarget(null); setCancelReason("");
      await load(page, siteFilter);
    } catch (caught) { const message = customerFacingError(caught, locale); setError(message); toastError(message); }
    finally { setCancelling(false); }
  }

  async function submitForFinanceApproval(approverUserId: string, reason: string) {
    if (!submitTarget?.canSubmit || !approverUserId || submittingApproval) return;
    setSubmittingApproval(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/invoices/${encodeURIComponent(submitTarget.invoice.id)}/transition`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "SUBMIT", revision: submitTarget.invoice.revision, approverUserId, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || copy.submitFailed);
      toastSuccess(copy.submitSuccess); setSubmitTarget(null);
      await load(page, siteFilter);
    } catch (caught) { const message = customerFacingError(caught, locale); setError(message); toastError(message); }
    finally { setSubmittingApproval(false); }
  }

  if (forbidden) return <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-800 dark:text-amber-200">{error}</p>;
  return <section data-testid="retail-invoice-flow-workbench" className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3"><FileClock className="mt-0.5 h-5 w-5 shrink-0 text-dtsc-blue" aria-hidden="true" /><div className="min-w-0"><h2 className="font-black text-dtsc-ink">{mode === "checkout" ? copy.title : copy.list}</h2><p className="mt-1 text-sm leading-6 text-dtsc-muted">{mode === "checkout" ? copy.lead : copy.finance}</p></div></div>
      <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className="h-4 w-4" />{copy.refresh}</Button>
    </header>
    {error ? <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
    {data && !data.checkoutReady ? <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm leading-6 text-amber-800 dark:text-amber-200"><ShieldAlert className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />{copy.disabled}</p> : null}
    {data?.checkoutReady && mode === "checkout" ? <div className="mt-4 min-w-0 space-y-3">
      <RetailActiveCustomerBar organizationId={organizationId} compact />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="min-w-0 space-y-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
          <label className="block min-w-0 text-xs font-bold text-dtsc-ink">{copy.warehouse}<select className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-surface px-3 text-sm" value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setLines([]); setPreviewOpen(false); idempotencyKey.current = ""; }}><option value="">{copy.chooseWarehouse}</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.siteName} · {warehouse.name}</option>)}</select></label>
          <label className="block min-w-0 text-xs font-bold text-dtsc-ink">{copy.product}<span className="mt-1 flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-dtsc-border bg-dtsc-surface px-3"><Search className="h-4 w-4 shrink-0 text-dtsc-muted" /><input className="w-full min-w-0 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} disabled={!warehouseId} /></span></label>
          {searching ? <p role="status" className="text-xs text-dtsc-muted">{copy.loading}</p> : null}
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">{products.map((product) => <button type="button" key={product.id} disabled={Boolean(product.trackInventory && Number(product.availableQuantity || "0") <= 0)} onClick={() => addProduct(product)} className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-lg border border-dtsc-border bg-dtsc-surface px-3 py-2 text-left text-sm hover:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50"><span className="min-w-0 flex-1"><span className="block break-words font-bold text-dtsc-ink">{product.name}</span><span className="block text-xs text-dtsc-muted">{product.sku || product.code} · {product.trackInventory ? `${product.availableQuantity || "0"} ${locale === "fr" ? "disponibles" : "available"}` : "Service"}</span></span><span className="shrink-0 text-right text-xs font-black text-dtsc-blue">{money(product.indicativeSalePrice || "0", product.currency || "CDF", locale)}<span className="mt-1 block">+ {copy.add}</span></span></button>)}</div>
        </div>
        <div className="min-w-0 space-y-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
          <h3 className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><ShoppingBasket className="h-4 w-4 text-dtsc-blue" />{copy.lines} <span className="ml-auto text-xs text-dtsc-muted">{lines.length}</span></h3>
          {!lines.length ? <p className="rounded-lg bg-dtsc-page p-3 text-sm text-dtsc-muted">{copy.noLines}</p> : null}
          {lines.map((line) => <div key={line.catalogItemId} className="min-w-0 space-y-2 border-b border-dtsc-border pb-2">
            <div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-bold text-dtsc-ink">{line.name}</p><p className="text-xs text-dtsc-muted">{line.code} · {money(pricing?.lines.find((item) => item.catalogItemId === line.catalogItemId)?.resolvedUnitPrice || line.unitPrice, line.currencyCode, locale)}</p></div><Button type="button" size="sm" variant="outline" onClick={() => { idempotencyKey.current = ""; setLines((current) => current.filter((item) => item.catalogItemId !== line.catalogItemId)); }}><XCircle className="h-4 w-4" /></Button></div>
            <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-dtsc-muted">{copy.quantity}<input type="number" min="0.001" max="1000000" step="0.001" value={line.quantity} onChange={(event) => { idempotencyKey.current = ""; setLines((current) => current.map((entry) => entry.catalogItemId === line.catalogItemId ? { ...entry, quantity: Number(event.target.value) } : entry)); }} className="min-h-10 w-24 min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-sm" /><strong className="ml-auto text-dtsc-ink">{money(pricing?.lines.find((item) => item.catalogItemId === line.catalogItemId)?.lineTotal || String(Number(line.unitPrice) * line.quantity), line.currencyCode, locale)}</strong></label>
            {line.inventoryItemId && lots.some((lot) => lot.inventoryItemId === line.inventoryItemId) ? <label className="block min-w-0 text-xs font-semibold text-dtsc-muted">{copy.lot}<select value={line.stockLotId || ""} onChange={(event) => { idempotencyKey.current = ""; setLines((current) => current.map((entry) => entry.catalogItemId === line.catalogItemId ? { ...entry, stockLotId: event.target.value || null } : entry)); }} className="mt-1 block min-h-10 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-sm"><option value="">{copy.chooseLot}</option>{lots.filter((lot) => lot.inventoryItemId === line.inventoryItemId && Number(lot.quantityAvailable) > 0).map((lot) => <option key={lot.id} value={lot.id}>{lot.lotNumber} · {lot.quantityAvailable}</option>)}</select></label> : null}
          </div>)}
          {pricingLoading ? <p role="status" className="text-xs text-dtsc-muted">{locale === "fr" ? "Calcul des prix et taxes…" : "Calculating prices and taxes…"}</p> : null}
          {pricingError ? <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">{pricingError}</p> : null}
          <div className="flex items-center justify-between gap-2 border-t border-dtsc-border pt-3"><span className="text-sm font-black text-dtsc-ink">{copy.total}</span><strong className="text-lg text-dtsc-blue">{money(pricing?.grandTotal || "0", currencyCode, locale)}</strong></div>
          <p className="text-xs leading-5 text-dtsc-muted">{copy.invoiceOnly}</p>
          <div data-responsive-actions className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={!lines.length || submitting} onClick={() => { setLines([]); idempotencyKey.current = ""; }}>{copy.clear}</Button><Button type="button" disabled={!chosenWarehouse || !lines.length || !pricing || pricingLoading || submitting || lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)} onClick={() => setPreviewOpen(true)}><ArrowRight className="h-4 w-4" />{copy.preview}</Button></div>
        </div>
      </div>
    </div> : null}
    <div className="mt-5 border-t border-dtsc-border pt-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-black text-dtsc-ink">{copy.list}</h3>{data?.sites.length ? <select aria-label={copy.warehouse} className="min-h-11 max-w-full rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-sm" value={siteFilter} onChange={(event) => { setSiteFilter(event.target.value); setPage(1); }}><option value="">{copy.all}</option>{data.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select> : null}</div>
      <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold text-dtsc-ink">{locale === "fr" ? "Recherche intelligente" : "Smart search"}<span className="mt-1 flex min-h-11 items-center gap-2 rounded-lg border border-dtsc-border bg-dtsc-page px-2"><Search className="h-4 w-4 text-dtsc-muted"/><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={locale === "fr" ? "N°, article, désignation" : "Number or item"} value={invoiceSearch} onChange={(event) => { setInvoiceSearch(event.target.value); setPage(1); }} /></span></label>
        <label className="text-xs font-bold text-dtsc-ink">{locale === "fr" ? "Du" : "From"}<input type="date" max={invoiceDateTo || undefined} value={invoiceDateFrom} onChange={(event) => { setInvoiceDateFrom(event.target.value); setPage(1); }} className="mt-1 min-h-11 w-full rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-sm" /></label>
        <label className="text-xs font-bold text-dtsc-ink">{locale === "fr" ? "Au" : "To"}<input type="date" min={invoiceDateFrom || undefined} value={invoiceDateTo} onChange={(event) => { setInvoiceDateTo(event.target.value); setPage(1); }} className="mt-1 min-h-11 w-full rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-sm" /></label>
        <div className="flex flex-wrap items-end gap-1"><Button type="button" variant="outline" onClick={() => { const date = invoiceDateFrom || invoiceDateTo || browserCivilDate(); setInvoiceDateFrom(date); setInvoiceDateTo(date); setPage(1); }}>{locale === "fr" ? "Date précise" : "Exact date"}</Button><Button type="button" variant="ghost" onClick={() => { setInvoiceDateFrom(""); setInvoiceDateTo(""); setPage(1); }} disabled={!invoiceDateFrom && !invoiceDateTo}>{locale === "fr" ? "Effacer" : "Clear"}</Button></div>
      </div>
      {loading ? <p role="status" className="mt-3 text-sm text-dtsc-muted">{copy.loading}</p> : null}
      {!loading && data && !data.items.length ? <p className="mt-3 rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">{copy.empty}</p> : null}
      <div className="mt-3 grid min-w-0 gap-2">{data?.items.map((entry) => (
        <article key={entry.id} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="break-words text-sm font-black text-dtsc-ink">{entry.invoice.number} · {entry.site.name}</p>
              <p className="mt-1 text-xs text-dtsc-muted">{entry.invoice.items.map((item) => item.description).join(" · ")}</p>
            </div>
            <span className="max-w-full rounded-full bg-blue-500/10 px-2 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">{invoiceStatus(entry.invoice.status, copy)}{entry.invoice.status === "PENDING_APPROVAL" ? ` (${entry.invoice.pendingApproverName || (locale === "fr" ? "validateur à confirmer" : "approver to confirm")})` : ""}</span>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-3 text-xs text-dtsc-muted">
            <span>{copy.outstanding} : <strong className="text-dtsc-ink">{money(entry.invoice.outstandingAmount, entry.invoice.currencyCode, locale)}</strong></span>
            <span>{entry.stockPostedAt ? copy.delivered : copy.stockPending}</span>
          </div>
          <div data-responsive-actions className="mt-3 flex min-w-0 flex-wrap justify-end gap-2 border-t border-dtsc-border pt-3">
            <Button type="button" variant="outline" onClick={() => window.open(`/api/enterprise/${organizationId}/retail/invoices/${encodeURIComponent(entry.invoice.id)}/print?paper=a4&lang=${locale}`, "_blank", "noopener,noreferrer")}><Printer className="h-4 w-4" />{copy.printA4}</Button>
            <Button type="button" variant="outline" onClick={() => window.open(`/api/enterprise/${organizationId}/retail/invoices/${encodeURIComponent(entry.invoice.id)}/print?paper=thermal&lang=${locale}`, "_blank", "noopener,noreferrer")}><Printer className="h-4 w-4" />{copy.printThermal}</Button>
            {data.checkoutReady && entry.canCancel ? <Button type="button" variant="outline" onClick={() => { setCancelTarget(entry); setCancelReason(""); }}><XCircle className="h-4 w-4 text-amber-600" />{copy.cancelDraft}</Button> : null}
            {data.checkoutReady && entry.canSubmit ? <Button type="button" onClick={() => setSubmitTarget(entry)}><Send className="h-4 w-4" />{copy.submitDraft}</Button> : null}
            {/* Collection is intentionally absent: only the cashier workstation can present it. */}
            {data.checkoutReady && entry.stockPostedAt ? <RetailInvoiceReturnDialog organizationId={organizationId} invoiceId={entry.invoice.id} invoiceNumber={entry.invoice.number} siteId={entry.siteId} currencyCode={entry.invoice.currencyCode} checkoutLines={entry.lines} invoiceItems={entry.invoice.items} locale={locale} onChanged={() => { void load(page, siteFilter); }} /> : null}
          </div>
        </article>
      ))}</div>
      {data && data.pagination.pageCount > 1 ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-dtsc-muted"><span>{data.pagination.page} / {data.pagination.pageCount} · {data.pagination.total}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>{copy.pagePrev}</Button><Button type="button" variant="outline" disabled={page >= data.pagination.pageCount || loading} onClick={() => setPage((current) => current + 1)}>{copy.pageNext}</Button></div></div> : null}
    </div>
    <Dialog open={previewOpen} onClose={() => { if (!submitting) setPreviewOpen(false); }} title={copy.previewTitle} description={copy.previewHint} className="max-w-3xl" presentation="editor">
      {pricing && chosenWarehouse ? <div data-retail-invoice-proforma className="min-w-0 space-y-3">
        <div className="rounded-xl border-l-4 border-cyan-600 bg-dtsc-page p-3"><strong className="block break-words text-base text-dtsc-ink">{organizationName || "DTSC Retail"}</strong><p className="mt-1 text-xs text-dtsc-muted">{chosenWarehouse.siteName} · {chosenWarehouse.name}</p><p className="mt-1 text-xs text-dtsc-muted">{copy.client} : {customerName || (locale === "fr" ? "Client de passage" : "Walk-in customer")}</p></div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">{lines.map((line) => { const priced = pricing.lines.find((item) => item.catalogItemId === line.catalogItemId); return <div key={line.catalogItemId} className="flex min-w-0 flex-wrap justify-between gap-2 border-b border-dtsc-border py-2 text-sm"><span className="min-w-0 flex-1 break-words text-dtsc-ink">{line.name} × {line.quantity}</span><strong className="text-dtsc-ink">{money(priced?.lineTotal || "0", currencyCode, locale)}</strong></div>; })}</div>
        <div className="ml-auto max-w-sm space-y-1 rounded-xl bg-dtsc-page p-3 text-sm"><div className="flex justify-between gap-2"><span>{copy.subtotal}</span><strong>{money(pricing.subtotal, currencyCode, locale)}</strong></div><div className="flex justify-between gap-2"><span>{copy.discounts}</span><strong>{money(pricing.discountTotal, currencyCode, locale)}</strong></div><div className="flex justify-between gap-2"><span>{copy.tax}</span><strong>{money(pricing.taxTotal, currencyCode, locale)}</strong></div><div className="flex justify-between gap-2 border-t border-dtsc-border pt-2 text-base font-black"><span>{copy.total}</span><strong>{money(pricing.grandTotal, currencyCode, locale)}</strong></div></div>
        <div data-responsive-actions className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={submitting} onClick={printProforma}><Printer className="h-4 w-4" />{copy.printProforma}</Button><Button type="button" variant="outline" disabled={submitting} onClick={() => setPreviewOpen(false)}>{copy.cancelAbort}</Button><Button type="button" disabled={submitting || pricingLoading} onClick={() => void prepare()}><ArrowRight className="h-4 w-4" />{submitting ? copy.preparing : copy.confirm}</Button></div>
      </div> : <p className="text-sm text-dtsc-muted">{copy.previewError}</p>}
    </Dialog>
    <Dialog open={Boolean(cancelTarget)} onClose={() => { if (!cancelling) { setCancelTarget(null); setCancelReason(""); } }} title={copy.cancelTitle} description={copy.cancelHint} className="max-w-xl" presentation="editor">
      {cancelTarget ? <form onSubmit={(event) => { event.preventDefault(); void cancelDraft(); }} className="grid min-w-0 gap-4">
        <p className="break-words rounded-lg bg-dtsc-page p-3 text-sm font-bold text-dtsc-ink">{cancelTarget.invoice.number} · {cancelTarget.site.name}</p>
        <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-dtsc-ink">{copy.cancelReason}<textarea className="min-h-28 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-base" value={cancelReason} minLength={4} maxLength={1000} required disabled={cancelling} onChange={(event) => setCancelReason(event.target.value)} /></label>
        <p className="text-xs text-dtsc-muted">{copy.cancelReasonHelp}</p>
        <div data-responsive-actions className="flex min-w-0 flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={cancelling} onClick={() => { setCancelTarget(null); setCancelReason(""); }}>{copy.cancelAbort}</Button><Button type="submit" disabled={cancelling || cancelReason.trim().length < 4}><XCircle className="h-4 w-4" />{copy.cancelConfirm}</Button></div>
      </form> : null}
    </Dialog>
    <Dialog open={Boolean(submitTarget)} onClose={() => { if (!submittingApproval) setSubmitTarget(null); }} title={copy.submitTitle} description={copy.submitHint} className="max-w-xl" presentation="editor">
      {submitTarget ? <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void submitForFinanceApproval(String(form.get("approverUserId") || ""), String(form.get("reason") || "")); }} className="grid min-w-0 gap-4">
        <p className="break-words rounded-lg bg-dtsc-page p-3 text-sm font-bold text-dtsc-ink">{submitTarget.invoice.number} · {submitTarget.site.name}</p>
        <EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_RECEIVABLES" locale={locale} label={copy.submitApprover} candidatesEndpoint={`/api/enterprise/${organizationId}/retail/invoices/approval-candidates?siteId=${encodeURIComponent(submitTarget.siteId)}`} disabled={submittingApproval} />
        <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-dtsc-ink">{copy.submitNote}<textarea name="reason" maxLength={1000} disabled={submittingApproval} className="min-h-24 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-base" /></label>
        <div data-responsive-actions className="flex min-w-0 flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={submittingApproval} onClick={() => setSubmitTarget(null)}>{copy.submitAbort}</Button><Button type="submit" disabled={submittingApproval}><Send className="h-4 w-4" />{copy.submitConfirm}</Button></div>
      </form> : null}
    </Dialog>
  </section>;
}
