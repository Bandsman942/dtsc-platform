"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, RefreshCw, ShieldCheck, ShoppingCart, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { customerFacingError, customerFacingStatusLabel } from "@/lib/customer-facing-language";
import {
  enqueueRetailOfflineSale,
  listRetailOfflineQueue,
  loadRetailOfflineSnapshot,
  retailOfflineIsUsable,
  saveRetailOfflineSnapshot,
  updateRetailOfflineQueueResult,
  type RetailOfflineQueueEntry,
  type RetailOfflineSnapshotEnvelope,
} from "@/lib/enterprise/retail/offline-client";

type Props = {
  organizationId: string;
  locale: "fr" | "en";
};

type Warehouse = { id: string; name: string; site: { id: string; name: string } };
type Dashboard = {
  configuration: { baseCurrencyCode: string } | null;
  warehouses?: Warehouse[];
  cashSession: null | {
    number: string;
    status: string;
    financialAccountId: string;
    financialAccount: { id: string; name: string; currencyCode: string };
  };
};

type OfflineCatalogItem = {
  catalogItemId: string;
  inventoryItemId: string | null;
  code: string;
  sku: string | null;
  name: string;
  currencyCode: string;
  unitPrice: string | null;
  serviceUnitPrice: string | null;
  customerUnitDiscountAmount: string | null;
  serviceUnitDiscountAmount: string | null;
  taxRate: string | null;
  taxIncluded: boolean;
  unitTaxAmount: string | null;
  unitLineTotal: string | null;
  trackInventory: boolean;
  quantityAvailable: string;
  offlineEligible: boolean;
};

type OfflineSnapshot = RetailOfflineSnapshotEnvelope & {
  currencyCode: string;
  generatedAt: string;
  site: { id: string; code: string; name: string };
  warehouse: { id: string; code: string; name: string };
  cashFinancialAccountId?: string;
  cashSessionNumber?: string;
  catalog: RetailOfflineSnapshotEnvelope["catalog"] & { items: OfflineCatalogItem[] };
};

type OfflineSalePayload = {
  mode?: "INVOICE_DRAFT";
  warehouseId: string;
  siteId: string;
  storageLocationId: null;
  customerBusinessPartyId: null;
  currencyCode: string;
  soldAt: string;
  idempotencyKey: string;
  couponCode: null;
  customerSegmentCode: null;
  channelCode: "POS";
  overrideReason: null;
  lines: Array<{
    catalogItemId: string;
    inventoryItemId: string | null;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxAmount: number;
  }>;
  tenders: Array<{ methodType: "CASH"; financialAccountId: string; amount: number; reference: null }>;
};

type CartLine = { item: OfflineCatalogItem; quantity: number };

