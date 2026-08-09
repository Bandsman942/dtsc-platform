"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { customerFacingError } from "@/lib/customer-facing-language";

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

async function readJson(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || body?.error || "Request failed");
  return body;
}

export function RetailActiveCustomerBar({ organizationId }: { organizationId: string }) {
  const language: "fr" | "en" = useAppLocale() === "en" ? "en" : "fr";
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [active, setActive] = useState<Customer | null>(null);
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
  }, [language]);

  const showError = useCallback((caught: unknown, fallback?: { fr: string; en: string }) => {
    setError(customerFacingError(caught, language, fallback));
  }, [language]);

  const load = useCallback(async () => {
    try {
      const [permissionData, activeData] = await Promise.all([
        fetch(`/api/enterprise/${organizationId}/retail/customer-payment-permissions`).then(readJson),
        fetch(`/api/enterprise/${organizationId}/retail/active-customer`).then(readJson),
      ]);
      setCapabilities(permissionData.capabilities);
      setActive(activeData.customer || null);
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
    <section className="rounded-2xl border bg-background/95 p-4 shadow-sm" aria-label={copy.title}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{copy.title}</h2>
            <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">{active ? copy.selected : copy.walkIn}</span>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{copy.hint}</p>
          {active ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{active.displayName || active.legalName}</p>
                <p className="truncate text-xs text-muted-foreground">{[active.retailProfile?.customerNumber || active.code, active.primaryPhone, active.primaryEmail, active.retailProfile?.segmentCode].filter(Boolean).join(" · ")}</p>
              </div>
              <button type="button" onClick={() => void clear()} className="min-h-10 rounded-xl border px-3 text-sm font-medium hover:bg-muted">{copy.clear}</button>
            </div>
          ) : null}
        </div>

        <div className="w-full lg:max-w-md">
          <div className="flex gap-2">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="min-h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm" autoComplete="off" />
            {capabilities.canCreateCustomers ? <button type="button" onClick={() => setShowCreate((value) => !value)} className="min-h-11 whitespace-nowrap rounded-xl border px-3 text-sm font-medium hover:bg-muted">{copy.create}</button> : null}
          </div>
          {search.trim().length >= 2 ? (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border bg-background p-1 shadow-lg">
              {searching ? <p className="p-3 text-sm text-muted-foreground">…</p> : results.length ? results.map((customer) => (
                <button key={customer.id} type="button" onClick={() => void select(customer)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-muted">
                  <span className="block truncate text-sm font-medium">{customer.displayName || customer.legalName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[customer.retailProfile?.customerNumber || customer.code, customer.primaryPhone, customer.primaryEmail].filter(Boolean).join(" · ")}</span>
                </button>
              )) : <p className="p-3 text-sm text-muted-foreground">{copy.noResult}</p>}
            </div>
          ) : null}
        </div>
      </div>

      {showCreate && capabilities.canCreateCustomers ? (
        <form onSubmit={quickCreate} className="mt-4 grid gap-3 rounded-xl border p-3 sm:grid-cols-3">
          <label className="text-sm font-medium">{copy.name}<input required minLength={2} value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label>
          <label className="text-sm font-medium">{copy.phone}<input value={form.primaryPhone} onChange={(event) => setForm({ ...form, primaryPhone: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" inputMode="tel" /></label>
          <label className="text-sm font-medium">{copy.email}<input value={form.primaryEmail} onChange={(event) => setForm({ ...form, primaryEmail: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" inputMode="email" type="email" /></label>
          <div className="flex gap-2 sm:col-span-3">
            <button disabled={creating} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50">{copy.save}</button>
            <button type="button" onClick={() => setShowCreate(false)} className="min-h-11 rounded-xl border px-4 text-sm font-medium">{copy.cancel}</button>
          </div>
        </form>
      ) : null}
      {error ? <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p> : null}
    </section>
  );
}
