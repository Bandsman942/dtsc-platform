"use client";

import Link from "next/link";
import { downloadProfessionalCsv, downloadProfessionalPdf, downloadProfessionalXlsx, type ProfessionalReportExportModel } from "@/lib/reporting/professional-export";
import { ArrowLeft, BadgePercent, RotateCcw, Tags } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import styles from "./retail-commercial-workspace.module.css";
import {
  customerFacingError,
  customerFacingFinancialAccountType,
  customerFacingProductCondition,
  customerFacingPromotionStackMode,
  customerFacingPromotionType,
  customerFacingRefundMethod,
  customerFacingReturnType,
  customerFacingSalesChannel,
  customerFacingStatusLabel,
  customerFacingStockDisposition,
  type CustomerFacingLocale,
} from "@/lib/customer-facing-language";

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
  revision: number;
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

const PROMOTION_TYPES = ["PERCENTAGE", "FIXED_AMOUNT", "QUANTITY_BREAK", "BUY_X_GET_Y", "BUNDLE"] as const;
const STACK_MODES = ["EXCLUSIVE", "STACKABLE"] as const;
const SALES_CHANNELS = ["POS", "ONLINE", "OMNICHANNEL"] as const;
const RETURN_TYPES = ["RETURN", "EXCHANGE"] as const;
const PRODUCT_CONDITIONS = ["SELLABLE", "OPENED", "DAMAGED", "DEFECTIVE", "EXPIRED", "OTHER"] as const;
const STOCK_DISPOSITIONS = ["RESTOCK", "SCRAP", "NO_STOCK"] as const;
const REFUND_METHODS = ["ORIGINAL_TENDER", "CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD"] as const;

function buildCopy(language: CustomerFacingLocale) {
  if (language === "en") {
    return {
      eyebrow: "Retail · Commercial management",
      title: "Pricing, offers & customer returns",
      intro: "Set when your sale prices apply, manage customer offers and handle returns through a clear approval and refund flow.",
      back: "Back to checkout",
      pricing: "Pricing",
      promotions: "Offers & promotions",
      returns: "Returns & exchanges",
      availablePrices: "Available sale prices",
      priceRules: "Checkout pricing rules",
      priceHint: "Choose when a sale price applies by quantity or sales channel. Product prices themselves remain managed in Catalog.",
      catalogLink: "Manage product prices in Catalog",
      financeLink: "Open Treasury accounts",
      addRule: "Save pricing rule",
      price: "Sale price",
      minQty: "Minimum quantity",
      maxQty: "Maximum quantity",
      channel: "Sales channel",
      order: "Application order",
      active: "Active",
      inactive: "Inactive",
      noRules: "No checkout pricing rule yet.",
      noPrices: "No active sale price is available. Add a product price in Catalog first.",
      promoControl: "Customer offers",
      promoHint: "Create offers your team can apply at checkout and follow how much discount they have generated.",
      createPromo: "Save promotion",
      code: "Offer code",
      nameFr: "French name",
      nameEn: "English name",
      type: "Offer type",
      status: "Availability",
      stacking: "Combination with other offers",
      coupon: "Coupon code (optional)",
      starts: "Starts",
      ends: "Ends (optional)",
      targetProduct: "Target product",
      percent: "Discount percentage",
      amount: "Discount amount",
      buyQty: "Quantity to buy",
      getQty: "Quantity offered",
      bundleProducts: "Products in the offer",
      bundlePrice: "Offer price",
      unitPrice: "Unit price",
      noPromos: "No customer promotion yet.",
      usage: "uses",
      discountGranted: "discount granted",
      returnRequest: "New return request",
      returnQueue: "Returns to review",
      returnHint: "A return is submitted first, then reviewed by another authorized person before the refund is completed.",
      sale: "Original sale",
      line: "Item to return",
      quantity: "Quantity",
      productCondition: "Product condition",
      disposition: "What to do with the stock",
      refundMethod: "Refund method",
      refundAccount: "Account used for refund",
      replacementSale: "Replacement sale",
      reason: "Reason",
      requestReturn: "Submit return request",
      pendingOnly: "Awaiting review",
      allReturns: "All returns",
      approve: "Approve & refund",
      reject: "Reject",
      rejectionReason: "Reason for rejection",
      noReturns: "No return matches this filter.",
      noSales: "No completed sale is currently available for return.",
      saveSuccess: "Changes saved.",
      requestSuccess: "Return request submitted for independent review.",
      approveSuccess: "Return approved and refund completed.",
      rejectSuccess: "Return rejected.",
      loading: "Loading commercial information…",
      forbidden: "Your role does not allow this action.",
      unavailableProduct: "Product no longer available",
      select: "Select",
      optional: "Optional",
    };
  }
  return {
    eyebrow: "Commerce de détail · Gestion commerciale",
    title: "Tarification, offres & retours clients",
    intro: "Définissez quand vos prix de vente s’appliquent, pilotez les offres clients et gérez les retours jusqu’à leur validation et leur remboursement.",
    back: "Retour à la caisse",
    pricing: "Tarification",
    promotions: "Offres & promotions",
    returns: "Retours & échanges",
    availablePrices: "Prix de vente disponibles",
    priceRules: "Règles de prix à la caisse",
    priceHint: "Choisissez quand un prix de vente s’applique selon la quantité ou le canal. Le prix du produit lui-même reste géré dans le Catalogue.",
    catalogLink: "Gérer les prix produits dans le Catalogue",
    financeLink: "Ouvrir les comptes de Trésorerie",
    addRule: "Enregistrer la règle de prix",
    price: "Prix de vente",
    minQty: "Quantité minimale",
    maxQty: "Quantité maximale",
    channel: "Canal de vente",
    order: "Ordre d’application",
    active: "Active",
    inactive: "Inactive",
    noRules: "Aucune règle de prix à la caisse pour le moment.",
    noPrices: "Aucun prix de vente actif n’est disponible. Ajoutez d’abord un prix produit dans le Catalogue.",
    promoControl: "Offres proposées aux clients",
    promoHint: "Créez les offres utilisables par l’équipe à la caisse et suivez le montant des remises déjà accordées.",
    createPromo: "Enregistrer la promotion",
    code: "Code de l’offre",
    nameFr: "Nom français",
    nameEn: "Nom anglais",
    type: "Type d’offre",
    status: "Disponibilité",
    stacking: "Cumul avec d’autres offres",
    coupon: "Code coupon (optionnel)",
    starts: "Début",
    ends: "Fin (optionnelle)",
    targetProduct: "Produit ciblé",
    percent: "Pourcentage de remise",
    amount: "Montant de remise",
    buyQty: "Quantité à acheter",
    getQty: "Quantité offerte",
    bundleProducts: "Produits de l’offre",
    bundlePrice: "Prix de l’offre",
    unitPrice: "Prix unitaire",
    noPromos: "Aucune promotion client pour le moment.",
    usage: "utilisations",
    discountGranted: "de remise accordée",
    returnRequest: "Nouvelle demande de retour",
    returnQueue: "Retours à examiner",
    returnHint: "Un retour est d’abord soumis, puis examiné par une autre personne autorisée avant de finaliser le remboursement.",
    sale: "Vente d’origine",
    line: "Article à retourner",
    quantity: "Quantité",
    productCondition: "État du produit",
    disposition: "Traitement du stock",
    refundMethod: "Mode de remboursement",
    refundAccount: "Compte utilisé pour le remboursement",
    replacementSale: "Vente de remplacement",
    reason: "Motif",
    requestReturn: "Soumettre la demande de retour",
    pendingOnly: "À examiner",
    allReturns: "Tous les retours",
    approve: "Valider & rembourser",
    reject: "Refuser",
    rejectionReason: "Motif du refus",
    noReturns: "Aucun retour ne correspond à ce filtre.",
    noSales: "Aucune vente finalisée n’est actuellement disponible pour un retour.",
    saveSuccess: "Modifications enregistrées.",
    requestSuccess: "Demande de retour soumise pour examen indépendant.",
    approveSuccess: "Retour validé et remboursement terminé.",
    rejectSuccess: "Retour refusé.",
    loading: "Chargement des informations commerciales…",
    forbidden: "Votre fonction ne vous autorise pas à réaliser cette action.",
    unavailableProduct: "Produit indisponible",
    select: "Sélectionner",
    optional: "Optionnel",
  };
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || body?.message || `HTTP_${response.status}`);
  return body;
}

