"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Printer, RotateCcw, Search, Share2, ShoppingCart, XCircle } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import type { MobileMoneyCashSession } from "@/components/enterprise/professional/mobile-money-cash-session-manager";
import { ProfessionalLoading } from "@/components/enterprise/professional/professional-erp-ui";
import { RetailPosCashSessionManager } from "@/components/enterprise/professional/retail-pos-cash-session-manager";
import {
  RetailErpLinks,
  RetailReportsPanel,
  RetailWorkspaceFrame,
  Select,
  moneyValue,
  statusTone,
  type CatalogItem,
  type FinancialAccount,
  type RetailDashboard,
  type RetailMutation,
  type Sale,
  type Warehouse,
} from "@/components/enterprise/professional/retail-workspace-shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { notifyToast } from "@/lib/client-toast";
import { customerFacingError, customerFacingFinancialAccountType, customerFacingStatusLabel } from "@/lib/customer-facing-language";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { translateRetailWorkspace, type RetailWorkspaceKey } from "@/lib/i18n";

type PosDashboard = RetailDashboard & { cashSessions?: MobileMoneyCashSession[] };

type CartLine = {
  catalogItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  referenceUnitPrice: number;
  discountAmount: number;
  taxAmount: number;
  currencyCode: string;
  inventoryItemId: string | null;
};

type TenderDraft = {
  methodType: string;
  financialAccountId: string;
  amount: number;
  reference: null;
};

type SaleDraft = {
  warehouseId: string;
  siteId: string | null;
  storageLocationId: null;
  currencyCode: string;
  lines: Array<{
    catalogItemId: string;
    inventoryItemId: string | null;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxAmount: number;
  }>;
  tenders: TenderDraft[];
  overrideReason: string | null;
};

type ErrorKey = "warehouse" | "cart" | "override" | "payment1" | "payment2" | "amounts";
type FormErrors = Partial<Record<ErrorKey, string>>;

function retailText(locale: "fr" | "en", key: RetailWorkspaceKey) {
  return translateRetailWorkspace(locale, key);
}

function GuidedField({ id, label, help, required, error, children }: { id?: string; label: string; help: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm font-black text-dtsc-ink">{label}</label>
        {required ? <span className="rounded-full border border-dtsc-border px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-dtsc-muted">*</span> : null}
      </div>
      {children}
      <p className="mt-1 text-xs font-semibold leading-5 text-dtsc-muted">{help}</p>
      {error ? <p role="alert" className="mt-1 text-xs font-bold leading-5 text-rose-700 dark:text-rose-200">{error}</p> : null}
    </div>
  );
}

function firstError(errors: FormErrors) {
  return Object.values(errors).find(Boolean) || "";
}

export function RetailPosDtscWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale: "fr" | "en" = useAppLocale() === "en" ? "en" : "fr";
  return (
    <RetailWorkspaceFrame organizationId={organizationId} organizationName={organizationName} definition={definition} moduleCode="RETAIL_POS" locale={locale}>
      {(context) => {
        const dashboard = context.dashboard as PosDashboard;
        if (context.tab === "HISTORY") return <PosHistory organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />;
        if (context.tab === "REPORTS") return <RetailReportsPanel dashboard={dashboard} moduleCode="RETAIL_POS" locale={locale} />;
        return <PosOperate organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} reload={async () => context.setRefreshKey((value) => value + 1)} />;
      }}
    </RetailWorkspaceFrame>
  );
}

