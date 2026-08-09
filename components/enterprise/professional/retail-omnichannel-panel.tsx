"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, CheckCircle2, MapPin, PackageCheck, RefreshCw, Search, ShoppingBag, Truck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { customerFacingError, customerFacingFulfillmentMode, customerFacingStatusLabel } from "@/lib/customer-facing-language";

type Props = { organizationId: string; locale: "fr" | "en" };
type Site = { id: string; name: string };
type Warehouse = { id: string; name: string; code?: string; site: Site };
type Dashboard = { configuration: { baseCurrencyCode: string } | null; warehouses?: Warehouse[] };
type Customer = { id: string; code: string; legalName: string; displayName: string; primaryPhone: string | null; retailProfile?: { customerNumber: string; segmentCode: string | null } | null };
type Product = { id: string; code: string; sku: string | null; name: string; indicativeSalePrice: string | number | null; currency: string | null; trackInventory: boolean; availableQuantity: string | null };
type CartLine = { product: Product; quantity: number };
type Fulfillment = { id: string; reference: string; status: string; createdAt: string };
type Order = { id: string; reference: string; status: string; currency: string; totalAmount: string | number; businessPartyId: string; expectedFulfillmentAt: string | null; fulfillments?: Fulfillment[] };
type Reservation = { id: string; status: string; quantity: string | number; warehouseId: string };
type OrderContext = { id: string; salesOrderId: string; fulfillmentMode: string; sourceSiteId: string; fulfillmentWarehouseId: string; pickupSiteId: string | null; status: string; createdAt: string };
type OrderRow = { context: OrderContext; order: Order | null; reservations: Reservation[] };
type OrdersResponse = { items: OrderRow[]; pagination: { page: number; pageSize: number; total: number; pageCount: number } };

type Mode = "CLICK_COLLECT" | "PICKUP_OTHER_STORE" | "SHIP_FROM_STORE" | "CUSTOMER_DELIVERY";
const MODES: Array<{ code: Mode; icon: typeof ShoppingBag }> = [
  { code: "CLICK_COLLECT", icon: ShoppingBag },
  { code: "PICKUP_OTHER_STORE", icon: MapPin },
  { code: "SHIP_FROM_STORE", icon: Truck },
  { code: "CUSTOMER_DELIVERY", icon: PackageCheck },
];

function formatMoney(value: string | number | null | undefined, currency: string, locale: "fr" | "en") {
  const amount = Number(value || 0);
  return `${amount.toLocaleString(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 2 })} ${currency}`;
}

function customerName(customer: Customer) {
  return customer.displayName || customer.legalName || customer.code;
}

function statusClass(status: string) {
  if (["RESERVED", "CONFIRMED", "COMPLETED", "FULFILLED"].includes(status)) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (["RESERVING", "PROCESSING", "PENDING"].includes(status)) return "bg-cyan-500/10 text-cyan-800 dark:text-cyan-200";
  return "bg-amber-500/10 text-amber-800 dark:text-amber-200";
}