function numberValue(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: string | number, currency?: string | null) {
  const amount = numberValue(value);
  try {
    return new Intl.NumberFormat(undefined, {
      style: currency ? "currency" : "decimal",
      currency: currency || undefined,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency || ""}`.trim();
  }
}

function localDateTimeInput(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function RegisterPager({ page, total, pageCount, setPage, language }: {
  page: number; total: number; pageCount: number; setPage: (page: number) => void; language: CustomerFacingLocale;
}) {
  return <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-dtsc-muted" role="navigation" aria-label={language === "en" ? "Pagination" : "Pagination de la liste"}>
    <span>{total} {language === "en" ? "items" : "éléments"} · {page} / {pageCount}</span>
    <div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="min-h-10 rounded-lg border border-dtsc-border px-3 disabled:opacity-40">{language === "en" ? "Previous" : "Précédent"}</button>
      <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="min-h-10 rounded-lg border border-dtsc-border px-3 disabled:opacity-40">{language === "en" ? "Next" : "Suivant"}</button>
    </div>
  </div>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="block text-sm font-medium">{children}</span>;
}

export function RetailCommercialWorkspace({ organizationId }: { organizationId: string }) {
  const language: CustomerFacingLocale = useAppLocale() === "en" ? "en" : "fr";
  const copy: Copy = useMemo(() => buildCopy(language), [language]);
  const [tab, setTab] = useState<Tab>("PRICING");
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [prices, setPrices] = useState<CatalogPrice[]>([]);
  const [conditions, setConditions] = useState<PriceCondition[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [returns, setReturns] = useState<RetailReturn[]>([]);
  const [accounts, setAccounts] = useState<RefundAccount[]>([]);
  const [conditionPage, setConditionPage] = useState(1);
  const [conditionSearch, setConditionSearch] = useState("");
  const [conditionActive, setConditionActive] = useState("");
  const [conditionPagination, setConditionPagination] = useState({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  const [promotionPage, setPromotionPage] = useState(1);
  const [promotionSearch, setPromotionSearch] = useState("");
  const [promotionStatus, setPromotionStatus] = useState("");
  const [promotionFrom, setPromotionFrom] = useState("");
  const [promotionTo, setPromotionTo] = useState("");
  const [promotionPagination, setPromotionPagination] = useState({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  const [returnPage, setReturnPage] = useState(1);
  const [returnSearch, setReturnSearch] = useState("");
  const [returnFrom, setReturnFrom] = useState("");
  const [returnTo, setReturnTo] = useState("");
  const [returnPagination, setReturnPagination] = useState({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  const [exporting, setExporting] = useState(false);
  const [returnStatus, setReturnStatus] = useState("PENDING_APPROVAL");
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [availableStores, setAvailableStores] = useState<Array<{ id: string; name: string }>>([]);
  const [priceForm, setPriceForm] = useState({
    id: "",
    revision: 0,
    siteId: "",
    catalogPriceId: "",
    minQuantity: "1",
    maxQuantity: "",
    channelCode: "POS",
    priority: "0",
    isActive: true,
  });
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

  const selectedSale = useMemo(
    () => sales.find((sale) => sale.id === returnForm.saleId) || null,
    [sales, returnForm.saleId],
  );
  const selectedPrice = useMemo(
    () => prices.find((price) => price.id === priceForm.catalogPriceId) || null,
    [prices, priceForm.catalogPriceId],
  );

  const showError = useCallback((caught: unknown, fallback: { fr: string; en: string }) => {
    setError(customerFacingError(caught, language, fallback));
  }, [language]);

  useEffect(() => {
    let active = true;
    fetch(`/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_POS`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { warehouses?: Array<{ site?: { id: string; name: string } }> } | null) => {
        if (!active) return;
        const sites = new Map<string, { id: string; name: string }>();
        for (const warehouse of data?.warehouses || []) if (warehouse.site) sites.set(warehouse.site.id, warehouse.site);
        setAvailableStores([...sites.values()]);
      }).catch(() => undefined);
    return () => { active = false; };
  }, [organizationId]);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [permissionData, priceData, saleData, accountData] = await Promise.all([
        fetch(`/api/enterprise/${organizationId}/retail/commercial-permissions`).then(readJson),
        fetch(`/api/enterprise/${organizationId}/retail/pricing/catalog?pageSize=100`).then(readJson),
        fetch(`/api/enterprise/${organizationId}/retail/sales?pageSize=50&status=COMPLETED`).then(readJson),
        fetch(`/api/enterprise/${organizationId}/retail/refund-accounts`).then(readJson),
      ]);
      setCapabilities(permissionData.capabilities);
      setPrices(priceData.items || []);
      setSales(saleData.items || []);
      setAccounts(accountData.items || []);
      setPriceForm((current) => ({
        ...current,
        catalogPriceId: current.catalogPriceId || priceData.items?.[0]?.id || "",
      }));
      setPromoForm((current) => ({
        ...current,
        catalogItemId: current.catalogItemId || priceData.items?.[0]?.catalogItemId || "",
      }));
      setReturnForm((current) => ({
        ...current,
        saleId: current.saleId || saleData.items?.[0]?.id || "",
        saleLineId: current.saleLineId || saleData.items?.[0]?.lines?.[0]?.id || "",
      }));
    } catch (caught) {
      showError(caught, {
        fr: "Les informations de tarification, promotion et remboursement ne sont pas disponibles pour le moment.",
        en: "Pricing, promotion and refund information is not available right now.",
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, showError]);

  const loadConditions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(conditionPage), pageSize: "20" });
      if (conditionSearch.trim()) params.set("search", conditionSearch.trim());
      if (conditionActive) params.set("active", conditionActive);
      const result = await fetch(`/api/enterprise/${organizationId}/retail/pricing/conditions?${params}`, { cache: "no-store" }).then(readJson);
      setConditions(result.items || []);
      if (result.pagination) setConditionPagination(result.pagination);
    } catch (caught) {
      showError(caught, { fr: "Les règles de prix filtrées ne sont pas disponibles.", en: "Filtered price rules are unavailable." });
    }
  }, [organizationId, conditionPage, conditionSearch, conditionActive, showError]);

  const loadPromotions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(promotionPage), pageSize: "20" });
      if (promotionSearch.trim()) params.set("search", promotionSearch.trim());
      if (promotionStatus) params.set("status", promotionStatus);
      if (promotionFrom) params.set("from", promotionFrom);
      if (promotionTo) params.set("to", promotionTo);
      const result = await fetch(`/api/enterprise/${organizationId}/retail/promotions?${params}`, { cache: "no-store" }).then(readJson);
      setPromotions(result.items || []);
      if (result.pagination) setPromotionPagination(result.pagination);
    } catch (caught) {
      showError(caught, { fr: "Les promotions filtrées ne sont pas disponibles.", en: "Filtered promotions are unavailable." });
    }
  }, [organizationId, promotionPage, promotionSearch, promotionStatus, promotionFrom, promotionTo, showError]);

  const loadReturns = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(returnPage), pageSize: "20" });
      if (returnStatus) params.set("status", returnStatus);
      if (returnSearch.trim()) params.set("search", returnSearch.trim());
      if (returnFrom) params.set("from", returnFrom);
      if (returnTo) params.set("to", returnTo);
      const data = await fetch(`/api/enterprise/${organizationId}/retail/returns?${params}`, { cache: "no-store" }).then(readJson);
      setReturns(data.items || []);
      if (data.pagination) setReturnPagination(data.pagination);
    } catch (caught) {
      showError(caught, {
        fr: "Les demandes de retour ne sont pas disponibles pour le moment.",
        en: "Return requests are not available right now.",
      });
    }
  }, [organizationId, returnPage, returnStatus, returnSearch, returnFrom, returnTo, showError]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => { const timer = setTimeout(() => { void loadConditions(); }, conditionSearch ? 250 : 0); return () => clearTimeout(timer); }, [loadConditions, conditionSearch]);
  useEffect(() => { const timer = setTimeout(() => { void loadPromotions(); }, promotionSearch ? 250 : 0); return () => clearTimeout(timer); }, [loadPromotions, promotionSearch]);
  useEffect(() => { const timer = setTimeout(() => { void loadReturns(); }, returnSearch ? 250 : 0); return () => clearTimeout(timer); }, [loadReturns, returnSearch]);

  async function submitPriceRule(event: React.FormEvent) {
    event.preventDefault();
    if (!capabilities?.canManagePricing) {
      setError(copy.forbidden);
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await fetch(`/api/enterprise/${organizationId}/retail/pricing/conditions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(priceForm.id ? { id: priceForm.id, revision: priceForm.revision } : {}),
          siteId: priceForm.siteId || null,
          catalogPriceId: priceForm.catalogPriceId,
          minQuantity: priceForm.minQuantity ? Number(priceForm.minQuantity) : null,
          maxQuantity: priceForm.maxQuantity ? Number(priceForm.maxQuantity) : null,
          channelCode: priceForm.channelCode,
          priority: Number(priceForm.priority || 0),
          isActive: priceForm.isActive,
        }),
      }).then(readJson);
      setMessage(copy.saveSuccess);
      setPriceForm((current) => ({ ...current, id: "", revision: 0, minQuantity: "1", maxQuantity: "", priority: "0" }));
      await loadConditions();
    } catch (caught) {
      showError(caught, {
        fr: "Cette règle de prix n’a pas pu être enregistrée. Vérifiez le prix, les quantités et le canal de vente.",
        en: "This pricing rule could not be saved. Check the price, quantities and sales channel.",
      });
    } finally {
      setSaving(false);
    }
  }

  function buildPromotionAction() {
    if (promoForm.promotionType === "PERCENTAGE") return { percent: Number(promoForm.percent) };
    if (promoForm.promotionType === "FIXED_AMOUNT") return { amount: Number(promoForm.amount) };
    if (promoForm.promotionType === "QUANTITY_BREAK") {
      return promoForm.unitPrice
        ? { minQuantity: Number(promoForm.minQuantity), unitPrice: Number(promoForm.unitPrice) }
        : { minQuantity: Number(promoForm.minQuantity), percent: Number(promoForm.percent) };
    }
    if (promoForm.promotionType === "BUY_X_GET_Y") {
      return { buyQuantity: Number(promoForm.buyQuantity), getQuantity: Number(promoForm.getQuantity) };
    }
    return { productIds: promoForm.bundleProductIds, bundlePrice: Number(promoForm.bundlePrice) };
  }

  async function submitPromotion(event: React.FormEvent) {
    event.preventDefault();
    if (!capabilities?.canManagePromotions) {
      setError(copy.forbidden);
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const targetProducts = promoForm.promotionType === "BUNDLE"
        ? promoForm.bundleProductIds
        : promoForm.catalogItemId
          ? [promoForm.catalogItemId]
          : [];
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
      await loadPromotions();
    } catch (caught) {
      showError(caught, {
        fr: "Cette promotion n’a pas pu être enregistrée. Vérifiez les produits, les dates et les conditions de l’offre.",
        en: "This promotion could not be saved. Check the products, dates and offer conditions.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function submitReturn(event: React.FormEvent) {
    event.preventDefault();
    if (!capabilities?.canCreateReturns) {
      setError(copy.forbidden);
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
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
          lines: [{
            saleLineId: returnForm.saleLineId,
            quantity: Number(returnForm.quantity),
            productCondition: returnForm.productCondition,
            stockDisposition: returnForm.stockDisposition,
          }],
        }),
      }).then(readJson);
      setMessage(copy.requestSuccess);
      setReturnForm((current) => ({ ...current, reason: "", quantity: "1" }));
      await loadReturns();
    } catch (caught) {
      showError(caught, {
        fr: "La demande de retour n’a pas pu être créée. Vérifiez la vente, la quantité et le mode de remboursement.",
        en: "The return request could not be created. Check the sale, quantity and refund method.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function decideReturn(item: RetailReturn, decision: "APPROVE" | "REJECT") {
    if (!capabilities?.canManageRefunds) {
      setError(copy.forbidden);
      return;
    }
    const reason = decision === "REJECT" ? (decisionReasons[item.id] || "").trim() : null;
    if (decision === "REJECT" && (!reason || reason.length < 3)) {
      setError(language === "en" ? "Enter a reason of at least 3 characters." : "Saisissez un motif d’au moins 3 caractères.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await fetch(`/api/enterprise/${organizationId}/retail/returns/${item.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          revision: item.revision,
          decision,
          reason,
          refundFinancialAccountId: item.refundFinancialAccountId || null,
        }),
      }).then(readJson);
      setMessage(decision === "APPROVE" ? copy.approveSuccess : copy.rejectSuccess);
      setDecisionReasons((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      await Promise.all([loadReturns(), loadCore()]);
    } catch (caught) {
      showError(caught, {
        fr: "Cette décision n’a pas pu être enregistrée. Actualisez le retour puis réessayez.",
        en: "This decision could not be saved. Refresh the return and try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  function selectSale(saleId: string) {
    const sale = sales.find((item) => item.id === saleId);
    setReturnForm((current) => ({
      ...current,
      saleId,
      saleLineId: sale?.lines?.[0]?.id || "",
      refundFinancialAccountId: "",
    }));
  }

  async function exportCommercialRegister(format: "csv" | "xlsx" | "pdf") {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      let endpoint = "";
      let columns: ProfessionalReportExportModel["columns"] = [];
      if (tab === "PRICING") {
        endpoint = "pricing/conditions";
        if (conditionSearch.trim()) params.set("search", conditionSearch.trim());
        if (conditionActive) params.set("active", conditionActive);
        columns = [{ key: "code", label: "Article" }, { key: "amount", label: "Prix" }, { key: "currency", label: "Devise" }, { key: "quantity", label: "Quantité min" }, { key: "channel", label: "Canal" }, { key: "status", label: "Statut" }];
      } else if (tab === "PROMOTIONS") {
        endpoint = "promotions";
        if (promotionSearch.trim()) params.set("search", promotionSearch.trim());
        if (promotionStatus) params.set("status", promotionStatus);
        if (promotionFrom) params.set("from", promotionFrom);
        if (promotionTo) params.set("to", promotionTo);
        columns = [{ key: "code", label: "Code" }, { key: "name", label: "Offre" }, { key: "type", label: "Type" }, { key: "status", label: "Statut" }, { key: "currency", label: "Devise" }, { key: "start", label: "Début" }, { key: "end", label: "Fin" }];
      } else {
        endpoint = "returns";
        if (returnSearch.trim()) params.set("search", returnSearch.trim());
        if (returnStatus) params.set("status", returnStatus);
        if (returnFrom) params.set("from", returnFrom);
        if (returnTo) params.set("to", returnTo);
        columns = [{ key: "number", label: "Retour" }, { key: "sale", label: "Vente" }, { key: "amount", label: "Montant" }, { key: "currency", label: "Devise" }, { key: "status", label: "Statut" }, { key: "reason", label: "Motif" }];
      }
      const records: Array<Record<string, unknown>> = [];
      for (let next = 1; ; next++) {
        params.set("page", String(next));
        const response = await fetch(`/api/enterprise/${organizationId}/retail/${endpoint}?${params}`, { cache: "no-store" });
        const body = await readJson(response);
        if ((body.pagination?.total || 0) > 5000) throw new Error(language === "en"
          ? "More than 5,000 results. Narrow the filters before exporting."
          : "Plus de 5 000 résultats. Affinez les filtres pour exporter.");
        records.push(...(body.items || []));
        if (!body.pagination || next >= body.pagination.pageCount) break;
      }
      const rows: ProfessionalReportExportModel["rows"] = records.map((record) => {
        if (tab === "PRICING") {
          const condition = record as unknown as PriceCondition;
          return { code: condition.item?.name || condition.catalogPriceId, amount: Number(condition.price?.amount || 0),
            currency: condition.price?.currency || "", quantity: condition.minQuantity || "", channel: condition.channelCode,
            status: condition.isActive ? copy.active : copy.inactive };
        }
        if (tab === "PROMOTIONS") {
          const offer = record as unknown as Promotion;
          return { code: offer.code, name: language === "en" ? offer.nameEn : offer.nameFr,
            type: customerFacingPromotionType(offer.promotionType, language), status: customerFacingStatusLabel(offer.status, language),
            currency: offer.currencyCode || "", start: offer.startsAt?.slice(0, 10) || "", end: offer.endsAt?.slice(0, 10) || "" };
        }
        const item = record as unknown as RetailReturn;
        return { number: item.number, sale: item.sale?.number || "", amount: Number(item.grandTotal),
          currency: item.currencyCode, status: customerFacingStatusLabel(item.status, language), reason: item.reason };
      });
      const model: ProfessionalReportExportModel = {
        title: `DTSC Retail — ${tab === "PRICING" ? copy.pricing : tab === "PROMOTIONS" ? copy.promotions : copy.returns}`,
        subtitle: language === "en" ? "Filtered and access-controlled commercial register" : "Registre commercial filtré et soumis aux droits d'accès",
        filenameBase: `dtsc-retail-${tab.toLowerCase()}-${new Date().toLocaleDateString("sv-SE")}`,
        generatedLabel: new Date().toLocaleString(language === "en" ? "en-US" : "fr-FR"),
        kpis: [{ label: language === "en" ? "Records" : "Enregistrements", value: String(rows.length) }],
        chart: [], columns, rows, insights: [],
        filters: [{ label: "Section", value: tab }, { label: "Recherche", value: tab === "PRICING" ? conditionSearch : tab === "PROMOTIONS" ? promotionSearch : returnSearch }],
      };
      if (format === "csv") downloadProfessionalCsv(model);
      else if (format === "xlsx") downloadProfessionalXlsx(model);
      else downloadProfessionalPdf(model);
    } catch (caught) {
      showError(caught, { fr: "L'export commercial n'a pas pu être généré. Vérifiez les filtres et vos droits d'accès.", en: "Commercial export failed. Check filters and access rights." });
    } finally { setExporting(false); }
  }

  if (loading) {
    return <div className="dtsc-card mx-auto max-w-7xl p-5 text-sm text-dtsc-muted" role="status">{copy.loading}</div>;
  }

  return (
    <div data-retail-commercial-workspace role="region" aria-label={copy.title} className={`${styles.workspace} mx-auto w-full min-w-0 max-w-7xl space-y-5 px-1 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-2 text-dtsc-ink sm:px-4 sm:pt-4 lg:px-6`}>
      <header className="dtsc-card-alt space-y-3 p-4 sm:p-6">
        <Link href="/enterprise-modules/RETAIL_POS" className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-blue transition hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {copy.back}
        </Link>
        <div className="flex min-w-0 items-start gap-3">
          <span className="dtsc-icon-badge shrink-0"><Tags className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-dtsc-blue">{copy.eyebrow}</p>
            <h1 className="mt-1 break-words text-xl font-black tracking-tight text-dtsc-ink sm:text-2xl lg:text-3xl">{copy.title}</h1>
          </div>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-dtsc-muted">{copy.intro}</p>
      </header>

      <nav className="flex min-w-0 gap-2 overflow-x-auto pb-2 [scrollbar-width:thin] [touch-action:pan-x]" aria-label={copy.title}>
        {(["PRICING", "PROMOTIONS", "RETURNS"] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            aria-current={tab === item ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${tab === item ? "border-cyan-500/50 bg-dtsc-soft text-dtsc-blue shadow-sm" : "border-dtsc-border bg-dtsc-surface text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-ink"}`}
          >
            {item === "PRICING" ? <Tags className="h-4 w-4" aria-hidden="true" /> : item === "PROMOTIONS" ? <BadgePercent className="h-4 w-4" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
            {item === "PRICING" ? copy.pricing : item === "PROMOTIONS" ? copy.promotions : copy.returns}
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-2" aria-label={language === "en" ? "Commercial export" : "Export commercial"}>
        <span className="mr-auto text-xs font-semibold text-dtsc-muted">{language === "en" ? "Filtered register · max 5,000 rows" : "Registre filtré · maximum 5 000 lignes"}</span>
        {(["csv","xlsx","pdf"] as const).map((format) => <button key={format} type="button" disabled={exporting || loading} onClick={() => void exportCommercialRegister(format)} className="min-h-10 rounded-lg border border-dtsc-border px-3 text-xs font-black uppercase text-dtsc-blue disabled:opacity-50">{format}</button>)}
      </div>
      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm" role="status">{message}</div> : null}
      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm" role="alert">{error}</div> : null}

      {tab === "PRICING" ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.65fr)]">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{copy.priceRules}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.priceHint}</p>
              <Link href="/enterprise-modules/CATALOG" className="mt-2 inline-flex text-sm font-medium underline underline-offset-4">
                {copy.catalogLink}
              </Link>
            </div>
            <div className="grid gap-2 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)]">
              <label className="text-xs font-semibold text-dtsc-muted">{language === "en" ? "Search rules" : "Rechercher des règles"}<input type="search" value={conditionSearch} onChange={(e) => { setConditionSearch(e.target.value); setConditionPage(1); }} className="mt-1 min-h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink" placeholder={language === "en" ? "Product or code" : "Article ou code"} /></label>
              <label className="text-xs font-semibold text-dtsc-muted">{language === "en" ? "Status" : "Statut"}<select value={conditionActive} onChange={(e) => { setConditionActive(e.target.value); setConditionPage(1); }} className="mt-1 min-h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink"><option value="">{copy.allReturns}</option><option value="true">{copy.active}</option><option value="false">{copy.inactive}</option></select></label>
            </div>

            {conditions.length ? (
              <div className="divide-y rounded-2xl border bg-background">
                {conditions.map((condition) => (
                  <div key={condition.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{condition.item?.name || copy.unavailableProduct}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {condition.price ? money(condition.price.amount, condition.price.currency) : "—"}
                        {" · "}{customerFacingSalesChannel(condition.channelCode, language)}
                        {" · "}{condition.siteId ? availableStores.find((site) => site.id === condition.siteId)?.name || condition.siteId : (language === "en" ? "All stores" : "Toutes les boutiques")}
                        {" · "}{copy.minQty}: {condition.minQuantity || "—"}
                        {condition.maxQuantity ? ` · ${copy.maxQty}: ${condition.maxQuantity}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border px-2 py-1">{copy.order} {condition.priority}</span>
                      <span className="rounded-full border px-2 py-1">{condition.isActive ? copy.active : copy.inactive}</span>
                      <details className="relative"><summary aria-label="Actions" className="min-h-9 cursor-pointer list-none rounded-lg border border-dtsc-border px-3 py-2 font-bold text-dtsc-blue">⋯</summary>
                        <div className="absolute right-0 z-10 min-w-44 rounded-lg border border-dtsc-border bg-dtsc-surface p-2 shadow-lg">
                          {capabilities?.canManagePricing ? <button type="button" className="block w-full px-2 py-2 text-left hover:bg-dtsc-soft" onClick={() => { setPriceForm({ id: condition.id, revision: condition.revision, siteId: condition.siteId || "", catalogPriceId: condition.catalogPriceId, minQuantity: condition.minQuantity || "1", maxQuantity: condition.maxQuantity || "", channelCode: condition.channelCode, priority: String(condition.priority), isActive: condition.isActive }); document.getElementById("retail-price-form")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{language === "en" ? "Edit rule" : "Modifier la règle"}</button> : null}
                          <Link href="/enterprise-modules/CATALOG" className="block rounded-lg px-2 py-2 hover:bg-dtsc-soft">{copy.catalogLink}</Link>
                        </div>
                      </details>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">{copy.noRules}</div>
            )}
            <RegisterPager page={conditionPage} pageCount={conditionPagination.pageCount} total={conditionPagination.total} setPage={setConditionPage} language={language} />
          </div>

          <aside id="retail-price-form" className="dtsc-card scroll-mt-24 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{priceForm.id ? (language === "en" ? "Edit pricing condition" : "Modifier une condition tarifaire") : copy.availablePrices}</h2>
              {priceForm.id ? <button type="button" className="min-h-10 rounded-lg border border-dtsc-border px-3 text-xs font-bold text-dtsc-blue" onClick={() => setPriceForm({ id: "", revision: 0, siteId: "", catalogPriceId: "", minQuantity: "1", maxQuantity: "", channelCode: "POS", priority: "0", isActive: true })}>{language === "en" ? "New rule" : "Nouvelle règle"}</button> : null}
            </div>
            {!prices.length ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-muted-foreground">{copy.noPrices}</p>
                <Link href="/enterprise-modules/CATALOG" className="inline-flex text-sm font-medium underline underline-offset-4">{copy.catalogLink}</Link>
              </div>
            ) : capabilities?.canManagePricing ? (
              <form className="mt-4 space-y-4" onSubmit={submitPriceRule}>
                <label className="block">
                  <FieldLabel>{language === "en" ? "Store scope" : "Portée boutique"}</FieldLabel>
                  <select value={priceForm.siteId} onChange={(event) => setPriceForm({ ...priceForm, siteId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                    <option value="">{language === "en" ? "All stores" : "Toutes les boutiques"}</option>
                    {availableStores.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                    {priceForm.siteId && !availableStores.some((site) => site.id === priceForm.siteId)
                      ? <option value={priceForm.siteId}>{priceForm.siteId}</option> : null}
                  </select>
                  <span className="mt-1 block text-xs text-dtsc-muted">{language === "en" ? "Select a store for a store-specific rule, or all stores for a common rule." : "Choisissez une boutique pour une règle locale, ou toutes pour une règle commune."}</span>
                </label>
                <label className="block">
                  <FieldLabel>{copy.price}</FieldLabel>
                  <select value={priceForm.catalogPriceId} onChange={(event) => setPriceForm({ ...priceForm, catalogPriceId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                    <option value="">—</option>
                    {prices.map((price) => (
                      <option key={price.id} value={price.id}>
                        {price.catalogItem.name} · {money(price.amount, price.currency)}{price.taxIncluded ? " TTC" : " HT"}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label>
                    <FieldLabel>{copy.minQty}</FieldLabel>
                    <input value={priceForm.minQuantity} onChange={(event) => setPriceForm({ ...priceForm, minQuantity: event.target.value })} type="number" min="0.000001" step="any" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                  </label>
                  <label>
                    <FieldLabel>{copy.maxQty}</FieldLabel>
                    <input value={priceForm.maxQuantity} onChange={(event) => setPriceForm({ ...priceForm, maxQuantity: event.target.value })} type="number" min="0.000001" step="any" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label>
                    <FieldLabel>{copy.channel}</FieldLabel>
                    <select value={priceForm.channelCode} onChange={(event) => setPriceForm({ ...priceForm, channelCode: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                      {SALES_CHANNELS.map((channel) => <option key={channel} value={channel}>{customerFacingSalesChannel(channel, language)}</option>)}
                    </select>
                  </label>
                  <label>
                    <FieldLabel>{copy.order}</FieldLabel>
                    <input value={priceForm.priority} onChange={(event) => setPriceForm({ ...priceForm, priority: event.target.value })} type="number" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                  </label>
                </div>
                <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                  <input checked={priceForm.isActive} onChange={(event) => setPriceForm({ ...priceForm, isActive: event.target.checked })} type="checkbox" />
                  {copy.active}
                </label>
                <button disabled={saving || !priceForm.catalogPriceId} className="min-h-11 w-full rounded-xl bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50">
                  {priceForm.id ? (language === "en" ? "Save rule changes" : "Enregistrer les modifications") : copy.addRule}
                </button>
              </form>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{copy.forbidden}</p>
            )}
          </aside>
        </section>
      ) : null}

      {tab === "PROMOTIONS" ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{copy.promoControl}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.promoHint}</p>
            </div>
            <div className="grid gap-2 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-dtsc-muted">{language === "en" ? "Search offers" : "Rechercher des offres"}<input type="search" value={promotionSearch} onChange={(e) => { setPromotionSearch(e.target.value); setPromotionPage(1); }} className="mt-1 min-h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink" placeholder={language === "en" ? "Code or name" : "Code ou nom"} /></label>
              <label className="text-xs font-semibold text-dtsc-muted">{copy.status}<select value={promotionStatus} onChange={(e) => { setPromotionStatus(e.target.value); setPromotionPage(1); }} className="mt-1 min-h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink"><option value="">{copy.allReturns}</option>{["ACTIVE","INACTIVE","DRAFT","ARCHIVED"].map((value) => <option key={value} value={value}>{customerFacingStatusLabel(value,language)}</option>)}</select></label>
              <label className="text-xs font-semibold text-dtsc-muted">{language === "en" ? "Created from" : "Créées du"}<input type="date" value={promotionFrom} max={promotionTo || undefined} onChange={(e) => { setPromotionFrom(e.target.value); setPromotionPage(1); }} className="mt-1 min-h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink" /></label>
              <label className="text-xs font-semibold text-dtsc-muted">{language === "en" ? "Created to" : "Créées au"}<input type="date" value={promotionTo} min={promotionFrom || undefined} onChange={(e) => { setPromotionTo(e.target.value); setPromotionPage(1); }} className="mt-1 min-h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink" /></label>
            </div>
            {promotions.length ? (
              <div className="divide-y rounded-2xl border bg-background">
                {promotions.map((promotion) => (
                  <div key={promotion.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{language === "en" ? promotion.nameEn : promotion.nameFr}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {customerFacingPromotionType(promotion.promotionType, language)} · {customerFacingPromotionStackMode(promotion.stackMode, language)}
                        </p>
                        {promotion.couponCode ? <p className="mt-1 text-xs text-muted-foreground">{copy.coupon}: {promotion.couponCode}</p> : null}
                      </div>
                      <div className="flex items-center gap-2"><span className="rounded-full border px-2 py-1 text-xs">{customerFacingStatusLabel(promotion.status, language)}</span><details className="relative"><summary aria-label="Actions" className="min-h-9 cursor-pointer list-none rounded-lg border px-3 py-2 text-sm text-dtsc-blue">⋯</summary><div className="absolute right-0 z-10 min-w-48 rounded-lg border border-dtsc-border bg-dtsc-surface p-3 text-xs shadow-lg"><strong>{promotion.code}</strong><p>{promotion.couponCode ? `${copy.coupon}: ${promotion.couponCode}` : customerFacingPromotionType(promotion.promotionType, language)}</p><p>{new Date(promotion.startsAt).toLocaleDateString(language)} — {promotion.endsAt ? new Date(promotion.endsAt).toLocaleDateString(language) : "∞"}</p></div></details></div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {promotion.usage.count} {copy.usage} · {money(promotion.usage.discountAmount, promotion.currencyCode)} {copy.discountGranted}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">{copy.noPromos}</div>
            )}
            <RegisterPager page={promotionPage} pageCount={promotionPagination.pageCount} total={promotionPagination.total} setPage={setPromotionPage} language={language} />
          </div>

          <aside className="dtsc-card p-4 sm:p-5">
            {capabilities?.canManagePromotions ? (
              <form className="space-y-3" onSubmit={submitPromotion}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label>
                    <FieldLabel>{copy.code}</FieldLabel>
                    <input required value={promoForm.code} onChange={(event) => setPromoForm({ ...promoForm, code: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                  </label>
                  <label>
                    <FieldLabel>{copy.order}</FieldLabel>
                    <input value={promoForm.priority} onChange={(event) => setPromoForm({ ...promoForm, priority: event.target.value })} type="number" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                  </label>
                </div>
                <label className="block">
                  <FieldLabel>{copy.nameFr}</FieldLabel>
                  <input required value={promoForm.nameFr} onChange={(event) => setPromoForm({ ...promoForm, nameFr: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                </label>
                <label className="block">
                  <FieldLabel>{copy.nameEn}</FieldLabel>
                  <input required value={promoForm.nameEn} onChange={(event) => setPromoForm({ ...promoForm, nameEn: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label>
                    <FieldLabel>{copy.type}</FieldLabel>
                    <select value={promoForm.promotionType} onChange={(event) => setPromoForm({ ...promoForm, promotionType: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                      {PROMOTION_TYPES.map((type) => <option key={type} value={type}>{customerFacingPromotionType(type, language)}</option>)}
                    </select>
                  </label>
                  <label>
                    <FieldLabel>{copy.stacking}</FieldLabel>
                    <select value={promoForm.stackMode} onChange={(event) => setPromoForm({ ...promoForm, stackMode: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                      {STACK_MODES.map((mode) => <option key={mode} value={mode}>{customerFacingPromotionStackMode(mode, language)}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <FieldLabel>{copy.status}</FieldLabel>
                  <select value={promoForm.status} onChange={(event) => setPromoForm({ ...promoForm, status: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                    <option value="ACTIVE">{customerFacingStatusLabel("ACTIVE", language)}</option>
                    <option value="INACTIVE">{customerFacingStatusLabel("INACTIVE", language)}</option>
                  </select>
                </label>

                {promoForm.promotionType !== "BUNDLE" ? (
                  <label className="block">
                    <FieldLabel>{copy.targetProduct}</FieldLabel>
                    <select value={promoForm.catalogItemId} onChange={(event) => setPromoForm({ ...promoForm, catalogItemId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                      {prices.map((price) => <option key={price.id} value={price.catalogItemId}>{price.catalogItem.name}</option>)}
                    </select>
                  </label>
                ) : (
                  <label className="block">
                    <FieldLabel>{copy.bundleProducts}</FieldLabel>
                    <select multiple value={promoForm.bundleProductIds} onChange={(event) => setPromoForm({ ...promoForm, bundleProductIds: Array.from(event.target.selectedOptions).map((option) => option.value) })} className="mt-1 min-h-28 w-full rounded-xl border bg-background px-3">
                      {prices.map((price) => <option key={price.id} value={price.catalogItemId}>{price.catalogItem.name}</option>)}
                    </select>
                  </label>
                )}

                {(promoForm.promotionType === "PERCENTAGE" || promoForm.promotionType === "QUANTITY_BREAK") ? (
                  <label className="block">
                    <FieldLabel>{copy.percent}</FieldLabel>
                    <input value={promoForm.percent} onChange={(event) => setPromoForm({ ...promoForm, percent: event.target.value })} type="number" min="0.01" max="100" step="0.01" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                  </label>
                ) : null}
                {promoForm.promotionType === "FIXED_AMOUNT" ? (
                  <label className="block">
                    <FieldLabel>{copy.amount}</FieldLabel>
                    <input required value={promoForm.amount} onChange={(event) => setPromoForm({ ...promoForm, amount: event.target.value })} type="number" min="0.01" step="0.01" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                  </label>
                ) : null}
                {promoForm.promotionType === "QUANTITY_BREAK" ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label>
                      <FieldLabel>{copy.minQty}</FieldLabel>
                      <input value={promoForm.minQuantity} onChange={(event) => setPromoForm({ ...promoForm, minQuantity: event.target.value })} type="number" min="1" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                    </label>
                    <label>
                      <FieldLabel>{copy.unitPrice}</FieldLabel>
                      <input value={promoForm.unitPrice} onChange={(event) => setPromoForm({ ...promoForm, unitPrice: event.target.value })} type="number" min="0" step="0.01" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                    </label>
                  </div>
                ) : null}
                {promoForm.promotionType === "BUY_X_GET_Y" ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label>
                      <FieldLabel>{copy.buyQty}</FieldLabel>
                      <input value={promoForm.buyQuantity} onChange={(event) => setPromoForm({ ...promoForm, buyQuantity: event.target.value })} type="number" min="1" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                    </label>
                    <label>
                      <FieldLabel>{copy.getQty}</FieldLabel>
                      <input value={promoForm.getQuantity} onChange={(event) => setPromoForm({ ...promoForm, getQuantity: event.target.value })} type="number" min="1" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                    </label>
                  </div>
                ) : null}
                {promoForm.promotionType === "BUNDLE" ? (
                  <label className="block">
                    <FieldLabel>{copy.bundlePrice}</FieldLabel>
                    <input required value={promoForm.bundlePrice} onChange={(event) => setPromoForm({ ...promoForm, bundlePrice: event.target.value })} type="number" min="0.01" step="0.01" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                  </label>
                ) : null}

                <label className="block">
                  <FieldLabel>{copy.coupon}</FieldLabel>
                  <input value={promoForm.couponCode} onChange={(event) => setPromoForm({ ...promoForm, couponCode: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label>
                    <FieldLabel>{copy.starts}</FieldLabel>
                    <input required value={promoForm.startsAt} onChange={(event) => setPromoForm({ ...promoForm, startsAt: event.target.value })} type="datetime-local" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-2" />
                  </label>
                  <label>
                    <FieldLabel>{copy.ends}</FieldLabel>
                    <input value={promoForm.endsAt} onChange={(event) => setPromoForm({ ...promoForm, endsAt: event.target.value })} type="datetime-local" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-2" />
                  </label>
                </div>
                <button disabled={saving} className="min-h-11 w-full rounded-xl bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50">{copy.createPromo}</button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">{copy.forbidden}</p>
            )}
          </aside>
        </section>
      ) : null}

      {tab === "RETURNS" ? (
        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">{copy.returnQueue}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.returnHint}</p>
            <p className="mt-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-dtsc-ink">{language === "en" ? "This queue manages legacy Retail returns. Returns linked to Finance invoices must be processed in the invoice register to preserve credit notes and accounting." : "Ce registre traite les retours Retail historiques. Les retours liés aux factures Finance doivent être traités dans le registre des factures pour conserver les avoirs et la comptabilité."}</p>
            <Link href="/enterprise-modules/RETAIL_POS?section=invoices" className="mt-2 inline-flex text-sm font-bold text-dtsc-blue underline">{language === "en" ? "Open Finance invoices" : "Ouvrir les factures Finance"}</Link>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(340px,0.8fr)_minmax(0,1fr)]">
            <aside className="dtsc-card p-4 sm:p-5">
              {capabilities?.canCreateReturns ? (
                <form className="space-y-3" onSubmit={submitReturn}>
                  <h3 className="font-semibold">{copy.returnRequest}</h3>
                  {sales.length ? (
                    <>
                      <label className="block">
                        <FieldLabel>{copy.sale}</FieldLabel>
                        <select value={returnForm.saleId} onChange={(event) => selectSale(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                          {sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.number} · {money(sale.grandTotal, sale.currencyCode)}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <FieldLabel>{copy.line}</FieldLabel>
                        <select value={returnForm.saleLineId} onChange={(event) => setReturnForm({ ...returnForm, saleLineId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                          {selectedSale?.lines.map((line) => <option key={line.id} value={line.id}>{line.description} · {line.quantity}</option>)}
                        </select>
                      </label>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label>
                          <FieldLabel>{copy.quantity}</FieldLabel>
                          <input required value={returnForm.quantity} onChange={(event) => setReturnForm({ ...returnForm, quantity: event.target.value })} type="number" min="0.000001" step="any" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" />
                        </label>
                        <label>
                          <FieldLabel>{copy.type}</FieldLabel>
                          <select value={returnForm.returnType} onChange={(event) => setReturnForm({ ...returnForm, returnType: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                            {RETURN_TYPES.map((type) => <option key={type} value={type}>{customerFacingReturnType(type, language)}</option>)}
                          </select>
                        </label>
                      </div>

                      {returnForm.returnType === "EXCHANGE" ? (
                        <label className="block">
                          <FieldLabel>{copy.replacementSale}</FieldLabel>
                          <select required value={returnForm.replacementSaleId} onChange={(event) => setReturnForm({ ...returnForm, replacementSaleId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                            <option value="">—</option>
                            {sales.filter((sale) => sale.id !== returnForm.saleId).map((sale) => <option key={sale.id} value={sale.id}>{sale.number}</option>)}
                          </select>
                        </label>
                      ) : null}

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label>
                          <FieldLabel>{copy.productCondition}</FieldLabel>
                          <select value={returnForm.productCondition} onChange={(event) => setReturnForm({ ...returnForm, productCondition: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                            {PRODUCT_CONDITIONS.map((condition) => <option key={condition} value={condition}>{customerFacingProductCondition(condition, language)}</option>)}
                          </select>
                        </label>
                        <label>
                          <FieldLabel>{copy.disposition}</FieldLabel>
                          <select value={returnForm.stockDisposition} onChange={(event) => setReturnForm({ ...returnForm, stockDisposition: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                            {STOCK_DISPOSITIONS.map((disposition) => <option key={disposition} value={disposition}>{customerFacingStockDisposition(disposition, language)}</option>)}
                          </select>
                        </label>
                      </div>

                      <label className="block">
                        <FieldLabel>{copy.refundMethod}</FieldLabel>
                        <select value={returnForm.refundMethod} onChange={(event) => setReturnForm({ ...returnForm, refundMethod: event.target.value, refundFinancialAccountId: "" })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                          {REFUND_METHODS.map((method) => <option key={method} value={method}>{customerFacingRefundMethod(method, language)}</option>)}
                        </select>
                      </label>

                      {returnForm.refundMethod !== "ORIGINAL_TENDER" ? (
                        <label className="block">
                          <FieldLabel>{copy.refundAccount}</FieldLabel>
                          <select required value={returnForm.refundFinancialAccountId} onChange={(event) => setReturnForm({ ...returnForm, refundFinancialAccountId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
                            <option value="">—</option>
                            {accounts
                              .filter((account) => !selectedSale?.currencyCode || account.currencyCode === selectedSale.currencyCode)
                              .map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name} · {customerFacingFinancialAccountType(account.accountType, language)} · {money(account.operationalBalance, account.currencyCode)}
                                </option>
                              ))}
                          </select>
                          <Link href="/enterprise-modules/FINANCE_TREASURY" className="mt-2 inline-flex text-xs font-medium underline underline-offset-4">{copy.financeLink}</Link>
                        </label>
                      ) : null}

                      <label className="block">
                        <FieldLabel>{copy.reason}</FieldLabel>
                        <textarea required minLength={3} value={returnForm.reason} onChange={(event) => setReturnForm({ ...returnForm, reason: event.target.value })} className="mt-1 min-h-24 w-full rounded-xl border bg-background px-3 py-2" />
                      </label>
                      <button disabled={saving || !returnForm.saleLineId} className="min-h-11 w-full rounded-xl bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50">{copy.requestReturn}</button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{copy.noSales}</p>
                  )}
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">{copy.forbidden}</p>
              )}
            </aside>

            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-xs font-semibold text-dtsc-muted">{language === "en" ? "Search returns" : "Rechercher des retours"}<input type="search" value={returnSearch} onChange={(e) => { setReturnSearch(e.target.value); setReturnPage(1); }} placeholder={language === "en" ? "Return or receipt number" : "N° retour ou vente"} className="mt-1 min-h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink" /></label>
                <label className="text-xs font-semibold text-dtsc-muted">{language === "en" ? "From" : "Du"}<input type="date" value={returnFrom} max={returnTo || undefined} onChange={(e) => { setReturnFrom(e.target.value); setReturnPage(1); }} className="mt-1 min-h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink" /></label>
                <label className="text-xs font-semibold text-dtsc-muted">{language === "en" ? "To" : "Au"}<input type="date" value={returnTo} min={returnFrom || undefined} onChange={(e) => { setReturnTo(e.target.value); setReturnPage(1); }} className="mt-1 min-h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink" /></label>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 [touch-action:pan-x]">
                <button type="button" onClick={() => { setReturnStatus("PENDING_APPROVAL"); setReturnPage(1); }} className={`min-h-10 shrink-0 rounded-full border px-3 py-2 text-sm transition ${returnStatus === "PENDING_APPROVAL" ? "border-cyan-500/50 bg-dtsc-soft font-semibold text-dtsc-blue" : "border-dtsc-border bg-dtsc-surface text-dtsc-muted hover:bg-dtsc-soft"}`}>{copy.pendingOnly}</button>
                <button type="button" onClick={() => { setReturnStatus(""); setReturnPage(1); }} className={`min-h-10 shrink-0 rounded-full border px-3 py-2 text-sm transition ${returnStatus === "" ? "border-cyan-500/50 bg-dtsc-soft font-semibold text-dtsc-blue" : "border-dtsc-border bg-dtsc-surface text-dtsc-muted hover:bg-dtsc-soft"}`}>{copy.allReturns}</button>
              </div>

              {returns.length ? returns.map((item) => (
                <article key={item.id} className="rounded-2xl border bg-background p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold">{item.number}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {customerFacingReturnType(item.returnType, language)} · {item.sale.number} · {money(item.grandTotal, item.currencyCode)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{customerFacingRefundMethod(item.refundMethod, language)}</p>
                    </div>
                    <div className="flex items-center gap-2"><span className="w-fit rounded-full border px-2 py-1 text-xs">{customerFacingStatusLabel(item.status, language)}</span><details className="relative"><summary aria-label="Actions" className="min-h-9 cursor-pointer list-none rounded-lg border border-dtsc-border px-3 py-2 font-bold text-dtsc-blue">⋯</summary><div className="absolute right-0 z-10 min-w-48 rounded-lg border border-dtsc-border bg-dtsc-surface p-2 shadow-lg"><Link href="/enterprise-modules/RETAIL_POS?section=returns" className="block rounded-lg px-2 py-2 text-xs text-dtsc-blue">{language === "en" ? "Open returns register" : "Ouvrir le registre des retours"}</Link><Link href="/enterprise-modules/FINANCE_TREASURY" className="block rounded-lg px-2 py-2 text-xs text-dtsc-blue">{language === "en" ? "Open treasury" : "Ouvrir la trésorerie"}</Link></div></details></div>
                  </div>

                  <p className="mt-3 text-sm">{item.reason}</p>
                  <div className="mt-3 space-y-2 rounded-xl bg-muted/30 p-3">
                    {item.lines.map((line) => (
                      <div key={line.id} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0 truncate">{line.saleLine.description}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{copy.quantity}: {line.quantity} · {customerFacingStockDisposition(line.stockDisposition, language)}</span>
                      </div>
                    ))}
                  </div>

                  {item.status === "PENDING_APPROVAL" && capabilities?.canManageRefunds ? (
                    <div className="mt-4 space-y-3 border-t pt-4">
                      <label className="block">
                        <FieldLabel>{copy.rejectionReason}</FieldLabel>
                        <textarea value={decisionReasons[item.id] || ""} onChange={(event) => setDecisionReasons((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-1 min-h-20 w-full rounded-xl border bg-background px-3 py-2" />
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button type="button" disabled={saving} onClick={() => void decideReturn(item, "APPROVE")} className="min-h-11 rounded-xl bg-[var(--dtsc-blue)] px-4 text-sm font-semibold text-[var(--dtsc-page)] transition hover:brightness-110 disabled:opacity-50">{copy.approve}</button>
                        <button type="button" disabled={saving} onClick={() => void decideReturn(item, "REJECT")} className="min-h-11 rounded-xl border px-4 text-sm font-medium disabled:opacity-50">{copy.reject}</button>
                      </div>
                    </div>
                  ) : null}
                </article>
              )) : (
                <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">{copy.noReturns}</div>
              )}
              <RegisterPager page={returnPage} pageCount={returnPagination.pageCount} total={returnPagination.total} setPage={setReturnPage} language={language} />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
