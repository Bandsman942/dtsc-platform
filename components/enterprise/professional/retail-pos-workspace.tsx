"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, RotateCcw, Search, Share2, ShoppingCart, XCircle } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Field, formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalLoading } from "@/components/enterprise/professional/professional-erp-ui";
import {
  OpenCashForm,
  RetailErpLinks,
  RetailReportsPanel,
  RetailWorkspaceFrame,
  Select,
  moneyValue,
  statusTone,
  type CatalogItem,
  type RetailDashboard,
  type RetailMutation,
  type Sale,
  type Warehouse,
} from "@/components/enterprise/professional/retail-workspace-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { customerFacingError, customerFacingStatusLabel } from "@/lib/customer-facing-language";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type CartLine = {
  catalogItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  currencyCode: string;
  inventoryItemId: string | null;
};

export function RetailPosWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  const locale: "fr" | "en" = useAppLocale() === "en" ? "en" : "fr";
  return (
    <RetailWorkspaceFrame
      organizationId={organizationId}
      organizationName={organizationName}
      definition={definition}
      moduleCode="RETAIL_POS"
      locale={locale}
    >
      {(context) => {
        const dashboard = context.dashboard as RetailDashboard;
        if (context.tab === "HISTORY") return <PosHistory organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />;
        if (context.tab === "REPORTS") return <RetailReportsPanel dashboard={dashboard} moduleCode="RETAIL_POS" locale={locale} />;
        return <PosOperate organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />;
      }}
    </RetailWorkspaceFrame>
  );
}

