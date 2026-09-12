"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/workspace/status-badge";
import { financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";

type Item = Record<string, unknown> & { id: string };
type TemplateLine = {
  ledgerAccountId: string;
  side: "DEBIT" | "CREDIT";
  allocationPercent: string;
  description: string;
};
type PeriodicTemplate = Item & {
  code?: string;
  version?: number;
  nameFr?: string;
  nameEn?: string;
  operationType?: string;
  cadence?: string;
  journalId?: string;
  defaultAmount?: string | number;
  currencyCode?: string;
  autoReverse?: boolean;
  status?: string;
  revision?: number;
  startDate?: string;
  endDate?: string | null;
  lines?: Array<Item & { ledgerAccountId?: string; side?: string; allocationPercent?: string | number; description?: string | null }>;
  executions?: Array<Item & { accountingDate?: string; journalEntryId?: string | null; reversalEntryId?: string | null; status?: string }>;
};

type Props = {
  organizationId: string;
  locale: FinanceLocale;
  canCreate: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canManage: boolean;
};

const blankLines = (): TemplateLine[] => [
  { ledgerAccountId: "", side: "DEBIT", allocationPercent: "100", description: "" },
  { ledgerAccountId: "", side: "CREDIT", allocationPercent: "100", description: "" },
];

async function requestJson(url: string, fallback: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json().catch(() => null) as (Record<string, unknown> & { message?: string; error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.message || body?.error || fallback);
  return body;
}

function isoDate(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function PeriodicAccountingPanel({ organizationId, locale, canCreate, canSubmit, canApprove, canManage }: Props) {
  const en = locale === "en";
  const [templates, setTemplates] = useState<PeriodicTemplate[]>([]);
  const [journals, setJournals] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [versionSource, setVersionSource] = useState<PeriodicTemplate | null>(null);
  const [executionDates, setExecutionDates] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    code: "",
    nameFr: "",
    nameEn: "",
    operationType: "RECURRING",
    journalId: "",
    cadence: "MONTHLY",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    defaultAmount: "",
    currencyCode: "USD",
    autoReverse: false,
    lines: blankLines(),
  });

  const copy = useMemo(() => en ? {
    title: "Periodic accounting",
    description: "Configure recurring entries, accruals, deferrals and allocation rules without creating a second ledger.",
    create: "New template",
    refresh: "Refresh",
    empty: "No periodic accounting template yet.",
    submit: "Submit",
    approve: "Approve",
    deactivate: "Deactivate",
    execute: "Execute",
    version: "New version",
    save: "Save",
    cancel: "Cancel",
    addLine: "Add line",
    remove: "Remove line",
    debit: "Debit",
    credit: "Credit",
    account: "Ledger account",
    percent: "Allocation %",
    date: "Accounting date",
    autoReverse: "Automatically reverse in the next open period",
    success: "Accounting operation completed.",
    failure: "The periodic accounting operation could not be completed.",
  } : {
    title: "Comptabilité périodique",
    description: "Configurez les écritures récurrentes, accruals, étalements et allocations sans créer un second grand livre.",
    create: "Nouveau modèle",
    refresh: "Actualiser",
    empty: "Aucun modèle comptable périodique.",
    submit: "Soumettre",
    approve: "Approuver",
    deactivate: "Désactiver",
    execute: "Exécuter",
    version: "Nouvelle version",
    save: "Enregistrer",
    cancel: "Annuler",
    addLine: "Ajouter une ligne",
    remove: "Retirer la ligne",
    debit: "Débit",
    credit: "Crédit",
    account: "Compte comptable",
    percent: "Allocation %",
    date: "Date comptable",
    autoReverse: "Contrepasser automatiquement dans la prochaine période ouverte",
    success: "Opération comptable terminée.",
    failure: "L’opération comptable périodique n’a pas pu être terminée.",
  }, [en]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const base = `/api/enterprise/${organizationId}`;
      const [templateBody, journalBody, accountBody] = await Promise.all([
        requestJson(`${base}/periodic-accounting?page=1&pageSize=100`, copy.failure),
        requestJson(`${base}/journals?page=1&pageSize=100`, copy.failure),
        requestJson(`${base}/ledger-accounts?page=1&pageSize=500`, copy.failure),
      ]);
      setTemplates(Array.isArray(templateBody.items) ? templateBody.items as PeriodicTemplate[] : []);
      setJournals(Array.isArray(journalBody.items) ? journalBody.items as Item[] : []);
      setAccounts(Array.isArray(accountBody.items) ? accountBody.items as Item[] : []);
    } catch (loadError) {
      setError(safeFinanceError(loadError, copy.failure, locale));
    } finally {
      setLoading(false);
    }
  }, [copy.failure, locale, organizationId]);

  useEffect(() => { void load(); }, [load]);

  function resetForm(source?: PeriodicTemplate) {
    setVersionSource(source || null);
    setForm({
      code: source?.code || "",
      nameFr: source?.nameFr || "",
      nameEn: source?.nameEn || "",
      operationType: source?.operationType || "RECURRING",
      journalId: source?.journalId || "",
      cadence: source?.cadence || "MONTHLY",
      startDate: isoDate(source?.startDate) || new Date().toISOString().slice(0, 10),
      endDate: isoDate(source?.endDate),
      defaultAmount: source?.defaultAmount === undefined ? "" : String(source.defaultAmount),
      currencyCode: source?.currencyCode || "USD",
      autoReverse: Boolean(source?.autoReverse),
      lines: source?.lines?.length ? source.lines.map((line) => ({
        ledgerAccountId: String(line.ledgerAccountId || ""),
        side: line.side === "CREDIT" ? "CREDIT" : "DEBIT",
        allocationPercent: String(line.allocationPercent || ""),
        description: String(line.description || ""),
      })) : blankLines(),
    });
    setFormOpen(true);
  }

  function updateLine(index: number, key: keyof TemplateLine, value: string) {
    setForm((current) => ({ ...current, lines: current.lines.map((line, position) => position === index ? { ...line, [key]: value } : line) }));
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const body = {
        ...(versionSource ? {} : { code: form.code }),
        nameFr: form.nameFr,
        nameEn: form.nameEn,
        operationType: form.operationType,
        journalId: form.journalId,
        cadence: form.cadence,
        startDate: form.startDate,
        endDate: form.endDate || null,
        defaultAmount: Number(form.defaultAmount),
        currencyCode: form.currencyCode,
        autoReverse: form.autoReverse,
        lines: form.lines.map((line) => ({ ...line, allocationPercent: Number(line.allocationPercent), description: line.description || null })),
      };
      const endpoint = versionSource
        ? `/api/enterprise/${organizationId}/periodic-accounting/${versionSource.id}/versions`
        : `/api/enterprise/${organizationId}/periodic-accounting`;
      await requestJson(endpoint, copy.failure, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      setFormOpen(false); setVersionSource(null); setNotice(copy.success); await load();
    } catch (saveError) {
      setError(safeFinanceError(saveError, copy.failure, locale));
    } finally { setBusy(false); }
  }

  async function transition(template: PeriodicTemplate, action: "SUBMIT" | "APPROVE" | "DEACTIVATE") {
    setBusy(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/enterprise/${organizationId}/periodic-accounting/${template.id}/transition`, copy.failure, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, revision: template.revision }) });
      setNotice(copy.success); await load();
    } catch (transitionError) {
      setError(safeFinanceError(transitionError, copy.failure, locale));
    } finally { setBusy(false); }
  }

  async function execute(template: PeriodicTemplate) {
    const date = executionDates[template.id] || new Date().toISOString().slice(0, 10);
    setBusy(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/enterprise/${organizationId}/periodic-accounting/${template.id}/execute`, copy.failure, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountingDate: date }) });
      setNotice(copy.success); await load();
    } catch (executionError) {
      setError(safeFinanceError(executionError, copy.failure, locale));
    } finally { setBusy(false); }
  }

  return <div className="min-w-0 space-y-5">
    <div className="flex min-w-0 flex-col gap-3 border-b border-dtsc-border pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-dtsc-blue" /><h2 className="font-black text-dtsc-ink">{copy.title}</h2></div><p className="mt-1 max-w-3xl text-sm leading-6 text-dtsc-muted">{copy.description}</p></div>
      <div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading || busy}><RefreshCw className="h-4 w-4" />{copy.refresh}</Button>{canCreate ? <Button onClick={() => resetForm()}><Plus className="h-4 w-4" />{copy.create}</Button> : null}</div>
    </div>
    {error ? <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {notice ? <p className="rounded-xl border border-dtsc-border bg-dtsc-soft p-3 text-sm font-bold text-dtsc-ink">{notice}</p> : null}
    {loading ? <p className="py-10 text-center text-sm text-dtsc-muted">…</p> : templates.length === 0 ? <p className="border-y border-dashed border-dtsc-border py-10 text-center text-sm text-dtsc-muted">{copy.empty}</p> : (
      <div className="divide-y divide-dtsc-border border-y border-dtsc-border">{templates.map((template) => {
        const status = String(template.status || "DRAFT");
        const name = en ? template.nameEn || template.nameFr : template.nameFr || template.nameEn;
        const executionDate = executionDates[template.id] || new Date().toISOString().slice(0, 10);
        return <article key={template.id} className="min-w-0 py-4">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-dtsc-ink">{template.code} · v{template.version} · {name}</h3><StatusBadge tone={financeStatusTone(status)}>{financeStatusLabel(status, locale)}</StatusBadge></div><p className="mt-1 text-sm text-dtsc-muted">{template.operationType} · {template.cadence} · {financeMoney(template.defaultAmount || 0, template.currencyCode || "USD", locale)}{template.autoReverse ? ` · ${en ? "auto-reversal" : "contrepassation auto"}` : ""}</p><p className="mt-1 text-xs text-dtsc-muted">{template.lines?.length || 0} {en ? "lines" : "lignes"} · {template.executions?.length || 0} {en ? "recent executions" : "exécutions récentes"}</p></div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {status === "DRAFT" && canSubmit ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void transition(template, "SUBMIT")}>{copy.submit}</Button> : null}
              {status === "PENDING_APPROVAL" && canApprove ? <Button size="sm" disabled={busy} onClick={() => void transition(template, "APPROVE")}>{copy.approve}</Button> : null}
              {status === "ACTIVE" && canManage ? <><Input type="date" className="w-40" aria-label={copy.date} value={executionDate} onChange={(event) => setExecutionDates((current) => ({ ...current, [template.id]: event.target.value }))} /><Button size="sm" disabled={busy} onClick={() => void execute(template)}>{copy.execute}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => resetForm(template)}>{copy.version}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void transition(template, "DEACTIVATE")}>{copy.deactivate}</Button></> : null}
              {["INACTIVE", "SUPERSEDED"].includes(status) && canCreate ? <Button size="sm" variant="outline" disabled={busy} onClick={() => resetForm(template)}>{copy.version}</Button> : null}
            </div>
          </div>
        </article>;
      })}</div>
    )}

    <Dialog open={formOpen} title={versionSource ? `${copy.version} · ${versionSource.code}` : copy.create} description={copy.description} onClose={() => { setFormOpen(false); setVersionSource(null); }} className="h-[94dvh] sm:max-w-5xl" footer={<><Button type="button" variant="outline" onClick={() => { setFormOpen(false); setVersionSource(null); }}>{copy.cancel}</Button><Button type="submit" form="periodic-accounting-form" disabled={busy}><Save className="h-4 w-4" />{copy.save}</Button></>}>
      <form id="periodic-accounting-form" onSubmit={saveTemplate} className="min-w-0 space-y-5">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!versionSource ? <label className="text-sm font-bold text-dtsc-ink">Code<Input required value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} /></label> : null}
          <label className="text-sm font-bold text-dtsc-ink">Nom FR<Input required value={form.nameFr} onChange={(event) => setForm((current) => ({ ...current, nameFr: event.target.value }))} /></label>
          <label className="text-sm font-bold text-dtsc-ink">Name EN<Input required value={form.nameEn} onChange={(event) => setForm((current) => ({ ...current, nameEn: event.target.value }))} /></label>
          <label className="text-sm font-bold text-dtsc-ink">Type<select className="mt-2 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3" value={form.operationType} onChange={(event) => setForm((current) => ({ ...current, operationType: event.target.value }))}>{["RECURRING", "ACCRUAL", "DEFERRAL", "ALLOCATION"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-sm font-bold text-dtsc-ink">{en ? "Journal" : "Journal"}<select required className="mt-2 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3" value={form.journalId} onChange={(event) => setForm((current) => ({ ...current, journalId: event.target.value }))}><option value="">—</option>{journals.map((journal) => <option key={journal.id} value={journal.id}>{String(journal.code || journal.id)} · {String((en ? journal.nameEn : journal.nameFr) || journal.nameFr || journal.nameEn || "")}</option>)}</select></label>
          <label className="text-sm font-bold text-dtsc-ink">Cadence<select className="mt-2 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3" value={form.cadence} onChange={(event) => setForm((current) => ({ ...current, cadence: event.target.value }))}>{["MONTHLY", "QUARTERLY", "YEARLY", "MANUAL"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-sm font-bold text-dtsc-ink">{en ? "Start date" : "Début"}<Input required type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></label>
          <label className="text-sm font-bold text-dtsc-ink">{en ? "End date" : "Fin"}<Input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></label>
          <label className="text-sm font-bold text-dtsc-ink">{en ? "Amount" : "Montant"}<Input required inputMode="decimal" value={form.defaultAmount} onChange={(event) => setForm((current) => ({ ...current, defaultAmount: event.target.value }))} /></label>
          <label className="text-sm font-bold text-dtsc-ink">{en ? "Currency" : "Devise"}<Input required maxLength={3} value={form.currencyCode} onChange={(event) => setForm((current) => ({ ...current, currencyCode: event.target.value.toUpperCase() }))} /></label>
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-dtsc-border p-3 text-sm font-bold text-dtsc-ink"><input type="checkbox" className="mt-1" checked={form.autoReverse} onChange={(event) => setForm((current) => ({ ...current, autoReverse: event.target.checked }))} /><span>{copy.autoReverse}</span></label>
        <div className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="font-black text-dtsc-ink">{en ? "Posting lines" : "Lignes de comptabilisation"}</h3><Button type="button" size="sm" variant="outline" onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, { ledgerAccountId: "", side: "DEBIT", allocationPercent: "", description: "" }] }))}><Plus className="h-4 w-4" />{copy.addLine}</Button></div>{form.lines.map((line, index) => <div key={index} className="grid min-w-0 gap-3 rounded-xl border border-dtsc-border p-3 sm:grid-cols-[1fr_9rem_9rem_auto] sm:items-end"><label className="text-sm font-bold text-dtsc-ink">{copy.account}<select required className="mt-2 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3" value={line.ledgerAccountId} onChange={(event) => updateLine(index, "ledgerAccountId", event.target.value)}><option value="">—</option>{accounts.map((account) => <option key={account.id} value={account.id}>{String(account.code || account.id)} · {String((en ? account.nameEn : account.nameFr) || account.nameFr || account.nameEn || "")}</option>)}</select></label><label className="text-sm font-bold text-dtsc-ink">{en ? "Side" : "Sens"}<select className="mt-2 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3" value={line.side} onChange={(event) => updateLine(index, "side", event.target.value)}><option value="DEBIT">{copy.debit}</option><option value="CREDIT">{copy.credit}</option></select></label><label className="text-sm font-bold text-dtsc-ink">{copy.percent}<Input required inputMode="decimal" value={line.allocationPercent} onChange={(event) => updateLine(index, "allocationPercent", event.target.value)} /></label><Button type="button" size="icon" variant="ghost" title={copy.remove} aria-label={copy.remove} disabled={form.lines.length <= 2} onClick={() => setForm((current) => ({ ...current, lines: current.lines.filter((_, position) => position !== index) }))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
      </form>
    </Dialog>
  </div>;
}
