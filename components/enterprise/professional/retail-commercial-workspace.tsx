"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Capabilities = {
  canManagePricing: boolean;
  canOverridePrice: boolean;
  canOverrideDiscount: boolean;
  canOverrideTax: boolean;
  canManagePromotions: boolean;
  canCreateReturns: boolean;
  canManageRefunds: boolean;
};

type CatalogPrice = {
  id: string;
  catalogItemId: string;
  amount: string;
  currency: string;
  taxIncluded: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
  catalogItem: { code: string; sku: string | null; name: string; taxable: boolean; taxCode: string | null };
};

type PriceCondition = {
  id: string;
  catalogPriceId: string;
  siteId: string | null;
  customerBusinessPartyId: string | null;
  customerSegmentCode: string | null;
  minQuantity: string | null;
  maxQuantity: string | null;
  channelCode: string;
  priority: number;
  isActive: boolean;
  item: { id: string; code: string; name: string } | null;
  price: { id: string; amount: string; currency: string; taxIncluded: boolean } | null;
};

type Promotion = {
  id: string;
  code: string;
  nameFr: string;
  nameEn: string;
  promotionType: string;
  status: string;
  priority: number;
  stackMode: string;
  couponCode: string | null;
  currencyCode: string | null;
  startsAt: string;
  endsAt: string | null;
  usage: { count: number; discountAmount: string };
};

type Sale = {
  id: string;
  number: string;
  soldAt: string;
  currencyCode: string;
  grandTotal: string;
  lines: Array<{ id: string; description: string; quantity: string; lineTotal: string; trackInventory: boolean }>;
};

type RetailReturn = {
  id: string;
  number: string;
  saleId: string;
  returnType: string;
  status: string;
  reason: string;
  currencyCode: string;
  grandTotal: string;
  refundMethod: string;
  refundFinancialAccountId: string | null;
  requestedByUserId: string;
  revision: number;
  createdAt: string;
  sale: { id: string; number: string; soldAt: string; currencyCode: string };
  lines: Array<{ id: string; quantity: string; stockDisposition: string; saleLine: { description: string; quantity: string } }>;
};

type RefundAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  currencyCode: string;
  operationalBalance: string;
};

type Tab = "PRICING" | "PROMOTIONS" | "RETURNS";

type Copy = ReturnType<typeof buildCopy>;