function PosOperate({
  organizationId,
  dashboard,
  locale,
  busyAction,
  mutate,
}: {
  organizationId: string;
  dashboard: RetailDashboard;
  locale: "fr" | "en";
  busyAction: string | null;
  mutate: RetailMutation;
}) {
  const warehouses = dashboard.warehouses || [];
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
  const [lastReceipt, setLastReceipt] = useState<Sale | null>(null);
  const currency = cart[0]?.currencyCode || dashboard.configuration?.baseCurrencyCode || "CDF";
  const total = useMemo(() => cart.reduce((sum, line) => sum + line.quantity * line.unitPrice - line.discountAmount + line.taxAmount, 0), [cart]);

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
        setSearchError(customerFacingError(caught, locale, {
          fr: "La recherche des articles n’est pas disponible pour le moment.",
          en: "Product search is not available right now.",
        }));
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [locale, organizationId, search, warehouseId]);

  function available(item: CatalogItem) {
    if (!item.trackInventory || item.availableQuantity === null || item.availableQuantity === undefined) return null;
    const value = Number(item.availableQuantity);
    return Number.isFinite(value) ? value : null;
  }

  function addItem(item: CatalogItem) {
    const itemCurrency = item.currency || dashboard.configuration?.baseCurrencyCode || "CDF";
    if (cart.length && itemCurrency !== currency) return;
    const stock = available(item);
    if (item.trackInventory && !item.allowNegativeStock && (stock === null || stock <= 0)) return;
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
        unitPrice: Number(item.indicativeSalePrice || 0),
        discountAmount: 0,
        taxAmount: 0,
        currencyCode: itemCurrency,
        inventoryItemId: item.inventoryItemId || null,
      }];
    });
  }

  function updateLine(id: string, patch: Partial<CartLine>) {
    setCart((current) => current.map((line) => line.catalogItemId === id ? { ...line, ...patch } : line));
  }

  function accountsFor(method: string) {
    if (method === "CASH") return dashboard.cashSession?.status === "OPEN" ? [dashboard.cashSession.financialAccount] : [];
    if (method === "MOBILE_MONEY") return dashboard.accounts.filter((account) => account.accountType === "MOBILE_MONEY" && account.currencyCode === currency);
    return dashboard.accounts.filter((account) => ["BANK", "CLEARING", "CARD_CLEARING"].includes(account.accountType) && account.currencyCode === currency);
  }

  const resolvedAccount1 = method1 === "CASH" ? dashboard.cashSession?.financialAccount.id || "" : account1;
  const resolvedAccount2 = method2 === "CASH" ? dashboard.cashSession?.financialAccount.id || "" : account2;

  async function submitSale() {
    if (!cart.length || !warehouseId || total <= 0) return;
    if (method1 === "CASH" && dashboard.cashSession?.status !== "OPEN") return;
    const tenders = [{ methodType: method1, financialAccountId: resolvedAccount1, amount: amount1, reference: null as string | null }];
    if (split && amount2 > 0) tenders.push({ methodType: method2, financialAccountId: resolvedAccount2, amount: amount2, reference: null });
    const body = await mutate(
      "pos-sale",
      `/api/enterprise/${organizationId}/retail/sales`,
      {
        warehouseId,
        siteId: warehouses.find((warehouse: Warehouse) => warehouse.id === warehouseId)?.site.id || null,
        storageLocationId: null,
        currencyCode: currency,
        lines: cart.map((line) => ({
          catalogItemId: line.catalogItemId,
          inventoryItemId: line.inventoryItemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          taxAmount: line.taxAmount,
        })),
        tenders,
        overrideReason: overrideReason || null,
      },
      locale === "en" ? "Sale completed." : "Vente encaissée.",
    );
    const sale = body?.sale as Sale | undefined;
    if (sale) {
      setLastReceipt(sale);
      setCart([]);
      setOverrideReason("");
      setSplit(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      <OpenCashForm organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} />
      <ModuleSection
        title={locale === "en" ? "Counter sale" : "Vente comptoir"}
        description={locale === "en"
          ? "Find available items, build the basket and collect payment in one clear flow."
          : "Recherchez les articles disponibles, composez le panier puis encaissez dans un même parcours."}
      >
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)]">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === "en" ? "Name, SKU or code" : "Nom, SKU ou code"} className="pl-9" />
              </div>
              <Select name="warehouse" value={warehouseId} onChange={setWarehouseId}>
                <option value="">{locale === "en" ? "Store / warehouse" : "Boutique / dépôt"}</option>
                {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.site.name} · {warehouse.name}</option>)}
              </Select>
            </div>
            {searchError ? <p role="alert" className="mt-3 text-sm font-semibold text-red-600 dark:text-red-300">{searchError}</p> : null}
            <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2">
              {searchLoading ? <div className="sm:col-span-2"><ProfessionalLoading rows={3} /></div> : products.map((item) => {
                const stock = available(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={Boolean(busyAction) || !warehouseId || (item.trackInventory && !item.allowNegativeStock && (stock === null || stock <= 0))}
                    onClick={() => addItem(item)}
                    className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-left transition hover:border-cyan-400 disabled:opacity-50"
                  >
                    <p className="break-words font-black text-dtsc-ink">{item.name}</p>
                    <p className="mt-1 text-xs font-semibold text-dtsc-muted">{item.sku || item.code} · {moneyValue(item.indicativeSalePrice, item.currency || currency)}</p>
                    <p className="mt-1 text-xs font-bold text-dtsc-muted">
                      {item.trackInventory
                        ? `${locale === "en" ? "Available" : "Disponible"}: ${stock ?? "—"}`
                        : (locale === "en" ? "Service / no stock tracking" : "Service / sans suivi de stock")}
                    </p>
                  </button>
                );
              })}
              {!searchLoading && !products.length && !searchError ? <div className="sm:col-span-2"><EmptyState compact title={locale === "en" ? "No item found" : "Aucun article trouvé"} description={locale === "en" ? "Try another name, SKU or code." : "Essayez un autre nom, SKU ou code."} /></div> : null}
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-black text-dtsc-ink">{locale === "en" ? "Basket" : "Panier"}</h3>
              <span className="text-sm font-black text-dtsc-blue">{moneyValue(total, currency)}</span>
            </div>
            <div className="mt-3 grid min-w-0 gap-3">
              {cart.map((line) => (
                <div key={line.catalogItemId} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0"><p className="break-words font-black text-dtsc-ink">{line.name}</p><p className="text-xs font-bold text-dtsc-muted">{moneyValue(line.unitPrice, line.currencyCode)}</p></div>
                    <Button type="button" size="sm" variant="outline" onClick={() => setCart((current) => current.filter((item) => item.catalogItemId !== line.catalogItemId))}><XCircle className="h-4 w-4" /></Button>
                  </div>
                  <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-3">
                    <Field label={locale === "en" ? "Qty" : "Qté"}><Input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(line.catalogItemId, { quantity: Number(event.target.value) })} /></Field>
                    <Field label={locale === "en" ? "Unit price" : "Prix unitaire"}><Input type="number" min="0" step="0.01" value={line.unitPrice} disabled={!dashboard.access.canManage} onChange={(event) => updateLine(line.catalogItemId, { unitPrice: Number(event.target.value) })} /></Field>
                    <Field label={locale === "en" ? "Discount" : "Remise"}><Input type="number" min="0" step="0.01" value={line.discountAmount} disabled={!dashboard.access.canManage} onChange={(event) => updateLine(line.catalogItemId, { discountAmount: Number(event.target.value) })} /></Field>
                  </div>
                </div>
              ))}
              {!cart.length ? <EmptyState compact title={locale === "en" ? "Empty basket" : "Panier vide"} description={locale === "en" ? "Add one or more items." : "Ajoutez un ou plusieurs articles."} /> : null}
            </div>
            {dashboard.access.canManage && cart.length ? <div className="mt-3"><Field label={locale === "en" ? "Reason for price or discount change" : "Motif du changement de prix ou remise"}><Input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} /></Field></div> : null}
          </div>
        </div>

        {cart.length ? (
          <div className="mt-5 grid min-w-0 gap-4 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <h3 className="font-black text-dtsc-ink">{locale === "en" ? "Payment" : "Encaissement"}</h3>
            <div className="grid min-w-0 gap-3 md:grid-cols-3">
              <Field label={locale === "en" ? "Method" : "Mode"}>
                <Select name="method1" value={method1} onChange={(value) => { setMethod1(value); setAccount1(""); }}>
                  <option value="CASH">{locale === "en" ? "Cash" : "Espèces"}</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                  <option value="BANK_TRANSFER">{locale === "en" ? "Bank transfer" : "Virement bancaire"}</option>
                  <option value="CARD">{locale === "en" ? "Card" : "Carte"}</option>
                </Select>
              </Field>
              <Field label={locale === "en" ? "Account" : "Compte"}>
                {method1 === "CASH" ? <Input value={dashboard.cashSession?.status === "OPEN" ? dashboard.cashSession.financialAccount.name : (locale === "en" ? "Open a till first" : "Ouvrez d’abord une caisse")} readOnly /> : (
                  <Select name="account1" value={account1} onChange={setAccount1}><option value="">—</option>{accountsFor(method1).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}</Select>
                )}
              </Field>
              <Field label={locale === "en" ? "Amount" : "Montant"}><Input type="number" min="0.01" step="0.01" value={amount1} onChange={(event) => setAmount1(Number(event.target.value))} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm font-bold text-dtsc-ink"><input type="checkbox" checked={split} onChange={(event) => setSplit(event.target.checked)} />{locale === "en" ? "Split payment" : "Paiement fractionné"}</label>
            {split ? (
              <div className="grid min-w-0 gap-3 md:grid-cols-3">
                <Field label={locale === "en" ? "Second method" : "Deuxième mode"}>
                  <Select name="method2" value={method2} onChange={(value) => { setMethod2(value); setAccount2(""); }}>
                    <option value="CASH">{locale === "en" ? "Cash" : "Espèces"}</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                    <option value="BANK_TRANSFER">{locale === "en" ? "Bank transfer" : "Virement bancaire"}</option>
                    <option value="CARD">{locale === "en" ? "Card" : "Carte"}</option>
                  </Select>
                </Field>
                <Field label={locale === "en" ? "Second account" : "Deuxième compte"}>
                  {method2 === "CASH" ? <Input value={dashboard.cashSession?.status === "OPEN" ? dashboard.cashSession.financialAccount.name : "—"} readOnly /> : <Select name="account2" value={account2} onChange={setAccount2}><option value="">—</option>{accountsFor(method2).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}</Select>}
                </Field>
                <Field label={locale === "en" ? "Second amount" : "Deuxième montant"}><Input type="number" min="0" step="0.01" value={amount2} onChange={(event) => setAmount2(Number(event.target.value))} /></Field>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-lg font-black text-dtsc-ink">Total: {moneyValue(total, currency)}</p>
              <Button type="button" disabled={Boolean(busyAction) || !dashboard.access.canWrite || !resolvedAccount1 || Math.abs(amount1 + amount2 - total) > 0.005} onClick={() => void submitSale()}>
                <ShoppingCart className="h-4 w-4" />{busyAction === "pos-sale" ? (locale === "en" ? "Processing…" : "Traitement…") : (locale === "en" ? "Collect payment" : "Encaisser")}
              </Button>
            </div>
          </div>
        ) : null}
      </ModuleSection>

      {lastReceipt ? (
        <ModuleSection title={locale === "en" ? "Receipt completed" : "Ticket terminé"} description={lastReceipt.number}>
          <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-2xl font-black text-dtsc-ink">{moneyValue(lastReceipt.grandTotal, lastReceipt.currencyCode)}</p><p className="text-sm font-bold text-dtsc-muted">{lastReceipt.lines.map((line) => `${line.description} × ${Number(line.quantity)}`).join(" · ")}</p></div>
              <div data-responsive-actions>
                <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />{locale === "en" ? "Print" : "Imprimer"}</Button>
                {typeof navigator !== "undefined" && "share" in navigator ? <Button variant="outline" onClick={() => void navigator.share({ title: lastReceipt.number, text: `${lastReceipt.number} · ${moneyValue(lastReceipt.grandTotal, lastReceipt.currencyCode)}` })}><Share2 className="h-4 w-4" />{locale === "en" ? "Share" : "Partager"}</Button> : null}
              </div>
            </div>
          </div>
        </ModuleSection>
      ) : null}
      <RetailErpLinks moduleCode="RETAIL_POS" locale={locale} />
    </div>
  );
}