export function RetailOmnichannelPanel({ organizationId, locale }: Props) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [orders, setOrders] = useState<OrdersResponse | null>(null);
  const [mode, setMode] = useState<Mode>("CLICK_COLLECT");
  const [sourceSiteId, setSourceSiteId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [pickupSiteId, setPickupSiteId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [expectedFulfillmentAt, setExpectedFulfillmentAt] = useState("");
  const [busy, setBusy] = useState<"load" | "customers" | "products" | "create" | null>("load");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy("load");
    setError("");
    try {
      const [dashboardResponse, ordersResponse] = await Promise.all([
        fetch(`/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_POS`, { cache: "no-store" }),
        fetch(`/api/enterprise/${organizationId}/retail/omnichannel/orders?page=1&pageSize=12`, { cache: "no-store" }),
      ]);
      const dashboardBody = await dashboardResponse.json().catch(() => null) as Dashboard | { error?: string; message?: string } | null;
      const ordersBody = await ordersResponse.json().catch(() => null) as OrdersResponse | { error?: string; message?: string } | null;
      if (!dashboardResponse.ok || !dashboardBody || !("warehouses" in dashboardBody)) throw new Error((dashboardBody as { message?: string; error?: string } | null)?.message || (dashboardBody as { error?: string } | null)?.error || "RETAIL_OMNICHANNEL_DASHBOARD_FAILED");
      if (!ordersResponse.ok || !ordersBody || !("items" in ordersBody)) throw new Error((ordersBody as { message?: string; error?: string } | null)?.message || (ordersBody as { error?: string } | null)?.error || "RETAIL_OMNICHANNEL_ORDERS_FAILED");
      const nextDashboard = dashboardBody as Dashboard;
      setDashboard(nextDashboard);
      setOrders(ordersBody as OrdersResponse);
      const firstWarehouse = nextDashboard.warehouses?.[0];
      if (firstWarehouse) {
        setWarehouseId((current) => current || firstWarehouse.id);
        setSourceSiteId((current) => current || firstWarehouse.site.id);
        setPickupSiteId((current) => current || firstWarehouse.site.id);
      }
    } catch (caught) {
      setError(customerFacingError(caught, locale));
    } finally {
      setBusy(null);
    }
  }, [locale, organizationId]);

  useEffect(() => { void load(); }, [load]);

  const sites = useMemo(() => {
    const map = new Map<string, Site>();
    for (const warehouse of dashboard?.warehouses || []) map.set(warehouse.site.id, warehouse.site);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [dashboard]);

  const selectedWarehouse = dashboard?.warehouses?.find((warehouse) => warehouse.id === warehouseId) || null;
  const currency = dashboard?.configuration?.baseCurrencyCode || products.find((item) => item.currency)?.currency || "CDF";

  useEffect(() => {
    if (!selectedWarehouse) return;
    if (mode === "CLICK_COLLECT") setPickupSiteId(selectedWarehouse.site.id);
    if (!sourceSiteId) setSourceSiteId(selectedWarehouse.site.id);
  }, [mode, selectedWarehouse, sourceSiteId]);

  async function searchCustomers() {
    const needle = customerSearch.trim();
    if (needle.length < 2) { setCustomers([]); return; }
    setBusy("customers");
    setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/customers?search=${encodeURIComponent(needle)}&pageSize=10`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { items?: Customer[]; error?: string; message?: string } | null;
      if (!response.ok) throw new Error(body?.message || body?.error || "RETAIL_CUSTOMER_SEARCH_FAILED");
      setCustomers(body?.items || []);
    } catch (caught) {
      setError(customerFacingError(caught, locale));
    } finally {
      setBusy(null);
    }
  }

  async function searchProducts() {
    if (!warehouseId) return;
    setBusy("products");
    setError("");
    try {
      const query = productSearch.trim();
      const response = await fetch(`/api/enterprise/${organizationId}/retail/products/search?q=${encodeURIComponent(query)}&warehouseId=${encodeURIComponent(warehouseId)}&pageSize=30`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { items?: Product[]; error?: string; message?: string } | null;
      if (!response.ok) throw new Error(body?.message || body?.error || "RETAIL_PRODUCT_SEARCH_FAILED");
      setProducts(body?.items || []);
    } catch (caught) {
      setError(customerFacingError(caught, locale));
    } finally {
      setBusy(null);
    }
  }

  function addProduct(product: Product) {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      const max = product.trackInventory ? Math.max(0, Math.floor(Number(product.availableQuantity || 0))) : Number.MAX_SAFE_INTEGER;
      if (max <= 0) return current;
      if (existing) return current.map((line) => line.product.id === product.id ? { ...line, quantity: Math.min(max, line.quantity + 1) } : line);
      return [...current, { product, quantity: 1 }];
    });
  }

  function setQuantity(productId: string, quantity: number) {
    setCart((current) => current.flatMap((line) => {
      if (line.product.id !== productId) return [line];
      if (quantity <= 0) return [];
      const max = line.product.trackInventory ? Math.max(0, Math.floor(Number(line.product.availableQuantity || 0))) : quantity;
      return [{ ...line, quantity: Math.min(quantity, max) }];
    }));
  }

  const indicativeTotal = useMemo(() => cart.reduce((sum, line) => sum + Number(line.product.indicativeSalePrice || 0) * line.quantity, 0), [cart]);
  const pickupRequired = mode === "CLICK_COLLECT" || mode === "PICKUP_OTHER_STORE";
  const invalidOtherStore = mode === "PICKUP_OTHER_STORE" && (!pickupSiteId || pickupSiteId === sourceSiteId);
  const canCreate = Boolean(customer && sourceSiteId && warehouseId && cart.length && (!pickupRequired || pickupSiteId) && !invalidOtherStore && !busy);

  async function createOrder() {
    if (!canCreate || !customer) return;
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/omnichannel/orders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `omni:${crypto.randomUUID()}`,
          customerBusinessPartyId: customer.id,
          sourceSiteId,
          fulfillmentWarehouseId: warehouseId,
          pickupSiteId: pickupRequired ? pickupSiteId : null,
          fulfillmentMode: mode,
          currencyCode: currency,
          expectedFulfillmentAt: expectedFulfillmentAt ? new Date(expectedFulfillmentAt).toISOString() : null,
          reservationExpiresAt: expectedFulfillmentAt ? new Date(expectedFulfillmentAt).toISOString() : null,
          lines: cart.map((line) => ({ catalogItemId: line.product.id, quantity: line.quantity })),
        }),
      });
      const body = await response.json().catch(() => null) as { order?: Order; orchestration?: OrderContext; reservations?: Reservation[]; error?: string; message?: string } | null;
      if (!response.ok || !body?.order) throw new Error(body?.message || body?.error || "RETAIL_OMNICHANNEL_CREATE_FAILED");
      setNotice(locale === "en" ? `Order ${body.order.reference} confirmed. Available stock has been reserved for this customer order.` : `Commande ${body.order.reference} confirmée. Le stock disponible a été réservé pour cette commande client.`);
      setCart([]);
      setProducts([]);
      setProductSearch("");
      await load();
    } catch (caught) {
      setError(customerFacingError(caught, locale));
    } finally {
      setBusy(null);
    }
  }

  return <section data-testid="retail-omnichannel-panel" className="rounded-3xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><Truck className="h-5 w-5 text-violet-600" /><h2 className="text-lg font-black text-dtsc-ink">{locale === "en" ? "Orders, pickup & delivery" : "Commandes, retraits & livraisons"}</h2></div><p className="mt-1 max-w-3xl text-sm text-dtsc-muted">{locale === "en" ? "Create a customer order from the Shop, choose where it will be prepared, then follow it through pickup or delivery." : "Créez une commande client depuis le Shop, choisissez où elle sera préparée, puis suivez-la jusqu’au retrait ou à la livraison."}</p></div>
      <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${busy === "load" ? "animate-spin" : ""}`} />{locale === "en" ? "Refresh" : "Actualiser"}</Button>
    </div>
    {error ? <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</div> : null}
    {notice ? <div role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">{notice}</div> : null}

    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <p className="text-sm font-black text-dtsc-ink">1. {locale === "en" ? "Pickup or delivery option" : "Mode de retrait ou livraison"}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{MODES.map((item) => { const Icon = item.icon; return <button key={item.code} type="button" onClick={() => setMode(item.code)} className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm font-bold transition ${mode === item.code ? "border-violet-500 bg-violet-500/10 text-violet-800 dark:text-violet-200" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink"}`}><Icon className="h-4 w-4" />{customerFacingFulfillmentMode(item.code, locale)}</button>; })}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-dtsc-muted">{locale === "en" ? "Selling store" : "Magasin de vente"}<select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={sourceSiteId} onChange={(event) => setSourceSiteId(event.target.value)}><option value="">—</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
            <label className="text-xs font-bold text-dtsc-muted">{locale === "en" ? "Preparation warehouse" : "Dépôt de préparation"}<select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setCart([]); setProducts([]); }}><option value="">—</option>{(dashboard?.warehouses || []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.site.name} · {warehouse.name}</option>)}</select></label>
            {pickupRequired ? <label className="text-xs font-bold text-dtsc-muted sm:col-span-2">{locale === "en" ? "Pickup store" : "Magasin de retrait"}<select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={pickupSiteId} onChange={(event) => setPickupSiteId(event.target.value)} disabled={mode === "CLICK_COLLECT"}><option value="">—</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>{invalidOtherStore ? <span className="mt-1 block text-xs font-semibold text-amber-700 dark:text-amber-300">{locale === "en" ? "Choose a pickup store different from the selling store." : "Choisissez un magasin de retrait différent du magasin de vente."}</span> : null}</label> : null}
            <label className="text-xs font-bold text-dtsc-muted sm:col-span-2">{locale === "en" ? "Planned pickup / delivery" : "Retrait / livraison prévu(e)"}<input className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" type="datetime-local" value={expectedFulfillmentAt} onChange={(event) => setExpectedFulfillmentAt(event.target.value)} /></label>
          </div>
        </div>

        <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <div className="flex items-center gap-2"><UserRound className="h-4 w-4" /><p className="text-sm font-black text-dtsc-ink">2. {locale === "en" ? "Customer" : "Client"}</p></div>
          {customer ? <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3"><div><p className="font-black text-dtsc-ink">{customerName(customer)}</p><p className="text-xs text-dtsc-muted">{customer.retailProfile?.customerNumber || customer.code}{customer.primaryPhone ? ` · ${customer.primaryPhone}` : ""}</p></div><Button type="button" variant="outline" size="sm" onClick={() => setCustomer(null)}>{locale === "en" ? "Change" : "Changer"}</Button></div> : <><div className="mt-3 flex gap-2"><Input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchCustomers(); } }} placeholder={locale === "en" ? "Name, phone or customer number" : "Nom, téléphone ou numéro client"} /><Button type="button" variant="outline" disabled={busy === "customers" || customerSearch.trim().length < 2} onClick={() => void searchCustomers()}><Search className="h-4 w-4" /></Button></div><div className="mt-2 grid gap-2">{customers.map((item) => <button type="button" key={item.id} onClick={() => { setCustomer(item); setCustomers([]); }} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-left"><p className="font-bold text-dtsc-ink">{customerName(item)}</p><p className="text-xs text-dtsc-muted">{item.retailProfile?.customerNumber || item.code}{item.primaryPhone ? ` · ${item.primaryPhone}` : ""}</p></button>)}</div></>}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <div className="flex items-center gap-2"><Box className="h-4 w-4" /><p className="text-sm font-black text-dtsc-ink">3. {locale === "en" ? "Products" : "Produits"}</p></div>
          <div className="mt-3 flex gap-2"><Input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchProducts(); } }} placeholder={locale === "en" ? "Product, SKU or code" : "Produit, SKU ou code"} disabled={!warehouseId} /><Button type="button" variant="outline" disabled={busy === "products" || !warehouseId} onClick={() => void searchProducts()}><Search className="h-4 w-4" /></Button></div>
          <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1">{products.map((product) => { const available = product.trackInventory ? Math.floor(Number(product.availableQuantity || 0)) : Number.POSITIVE_INFINITY; return <button type="button" key={product.id} disabled={available <= 0} onClick={() => addProduct(product)} className="flex items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-left disabled:opacity-50"><div className="min-w-0"><p className="truncate font-bold text-dtsc-ink">{product.name}</p><p className="text-xs text-dtsc-muted">{product.code}{product.sku ? ` · ${product.sku}` : ""}</p></div><div className="text-right"><p className="text-sm font-black text-dtsc-ink">{formatMoney(product.indicativeSalePrice, product.currency || currency, locale)}</p><p className="text-[11px] text-dtsc-muted">{product.trackInventory ? `${locale === "en" ? "Available" : "Disponible"} ${available}` : (locale === "en" ? "Available on demand" : "Disponible sur demande")}</p></div></button>; })}</div>
        </div>

        <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <p className="text-sm font-black text-dtsc-ink">4. {locale === "en" ? "Customer order" : "Commande client"}</p>
          <div className="mt-3 space-y-2">{cart.map((line) => <div key={line.product.id} className="flex items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><div className="min-w-0"><p className="truncate font-bold text-dtsc-ink">{line.product.name}</p><p className="text-xs text-dtsc-muted">{formatMoney(line.product.indicativeSalePrice, line.product.currency || currency, locale)} · {locale === "en" ? "Price checked automatically at confirmation" : "Prix vérifié automatiquement à la confirmation"}</p></div><input aria-label={`${locale === "en" ? "Quantity" : "Quantité"} ${line.product.name}`} className="h-9 w-20 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-sm" type="number" min="0" step="1" value={line.quantity} onChange={(event) => setQuantity(line.product.id, Math.max(0, Number(event.target.value) || 0))} /></div>)}{!cart.length ? <p className="text-sm text-dtsc-muted">{locale === "en" ? "Search products and add them to the customer order." : "Recherchez des produits puis ajoutez-les à la commande client."}</p> : null}</div>
          <div className="mt-4 flex items-center justify-between border-t border-dtsc-border pt-4"><div><p className="text-xs font-bold uppercase text-dtsc-muted">{locale === "en" ? "Estimated total" : "Total estimé"}</p><p className="text-[11px] text-dtsc-muted">{locale === "en" ? "The final total is checked against your prices, promotions and taxes." : "Le total final est vérifié selon vos tarifs, promotions et taxes."}</p></div><p className="text-lg font-black text-dtsc-ink">{formatMoney(indicativeTotal, currency, locale)}</p></div>
          <Button type="button" className="mt-4 w-full" disabled={!canCreate} onClick={() => void createOrder()}><CheckCircle2 className="h-4 w-4" />{busy === "create" ? "…" : (locale === "en" ? "Confirm order & reserve stock" : "Confirmer la commande & réserver le stock")}</Button>
        </div>
      </div>
    </div>

    <div className="mt-6 border-t border-dtsc-border pt-5">
      <div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-dtsc-ink">{locale === "en" ? "Order tracking" : "Suivi des commandes"}</h3><p className="text-xs text-dtsc-muted">{locale === "en" ? "Follow each order from reserved stock through pickup or delivery." : "Suivez chaque commande depuis la réservation du stock jusqu’au retrait ou à la livraison."}</p></div><span className="rounded-full bg-dtsc-page px-2.5 py-1 text-xs font-black text-dtsc-muted">{orders?.pagination.total || 0}</span></div>
      <div className="mt-3 grid gap-2">{(orders?.items || []).map((row) => { const order = row.order; const latestFulfillment = order?.fulfillments?.[0]; return <div key={row.context.id} className="grid gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-3 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-black text-dtsc-ink">{order?.reference || row.context.salesOrderId}</span><span className={`rounded-full px-2 py-1 text-[11px] font-black ${statusClass(row.context.status)}`}>{customerFacingStatusLabel(row.context.status, locale)}</span><span className="rounded-full bg-violet-500/10 px-2 py-1 text-[11px] font-black text-violet-700 dark:text-violet-300">{customerFacingFulfillmentMode(row.context.fulfillmentMode, locale)}</span></div><p className="mt-1 text-xs text-dtsc-muted">{order ? `${customerFacingStatusLabel(order.status, locale)} · ${formatMoney(order.totalAmount, order.currency, locale)}` : "—"} · {row.reservations.length} {locale === "en" ? "stock reservation(s)" : "réservation(s) de stock"}{latestFulfillment ? ` · ${locale === "en" ? "Pickup / delivery" : "Retrait / livraison"} ${latestFulfillment.reference}: ${customerFacingStatusLabel(latestFulfillment.status, locale)}` : ""}</p></div><p className="text-xs font-semibold text-dtsc-muted">{new Date(row.context.createdAt).toLocaleString(locale === "en" ? "en-US" : "fr-FR")}</p></div>; })}{!orders?.items.length ? <p className="text-sm text-dtsc-muted">{locale === "en" ? "No customer order yet." : "Aucune commande client pour le moment."}</p> : null}</div>
    </div>
  </section>;
}