function buildCopy(language: "fr" | "en") {
  if (language === "en") {
    return {
      eyebrow: "Shop 2.0 · Commercial control",
      title: "Pricing, promotions & returns",
      intro: "Configure the commercial rules used by the POS, manage campaigns and control partial returns without bypassing Finance or Inventory.",
      back: "Back to POS",
      pricing: "Pricing",
      promotions: "Promotions",
      returns: "Returns & exchanges",
      canonicalPrices: "Canonical sale prices",
      priceRules: "Retail price conditions",
      priceHint: "Base prices remain owned by the common Catalog. These rules only resolve when a canonical price applies at the POS.",
      addRule: "Save pricing rule",
      price: "Sale price",
      minQty: "Minimum quantity",
      maxQty: "Maximum quantity",
      channel: "Channel",
      priority: "Priority",
      active: "Active",
      noRules: "No Retail price condition yet.",
      noPrices: "No active canonical sale price is available. Configure prices in Catalog first.",
      promoControl: "Campaign control",
      promoHint: "Promotions are a dedicated Retail domain. They never reuse the retired legacy PROMOTIONS source.",
      createPromo: "Save promotion",
      code: "Code",
      nameFr: "French name",
      nameEn: "English name",
      type: "Type",
      status: "Status",
      stacking: "Stacking",
      coupon: "Coupon (optional)",
      starts: "Starts",
      ends: "Ends (optional)",
      targetProduct: "Target product",
      percent: "Percentage",
      amount: "Amount",
      buyQty: "Buy quantity",
      getQty: "Free quantity",
      bundleProducts: "Bundle products",
      bundlePrice: "Bundle price",
      noPromos: "No Retail promotion yet.",
      usage: "uses",
      returnRequest: "New return request",
      returnQueue: "Approval queue",
      returnHint: "The requester cannot approve their own refund. Pending quantities are reserved to prevent concurrent double returns.",
      sale: "Original sale",
      line: "Sale line",
      quantity: "Quantity",
      productCondition: "Product condition",
      disposition: "Stock disposition",
      refundMethod: "Refund method",
      refundAccount: "Refund account",
      replacementSale: "Replacement sale",
      reason: "Reason",
      requestReturn: "Submit return request",
      pendingOnly: "Pending approval",
      allReturns: "All returns",
      approve: "Approve & refund",
      reject: "Reject",
      noReturns: "No return matches this filter.",
      noSales: "No completed sale is available for return.",
      saveSuccess: "Saved successfully.",
      requestSuccess: "Return request submitted for independent approval.",
      approveSuccess: "Return approved, refund and accounting completed.",
      rejectSuccess: "Return rejected.",
      loading: "Loading…",
      forbidden: "Your role does not allow this action.",
    };
  }
  return {
    eyebrow: "Shop 2.0 · Contrôle commercial",
    title: "Tarification, promotions & retours",
    intro: "Configurez les règles commerciales utilisées par la caisse, pilotez les campagnes et contrôlez les retours partiels sans contourner Finance ni le stock.",
    back: "Retour à la caisse",
    pricing: "Tarification",
    promotions: "Promotions",
    returns: "Retours & échanges",
    canonicalPrices: "Prix de vente canoniques",
    priceRules: "Conditions de prix Retail",
    priceHint: "Les prix de base restent gérés par le Catalogue commun. Ces règles servent uniquement à déterminer quel prix canonique s’applique au POS.",
    addRule: "Enregistrer la règle de prix",
    price: "Prix de vente",
    minQty: "Quantité minimale",
    maxQty: "Quantité maximale",
    channel: "Canal",
    priority: "Priorité",
    active: "Active",
    noRules: "Aucune condition de prix Retail pour le moment.",
    noPrices: "Aucun prix de vente canonique actif. Configurez d’abord les prix dans Catalogue.",
    promoControl: "Pilotage des campagnes",
    promoHint: "Les promotions appartiennent à un domaine Retail dédié. Elles ne réutilisent jamais l’ancienne source PROMOTIONS retirée.",
    createPromo: "Enregistrer la promotion",
    code: "Code",
    nameFr: "Nom français",
    nameEn: "Nom anglais",
    type: "Type",
    status: "Statut",
    stacking: "Cumul",
    coupon: "Coupon (optionnel)",
    starts: "Début",
    ends: "Fin (optionnelle)",
    targetProduct: "Produit ciblé",
    percent: "Pourcentage",
    amount: "Montant",
    buyQty: "Quantité achetée",
    getQty: "Quantité offerte",
    bundleProducts: "Produits du bundle",
    bundlePrice: "Prix du bundle",
    noPromos: "Aucune promotion Retail pour le moment.",
    usage: "utilisations",
    returnRequest: "Nouvelle demande de retour",
    returnQueue: "File de validation",
    returnHint: "Le demandeur ne peut pas valider lui-même son remboursement. Les quantités en attente sont réservées pour empêcher les doubles retours concurrents.",
    sale: "Vente d’origine",
    line: "Ligne du ticket",
    quantity: "Quantité",
    productCondition: "État du produit",
    disposition: "Traitement du stock",
    refundMethod: "Mode de remboursement",
    refundAccount: "Compte de remboursement",
    replacementSale: "Vente de remplacement",
    reason: "Motif",
    requestReturn: "Soumettre la demande de retour",
    pendingOnly: "En attente de validation",
    allReturns: "Tous les retours",
    approve: "Valider & rembourser",
    reject: "Refuser",
    noReturns: "Aucun retour ne correspond à ce filtre.",
    noSales: "Aucune vente finalisée n’est disponible pour un retour.",
    saveSuccess: "Enregistrement effectué.",
    requestSuccess: "Demande de retour soumise pour validation indépendante.",
    approveSuccess: "Retour validé, remboursement et comptabilisation terminés.",
    rejectSuccess: "Retour refusé.",
    loading: "Chargement…",
    forbidden: "Votre fonction ne vous autorise pas à réaliser cette action.",
  };
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || body?.error || "Request failed");
  return body;
}

