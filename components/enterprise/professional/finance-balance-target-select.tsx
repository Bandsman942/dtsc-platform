"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { financeMoney, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { Input } from "@/components/ui/input";

type Balance = {
  id: string;
  businessPartyId?: string | null;
  currencyCode: string;
  outstandingAmount: string | number;
  salesInvoice?: { number?: string } | null;
  supplierInvoice?: { number?: string } | null;
};

export function FinanceBalanceTargetSelect({
  organizationId,
  direction,
  businessPartyId,
  currencyCode,
  locale,
}: {
  organizationId: string;
  direction: string;
  businessPartyId?: string | null;
  currencyCode: string;
  locale: FinanceLocale;
}) {
  const endpoint = direction === "INBOUND" ? "receivables" : "payables";
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: "1", pageSize: "100", status: "OPEN", currencyCode });
    if (businessPartyId) params.set("businessPartyId", businessPartyId);
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [businessPartyId, currencyCode, search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(`/api/enterprise/${organizationId}/${endpoint}?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || body.error || "Allocation targets unavailable");
        setItems(Array.isArray(body.items) ? body.items : []);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setItems([]);
        setError(safeFinanceError(requestError, locale === "en" ? "Unable to load open balances." : "Impossible de charger les soldes ouverts."));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [endpoint, organizationId, query, locale]);

  return <div className="grid gap-3">
    <Field label={locale === "en" ? "Search open invoice" : "Rechercher la facture ouverte"}>
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === "en" ? "Invoice number…" : "Numéro de facture…"} />
    </Field>
    <Field label={locale === "en" ? "Open invoice" : "Facture ouverte"}>
      <NativeSelect
        name="targetId"
        required
        disabled={loading}
        items={items.map((item) => ({ id: item.id, label: `${item.salesInvoice?.number || item.supplierInvoice?.number || item.id} · ${financeMoney(item.outstandingAmount, item.currencyCode, locale)}` }))}
      />
    </Field>
    {loading ? <p className="text-xs text-dtsc-muted">{locale === "en" ? "Loading…" : "Chargement…"}</p> : null}
    {error ? <p className="text-xs font-semibold text-red-700 dark:text-red-300">{error}</p> : null}
    {!loading && !error && items.length === 0 ? <p className="text-xs text-dtsc-muted">{locale === "en" ? "No compatible open balance found." : "Aucun solde ouvert compatible trouvé."}</p> : null}
  </div>;
}