function PosOperate({ organizationId, dashboard, locale, busyAction, mutate, reload }: { organizationId: string; dashboard: PosDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation; reload: () => Promise<void> }) {
  const copy = locale === "en" ? {
    searchHelp: "Search the real company catalog by name, SKU or code. Availability is calculated for the selected warehouse.",
    warehouseHelp: "Required. The warehouse determines stock availability and the site attached to the sale.",
    quantityHelp: "Quantity sold. It must be greater than zero and remain within available stock when negative stock is forbidden.",
    priceHelp: "Catalog price. Only a module manager may change it; a business reason is then required.",
    discountHelp: "Optional manual discount. A non-zero discount is a commercial override and requires a reason.",
    overrideReason: "Reason for price/discount override",
    overrideHelp: "Required only when a price is changed, a discount is entered or an item has no configured reference price.",
    paymentMethod: "Payment method",
    paymentMethodHelp: "Choose how the customer pays. The financial account must exist in this company and use the ticket currency.",
    account: "Payment account",
    cashAccountHelp: "Choose one of your open tills in the ticket currency. The server checks that the session is still open and belongs to you.",
    accountHelp: "Choose an active financial account in the ticket currency.",
    amount: "Amount",
    amountHelp: "The sum of all payment lines must match the ticket total exactly.",
    split: "Split payment",
    splitHelp: "Enable only when the customer pays with two distinct financial accounts.",
    secondPayment: "Second payment",
    review: "Review sale",
    reviewTitle: "Confirm point-of-sale transaction",
    reviewDescription: "Review the basket, warehouse, till/payment accounts and totals before creating the receipt.",
    edit: "Edit",
    confirm: "Confirm sale",
    processing: "Processing…",
    missingWarehouse: "Select an active store/warehouse before reviewing the sale.",
    emptyCart: "Add at least one valid product or service to the basket.",
    invalidCart: "Check quantities, prices and discounts in the basket before continuing.",
    overrideRequired: "Enter a business reason of at least 3 characters for the price or discount override.",
    overrideForbidden: "This basket requires a price/discount override, but your role is not allowed to perform it.",
    missingPayment: "Choose a valid financial account for the first payment.",
    missingSecondPayment: "Choose a valid, distinct financial account for the second payment.",
    paymentMismatch: "Payment amounts must be positive and their total must equal the ticket total.",
    noWrite: "You can view the POS, but your role cannot record a sale.",
    saleCompleted: "Sale completed.",
    tillCurrency: "The selected cash till must use the same currency as the ticket.",
    cash: "Cash",
    mobileMoney: "Mobile Money",
    bank: "Bank transfer",
    card: "Card",
    total: "Total",
    warehouse: "Store / warehouse",
    basket: "Basket",
    payment: "Payment",
    marginNotShown: "The server remains authoritative for price, tax, stock and accounting posting.",
  } : {
    searchHelp: "Recherchez le vrai catalogue de l’entreprise par nom, SKU ou code. La disponibilité est calculée pour le dépôt sélectionné.",
    warehouseHelp: "Obligatoire. Le dépôt détermine la disponibilité du stock et le site rattaché à la vente.",
    quantityHelp: "Quantité vendue. Elle doit être supérieure à zéro et rester dans le stock disponible lorsque le stock négatif est interdit.",
    priceHelp: "Prix du catalogue. Seul un responsable du module peut le modifier; un motif métier devient alors obligatoire.",
    discountHelp: "Remise manuelle optionnelle. Toute remise non nulle est une dérogation commerciale et exige un motif.",
    overrideReason: "Motif de dérogation prix/remise",
    overrideHelp: "Obligatoire uniquement si un prix est modifié, une remise est saisie ou un article n’a pas de prix de référence configuré.",
    paymentMethod: "Mode de paiement",
    paymentMethodHelp: "Choisissez comment le client paie. Le compte financier doit appartenir à cette entreprise et utiliser la devise du ticket.",
    account: "Compte d’encaissement",
    cashAccountHelp: "Choisissez l’une de vos caisses ouvertes dans la devise du ticket. Le serveur vérifie que la session est encore ouverte et vous appartient.",
    accountHelp: "Choisissez un compte financier actif dans la devise du ticket.",
    amount: "Montant",
    amountHelp: "La somme de toutes les lignes de paiement doit correspondre exactement au total du ticket.",
    split: "Paiement fractionné",
    splitHelp: "Activez uniquement lorsque le client paie avec deux comptes financiers distincts.",
    secondPayment: "Deuxième paiement",
    review: "Vérifier la vente",
    reviewTitle: "Confirmer la vente au point de vente",
    reviewDescription: "Vérifiez le panier, le dépôt, les caisses/comptes d’encaissement et les totaux avant de créer le ticket.",
    edit: "Modifier",
    confirm: "Confirmer la vente",
    processing: "Traitement…",
    missingWarehouse: "Sélectionnez une boutique ou un dépôt actif avant de vérifier la vente.",
    emptyCart: "Ajoutez au moins un produit ou service valide dans le panier.",
    invalidCart: "Vérifiez les quantités, prix et remises du panier avant de continuer.",
    overrideRequired: "Saisissez un motif métier d’au moins 3 caractères pour la dérogation de prix ou remise.",
    overrideForbidden: "Ce panier nécessite une dérogation prix/remise, mais votre rôle ne permet pas de l’effectuer.",
    missingPayment: "Choisissez un compte financier valide pour le premier paiement.",
    missingSecondPayment: "Choisissez un compte financier valide et distinct pour le deuxième paiement.",
    paymentMismatch: "Les montants de paiement doivent être positifs et leur somme doit correspondre au total du ticket.",
    noWrite: "Vous pouvez consulter le point de vente, mais votre rôle ne permet pas d’enregistrer une vente.",
    saleCompleted: "Vente terminée.",
    tillCurrency: "La caisse sélectionnée doit utiliser la même devise que le ticket.",
    cash: "Espèces",
    mobileMoney: "Mobile Money",
    bank: "Virement bancaire",
    card: "Carte",
    total: "Total",
    warehouse: "Boutique / dépôt",
    basket: "Panier",
    payment: "Paiement",
    marginNotShown: "Le serveur reste autoritaire pour le prix, la taxe, le stock et la comptabilisation.",
  };

  const warehouses = dashboard.warehouses || [];
  const sessions = useMemo(() => dashboard.cashSessions || (dashboard.cashSession ? [dashboard.cashSession as MobileMoneyCashSession] : []), [dashboard.cashSession, dashboard.cashSessions]);
  const openSessions = useMemo(() => sessions.filter((session) => session.status === "OPEN"), [sessions]);
  const [selectedCashSessionId, setSelectedCashSessionId] = useState("");
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [method1, setMethod1] = useState("CASH");
  const [account1, setAccount1] = useState("");
  const [amount1, setAmount1] = useState(0);
  const [split, setSplit] = useState(false);
  const [method2, setMethod2] = useState("MOBILE_MONEY");
  const [account2, setAccount2] = useState("");
  const [amount2, setAmount2] = useState(0);
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState<SaleDraft | null>(null);
  const [lastReceipt, setLastReceipt] = useState<Sale | null>(null);
  const currency = cart[0]?.currencyCode || dashboard.configuration?.baseCurrencyCode || "CDF";
  const total = useMemo(() => cart.reduce((sum, line) => sum + line.quantity * line.unitPrice - line.discountAmount + line.taxAmount, 0), [cart]);
  const overrideNeeded = useMemo(() => cart.some((line) => line.referenceUnitPrice <= 0 || Math.abs(line.unitPrice - line.referenceUnitPrice) > 0.000001 || line.discountAmount > 0 || line.taxAmount > 0), [cart]);

  useEffect(() => {
    if (!openSessions.length) {
      if (selectedCashSessionId) setSelectedCashSessionId("");
      return;
    }
    if (!openSessions.some((session) => session.id === selectedCashSessionId)) setSelectedCashSessionId(openSessions[0].id);
  }, [openSessions, selectedCashSessionId]);

  const activeCash = openSessions.find((session) => session.id === selectedCashSessionId) || openSessions[0] || null;

  useEffect(() => {
    if (!split) {
      setAmount1(Number(total.toFixed(2)));
      setAmount2(0);
    }
  }, [split, total]);

  useEffect(() => {
    if (!warehouseId) {
      setProducts([]);
      setSearchError("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        const params = new URLSearchParams({ q: search.trim(), warehouseId, page: "1", pageSize: "30" });
        const response = await fetch(`/api/enterprise/${organizationId}/retail/products/search?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json().catch(() => null) as { items?: CatalogItem[]; message?: string; error?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || body?.error || "RETAIL_PRODUCT_SEARCH_FAILED");
        setProducts(body.items || []);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setProducts([]);
        setSearchError(customerFacingError(caught, locale, { fr: translateRetailWorkspace("fr", "productSearchUnavailable"), en: translateRetailWorkspace("en", "productSearchUnavailable") }));
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [locale, organizationId, search, warehouseId]);

  function available(item: CatalogItem) {
    if (!item.trackInventory || item.availableQuantity === null || item.availableQuantity === undefined) return null;
    const value = Number(item.availableQuantity);
    return Number.isFinite(value) ? value : null;
  }

  function addItem(item: CatalogItem) {
    const itemCurrency = item.currency || dashboard.configuration?.baseCurrencyCode || "CDF";
    if (cart.length && itemCurrency !== currency) {
      notifyToast(locale === "en" ? "A single POS receipt cannot mix currencies." : "Un même ticket de caisse ne peut pas mélanger plusieurs devises.", "error");
      return;
    }
    const stock = available(item);
    if (item.trackInventory && !item.allowNegativeStock && (stock === null || stock <= 0)) {
      notifyToast(locale === "en" ? "This item is not available in the selected warehouse." : "Cet article n’est pas disponible dans le dépôt sélectionné.", "error");
      return;
    }
    const price = Number(item.indicativeSalePrice || 0);
    setCart((current) => {
      const existing = current.find((line) => line.catalogItemId === item.id);
      if (existing) {
        if (item.trackInventory && !item.allowNegativeStock && stock !== null && existing.quantity >= stock) return current;
        return current.map((line) => line.catalogItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, {
        catalogItemId: item.id,
        name: item.name,
        quantity: 1,
        unitPrice: Number.isFinite(price) ? price : 0,
        referenceUnitPrice: Number.isFinite(price) ? price : 0,
        discountAmount: 0,
        taxAmount: 0,
        currencyCode: itemCurrency,
        inventoryItemId: item.inventoryItemId || null,
      }];
    });
    setPending(null);
    setErrors({});
  }

  function updateLine(id: string, patch: Partial<CartLine>) {
    setCart((current) => current.map((line) => line.catalogItemId === id ? { ...line, ...patch } : line));
    setPending(null);
    setErrors((current) => ({ ...current, cart: undefined, override: undefined, amounts: undefined }));
  }

  const openCashAccounts = useMemo(() => openSessions
    .filter((session) => session.financialAccount.currencyCode === currency)
    .map((session) => dashboard.accounts.find((account) => account.id === session.financialAccount.id))
    .filter((account): account is FinancialAccount => Boolean(account)), [currency, dashboard.accounts, openSessions]);

  function accountsFor(method: string) {
    if (method === "CASH") return openCashAccounts;
    if (method === "MOBILE_MONEY") return dashboard.accounts.filter((account) => account.accountType === "MOBILE_MONEY" && account.currencyCode === currency);
    if (method === "CARD") return dashboard.accounts.filter((account) => ["BANK", "CLEARING", "CARD_CLEARING"].includes(account.accountType) && account.currencyCode === currency);
    return dashboard.accounts.filter((account) => ["BANK", "CLEARING"].includes(account.accountType) && account.currencyCode === currency);
  }

  useEffect(() => {
    const accounts = accountsFor(method1);
    if (!accounts.some((account) => account.id === account1)) {
      const preferred = method1 === "CASH" && activeCash?.financialAccount.currencyCode === currency
        ? accounts.find((account) => account.id === activeCash.financialAccount.id)
        : accounts[0];
      setAccount1(preferred?.id || "");
    }
  }, [activeCash?.financialAccount.currencyCode, activeCash?.financialAccount.id, currency, method1, openCashAccounts]);

  useEffect(() => {
    if (!split) return;
    const accounts = accountsFor(method2);
    if (!accounts.some((account) => account.id === account2)) setAccount2(accounts.find((account) => account.id !== account1)?.id || accounts[0]?.id || "");
  }, [account1, currency, method2, openCashAccounts, split]);

  function buildReview() {
    const nextErrors: FormErrors = {};
    if (!warehouseId || !warehouses.some((warehouse) => warehouse.id === warehouseId)) nextErrors.warehouse = copy.missingWarehouse;
    if (!cart.length) nextErrors.cart = copy.emptyCart;
    const invalidLine = cart.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || !Number.isFinite(line.discountAmount) || line.discountAmount < 0 || line.discountAmount > line.quantity * line.unitPrice + line.taxAmount);
    if (invalidLine || !Number.isFinite(total) || total <= 0) nextErrors.cart = copy.invalidCart;
    if (overrideNeeded && !dashboard.access.canManage) nextErrors.override = copy.overrideForbidden;
    if (overrideNeeded && dashboard.access.canManage && overrideReason.trim().length < 3) nextErrors.override = copy.overrideRequired;

    const paymentAccounts1 = accountsFor(method1);
    const selectedAccount1 = paymentAccounts1.find((account) => account.id === account1) || null;
    if (!selectedAccount1) nextErrors.payment1 = method1 === "CASH" && openCashAccounts.length === 0 ? copy.tillCurrency : copy.missingPayment;

    let selectedAccount2: FinancialAccount | null = null;
    if (split) {
      selectedAccount2 = accountsFor(method2).find((account) => account.id === account2) || null;
      if (!selectedAccount2 || selectedAccount2.id === selectedAccount1?.id) nextErrors.payment2 = copy.missingSecondPayment;
    }
    const tenderTotal = amount1 + (split ? amount2 : 0);
    if (!Number.isFinite(amount1) || amount1 <= 0 || (split && (!Number.isFinite(amount2) || amount2 <= 0)) || Math.abs(tenderTotal - total) > 0.005) nextErrors.amounts = copy.paymentMismatch;

    setErrors(nextErrors);
    const message = firstError(nextErrors);
    if (message) {
      notifyToast(message, "error");
      setPending(null);
      return;
    }
    if (!selectedAccount1) return;

    const tenders: TenderDraft[] = [{ methodType: method1, financialAccountId: selectedAccount1.id, amount: amount1, reference: null }];
    if (split && selectedAccount2) tenders.push({ methodType: method2, financialAccountId: selectedAccount2.id, amount: amount2, reference: null });
    setPending({
      warehouseId,
      siteId: warehouses.find((warehouse: Warehouse) => warehouse.id === warehouseId)?.site.id || null,
      storageLocationId: null,
      currencyCode: currency,
      lines: cart.map((line) => ({ catalogItemId: line.catalogItemId, inventoryItemId: line.inventoryItemId, quantity: line.quantity, unitPrice: line.unitPrice, discountAmount: line.discountAmount, taxAmount: line.taxAmount })),
      tenders,
      overrideReason: overrideNeeded ? overrideReason.trim() : null,
    });
  }

  async function confirmSale() {
    if (!pending) return;
    const body = await mutate("pos-sale", `/api/enterprise/${organizationId}/retail/sales`, pending, copy.saleCompleted);
    const sale = body?.sale as Sale | undefined;
    if (sale) {
      setLastReceipt(sale);
      setPending(null);
      setCart([]);
      setOverrideReason("");
      setSplit(false);
      setAmount2(0);
      setErrors({});
      await reload();
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      <RetailPosCashSessionManager
        organizationId={organizationId}
        accounts={dashboard.accounts}
        sessions={sessions}
        selectedSessionId={activeCash?.id || ""}
        onSelectSession={(sessionId) => { setSelectedCashSessionId(sessionId); const session = openSessions.find((item) => item.id === sessionId); if (method1 === "CASH" && session?.financialAccount.currencyCode === currency) setAccount1(session.financialAccount.id); setPending(null); setErrors({}); }}
        locale={locale}
        busyAction={busyAction}
        mutate={mutate}
        reload={reload}
      />

      <ModuleSection title={retailText(locale, "counterSale")} description={retailText(locale, "counterSaleDescription")}>
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)]">
              <GuidedField id="pos-product-search" label={retailText(locale, "nameSkuCode")} help={copy.searchHelp}>
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" />
                  <Input id="pos-product-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={retailText(locale, "nameSkuCode")} className="pl-9" />
                </div>
              </GuidedField>
              <GuidedField label={copy.warehouse} help={copy.warehouseHelp} required error={errors.warehouse}>
                <Select name="warehouse" value={warehouseId} onChange={(value) => { setWarehouseId(value); setCart([]); setPending(null); setErrors({}); }}>
                  <option value="">—</option>
                  {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.site.name} · {warehouse.name}</option>)}
                </Select>
              </GuidedField>
            </div>
            {searchError ? <p role="alert" className="mt-3 text-sm font-semibold text-red-600 dark:text-red-300">{searchError}</p> : null}
            <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2">
              {searchLoading ? <div className="sm:col-span-2"><ProfessionalLoading rows={3} /></div> : products.map((item) => {
                const stock = available(item);
                return (
                  <button key={item.id} type="button" disabled={Boolean(busyAction) || !warehouseId || (item.trackInventory && !item.allowNegativeStock && (stock === null || stock <= 0))} onClick={() => addItem(item)} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-left transition hover:border-cyan-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50">
                    <p className="break-words font-black text-dtsc-ink">{item.name}</p>
                    <p className="mt-1 text-xs font-semibold text-dtsc-muted">{item.sku || item.code} · {moneyValue(item.indicativeSalePrice, item.currency || currency, locale)}</p>
                    <p className="mt-1 text-xs font-bold text-dtsc-muted">{item.trackInventory ? `${retailText(locale, "available")}: ${stock ?? "—"}` : retailText(locale, "serviceNoStock")}</p>
                  </button>
                );
              })}
              {!searchLoading && !products.length && !searchError ? <div className="sm:col-span-2"><EmptyState compact title={retailText(locale, "noItemFound")} description={retailText(locale, "noItemFoundDescription")} /></div> : null}
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="font-black text-dtsc-ink">{copy.basket}</h3><span className="text-sm font-black text-dtsc-blue">{moneyValue(total, currency, locale)}</span></div>
            <div className="mt-3 grid min-w-0 gap-3">
              {cart.map((line) => (
                <div key={line.catalogItemId} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0"><p className="break-words font-black text-dtsc-ink">{line.name}</p><p className="text-xs font-bold text-dtsc-muted">{moneyValue(line.referenceUnitPrice, line.currencyCode, locale)}</p></div>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setCart((current) => current.filter((item) => item.catalogItemId !== line.catalogItemId)); setPending(null); setErrors({}); }}><XCircle className="h-4 w-4" /></Button>
                  </div>
                  <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-3">
                    <GuidedField label={retailText(locale, "quantityShort")} help={copy.quantityHelp} required>
                      <Input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(line.catalogItemId, { quantity: Number(event.target.value) })} />
                    </GuidedField>
                    <GuidedField label={retailText(locale, "unitPrice")} help={copy.priceHelp} required>
                      <Input type="number" min="0" step="0.01" value={line.unitPrice} disabled={!dashboard.access.canManage} onChange={(event) => updateLine(line.catalogItemId, { unitPrice: Number(event.target.value) })} />
                    </GuidedField>
                    <GuidedField label={retailText(locale, "discount")} help={copy.discountHelp}>
                      <Input type="number" min="0" step="0.01" value={line.discountAmount} disabled={!dashboard.access.canManage} onChange={(event) => updateLine(line.catalogItemId, { discountAmount: Number(event.target.value) })} />
                    </GuidedField>
                  </div>
                </div>
              ))}
              {!cart.length ? <EmptyState compact title={retailText(locale, "emptyBasket")} description={retailText(locale, "emptyBasketDescription")} /> : null}
              {errors.cart ? <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-bold text-rose-700 dark:text-rose-200">{errors.cart}</p> : null}
            </div>
            {overrideNeeded && dashboard.access.canManage ? (
              <div className="mt-3"><GuidedField id="pos-override-reason" label={copy.overrideReason} help={copy.overrideHelp} required error={errors.override}><Input id="pos-override-reason" value={overrideReason} onChange={(event) => { setOverrideReason(event.target.value); setPending(null); setErrors((current) => ({ ...current, override: undefined })); }} minLength={3} maxLength={1000} aria-invalid={Boolean(errors.override)} /></GuidedField></div>
            ) : null}
            {errors.override && !dashboard.access.canManage ? <p role="alert" className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-bold text-rose-700 dark:text-rose-200">{errors.override}</p> : null}
          </div>
        </div>

        {cart.length ? (
          <form noValidate onSubmit={(event) => { event.preventDefault(); buildReview(); }} className="mt-5 grid min-w-0 gap-4 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <h3 className="font-black text-dtsc-ink">{copy.payment}</h3>
            <div className="grid min-w-0 gap-4 md:grid-cols-3">
              <GuidedField label={copy.paymentMethod} help={copy.paymentMethodHelp} required>
                <Select name="method1" value={method1} onChange={(value) => { setMethod1(value); setAccount1(""); setPending(null); setErrors((current) => ({ ...current, payment1: undefined, amounts: undefined })); }}>
                  <option value="CASH">{copy.cash}</option><option value="MOBILE_MONEY">{copy.mobileMoney}</option><option value="BANK_TRANSFER">{copy.bank}</option><option value="CARD">{copy.card}</option>
                </Select>
              </GuidedField>
              <GuidedField label={copy.account} help={method1 === "CASH" ? copy.cashAccountHelp : copy.accountHelp} required error={errors.payment1}>
                <Select name="account1" value={account1} onChange={(value) => { setAccount1(value); setPending(null); setErrors((current) => ({ ...current, payment1: undefined, payment2: undefined })); }}>
                  <option value="">—</option>{accountsFor(method1).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>)}
                </Select>
              </GuidedField>
              <GuidedField id="pos-amount1" label={copy.amount} help={copy.amountHelp} required error={errors.amounts}>
                <Input id="pos-amount1" type="number" min="0.01" step="0.01" value={amount1} onChange={(event) => { setAmount1(Number(event.target.value)); setPending(null); setErrors((current) => ({ ...current, amounts: undefined })); }} aria-invalid={Boolean(errors.amounts)} />
              </GuidedField>
            </div>

            <div className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
              <label className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><input type="checkbox" checked={split} onChange={(event) => { setSplit(event.target.checked); setPending(null); setErrors((current) => ({ ...current, payment2: undefined, amounts: undefined })); }} />{copy.split}</label>
              <p className="mt-1 text-xs font-semibold leading-5 text-dtsc-muted">{copy.splitHelp}</p>
            </div>

            {split ? (
              <div className="grid min-w-0 gap-4 md:grid-cols-3">
                <GuidedField label={copy.secondPayment} help={copy.paymentMethodHelp} required>
                  <Select name="method2" value={method2} onChange={(value) => { setMethod2(value); setAccount2(""); setPending(null); setErrors((current) => ({ ...current, payment2: undefined, amounts: undefined })); }}>
                    <option value="CASH">{copy.cash}</option><option value="MOBILE_MONEY">{copy.mobileMoney}</option><option value="BANK_TRANSFER">{copy.bank}</option><option value="CARD">{copy.card}</option>
                  </Select>
                </GuidedField>
                <GuidedField label={copy.account} help={method2 === "CASH" ? copy.cashAccountHelp : copy.accountHelp} required error={errors.payment2}>
                  <Select name="account2" value={account2} onChange={(value) => { setAccount2(value); setPending(null); setErrors((current) => ({ ...current, payment2: undefined })); }}>
                    <option value="">—</option>{accountsFor(method2).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>)}
                  </Select>
                </GuidedField>
                <GuidedField id="pos-amount2" label={copy.amount} help={copy.amountHelp} required error={errors.amounts}>
                  <Input id="pos-amount2" type="number" min="0.01" step="0.01" value={amount2} onChange={(event) => { setAmount2(Number(event.target.value)); setPending(null); setErrors((current) => ({ ...current, amounts: undefined })); }} aria-invalid={Boolean(errors.amounts)} />
                </GuidedField>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-lg font-black text-dtsc-ink">{copy.total}: {moneyValue(total, currency, locale)}</p><p className="mt-1 text-xs font-semibold text-dtsc-muted">{copy.marginNotShown}</p></div>
              <Button type="submit" disabled={Boolean(busyAction) || !dashboard.access.canWrite}><ShoppingCart className="h-4 w-4" />{copy.review}</Button>
            </div>
            {!dashboard.access.canWrite ? <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-800 dark:text-amber-200">{copy.noWrite}</p> : null}
          </form>
        ) : null}
      </ModuleSection>

      {lastReceipt ? (
        <ModuleSection title={retailText(locale, "receiptCompleted")} description={lastReceipt.number}>
          <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-2xl font-black text-dtsc-ink">{moneyValue(lastReceipt.grandTotal, lastReceipt.currencyCode, locale)}</p><p className="text-sm font-bold text-dtsc-muted">{lastReceipt.lines.map((line) => `${line.description} × ${Number(line.quantity)}`).join(" · ")}</p></div>
              <div data-responsive-actions><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />{retailText(locale, "print")}</Button>{typeof navigator !== "undefined" && "share" in navigator ? <Button variant="outline" onClick={() => void navigator.share({ title: lastReceipt.number, text: `${lastReceipt.number} · ${moneyValue(lastReceipt.grandTotal, lastReceipt.currencyCode, locale)}` })}><Share2 className="h-4 w-4" />{retailText(locale, "share")}</Button> : null}</div>
            </div>
          </div>
        </ModuleSection>
      ) : null}

      <RetailErpLinks moduleCode="RETAIL_POS" locale={locale} />

      <Dialog open={Boolean(pending)} title={copy.reviewTitle} description={copy.reviewDescription} onClose={() => { if (busyAction !== "pos-sale") setPending(null); }} presentation="editor" className="h-[96dvh] max-w-4xl" footer={<><Button type="button" variant="outline" disabled={busyAction === "pos-sale"} onClick={() => setPending(null)}>{copy.edit}</Button><Button type="button" disabled={!pending || busyAction === "pos-sale"} onClick={() => void confirmSale()}><CheckCircle2 className="h-4 w-4" />{busyAction === "pos-sale" ? copy.processing : copy.confirm}</Button></>}>
        {pending ? (
          <div className="grid min-w-0 gap-4 p-4 sm:p-5">
            <div className="rounded-2xl border-2 border-amber-400/50 bg-amber-500/10 p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{warehouses.find((warehouse) => warehouse.id === pending.warehouseId)?.name || copy.warehouse}</p><p className="mt-2 text-2xl font-black text-dtsc-ink">{moneyValue(total, pending.currencyCode, locale)}</p><p className="mt-1 text-sm font-bold text-dtsc-muted">{cart.length} {locale === "en" ? "line(s)" : "ligne(s)"}</p></div>
            <div className="grid gap-2">{cart.map((line) => <div key={line.catalogItemId} className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3"><div className="min-w-0"><p className="break-words text-sm font-black text-dtsc-ink">{line.name}</p><p className="text-xs font-semibold text-dtsc-muted">{Number(line.quantity)} × {moneyValue(line.unitPrice, line.currencyCode, locale)}{line.discountAmount ? ` · -${moneyValue(line.discountAmount, line.currencyCode, locale)}` : ""}</p></div><p className="shrink-0 text-sm font-black text-dtsc-ink">{moneyValue(line.quantity * line.unitPrice - line.discountAmount + line.taxAmount, line.currencyCode, locale)}</p></div>)}</div>
            <div className="grid gap-3 sm:grid-cols-2">{pending.tenders.map((tender, index) => { const account = dashboard.accounts.find((item) => item.id === tender.financialAccountId); return <ReviewItem key={`${tender.financialAccountId}-${index}`} label={`${copy.payment} ${index + 1}`} value={`${account?.name || "—"} · ${moneyValue(tender.amount, pending.currencyCode, locale)}`} />; })}{pending.overrideReason ? <ReviewItem label={copy.overrideReason} value={pending.overrideReason} /> : null}</div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted">{label}</p><p className="mt-1 break-words text-sm font-black text-dtsc-ink">{value}</p></div>;
}

function PosHistory({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: PosDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
  const items = dashboard.recent.sales || [];
  const copy = locale === "en" ? { reasonHelp: "Explain why this completed receipt must be reversed. The original receipt remains in the audit trail.", reasonRequired: "Enter a reversal reason of at least 3 characters.", cancel: "Cancel", confirm: "Confirm reversal", processing: "Processing…" } : { reasonHelp: "Expliquez pourquoi ce ticket terminé doit être contrepassé. Le ticket original reste dans l’historique d’audit.", reasonRequired: "Saisissez un motif de contrepassation d’au moins 3 caractères.", cancel: "Annuler", confirm: "Confirmer la contrepassation", processing: "Traitement…" };
  const [target, setTarget] = useState<Sale | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  function close() {
    if (target && busyAction === `reverse-${target.id}`) return;
    setTarget(null); setReason(""); setError("");
  }

  async function reverse() {
    if (!target) return;
    const normalized = reason.trim();
    if (normalized.length < 3) { setError(copy.reasonRequired); notifyToast(copy.reasonRequired, "error"); return; }
    setError("");
    const result = await mutate(`reverse-${target.id}`, `/api/enterprise/${organizationId}/retail/sales/${target.id}/reverse`, { revision: target.revision, reason: normalized }, retailText(locale, "reversalCompleted"), { idempotent: false });
    if (result) close();
  }

  return (
    <div className="grid min-w-0 gap-5">
      <ModuleSection title={retailText(locale, "recentReceipts")}>
        {items.length ? <BusinessList ariaLabel={retailText(locale, "posReceipts")}>{items.map((item) => <BusinessListItem key={item.id} title={`${item.number} · ${moneyValue(item.grandTotal, item.currencyCode, locale)}`} status={<StatusBadge tone={statusTone(item.status)}>{customerFacingStatusLabel(item.status, locale)}</StatusBadge>} meta={formatEnterpriseDate(item.soldAt, locale)} description={item.lines.map((line) => `${line.description} × ${Number(line.quantity)}`).join(" · ")} actions={dashboard.access.canManage && item.status === "COMPLETED" ? <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => { setTarget(item); setReason(""); setError(""); }}><RotateCcw className="h-4 w-4" />{retailText(locale, "reverse")}</Button> : undefined} />)}</BusinessList> : <EmptyState compact title={retailText(locale, "noReceipt")} description={retailText(locale, "noReceiptDescription")} />}
      </ModuleSection>
      <RetailErpLinks moduleCode="RETAIL_POS" locale={locale} />
      <Dialog open={Boolean(target)} title={`${retailText(locale, "reverse")} · ${target?.number || ""}`} description={copy.reasonHelp} onClose={close} className="max-w-xl" footer={<><Button type="button" variant="outline" disabled={Boolean(target && busyAction === `reverse-${target.id}`)} onClick={close}>{copy.cancel}</Button><Button type="button" disabled={!target || Boolean(target && busyAction === `reverse-${target.id}`)} onClick={() => void reverse()}><RotateCcw className="h-4 w-4" />{target && busyAction === `reverse-${target.id}` ? copy.processing : copy.confirm}</Button></>}>
        <GuidedField id="pos-reversal-reason" label={retailText(locale, "reversalReason")} help={copy.reasonHelp} required error={error}><textarea id="pos-reversal-reason" value={reason} onChange={(event) => { setReason(event.currentTarget.value); if (error) setError(""); }} minLength={3} maxLength={1000} disabled={Boolean(target && busyAction === `reverse-${target.id}`)} className="min-h-32 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" /></GuidedField>
      </Dialog>
    </div>
  );
}