function numberValue(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: string | number, currency?: string | null) {
  const amount = numberValue(value);
  try {
    return new Intl.NumberFormat(undefined, { style: currency ? "currency" : "decimal", currency: currency || undefined, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency || ""}`.trim();
  }
}

function localDateTimeInput(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function RetailCommercialWorkspace({ organizationId }: { organizationId: string }) {
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [tab, setTab] = useState<Tab>("PRICING");
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [prices, setPrices] = useState<CatalogPrice[]>([]);
  const [conditions, setConditions] = useState<PriceCondition[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [returns, setReturns] = useState<RetailReturn[]>([]);
  const [accounts, setAccounts] = useState<RefundAccount[]>([]);
  const [returnStatus, setReturnStatus] = useState("PENDING_APPROVAL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [priceForm, setPriceForm] = useState({ catalogPriceId: "", minQuantity: "1", maxQuantity: "", channelCode: "POS", priority: "0", isActive: true });
  const [promoForm, setPromoForm] = useState({
    code: "",
    nameFr: "",
    nameEn: "",
    promotionType: "PERCENTAGE",
    status: "ACTIVE",
    priority: "0",
    stackMode: "EXCLUSIVE",
    couponCode: "",
    startsAt: localDateTimeInput(),
    endsAt: "",
    catalogItemId: "",
    percent: "10",
    amount: "",
    minQuantity: "2",
    unitPrice: "",
    buyQuantity: "2",
    getQuantity: "1",
    bundleProductIds: [] as string[],
    bundlePrice: "",
  });
  const [returnForm, setReturnForm] = useState({
    saleId: "",
    saleLineId: "",
    quantity: "1",
    returnType: "RETURN",
    replacementSaleId: "",
    productCondition: "SELLABLE",
    stockDisposition: "RESTOCK",
    refundMethod: "ORIGINAL_TENDER",
    refundFinancialAccountId: "",
    reason: "",
  });

  const copy: Copy = useMemo(() => buildCopy(language), [language]);
  const selectedSale = useMemo(() => sales.find((sale) => sale.id === returnForm.saleId) || null, [sales, returnForm.saleId]);
  const selectedPrice = useMemo(() => prices.find((price) => price.id === priceForm.catalogPriceId) || null, [prices, priceForm.catalogPriceId]);

  useEffect(() => {
    const htmlLanguage = document.documentElement.lang.toLowerCase();
    setLanguage(htmlLanguage.startsWith("en") ? "en" : "fr");
  }, []);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [permissionData, priceData, conditionData, promotionData, saleData, accountData] = await Promise.all([
        fetch(`/api/enterprise/${organizationId}/retail/commercial-permissions`).then(readJson),
        fetch(`/api/enterprise/${organizationId}/retail/pricing/catalog?pageSize=100`).then(readJson),
        fetch(`/api/enterprise/${organizationId}/retail/pricing/conditions`).then(readJson),
        fetch(`/api/enterprise/${organizationId}/retail/promotions?pageSize=100`).then(readJson),
        fetch(`/api/enterprise/${organizationId}/retail/sales?pageSize=50&status=COMPLETED`).then(readJson),
        fetch(`/api/enterprise/${organizationId}/retail/refund-accounts`).then(readJson),
      ]);
      setCapabilities(permissionData.capabilities);
      setPrices(priceData.items || []);
      setConditions(conditionData.items || []);
      setPromotions(promotionData.items || []);
      setSales(saleData.items || []);
      setAccounts(accountData.items || []);
      setPriceForm((current) => ({ ...current, catalogPriceId: current.catalogPriceId || priceData.items?.[0]?.id || "" }));
      setPromoForm((current) => ({ ...current, catalogItemId: current.catalogItemId || priceData.items?.[0]?.catalogItemId || "" }));
      setReturnForm((current) => ({ ...current, saleId: current.saleId || saleData.items?.[0]?.id || "", saleLineId: current.saleLineId || saleData.items?.[0]?.lines?.[0]?.id || "" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Shop 2 commercial data.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const loadReturns = useCallback(async () => {
    try {
      const suffix = returnStatus ? `&status=${encodeURIComponent(returnStatus)}` : "";
      const data = await fetch(`/api/enterprise/${organizationId}/retail/returns?pageSize=100${suffix}`).then(readJson);
      setReturns(data.items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load returns.");
    }
  }, [organizationId, returnStatus]);

  useEffect(() => { void loadCore(); }, [loadCore]);
  useEffect(() => { void loadReturns(); }, [loadReturns]);

  async function submitPriceRule(event: React.FormEvent) {
    event.preventDefault();
    if (!capabilities?.canManagePricing) return setError(copy.forbidden);
    setSaving(true); setError(""); setMessage("");
    try {
      await fetch(`/api/enterprise/${organizationId}/retail/pricing/conditions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          catalogPriceId: priceForm.catalogPriceId,
          minQuantity: priceForm.minQuantity ? Number(priceForm.minQuantity) : null,
          maxQuantity: priceForm.maxQuantity ? Number(priceForm.maxQuantity) : null,
          channelCode: priceForm.channelCode,
          priority: Number(priceForm.priority || 0),
          isActive: priceForm.isActive,
        }),
      }).then(readJson);
      setMessage(copy.saveSuccess);
      const data = await fetch(`/api/enterprise/${organizationId}/retail/pricing/conditions`).then(readJson);
      setConditions(data.items || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Save failed"); }
    finally { setSaving(false); }
  }

  function buildPromotionAction() {
    if (promoForm.promotionType === "PERCENTAGE") return { percent: Number(promoForm.percent) };
    if (promoForm.promotionType === "FIXED_AMOUNT") return { amount: Number(promoForm.amount) };
    if (promoForm.promotionType === "QUANTITY_BREAK") return promoForm.unitPrice
      ? { minQuantity: Number(promoForm.minQuantity), unitPrice: Number(promoForm.unitPrice) }
      : { minQuantity: Number(promoForm.minQuantity), percent: Number(promoForm.percent) };
    if (promoForm.promotionType === "BUY_X_GET_Y") return { buyQuantity: Number(promoForm.buyQuantity), getQuantity: Number(promoForm.getQuantity) };
    return { productIds: promoForm.bundleProductIds, bundlePrice: Number(promoForm.bundlePrice) };
  }

  async function submitPromotion(event: React.FormEvent) {
    event.preventDefault();
    if (!capabilities?.canManagePromotions) return setError(copy.forbidden);
    setSaving(true); setError(""); setMessage("");
    try {
      const targetProducts = promoForm.promotionType === "BUNDLE" ? promoForm.bundleProductIds : promoForm.catalogItemId ? [promoForm.catalogItemId] : [];
      await fetch(`/api/enterprise/${organizationId}/retail/promotions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: promoForm.code,
          nameFr: promoForm.nameFr,
          nameEn: promoForm.nameEn,
          promotionType: promoForm.promotionType,
          status: promoForm.status,
          priority: Number(promoForm.priority || 0),
          stackMode: promoForm.stackMode,
          couponCode: promoForm.couponCode || null,
          currencyCode: selectedPrice?.currency || prices.find((price) => price.catalogItemId === promoForm.catalogItemId)?.currency || null,
          startsAt: new Date(promoForm.startsAt).toISOString(),
          endsAt: promoForm.endsAt ? new Date(promoForm.endsAt).toISOString() : null,
          conditionsJson: targetProducts.length ? { productIds: targetProducts } : null,
          actionJson: buildPromotionAction(),
        }),
      }).then(readJson);
      setMessage(copy.saveSuccess);
      const data = await fetch(`/api/enterprise/${organizationId}/retail/promotions?pageSize=100`).then(readJson);
      setPromotions(data.items || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Save failed"); }
    finally { setSaving(false); }
  }

  async function submitReturn(event: React.FormEvent) {
    event.preventDefault();
    if (!capabilities?.canCreateReturns) return setError(copy.forbidden);
    setSaving(true); setError(""); setMessage("");
    try {
      await fetch(`/api/enterprise/${organizationId}/retail/sales/${returnForm.saleId}/returns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          returnType: returnForm.returnType,
          exchangeSaleId: returnForm.returnType === "EXCHANGE" ? returnForm.replacementSaleId : null,
          reason: returnForm.reason,
          refundMethod: returnForm.refundMethod,
          refundFinancialAccountId: returnForm.refundMethod === "ORIGINAL_TENDER" ? null : returnForm.refundFinancialAccountId,
          idempotencyKey: crypto.randomUUID(),
          lines: [{ saleLineId: returnForm.saleLineId, quantity: Number(returnForm.quantity), productCondition: returnForm.productCondition, stockDisposition: returnForm.stockDisposition }],
        }),
      }).then(readJson);
      setMessage(copy.requestSuccess);
      setReturnForm((current) => ({ ...current, reason: "", quantity: "1" }));
      await loadReturns();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Return request failed"); }
    finally { setSaving(false); }
  }

  async function decideReturn(item: RetailReturn, decision: "APPROVE" | "REJECT") {
    if (!capabilities?.canManageRefunds) return setError(copy.forbidden);
    const reason = decision === "REJECT" ? window.prompt(copy.reason) : null;
    if (decision === "REJECT" && (!reason || reason.trim().length < 3)) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await fetch(`/api/enterprise/${organizationId}/retail/returns/${item.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: item.revision, decision, reason, refundFinancialAccountId: item.refundFinancialAccountId || null }),
      }).then(readJson);
      setMessage(decision === "APPROVE" ? copy.approveSuccess : copy.rejectSuccess);
      await Promise.all([loadReturns(), loadCore()]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Decision failed"); }
    finally { setSaving(false); }
  }

  function selectSale(saleId: string) {
    const sale = sales.find((item) => item.id === saleId);
    setReturnForm((current) => ({ ...current, saleId, saleLineId: sale?.lines?.[0]?.id || "", refundFinancialAccountId: "" }));
  }

  if (loading) return <div className="mx-auto max-w-7xl p-4 text-sm text-muted-foreground">{copy.loading}</div>;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{copy.eyebrow}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1>
          </div>
          <Link href="/enterprise-modules/RETAIL_POS" className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted">{copy.back}</Link>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{copy.intro}</p>
      </header>

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label={copy.title}>
        {(["PRICING", "PROMOTIONS", "RETURNS"] as Tab[]).map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium ${tab === item ? "bg-foreground text-background" : "bg-background hover:bg-muted"}`}>
            {item === "PRICING" ? copy.pricing : item === "PROMOTIONS" ? copy.promotions : copy.returns}
          </button>
        ))}
      </nav>

      {message ? <div className="rounded-xl border p-3 text-sm" role="status">{message}</div> : null}
      {error ? <div className="rounded-xl border p-3 text-sm" role="alert">{error}</div> : null}

      {tab === "PRICING" ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.65fr)]">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{copy.priceRules}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{copy.priceHint}</p>
            </div>
            {conditions.length ? (
              <div className="divide-y rounded-2xl border">
                {conditions.map((condition) => (
                  <div key={condition.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{condition.item?.name || condition.item?.code || condition.catalogPriceId}</p>
                      <p className="text-sm text-muted-foreground">{condition.price ? money(condition.price.amount, condition.price.currency) : "—"} · {condition.channelCode} · min {condition.minQuantity || "—"} · max {condition.maxQuantity || "—"}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs"><span className="rounded-full border px-2 py-1">P{condition.priority}</span><span className="rounded-full border px-2 py-1">{condition.isActive ? copy.active : "Inactive"}</span></div>
                  </div>
                ))}
              </div>
            ) : <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">{copy.noRules}</div>}
          </div>

          <aside className="rounded-2xl border p-4 sm:p-5">
            <h2 className="font-semibold">{copy.canonicalPrices}</h2>
            {!prices.length ? <p className="mt-3 text-sm text-muted-foreground">{copy.noPrices}</p> : capabilities?.canManagePricing ? (
              <form className="mt-4 space-y-4" onSubmit={submitPriceRule}>
                <label className="block text-sm font-medium">{copy.price}<select value={priceForm.catalogPriceId} onChange={(event) => setPriceForm({ ...priceForm, catalogPriceId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"><option value="">—</option>{prices.map((price) => <option key={price.id} value={price.id}>{price.catalogItem.name} · {money(price.amount, price.currency)}{price.taxIncluded ? " TTC" : " HT"}</option>)}</select></label>
                <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">{copy.minQty}<input value={priceForm.minQuantity} onChange={(event) => setPriceForm({ ...priceForm, minQuantity: event.target.value })} type="number" min="0.000001" step="any" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label><label className="text-sm font-medium">{copy.maxQty}<input value={priceForm.maxQuantity} onChange={(event) => setPriceForm({ ...priceForm, maxQuantity: event.target.value })} type="number" min="0.000001" step="any" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label></div>
                <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">{copy.channel}<input value={priceForm.channelCode} onChange={(event) => setPriceForm({ ...priceForm, channelCode: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label><label className="text-sm font-medium">{copy.priority}<input value={priceForm.priority} onChange={(event) => setPriceForm({ ...priceForm, priority: event.target.value })} type="number" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label></div>
                <label className="flex items-center gap-2 text-sm"><input checked={priceForm.isActive} onChange={(event) => setPriceForm({ ...priceForm, isActive: event.target.checked })} type="checkbox" />{copy.active}</label>
                <button disabled={saving || !priceForm.catalogPriceId} className="min-h-11 w-full rounded-xl bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50">{copy.addRule}</button>
              </form>
            ) : <p className="mt-3 text-sm text-muted-foreground">{copy.forbidden}</p>}
          </aside>
        </section>
      ) : null}

      {tab === "PROMOTIONS" ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <div className="space-y-4"><div><h2 className="text-lg font-semibold">{copy.promoControl}</h2><p className="mt-1 text-sm text-muted-foreground">{copy.promoHint}</p></div>{promotions.length ? <div className="divide-y rounded-2xl border">{promotions.map((promotion) => <div key={promotion.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{language === "en" ? promotion.nameEn : promotion.nameFr}</p><p className="text-sm text-muted-foreground">{promotion.code} · {promotion.promotionType}</p></div><span className="rounded-full border px-2 py-1 text-xs">{promotion.status}</span></div><p className="mt-2 text-xs text-muted-foreground">{promotion.usage.count} {copy.usage} · {money(promotion.usage.discountAmount, promotion.currencyCode)}</p></div>)}</div> : <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">{copy.noPromos}</div>}</div>
          <aside className="rounded-2xl border p-4 sm:p-5">{capabilities?.canManagePromotions ? <form className="space-y-3" onSubmit={submitPromotion}><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">{copy.code}<input required value={promoForm.code} onChange={(event) => setPromoForm({ ...promoForm, code: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label><label className="text-sm font-medium">{copy.priority}<input value={promoForm.priority} onChange={(event) => setPromoForm({ ...promoForm, priority: event.target.value })} type="number" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label></div><label className="block text-sm font-medium">{copy.nameFr}<input required value={promoForm.nameFr} onChange={(event) => setPromoForm({ ...promoForm, nameFr: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label><label className="block text-sm font-medium">{copy.nameEn}<input required value={promoForm.nameEn} onChange={(event) => setPromoForm({ ...promoForm, nameEn: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label>
            <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">{copy.type}<select value={promoForm.promotionType} onChange={(event) => setPromoForm({ ...promoForm, promotionType: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"><option value="PERCENTAGE">%</option><option value="FIXED_AMOUNT">Fixed</option><option value="QUANTITY_BREAK">Quantity</option><option value="BUY_X_GET_Y">Buy X Get Y</option><option value="BUNDLE">Bundle</option></select></label><label className="text-sm font-medium">{copy.stacking}<select value={promoForm.stackMode} onChange={(event) => setPromoForm({ ...promoForm, stackMode: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"><option value="EXCLUSIVE">Exclusive</option><option value="STACKABLE">Stackable</option></select></label></div>
            {promoForm.promotionType !== "BUNDLE" ? <label className="block text-sm font-medium">{copy.targetProduct}<select value={promoForm.catalogItemId} onChange={(event) => setPromoForm({ ...promoForm, catalogItemId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">{prices.map((price) => <option key={price.id} value={price.catalogItemId}>{price.catalogItem.name}</option>)}</select></label> : <label className="block text-sm font-medium">{copy.bundleProducts}<select multiple value={promoForm.bundleProductIds} onChange={(event) => setPromoForm({ ...promoForm, bundleProductIds: Array.from(event.target.selectedOptions).map((option) => option.value) })} className="mt-1 min-h-28 w-full rounded-xl border bg-background px-3">{prices.map((price) => <option key={price.id} value={price.catalogItemId}>{price.catalogItem.name}</option>)}</select></label>}
            {(promoForm.promotionType === "PERCENTAGE" || promoForm.promotionType === "QUANTITY_BREAK") ? <label className="block text-sm font-medium">{copy.percent}<input value={promoForm.percent} onChange={(event) => setPromoForm({ ...promoForm, percent: event.target.value })} type="number" min="0.01" max="100" step="0.01" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label> : null}
            {promoForm.promotionType === "FIXED_AMOUNT" ? <label className="block text-sm font-medium">{copy.amount}<input required value={promoForm.amount} onChange={(event) => setPromoForm({ ...promoForm, amount: event.target.value })} type="number" min="0.01" step="0.01" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label> : null}
            {promoForm.promotionType === "QUANTITY_BREAK" ? <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">{copy.minQty}<input value={promoForm.minQuantity} onChange={(event) => setPromoForm({ ...promoForm, minQuantity: event.target.value })} type="number" min="1" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label><label className="text-sm font-medium">Unit price<input value={promoForm.unitPrice} onChange={(event) => setPromoForm({ ...promoForm, unitPrice: event.target.value })} type="number" min="0" step="0.01" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label></div> : null}
            {promoForm.promotionType === "BUY_X_GET_Y" ? <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">{copy.buyQty}<input value={promoForm.buyQuantity} onChange={(event) => setPromoForm({ ...promoForm, buyQuantity: event.target.value })} type="number" min="1" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label><label className="text-sm font-medium">{copy.getQty}<input value={promoForm.getQuantity} onChange={(event) => setPromoForm({ ...promoForm, getQuantity: event.target.value })} type="number" min="1" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label></div> : null}
            {promoForm.promotionType === "BUNDLE" ? <label className="block text-sm font-medium">{copy.bundlePrice}<input required value={promoForm.bundlePrice} onChange={(event) => setPromoForm({ ...promoForm, bundlePrice: event.target.value })} type="number" min="0.01" step="0.01" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label> : null}
            <label className="block text-sm font-medium">{copy.coupon}<input value={promoForm.couponCode} onChange={(event) => setPromoForm({ ...promoForm, couponCode: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">{copy.starts}<input required value={promoForm.startsAt} onChange={(event) => setPromoForm({ ...promoForm, startsAt: event.target.value })} type="datetime-local" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-2" /></label><label className="text-sm font-medium">{copy.ends}<input value={promoForm.endsAt} onChange={(event) => setPromoForm({ ...promoForm, endsAt: event.target.value })} type="datetime-local" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-2" /></label></div><button disabled={saving} className="min-h-11 w-full rounded-xl bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50">{copy.createPromo}</button></form> : <p className="text-sm text-muted-foreground">{copy.forbidden}</p>}</aside>
        </section>
      ) : null}

      {tab === "RETURNS" ? (
        <section className="space-y-6"><div><h2 className="text-lg font-semibold">{copy.returnQueue}</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{copy.returnHint}</p></div><div className="grid gap-6 lg:grid-cols-[minmax(340px,0.8fr)_minmax(0,1fr)]">
          <aside className="rounded-2xl border p-4 sm:p-5">{capabilities?.canCreateReturns ? <form className="space-y-3" onSubmit={submitReturn}><h3 className="font-semibold">{copy.returnRequest}</h3>{sales.length ? <><label className="block text-sm font-medium">{copy.sale}<select value={returnForm.saleId} onChange={(event) => selectSale(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">{sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.number} · {money(sale.grandTotal, sale.currencyCode)}</option>)}</select></label><label className="block text-sm font-medium">{copy.line}<select value={returnForm.saleLineId} onChange={(event) => setReturnForm({ ...returnForm, saleLineId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">{selectedSale?.lines.map((line) => <option key={line.id} value={line.id}>{line.description} · {line.quantity}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">{copy.quantity}<input required value={returnForm.quantity} onChange={(event) => setReturnForm({ ...returnForm, quantity: event.target.value })} type="number" min="0.000001" step="any" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label><label className="text-sm font-medium">{copy.type}<select value={returnForm.returnType} onChange={(event) => setReturnForm({ ...returnForm, returnType: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"><option value="RETURN">Return</option><option value="EXCHANGE">Exchange</option></select></label></div>{returnForm.returnType === "EXCHANGE" ? <label className="block text-sm font-medium">{copy.replacementSale}<select required value={returnForm.replacementSaleId} onChange={(event) => setReturnForm({ ...returnForm, replacementSaleId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"><option value="">—</option>{sales.filter((sale) => sale.id !== returnForm.saleId).map((sale) => <option key={sale.id} value={sale.id}>{sale.number}</option>)}</select></label> : null}<div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">{copy.productCondition}<select value={returnForm.productCondition} onChange={(event) => setReturnForm({ ...returnForm, productCondition: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"><option value="SELLABLE">Sellable</option><option value="OPENED">Opened</option><option value="DAMAGED">Damaged</option><option value="DEFECTIVE">Defective</option><option value="EXPIRED">Expired</option><option value="OTHER">Other</option></select></label><label className="text-sm font-medium">{copy.disposition}<select value={returnForm.stockDisposition} onChange={(event) => setReturnForm({ ...returnForm, stockDisposition: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"><option value="RESTOCK">Restock</option><option value="SCRAP">Scrap</option><option value="NO_STOCK">No stock effect</option></select></label></div><label className="block text-sm font-medium">{copy.refundMethod}<select value={returnForm.refundMethod} onChange={(event) => setReturnForm({ ...returnForm, refundMethod: event.target.value, refundFinancialAccountId: "" })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"><option value="ORIGINAL_TENDER">Original tender</option><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile Money</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option></select></label>{returnForm.refundMethod !== "ORIGINAL_TENDER" ? <label className="block text-sm font-medium">{copy.refundAccount}<select required value={returnForm.refundFinancialAccountId} onChange={(event) => setReturnForm({ ...returnForm, refundFinancialAccountId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"><option value="">—</option>{accounts.filter((account) => !selectedSale?.currencyCode || account.currencyCode === selectedSale.currencyCode).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.accountType} · {money(account.operationalBalance, account.currencyCode)}</option>)}</select></label> : null}<label className="block text-sm font-medium">{copy.reason}<textarea required minLength={3} value={returnForm.reason} onChange={(event) => setReturnForm({ ...returnForm, reason: event.target.value })} className="mt-1 min-h-24 w-full rounded-xl border bg-background px-3 py-2" /></label><button disabled={saving || !returnForm.saleLineId} className="min-h-11 w-full rounded-xl bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50">{copy.requestReturn}</button></> : <p className="text-sm text-muted-foreground">{copy.noSales}</p>}</form> : <p className="text-sm text-muted-foreground">{copy.forbidden}</p>}</aside>
          <div className="space-y-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setReturnStatus("PENDING_APPROVAL")} className={`rounded-full border px-3 py-2 text-sm ${returnStatus === "PENDING_APPROVAL" ? "bg-foreground text-background" : ""}`}>{copy.pendingOnly}</button><button type="button" onClick={() => setReturnStatus("")} className={`rounded-full border px-3 py-2 text-sm ${returnStatus === "" ? "bg-foreground text-background" : ""}`}>{copy.allReturns}</button></div>{returns.length ? <div className="divide-y rounded-2xl border">{returns.map((item) => <article key={item.id} className="space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{item.number} · {item.sale.number}</p><p className="text-sm text-muted-foreground">{item.returnType} · {money(item.grandTotal, item.currencyCode)} · {new Date(item.createdAt).toLocaleString()}</p></div><span className="rounded-full border px-2 py-1 text-xs">{item.status}</span></div><p className="text-sm">{item.reason}</p><div className="space-y-1 text-sm text-muted-foreground">{item.lines.map((line) => <p key={line.id}>{line.saleLine.description} · {line.quantity} · {line.stockDisposition}</p>)}</div>{item.status === "PENDING_APPROVAL" && capabilities?.canManageRefunds ? <div className="flex flex-wrap gap-2"><button disabled={saving} onClick={() => void decideReturn(item, "APPROVE")} type="button" className="min-h-10 rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background">{copy.approve}</button><button disabled={saving} onClick={() => void decideReturn(item, "REJECT")} type="button" className="min-h-10 rounded-xl border px-4 py-2 text-sm font-medium">{copy.reject}</button></div> : null}</article>)}</div> : <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">{copy.noReturns}</div>}</div>
        </div></section>
      ) : null}
    </main>
  );
}