function PosHistory({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
  const items = dashboard.recent.sales || [];
  async function reverse(item: Sale) {
    const reason = window.prompt(locale === "en" ? "Reason for reversal" : "Motif de l’annulation");
    if (!reason?.trim()) return;
    await mutate(
      `reverse-${item.id}`,
      `/api/enterprise/${organizationId}/retail/sales/${item.id}/reverse`,
      { revision: item.revision, reason: reason.trim() },
      locale === "en" ? "Reversal completed." : "Annulation enregistrée.",
      { idempotent: false },
    );
  }
  return (
    <div className="grid min-w-0 gap-5">
      <ModuleSection title={locale === "en" ? "Recent receipts" : "Tickets récents"}>
        {items.length ? (
          <BusinessList ariaLabel={locale === "en" ? "POS receipts" : "Tickets de caisse"}>
            {items.map((item) => (
              <BusinessListItem
                key={item.id}
                title={`${item.number} · ${moneyValue(item.grandTotal, item.currencyCode)}`}
                status={<StatusBadge tone={statusTone(item.status)}>{customerFacingStatusLabel(item.status, locale)}</StatusBadge>}
                meta={formatEnterpriseDate(item.soldAt, locale)}
                description={item.lines.map((line) => `${line.description} × ${Number(line.quantity)}`).join(" · ")}
                actions={dashboard.access.canManage && item.status === "COMPLETED" ? <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void reverse(item)}><RotateCcw className="h-4 w-4" />{locale === "en" ? "Reverse" : "Annuler"}</Button> : undefined}
              />
            ))}
          </BusinessList>
        ) : <EmptyState compact title={locale === "en" ? "No receipt" : "Aucun ticket"} description={locale === "en" ? "Completed sales will appear here." : "Les ventes terminées apparaîtront ici."} />}
      </ModuleSection>
      <RetailErpLinks moduleCode="RETAIL_POS" locale={locale} />
    </div>
  );
}
