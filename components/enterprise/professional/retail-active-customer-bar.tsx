"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppLocale } from "@/components/i18n/locale-provider";
import {
  customerFacingError,
  customerFacingStatusLabel,
  customerFacingStoredValueType,
} from "@/lib/customer-facing-language";

type Customer = {
  id: string;
  code: string;
  legalName: string;
  displayName: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  retailProfile?: { customerNumber: string; segmentCode: string | null; priceListCode: string | null; status: string } | null;
};

type Capabilities = {
  canReadCustomers: boolean;
  canCreateCustomers: boolean;
  canManageCustomers: boolean;
};

type LoyaltyAccount = {
  id: string;
  pointsBalance: string;
  lifetimeEarned: string;
  lifetimeRedeemed: string;
  status: string;
  program: { nameFr: string; nameEn: string; currencyCode: string; status: string };
};

type StoredValueAccount = {
  id: string;
  accountType: string;
  displayCode: string;
  currencyCode: string;
  balance: string;
  status: string;
  expiresAt: string | null;
};

type CustomerValue = {
  summary: {
    saleCount: number;
    returnCount: number;
    salesTotalByCurrency: Record<string, number>;
    returnsTotalByCurrency: Record<string, number>;
  };
  loyaltyAccounts: LoyaltyAccount[];
  storedValueAccounts: StoredValueAccount[];
};

async function readJson(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || body?.error || "Request failed");
  return body;
}

function money(value: string | number, currencyCode: string) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

