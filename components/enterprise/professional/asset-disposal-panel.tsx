"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArchiveRestore, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { financeDate, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { StatusBadge } from "@/components/workspace/status-badge";

type Disposal = {
  id: string;
  disposalDate?: string;
  grossValue?: string | number;
  accumulatedDepreciation?: string | number;
  netBookValue?: string | number;
  proceeds?: string | number;
  gainLoss?: string | number;
  currencyCode?: string;
  status?: string;
  journalEntryId?: string | null;
  revision?: number;
};
type Profile = {
  id: string;
  status?: string;
  currencyCode?: string;
  asset?: { id?: string; code?: string; name?: string } | null;
  disposals?: Disposal[];
  capabilities?: { canDispose?: boolean };
};
type Props = { organizationId: string; locale: FinanceLocale; canManage: boolean };

async function requestJson(url: string, fallback: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json().catch(() => null) as (Record<string, unknown> & { message?: string; error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.message || body?.error || fallback);
  return body;
}

export function AssetDisposalPanel({ organizationId, locale, canManage }: Props) {
  const en = locale === "en";
  const copy = useMemo(() => en ? {
    title: "Asset disposals",
    description: "Prepare and post asset disposals with audited derecognition of gross cost, accumulated depreciation, proceeds and gain or loss.",
    refresh: "Refresh",
    newDraft: "Prepare disposal",
    asset: "Asset",
    date: "Disposal date",
    proceeds: "Proceeds",
    currency: "Proceeds currency",
    reason: "Reason",
    saveDraft: "Create draft",
    post: "Post disposal",
    cancel: "Cancel",
    empty: "No asset disposal yet.",
    noneAvailable: "No active asset is currently eligible for disposal.",
    successDraft: "Disposal draft prepared.",
    successPost: "Asset disposal posted and future depreciation cancelled.",
    failure: "The asset disposal operation could not be completed.",
    gross: "Gross value",
    accumulated: "Accumulated depreciation",
    nbv: "Net book value",
    gainLoss: "Gain / loss",
    journal: "Journal entry",
  } : {
    title: "Cessions d’actifs",
    description: "Préparez puis comptabilisez les cessions avec sortie auditée de la valeur brute, des amortissements cumulés, du produit et du gain ou de la perte.",
    refresh: "Actualiser",
    newDraft: "Préparer une cession",
    asset: "Actif",
    date: "Date de cession",
    proceeds: "Produit de cession",
    currency: "Devise du produit",
    reason: "Motif",
    saveDraft: "Créer le brouillon",
    post: "Comptabiliser la cession",
    cancel: "Annuler",
    empty: "Aucune cession d’actif.",
    noneAvailable: "Aucun actif actif n’est actuellement éligible à la cession.",
    successDraft: "Brouillon de cession préparé.",
    successPost: "Cession comptabilisée et amortissements futurs annulés.",
    failure: "L’opération de cession n’a pas pu être terminée.",
    gross: "Valeur brute",
    accumulated: "Amortissements cumulés",
    nbv: "Valeur nette comptable",
    gainLoss: "Gain / perte",
    journal: "Écriture comptable",
  }, [en]);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().slice(0, 10));
  const [proceedsAmount, setProceedsAmount] = useState("0");
  const [proceedsCurrencyCode, setProceedsCurrencyCode] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const body = await requestJson(`/api/enterprise/${organizationId}/asset-accounting?page=1&pageSize=200`, copy.failure);
      const items = Array.isArray(body.items) ? body.items as Profile[] : [];
      setProfiles(items);
      const available = items.find((profile) => profile.capabilities?.canDispose);
      if (available) {
        setProfileId((current) => current || available.id);
        setProceedsCurrencyCode((current) => current || available.currencyCode || "USD");
      }
    } catch (loadError) {
      setError(safeFinanceError(loadError, copy.failure, locale));
    } finally { setLoading(false); }
  }, [copy.failure, locale, organizationId]);

  useEffect(() => { void load(); }, [load]);

  const availableProfiles = profiles.filter((profile) => profile.capabilities?.canDispose);
  const selectedProfile = profiles.find((profile) => profile.id === profileId);
  const rows = profiles.flatMap((profile) => (profile.disposals || []).map((disposal) => ({ profile, disposal }))).sort((a, b) => String(b.disposal.disposalDate || "").localeCompare(String(a.disposal.disposalDate || "")));

  function openForm() {
    const target = availableProfiles[0];
    if (!target) return;
    setProfileId(target.id);
    setProceedsCurrencyCode(target.currencyCode || "USD");
    setProceedsAmount("0");
    setReason("");
    setDisposalDate(new Date().toISOString().slice(0, 10));
    setFormOpen(true);
  }

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    if (!profileId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/enterprise/${organizationId}/asset-accounting/${profileId}/disposals`, copy.failure, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disposalDate, proceedsAmount, proceedsCurrencyCode, reason }),
      });
      setFormOpen(false); setNotice(copy.successDraft); await load();
    } catch (operationError) { setError(safeFinanceError(operationError, copy.failure, locale)); }
    finally { setBusy(false); }
  }

  async function postDisposal(profile: Profile, disposal: Disposal) {
    setBusy(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/enterprise/${organizationId}/asset-accounting/${profile.id}/disposals/${disposal.id}/post`, copy.failure, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: disposal.revision || 1 }),
      });
      setNotice(copy.successPost); await load();
    } catch (operationError) { setError(safeFinanceError(operationError, copy.failure, locale)); }
    finally { setBusy(false); }
  }

  return <div className="min-w-0 space-y-5">
    <div className="flex min-w-0 flex-col gap-3 border-b border-dtsc-border pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><div className="flex items-center gap-2"><ArchiveRestore className="h-5 w-5 text-dtsc-blue" /><h2 className="font-black text-dtsc-ink">{copy.title}</h2></div><p className="mt-1 max-w-4xl text-sm leading-6 text-dtsc-muted">{copy.description}</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading || busy}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{copy.refresh}</Button>{canManage && availableProfiles.length ? <Button onClick={openForm}><Plus className="h-4 w-4" />{copy.newDraft}</Button> : null}</div>
    </div>
    {error ? <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/20 dark:text-red-200">{error}</p> : null}
    {notice ? <p className="rounded-xl border border-dtsc-border bg-dtsc-soft p-3 text-sm font-bold text-dtsc-ink">{notice}</p> : null}
    {!loading && canManage && !availableProfiles.length ? <p className="rounded-xl border border-dtsc-border p-3 text-sm text-dtsc-muted">{copy.noneAvailable}</p> : null}

    {formOpen ? <form className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5" onSubmit={createDraft}>
      <h3 className="font-black text-dtsc-ink">{copy.newDraft}</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-bold text-dtsc-ink"><span>{copy.asset}</span><select className="h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-surface px-3" value={profileId} onChange={(event) => { const id = event.target.value; setProfileId(id); const profile = profiles.find((item) => item.id === id); if (profile?.currencyCode) setProceedsCurrencyCode(profile.currencyCode); }} disabled={busy}>{availableProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.asset?.code || profile.id} · {profile.asset?.name || ""}</option>)}</select></label>
        <label className="space-y-1 text-sm font-bold text-dtsc-ink"><span>{copy.date}</span><Input type="date" value={disposalDate} onChange={(event) => setDisposalDate(event.target.value)} required /></label>
        <label className="space-y-1 text-sm font-bold text-dtsc-ink"><span>{copy.proceeds}</span><Input type="number" min="0" step="0.01" value={proceedsAmount} onChange={(event) => setProceedsAmount(event.target.value)} required /></label>
        <label className="space-y-1 text-sm font-bold text-dtsc-ink"><span>{copy.currency}</span><Input value={proceedsCurrencyCode} maxLength={3} onChange={(event) => setProceedsCurrencyCode(event.target.value.toUpperCase())} required /></label>
        <label className="space-y-1 text-sm font-bold text-dtsc-ink md:col-span-2"><span>{copy.reason}</span><Input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} required /></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><Button type="submit" disabled={busy || !selectedProfile}>{copy.saveDraft}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setFormOpen(false)}>{copy.cancel}</Button></div>
    </form> : null}

    {loading ? <p className="py-10 text-center text-sm text-dtsc-muted">…</p> : rows.length === 0 ? <p className="border-y border-dashed border-dtsc-border py-10 text-center text-sm text-dtsc-muted">{copy.empty}</p> : <div className="divide-y divide-dtsc-border border-y border-dtsc-border">{rows.map(({ profile, disposal }) => {
      const status = disposal.status || "DRAFT";
      const currency = disposal.currencyCode || profile.currencyCode || "USD";
      return <article key={disposal.id} className="py-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-dtsc-ink">{profile.asset?.code || profile.id} · {profile.asset?.name || ""}</h3><StatusBadge tone={financeStatusTone(status)}>{financeStatusLabel(status, locale)}</StatusBadge></div><p className="mt-1 text-sm text-dtsc-muted">{financeDate(disposal.disposalDate, locale)} · {copy.proceeds}: {financeMoney(disposal.proceeds || 0, currency, locale)}</p><div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-dtsc-muted sm:grid-cols-2 lg:grid-cols-4"><span>{copy.gross}: {financeMoney(disposal.grossValue || 0, currency, locale)}</span><span>{copy.accumulated}: {financeMoney(disposal.accumulatedDepreciation || 0, currency, locale)}</span><span>{copy.nbv}: {financeMoney(disposal.netBookValue || 0, currency, locale)}</span><span>{copy.gainLoss}: {financeMoney(disposal.gainLoss || 0, currency, locale)}</span></div>{disposal.journalEntryId ? <p className="mt-1 text-xs font-bold text-dtsc-muted">{copy.journal}: {disposal.journalEntryId}</p> : null}</div>{status === "DRAFT" && canManage ? <Button size="sm" disabled={busy} onClick={() => void postDisposal(profile, disposal)}>{copy.post}</Button> : null}</div></article>;
    })}</div>}
  </div>;
}