type SyncResponse = {
  operation?: { status?: string; conflictCode?: string | null; serverEntityId?: string | null };
  sale?: { id?: string };
  invoice?: { id?: string };
  error?: string;
  message?: string;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function money(value: number, currency: string, locale: "fr" | "en") {
  return `${value.toLocaleString(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 2 })} ${currency}`;
}

function blockingMessage(code: string | null, locale: "fr" | "en") {
  return customerFacingError(code || "RETAIL_OFFLINE_SNAPSHOT_FAILED", locale, {
    fr: "La vente hors connexion n’est pas disponible avec la configuration actuelle.",
    en: "Offline sales are not available with the current configuration.",
  });
}

function lineAmounts(item: OfflineCatalogItem, quantity: number) {
  const customerUnitPrice = Number(item.unitPrice || 0);
  const serviceUnitPrice = Number(item.serviceUnitPrice || item.unitPrice || 0);
  const customerDiscount = Number(item.customerUnitDiscountAmount || 0) * quantity;
  const serviceDiscount = roundMoney(Number(item.serviceUnitDiscountAmount || 0) * quantity);
  const customerAfterDiscount = roundMoney(customerUnitPrice * quantity - customerDiscount);
  const serviceAfterDiscount = roundMoney(serviceUnitPrice * quantity - serviceDiscount);
  const taxRate = Number(item.taxRate || 0);
  const taxAmount = item.taxIncluded
    ? roundMoney(customerAfterDiscount - serviceAfterDiscount)
    : roundMoney(customerAfterDiscount * taxRate);
  const lineTotal = item.taxIncluded ? customerAfterDiscount : roundMoney(customerAfterDiscount + taxAmount);
  return { serviceUnitPrice: roundMoney(serviceUnitPrice), serviceDiscount, taxAmount, lineTotal };
}

export function RetailOfflineContinuity({ organizationId, locale }: Props) {
  const [online, setOnline] = useState(true);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);
  const [queue, setQueue] = useState<Array<RetailOfflineQueueEntry<OfflineSalePayload>>>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<"prepare" | "sync" | "capture" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const wasOnline = useRef(true);

  const refreshLocal = useCallback(async () => {
    try {
      const [storedSnapshot, storedQueue] = await Promise.all([
        loadRetailOfflineSnapshot(organizationId),
        listRetailOfflineQueue<OfflineSalePayload>(organizationId),
      ]);
      setSnapshot(storedSnapshot as OfflineSnapshot | null);
      setQueue(storedQueue);
    } catch (caught) {
      setError(customerFacingError(caught, locale));
    }
  }, [locale, organizationId]);

  const refreshDashboard = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_POS`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as Dashboard | { error?: string; message?: string } | null;
      if (!response.ok || !body || !("cashSession" in body)) throw new Error((body as { message?: string; error?: string } | null)?.message || (body as { error?: string } | null)?.error || "RETAIL_OFFLINE_DASHBOARD_FAILED");
      const next = body as Dashboard;
      setDashboard(next);
      setWarehouseId((current) => current || next.warehouses?.[0]?.id || "");
    } catch (caught) {
      setError(customerFacingError(caught, locale));
    }
  }, [locale, organizationId]);

  const syncPending = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const pending = (await listRetailOfflineQueue<OfflineSalePayload>(organizationId)).filter((entry) => entry.status === "PENDING_SYNC");
    if (!pending.length) { await refreshLocal(); return; }
    setBusy("sync");
    setError("");
    setNotice("");
    try {
      for (const entry of pending.slice(0, snapshot?.policy.maxQueueBatch || 25)) {
        const response = await fetch(`/api/enterprise/${organizationId}/retail/offline/sync`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ operationUuid: entry.operationUuid, snapshotVersion: entry.snapshotVersion, siteId: entry.siteId, warehouseId: entry.warehouseId, payload: entry.payload }),
        });
        const body = await response.json().catch(() => null) as SyncResponse | null;
        const status = body?.operation?.status;
        if (["SYNCED", "CONFLICT", "REJECTED"].includes(String(status))) {
          await updateRetailOfflineQueueResult(organizationId, entry.operationUuid, {
            status: status as "SYNCED" | "CONFLICT" | "REJECTED",
            conflictCode: body?.operation?.conflictCode || null,
            serverEntityId: body?.operation?.serverEntityId || body?.invoice?.id || body?.sale?.id || null,
          });
          continue;
        }
        if (!response.ok) throw new Error(body?.message || body?.error || "RETAIL_OFFLINE_SYNC_FAILED");
      }
      setNotice(locale === "en" ? "Offline synchronization completed. Review any rejected or conflicting drafts before closing the register." : "Synchronisation terminée. Vérifiez les brouillons en conflit ou rejetés avant de clôturer la caisse.");
      await refreshLocal();
      await refreshDashboard();
    } catch (caught) {
      setError(customerFacingError(caught, locale));
    } finally {
      setBusy(null);
    }
  }, [locale, organizationId, refreshDashboard, refreshLocal, snapshot?.policy.maxQueueBatch]);

  useEffect(() => {
    const current = typeof navigator === "undefined" ? true : navigator.onLine;
    setOnline(current);
    wasOnline.current = current;
    void refreshLocal();
    if (current) { void refreshDashboard(); void syncPending(); }
    const handleOnline = () => {
      setOnline(true);
      const returnedFromOffline = !wasOnline.current;
      wasOnline.current = true;
      void refreshDashboard();
      if (returnedFromOffline) void syncPending();
    };
    const handleOffline = () => { wasOnline.current = false; setOnline(false); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, [refreshDashboard, refreshLocal, syncPending]);

  async function prepareSnapshot() {
    const warehouse = dashboard?.warehouses?.find((item) => item.id === warehouseId);
    const cashSession = dashboard?.cashSession;
    if (!warehouse) {
      setError(locale === "en" ? "Open a cash register and select a stock warehouse before enabling offline sales." : "Ouvrez une caisse et sélectionnez un dépôt de stock avant d’activer la vente hors connexion.");
      return;
    }
    setBusy("prepare");
    setError("");
    setNotice("");
    try {
      const currencyCode = cashSession?.financialAccount.currencyCode || dashboard?.configuration?.baseCurrencyCode || "CDF";
      const response = await fetch(`/api/enterprise/${organizationId}/retail/offline/snapshot`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId: warehouse.site.id, warehouseId: warehouse.id, currencyCode, maxItems: 500 }),
      });
      const body = await response.json().catch(() => null) as OfflineSnapshot | { error?: string; message?: string } | null;
      if (!response.ok || !body || !("version" in body)) throw new Error((body as { message?: string; error?: string } | null)?.message || (body as { error?: string } | null)?.error || "RETAIL_OFFLINE_SNAPSHOT_FAILED");
      const serverSnapshot = body as OfflineSnapshot;
      if (!serverSnapshot.policy.draftOnly && (!cashSession || cashSession.status !== "OPEN")) {
        throw new Error(locale === "fr" ? "La vente historique hors connexion exige une caisse ouverte." : "Legacy offline sales require an open cash register.");
      }
      const prepared = { ...serverSnapshot, cashFinancialAccountId: cashSession?.financialAccount.id, cashSessionNumber: cashSession?.number };
      await saveRetailOfflineSnapshot(organizationId, prepared);
      setSnapshot(prepared);
      setCart([]);
      setNotice(prepared.policy.saleEnabled
        ? prepared.policy.draftOnly
          ? (locale === "en" ? "Encrypted offline Finance drafts are ready. No cash is collected and no invoice is issued until an online approval." : "Les brouillons Finance hors connexion sont prêts. Aucun encaissement ni aucune facture émise sans validation en ligne.")
          : (locale === "en" ? "Offline sales are ready on this device." : "La vente hors connexion est prête sur cet appareil.")
        : blockingMessage(prepared.policy.blockingReason, locale));
    } catch (caught) {
      setError(customerFacingError(caught, locale));
    } finally {
      setBusy(null);
    }
  }

  const queuedQuantity = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of queue.filter((item) => item.status === "PENDING_SYNC")) {
      for (const line of entry.payload.lines || []) map.set(line.catalogItemId, (map.get(line.catalogItemId) || 0) + Number(line.quantity || 0));
    }
    return map;
  }, [queue]);

  const visibleItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const items = snapshot?.catalog.items || [];
    return items.filter((item) => item.offlineEligible && (!needle || item.name.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle) || (item.sku || "").toLowerCase().includes(needle))).slice(0, 80);
  }, [search, snapshot]);

  function remaining(item: OfflineCatalogItem, cartQuantity = 0) {
    if (!item.trackInventory) return Number.POSITIVE_INFINITY;
    return Math.max(0, Number(item.quantityAvailable || 0) - (queuedQuantity.get(item.catalogItemId) || 0) - cartQuantity);
  }

  function addToCart(item: OfflineCatalogItem) {
    setCart((current) => {
      const existing = current.find((line) => line.item.catalogItemId === item.catalogItemId);
      const currentQuantity = existing?.quantity || 0;
      if (remaining(item, currentQuantity) <= 0) return current;
      return existing
        ? current.map((line) => line.item.catalogItemId === item.catalogItemId ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { item, quantity: 1 }];
    });
  }

  function changeQuantity(catalogItemId: string, quantity: number) {
    setCart((current) => current.flatMap((line) => {
      if (line.item.catalogItemId !== catalogItemId) return [line];
      if (quantity <= 0) return [];
      const max = line.item.trackInventory ? Math.max(0, Number(line.item.quantityAvailable || 0) - (queuedQuantity.get(catalogItemId) || 0)) : quantity;
      return [{ ...line, quantity: Math.min(quantity, max) }];
    }));
  }

  const cartAmounts = useMemo(() => cart.map((line) => ({ line, amounts: lineAmounts(line.item, line.quantity) })), [cart]);
  const total = useMemo(() => roundMoney(cartAmounts.reduce((sum, row) => sum + row.amounts.lineTotal, 0)), [cartAmounts]);
  const pendingCount = queue.filter((entry) => entry.status === "PENDING_SYNC").length;
  const conflictCount = queue.filter((entry) => entry.status === "CONFLICT" || entry.status === "REJECTED").length;
  const usable = retailOfflineIsUsable(snapshot);

  async function captureOfflineSale() {
    if (!snapshot || !usable || (!snapshot.policy.draftOnly && !snapshot.cashFinancialAccountId) || !cart.length || total <= 0) return;
    setBusy("capture");
    setError("");
    setNotice("");
    try {
      const operationUuid = crypto.randomUUID();
      const payload: OfflineSalePayload = {
        ...(snapshot.policy.draftOnly ? { mode: "INVOICE_DRAFT" as const } : {}),
        warehouseId: snapshot.warehouse.id,
        siteId: snapshot.site.id,
        storageLocationId: null,
        customerBusinessPartyId: null,
        currencyCode: snapshot.currencyCode,
        soldAt: new Date().toISOString(),
        idempotencyKey: `offline-local:${operationUuid}`,
        couponCode: null,
        customerSegmentCode: null,
        channelCode: "POS",
        overrideReason: null,
        lines: cartAmounts.map(({ line, amounts }) => ({
          catalogItemId: line.item.catalogItemId,
          inventoryItemId: line.item.inventoryItemId,
          quantity: line.quantity,
          unitPrice: amounts.serviceUnitPrice,
          discountAmount: amounts.serviceDiscount,
          taxAmount: amounts.taxAmount,
        })),
        tenders: snapshot.policy.draftOnly ? [] : [{ methodType: "CASH", financialAccountId: snapshot.cashFinancialAccountId!, amount: total, reference: null }],
      };
      await enqueueRetailOfflineSale({ organizationId, operationUuid, snapshotVersion: snapshot.version, siteId: snapshot.site.id, warehouseId: snapshot.warehouse.id, payload });
      setCart([]);
      setNotice(snapshot.policy.draftOnly
        ? (locale === "en" ? "Finance draft saved locally. After synchronization, an authorized person must approve and issue its invoice before collection." : "Brouillon Finance enregistré sur cet appareil. Après synchronisation, une personne autorisée devra valider puis émettre la facture avant encaissement.")
        : (locale === "en" ? "Sale saved locally, pending online validation." : "Vente enregistrée localement, sous réserve des contrôles en ligne."));
      await refreshLocal();
      if (online) await syncPending();
    } catch (caught) {
      setError(customerFacingError(caught, locale));
    } finally {
      setBusy(null);
    }
  }

  const snapshotExpired = snapshot ? !retailOfflineIsUsable(snapshot) && snapshot.policy.saleEnabled : false;

  return <section data-testid="retail-offline-continuity" className="rounded-3xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${online ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>{online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}{online ? (locale === "en" ? "Online" : "En ligne") : (locale === "en" ? "Offline" : "Hors ligne")}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs font-black text-cyan-800 dark:text-cyan-200"><ShieldCheck className="h-3.5 w-3.5" />{locale === "en" ? "Local protection active" : "Protection locale active"}</span>
        </div>
        <h2 className="mt-2 text-lg font-black text-dtsc-ink">{locale === "en" ? "Offline sales" : "Vente hors connexion"}</h2>
        <p className="mt-1 max-w-3xl text-sm text-dtsc-muted">{snapshot?.policy.draftOnly
          ? (locale === "en" ? "During an outage, prepare encrypted Finance drafts only. The server must recheck price, stock, permissions and taxation; no payment is recorded or invoice issued until the online workflow completes." : "Pendant une coupure, préparez des brouillons Finance chiffrés. Le serveur reverra prix, stock, droits et taxes. Aucun encaissement n'est confirmé et aucune facture n'est émise avant la validation en ligne.")
          : (locale === "en" ? "Historical offline cash sales are provisional until server synchronization." : "Les ventes historiques hors connexion restent provisoires jusqu’à validation serveur.")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {online ? <Button type="button" variant="outline" disabled={Boolean(busy) || !warehouseId} onClick={prepareSnapshot}><Download className="h-4 w-4" />{busy === "prepare" ? "…" : (locale === "en" ? "Prepare offline sales" : "Préparer la vente hors connexion")}</Button> : null}
        {online && pendingCount ? <Button type="button" disabled={Boolean(busy)} onClick={() => void syncPending()}><RefreshCw className={`h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} />{locale === "en" ? `Sync ${pendingCount}` : `Synchroniser ${pendingCount}`}</Button> : null}
      </div>
    </div>

    {online && dashboard?.warehouses?.length ? <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <label className="text-sm font-bold text-dtsc-ink">{locale === "en" ? "Stock warehouse" : "Dépôt de stock"}<select className="mt-1 h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>{dashboard.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.site.name} · {warehouse.name}</option>)}</select></label>
      <div className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm"><p className="font-bold text-dtsc-ink">{locale === "en" ? "Cash register" : "Caisse"}</p><p className="text-dtsc-muted">{dashboard.cashSession?.status === "OPEN" ? `${dashboard.cashSession.number} · ${dashboard.cashSession.financialAccount.name} · ${dashboard.cashSession.financialAccount.currencyCode}` : (locale === "en" ? "No open cash register" : "Aucune caisse ouverte")}</p></div>
    </div> : null}

    {error ? <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</div> : null}
    {notice ? <div role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">{notice}</div> : null}

    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-bold uppercase tracking-wide text-dtsc-muted">{locale === "en" ? "Offline preparation" : "Préparation hors connexion"}</p><p className="mt-1 font-black text-dtsc-ink">{snapshot ? (usable ? (locale === "en" ? "Ready" : "Prête") : (locale === "en" ? "Needs refresh" : "À actualiser")) : "—"}</p>{snapshot ? <p className="mt-1 text-xs text-dtsc-muted">{snapshot.warehouse.name} · {snapshot.currencyCode} · {snapshot.catalog.returned}/{snapshot.catalog.total}</p> : null}</div>
      <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-bold uppercase tracking-wide text-dtsc-muted">{locale === "en" ? "Waiting to sync" : "À synchroniser"}</p><p className="mt-1 text-xl font-black text-dtsc-ink">{pendingCount}</p></div>
      <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-bold uppercase tracking-wide text-dtsc-muted">{locale === "en" ? "Sales to review" : "Ventes à vérifier"}</p><p className="mt-1 text-xl font-black text-dtsc-ink">{conflictCount}</p></div>
    </div>

    {snapshot && !snapshot.policy.saleEnabled ? <div className="mt-4 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-semibold text-amber-900 dark:text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{blockingMessage(snapshot.policy.blockingReason, locale)}</div> : null}
    {snapshotExpired ? <div className="mt-4 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-semibold text-amber-900 dark:text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{locale === "en" ? "Offline sales need to be refreshed. Reconnect and prepare them again before continuing." : "La vente hors connexion doit être actualisée. Reconnectez-vous et préparez-la de nouveau avant de continuer."}</div> : null}

    {snapshot && snapshot.policy.saleEnabled ? <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-dtsc-ink">{locale === "en" ? "Products available offline" : "Produits disponibles hors connexion"}</h3><p className="text-xs text-dtsc-muted">{locale === "en" ? "Cash payments only. Promotions and payment methods that require a connection remain unavailable." : "Paiement en espèces uniquement. Les promotions et moyens de paiement nécessitant une connexion restent indisponibles."}</p></div></div>
        <Input className="mt-3" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === "en" ? "Search available products" : "Rechercher les produits disponibles"} />
        <div className="mt-3 grid max-h-[360px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{visibleItems.map((item) => { const cartQty = cart.find((line) => line.item.catalogItemId === item.catalogItemId)?.quantity || 0; const available = remaining(item, cartQty); return <button key={item.catalogItemId} type="button" disabled={!usable || available <= 0} onClick={() => addToCart(item)} className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-left transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"><p className="truncate font-bold text-dtsc-ink">{item.name}</p><p className="mt-1 text-xs text-dtsc-muted">{item.code}{item.sku ? ` · ${item.sku}` : ""}</p><div className="mt-2 flex items-center justify-between gap-2"><span className="font-black text-dtsc-ink">{money(Number(item.unitLineTotal || item.unitPrice || 0), item.currencyCode, locale)}</span><span className="text-xs font-semibold text-dtsc-muted">{item.trackInventory ? `${locale === "en" ? "Available" : "Disponible"}: ${Number.isFinite(available) ? available : "∞"}` : (locale === "en" ? "No stock limit" : "Sans limite de stock")}</span></div></button>; })}{!visibleItems.length ? <p className="text-sm text-dtsc-muted">{locale === "en" ? "No product is currently available for offline sales." : "Aucun produit n’est actuellement disponible pour la vente hors connexion."}</p> : null}</div>
      </div>

      <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
        <div className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /><h3 className="font-black text-dtsc-ink">{locale === "en" ? "Offline sale" : "Vente hors connexion"}</h3></div>
        <div className="mt-3 space-y-2">{cart.map((line) => <div key={line.item.catalogItemId} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-bold text-dtsc-ink">{line.item.name}</p><p className="text-xs text-dtsc-muted">{money(lineAmounts(line.item, line.quantity).lineTotal, snapshot.currencyCode, locale)}</p></div><input aria-label={locale === "en" ? `Quantity ${line.item.name}` : `Quantité ${line.item.name}`} className="h-9 w-20 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-sm" type="number" min="0" step="1" value={line.quantity} onChange={(event) => changeQuantity(line.item.catalogItemId, Math.max(0, Number(event.target.value) || 0))} /></div></div>)}{!cart.length ? <p className="text-sm text-dtsc-muted">{locale === "en" ? "Add products to this sale." : "Ajoutez des produits à cette vente."}</p> : null}</div>
        <div className="mt-4 flex items-center justify-between border-t border-dtsc-border pt-4"><span className="font-bold text-dtsc-muted">Total</span><span className="text-lg font-black text-dtsc-ink">{money(total, snapshot.currencyCode, locale)}</span></div>
        <Button className="mt-4 w-full" type="button" disabled={Boolean(busy) || !usable || !cart.length || (!snapshot.policy.draftOnly && !snapshot.cashFinancialAccountId)} onClick={() => void captureOfflineSale()}>{busy === "capture" ? "…" : snapshot.policy.draftOnly ? (locale === "en" ? "Save Finance draft" : "Enregistrer le brouillon Finance") : (locale === "en" ? "Save offline sale" : "Enregistrer la vente hors connexion")}</Button>
        <p className="mt-2 text-xs text-dtsc-muted">{snapshot.policy.draftOnly
          ? (locale === "en" ? "Synchronization creates an invoice DRAFT, not a receipt. Approval, issuance, payment and stock posting remain online." : "La synchronisation crée une facture BROUILLON, pas un reçu. Validation, émission, encaissement et sortie de stock restent en ligne.")
          : (locale === "en" ? "Stock and accounting are updated only after accepted synchronization." : "Le stock et la comptabilité ne sont mis à jour qu’après synchronisation acceptée.")}</p>
      </div>
    </div> : null}

    {queue.length ? <div className="mt-5 border-t border-dtsc-border pt-4"><h3 className="font-black text-dtsc-ink">{locale === "en" ? "Offline sales history" : "Historique des ventes hors connexion"}</h3><div className="mt-3 grid gap-2">{queue.slice(-10).reverse().map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm"><div><span className="font-bold text-dtsc-ink">{entry.payload.mode === "INVOICE_DRAFT" ? (locale === "en" ? "Finance draft" : "Brouillon Finance") : (locale === "en" ? "Offline sale" : "Vente hors connexion")}</span><span className="ml-2 text-dtsc-muted">{new Date(entry.createdAt).toLocaleString(locale === "en" ? "en-US" : "fr-FR")}</span></div><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-black ${entry.status === "SYNCED" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : entry.status === "PENDING_SYNC" ? "bg-cyan-500/10 text-cyan-800 dark:text-cyan-200" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>{entry.status === "SYNCED" && entry.payload.mode === "INVOICE_DRAFT" ? (locale === "en" ? "Draft created — approval pending" : "Brouillon créé — validation requise") : customerFacingStatusLabel(entry.status, locale)}</span>{entry.conflictCode ? <span className="max-w-[320px] truncate text-xs font-semibold text-amber-800 dark:text-amber-200">{customerFacingError(entry.conflictCode, locale, { fr: "Cette vente doit être vérifiée avant validation.", en: "This sale must be reviewed before it can be completed." })}</span> : null}</div></div>)}</div></div> : null}
  </section>;
}