function points(value: string | number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function RetailActiveCustomerBar({ organizationId, compact = false }: { organizationId: string; compact?: boolean }) {
  const language: "fr" | "en" = useAppLocale() === "en" ? "en" : "fr";
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [active, setActive] = useState<Customer | null>(null);
  const [customerValue, setCustomerValue] = useState<CustomerValue | null>(null);
  const [valueLoading, setValueLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ legalName: "", primaryPhone: "", primaryEmail: "" });

  const copy = useMemo(() => language === "en" ? {
    title: "Customer at checkout",
    walkIn: "Walk-in sale",
    search: "Search name, phone, email or customer number",
    selected: "Customer selected",
    clear: "Remove",
    create: "New customer",
    createTitle: "Add a customer",
    name: "Customer name",
    phone: "Phone",
    email: "Email",
    save: "Create & select",
    cancel: "Cancel",
    noResult: "No matching customer.",
    hint: "Choose a customer to personalize this sale and keep their purchase history together. Remove the customer for a walk-in sale.",
    benefits: "Loyalty & customer balances",
    benefitsHint: "See the benefits already linked to this customer before completing the sale.",
    loyalty: "Loyalty",
    points: "points available",
    earned: "earned in total",
    redeemed: "used in total",
    storedValue: "Gift cards & store credit",
    noBenefits: "No loyalty balance, gift card or store credit is linked to this customer yet.",
    purchaseHistory: "Purchase history",
    sales: "sales",
    returns: "returns",
    expires: "Expires",
    loadingBenefits: "Loading customer benefits…",
  } : {
    title: "Client au comptoir",
    walkIn: "Vente de passage",
    search: "Rechercher nom, téléphone, email ou numéro client",
    selected: "Client sélectionné",
    clear: "Retirer",
    create: "Nouveau client",
    createTitle: "Ajouter un client",
    name: "Nom du client",
    phone: "Téléphone",
    email: "Email",
    save: "Créer & sélectionner",
    cancel: "Annuler",
    noResult: "Aucun client correspondant.",
    hint: "Sélectionnez un client pour personnaliser la vente et conserver son historique d’achats. Retirez-le pour une vente de passage.",
    benefits: "Fidélité & avoirs client",
    benefitsHint: "Consultez les avantages déjà liés à ce client avant de finaliser la vente.",
    loyalty: "Fidélité",
    points: "points disponibles",
    earned: "gagnés au total",
    redeemed: "utilisés au total",
    storedValue: "Cartes-cadeaux & avoirs",
    noBenefits: "Aucun solde fidélité, carte-cadeau ou avoir n’est encore lié à ce client.",
    purchaseHistory: "Historique d’achats",
    sales: "ventes",
    returns: "retours",
    expires: "Expire le",
    loadingBenefits: "Chargement des avantages client…",
  }, [language]);

  const showError = useCallback((caught: unknown, fallback?: { fr: string; en: string }) => {
    setError(customerFacingError(caught, language, fallback));
  }, [language]);

  const load = useCallback(async () => {
    try {
      const [permissionData, activeData] = await Promise.all([
        fetch(`/api/enterprise/${organizationId}/retail/customer-payment-permissions`, { cache: "no-store" }).then(readJson),
        fetch(`/api/enterprise/${organizationId}/retail/active-customer`, { cache: "no-store" }).then(readJson),
      ]);
      setCapabilities(permissionData.capabilities);
      setActive(activeData.customer || null);
      window.dispatchEvent(new CustomEvent("dtsc-retail-customer-changed", { detail: { organizationId } }));
    } catch (caught) {
      showError(caught, {
        fr: "Les informations client ne sont pas disponibles pour le moment.",
        en: "Customer information is not available right now.",
      });
    }
  }, [organizationId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!active?.id || !capabilities?.canReadCustomers) {
      setCustomerValue(null);
      return;
    }
    const controller = new AbortController();
    setValueLoading(true);
    fetch(`/api/enterprise/${organizationId}/retail/customers/${active.id}`, { signal: controller.signal, cache: "no-store" })
      .then(readJson)
      .then((data) => setCustomerValue({
        summary: data.summary,
        loyaltyAccounts: data.loyaltyAccounts || [],
        storedValueAccounts: data.storedValueAccounts || [],
      }))
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          showError(caught, {
            fr: "Les avantages de ce client ne sont pas disponibles pour le moment.",
            en: "This customer’s benefits are not available right now.",
          });
        }
      })
      .finally(() => setValueLoading(false));
    return () => controller.abort();
  }, [active?.id, capabilities?.canReadCustomers, organizationId, showError]);

  useEffect(() => {
    if (!capabilities?.canReadCustomers || search.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const data = await fetch(`/api/enterprise/${organizationId}/retail/customers?search=${encodeURIComponent(search.trim())}&pageSize=10`, { signal: controller.signal }).then(readJson);
        setResults(data.items || []);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          showError(caught, {
            fr: "La recherche de clients n’a pas abouti. Réessayez avec un autre nom ou contact.",
            en: "Customer search could not be completed. Try another name or contact.",
          });
        }
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [organizationId, search, capabilities?.canReadCustomers, showError]);

  async function select(customer: Customer) {
    setError("");
    try {
      const data = await fetch(`/api/enterprise/${organizationId}/retail/active-customer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerBusinessPartyId: customer.id }),
      }).then(readJson);
      setActive(data.customer);
      window.dispatchEvent(new CustomEvent("dtsc-retail-customer-changed", { detail: { organizationId } }));
      setCustomerValue(null);
      setSearch("");
      setResults([]);
    } catch (caught) {
      showError(caught, {
        fr: "Ce client n’a pas pu être sélectionné pour la vente.",
        en: "This customer could not be selected for the sale.",
      });
    }
  }

  async function clear() {
    setError("");
    try {
      await fetch(`/api/enterprise/${organizationId}/retail/active-customer`, { method: "DELETE" }).then(readJson);
      setActive(null);
      window.dispatchEvent(new CustomEvent("dtsc-retail-customer-changed", { detail: { organizationId } }));
      setCustomerValue(null);
    } catch (caught) {
      showError(caught, {
        fr: "Le client n’a pas pu être retiré de la vente.",
        en: "The customer could not be removed from the sale.",
      });
    }
  }

  async function quickCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const created = await fetch(`/api/enterprise/${organizationId}/business-parties`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          partyType: "PERSON",
          legalName: form.legalName,
          displayName: form.legalName,
          primaryEmail: form.primaryEmail || null,
          primaryPhone: form.primaryPhone || null,
          roles: ["CUSTOMER"],
          contacts: [
            ...(form.primaryPhone ? [{ contactType: "PHONE", label: "POS", value: form.primaryPhone, isPrimary: true }] : []),
            ...(form.primaryEmail ? [{ contactType: "EMAIL", label: "POS", value: form.primaryEmail, isPrimary: !form.primaryPhone }] : []),
          ],
          addresses: [],
          notes: null,
        }),
      }).then(readJson);
      const customer: Customer = { ...created.party, retailProfile: null };
      await select(customer);
      setForm({ legalName: "", primaryPhone: "", primaryEmail: "" });
      setShowCreate(false);
    } catch (caught) {
      showError(caught, {
        fr: "Le client n’a pas pu être créé. Vérifiez son nom et ses coordonnées puis réessayez.",
        en: "The customer could not be created. Check the name and contact details, then try again.",
      });
    } finally {
      setCreating(false);
    }
  }

  if (!capabilities?.canReadCustomers) return null;

  return (
    <section data-retail-customer-workspace data-retail-customer-compact={compact ? "true" : undefined} className={compact ? "min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3" : "min-w-0 max-w-full rounded-3xl border border-dtsc-border bg-dtsc-surface p-4 shadow-[0_8px_30px_rgba(0,23,54,0.07)] sm:p-6"} aria-label={copy.title}>
      <div className={`flex min-w-0 flex-col lg:flex-row lg:items-start lg:justify-between ${compact ? "gap-3" : "gap-5"}`}>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5 border-l-4 border-cyan-500 pl-3">
            {!compact ? <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-dtsc-blue dark:text-cyan-300"><UserRoundCheck className="h-5 w-5" aria-hidden="true" /></span> : null}
            <h2 className={`min-w-0 break-words font-black tracking-tight text-dtsc-ink ${compact ? "text-sm" : "text-lg"}`}>{copy.title}</h2>
            <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold text-dtsc-blue dark:text-cyan-200">{active ? copy.selected : copy.walkIn}</span>
          </div>
          {!compact ? <p className="mt-3 max-w-3xl text-sm leading-6 text-dtsc-muted">{copy.hint}</p> : null}
          {active ? (
            <div className="mt-3 space-y-3">
              <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-extrabold text-dtsc-ink">{active.displayName || active.legalName}</p>
                  <p className="break-words text-xs text-dtsc-muted">{[active.retailProfile?.customerNumber || active.code, active.primaryPhone, active.primaryEmail, active.retailProfile?.segmentCode].filter(Boolean).join(" · ")}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void clear()} className="shrink-0 rounded-xl">{copy.clear}</Button>
              </div>

              <details className="group min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-bold text-dtsc-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                  <span>{copy.benefits}</span>
                  <span className="text-xs font-medium text-muted-foreground group-open:hidden">{language === "en" ? "View" : "Voir"}</span>
                  <span className="hidden text-xs font-medium text-muted-foreground group-open:inline">{language === "en" ? "Hide" : "Masquer"}</span>
                </summary>
                <div className="space-y-4 border-t p-3">
                  <p className="text-xs leading-5 text-muted-foreground">{copy.benefitsHint}</p>
                  {valueLoading ? <p className="text-sm text-muted-foreground">{copy.loadingBenefits}</p> : customerValue ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground">{copy.purchaseHistory}</p>
                          <p className="mt-1 text-sm font-semibold">{customerValue.summary.saleCount} {copy.sales} · {customerValue.summary.returnCount} {copy.returns}</p>
                        </div>
                        {Object.entries(customerValue.summary.salesTotalByCurrency || {}).slice(0, 2).map(([currency, total]) => (
                          <div key={currency} className="rounded-xl bg-muted/30 p-3">
                            <p className="text-xs text-muted-foreground">{language === "en" ? "Purchases" : "Achats"} · {currency}</p>
                            <p className="mt-1 text-sm font-semibold">{money(total, currency)}</p>
                          </div>
                        ))}
                      </div>

                      {customerValue.loyaltyAccounts.length ? (
                        <div>
                          <h3 className="text-sm font-semibold">{copy.loyalty}</h3>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {customerValue.loyaltyAccounts.map((account) => (
                              <div key={account.id} className="rounded-xl border p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="min-w-0 truncate text-sm font-medium">{language === "en" ? account.program.nameEn : account.program.nameFr}</p>
                                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{customerFacingStatusLabel(account.status, language)}</span>
                                </div>
                                <p className="mt-2 text-lg font-semibold">{points(account.pointsBalance)} <span className="text-xs font-medium text-muted-foreground">{copy.points}</span></p>
                                <p className="mt-1 text-xs text-muted-foreground">{points(account.lifetimeEarned)} {copy.earned} · {points(account.lifetimeRedeemed)} {copy.redeemed}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {customerValue.storedValueAccounts.length ? (
                        <div>
                          <h3 className="text-sm font-semibold">{copy.storedValue}</h3>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {customerValue.storedValueAccounts.map((account) => (
                              <div key={account.id} className="rounded-xl border p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-medium">{customerFacingStoredValueType(account.accountType, language)}</p>
                                  <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{customerFacingStatusLabel(account.status, language)}</span>
                                </div>
                                <p className="mt-2 text-lg font-semibold">{money(account.balance, account.currencyCode)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{account.displayCode}{account.expiresAt ? ` · ${copy.expires}: ${new Date(account.expiresAt).toLocaleDateString(language === "en" ? "en" : "fr")}` : ""}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {!customerValue.loyaltyAccounts.length && !customerValue.storedValueAccounts.length ? (
                        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">{copy.noBenefits}</p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </details>
            </div>
          ) : null}
        </div>

        <div className="w-full min-w-0 lg:max-w-md">
          <div data-responsive-actions className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} aria-label={copy.search} className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink outline-none placeholder:text-dtsc-muted focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20" autoComplete="off" type="search" />
            {capabilities.canCreateCustomers ? <Button type="button" onClick={() => setShowCreate((value) => !value)} variant="outline" className="w-full rounded-xl sm:w-auto"><Plus className="h-4 w-4 shrink-0" />{copy.create}</Button> : null}
          </div>
          {search.trim().length >= 2 ? (
            <div className="mt-2 max-h-64 min-w-0 overflow-y-auto rounded-xl border border-dtsc-border bg-dtsc-surface p-1 shadow-lg">
              {searching ? <p className="p-3 text-sm text-muted-foreground">…</p> : results.length ? results.map((customer) => (
                <button key={customer.id} type="button" onClick={() => void select(customer)} className="block min-w-0 w-full rounded-lg px-3 py-2 text-left transition hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                  <span className="block break-words text-sm font-bold text-dtsc-ink">{customer.displayName || customer.legalName}</span>
                  <span className="block break-words text-xs text-dtsc-muted">{[customer.retailProfile?.customerNumber || customer.code, customer.primaryPhone, customer.primaryEmail].filter(Boolean).join(" · ")}</span>
                </button>
              )) : <p className="p-3 text-sm text-muted-foreground">{copy.noResult}</p>}
            </div>
          ) : null}
        </div>
      </div>

      {showCreate && capabilities.canCreateCustomers ? (
        <form onSubmit={quickCreate} className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:grid-cols-3">
          <label className="min-w-0 text-sm font-bold text-dtsc-ink">{copy.name}<input required minLength={2} value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink" /></label>
          <label className="min-w-0 text-sm font-bold text-dtsc-ink">{copy.phone}<input value={form.primaryPhone} onChange={(event) => setForm({ ...form, primaryPhone: event.target.value })} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink" inputMode="tel" /></label>
          <label className="min-w-0 text-sm font-bold text-dtsc-ink">{copy.email}<input value={form.primaryEmail} onChange={(event) => setForm({ ...form, primaryEmail: event.target.value })} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink" inputMode="email" type="email" /></label>
          <div data-responsive-actions className="flex flex-wrap gap-2 sm:col-span-3">
            <Button disabled={creating} className="rounded-xl bg-[var(--dtsc-blue)] text-[var(--dtsc-page)] hover:brightness-110">{copy.save}</Button>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)} className="rounded-xl">{copy.cancel}</Button>
          </div>
        </form>
      ) : null}
      {error ? <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p> : null}
    </section>
  );
}
