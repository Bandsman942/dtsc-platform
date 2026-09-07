"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Copy, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { FinanceAccountingReferenceSelect } from "@/components/enterprise/core-v2/finance-accounting-reference-select";
import { safeFinanceError } from "@/components/enterprise/professional/finance-professional-ui";
import { financeMutation } from "@/components/enterprise/professional/finance-professional-workspace-shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";

type JournalLineDraft = {
  key: string;
  ledgerAccountId: string;
  description: string;
  debit: string;
  credit: string;
  businessPartyId: string;
  projectId: string;
  departmentId: string;
  siteId: string;
  assetId: string;
  inventoryItemId: string;
  analyticReference: string;
  dimensionsOpen: boolean;
};

function freshLine(seed: number): JournalLineDraft {
  return {
    key: `${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 8)}`,
    ledgerAccountId: "",
    description: "",
    debit: "",
    credit: "",
    businessPartyId: "",
    projectId: "",
    departmentId: "",
    siteId: "",
    assetId: "",
    inventoryItemId: "",
    analyticReference: "",
    dimensionsOpen: false,
  };
}

function decimal(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyText(value: number, currency: string, locale: "fr" | "en") {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + (currency ? ` ${currency}` : "");
}

export function AccountingJournalWorkbench({
  open,
  organizationId,
  locale: rawLocale,
  onClose,
  onCreated,
}: {
  open: boolean;
  organizationId: string;
  locale?: string | null;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const locale: "fr" | "en" = rawLocale === "en" ? "en" : "fr";
  const en = locale === "en";
  const [journalId, setJournalId] = useState("");
  const [fiscalPeriodId, setFiscalPeriodId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [accountingDate, setAccountingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [documentDate, setDocumentDate] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<JournalLineDraft[]>(() => [freshLine(1), freshLine(2)]);
  const [busy, setBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  useToastMessage(successMessage, "success");
  useToastMessage(errorMessage, "error");

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, line) => sum + decimal(line.debit), 0);
    const credit = lines.reduce((sum, line) => sum + decimal(line.credit), 0);
    return { debit, credit, difference: debit - credit, balanced: debit > 0 && Math.abs(debit - credit) < 0.000001 };
  }, [lines]);

  function updateLine(key: string, patch: Partial<JournalLineDraft>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  function addLine() {
    setLines((current) => [...current, freshLine(current.length + 1)]);
  }

  function duplicateLine(line: JournalLineDraft) {
    setLines((current) => [...current, {
      ...freshLine(current.length + 1),
      description: line.description,
      debit: line.debit,
      credit: line.credit,
      analyticReference: line.analyticReference,
      dimensionsOpen: line.dimensionsOpen,
    }]);
  }

  function removeLine(key: string) {
    setLines((current) => current.length <= 2 ? current : current.filter((line) => line.key !== key));
  }

  function reset() {
    setJournalId("");
    setFiscalPeriodId("");
    setCurrencyCode("");
    setAccountingDate(new Date().toISOString().slice(0, 10));
    setDocumentDate("");
    setReference("");
    setDescription("");
    setLines([freshLine(1), freshLine(2)]);
    setErrorMessage("");
  }

  function close() {
    if (!busy) onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    if (!journalId || !fiscalPeriodId || !currencyCode || !accountingDate || !description.trim()) {
      setErrorMessage(en ? "Complete the journal header before saving." : "Complétez l’en-tête de l’écriture avant l’enregistrement.");
      return;
    }
    if (lines.length < 2 || lines.some((line) => !line.ledgerAccountId || (decimal(line.debit) <= 0 && decimal(line.credit) <= 0) || (decimal(line.debit) > 0 && decimal(line.credit) > 0))) {
      setErrorMessage(en ? "Each line needs an account and exactly one positive debit or credit." : "Chaque ligne doit avoir un compte et exactement un débit ou un crédit positif.");
      return;
    }
    if (!totals.balanced) {
      setErrorMessage(en ? "The journal entry must be balanced before saving." : "L’écriture doit être équilibrée avant l’enregistrement.");
      return;
    }

    setBusy(true);
    try {
      await financeMutation(`/api/enterprise/${organizationId}/journal-entries`, {
        journalId,
        fiscalPeriodId,
        accountingDate,
        documentDate: documentDate || undefined,
        reference: reference.trim() || undefined,
        description: description.trim(),
        idempotencyKey: `${organizationId}:manual-entry:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
        lines: lines.map((line) => ({
          ledgerAccountId: line.ledgerAccountId,
          description: line.description.trim() || undefined,
          debit: line.debit || "0",
          credit: line.credit || "0",
          transactionCurrencyCode: currencyCode,
          transactionAmount: String(Math.max(decimal(line.debit), decimal(line.credit))),
          businessPartyId: line.businessPartyId || undefined,
          projectId: line.projectId || undefined,
          departmentId: line.departmentId || undefined,
          siteId: line.siteId || undefined,
          assetId: line.assetId || undefined,
          inventoryItemId: line.inventoryItemId || undefined,
          analyticReference: line.analyticReference.trim() || undefined,
        })),
      });
      setSuccessMessage(en ? "Journal entry saved." : "Écriture comptable enregistrée.");
      reset();
      onCreated?.();
      onClose();
    } catch (error) {
      setErrorMessage(safeFinanceError(error, en ? "The journal entry could not be saved." : "L’écriture n’a pas pu être enregistrée.", locale));
    } finally {
      setBusy(false);
    }
  }

  const compactInput = "h-9 min-w-[7rem] rounded-lg px-2 text-xs tabular-nums";

  return (
    <Dialog
      open={open}
      onClose={close}
      presentation="editor"
      title={en ? "New journal entry" : "Nouvelle écriture comptable"}
      description={en ? "Enter a balanced multi-line journal entry. Analytical dimensions remain optional unless your accounting policy requires them." : "Saisissez une écriture multi-lignes équilibrée. Les dimensions analytiques restent facultatives sauf exigence de votre politique comptable."}
      className="h-[96dvh] max-w-[min(1480px,calc(100vw-1rem))]"
    >
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="grid shrink-0 gap-3 border-b border-dtsc-border bg-dtsc-page/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="journal" name="journalId" label={en ? "Journal" : "Journal"} locale={locale} required disabled={busy} onOptionChange={(option) => setJournalId(option?.id || "")} />
          <FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="fiscal-period" name="fiscalPeriodId" label={en ? "Fiscal period" : "Période"} locale={locale} required disabled={busy} status="OPEN" onOptionChange={(option) => setFiscalPeriodId(option?.id || "")} />
          <FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="currency" name="currencyCode" label={en ? "Currency" : "Devise"} locale={locale} required disabled={busy} onOptionChange={(option) => setCurrencyCode(option?.currency || option?.code || "")} />
          <label className="grid gap-2 text-sm font-bold text-dtsc-ink">{en ? "Accounting date" : "Date comptable"}<Input type="date" value={accountingDate} onChange={(event) => setAccountingDate(event.target.value)} required disabled={busy} /></label>
          <label className="grid gap-2 text-sm font-bold text-dtsc-ink">{en ? "Document date" : "Date du document"}<Input type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} disabled={busy} /></label>
          <label className="grid gap-2 text-sm font-bold text-dtsc-ink">{en ? "Reference" : "Référence"}<Input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} disabled={busy} /></label>
          <label className="grid gap-2 text-sm font-bold text-dtsc-ink sm:col-span-2">{en ? "Description" : "Libellé de l’écriture"}<Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} required disabled={busy} /></label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-2 sm:p-3">
          <div className="min-w-[980px] overflow-hidden rounded-xl border border-dtsc-border bg-dtsc-surface">
            <div className="sticky top-0 z-[2] grid grid-cols-[minmax(220px,1.5fr)_minmax(180px,1.2fr)_130px_130px_94px_88px] gap-2 border-b border-dtsc-border bg-dtsc-page/95 px-2 py-2 text-[11px] font-black uppercase tracking-[0.04em] text-dtsc-muted backdrop-blur">
              <span>{en ? "Account" : "Compte"}</span><span>{en ? "Line description" : "Libellé ligne"}</span><span className="text-right">{en ? "Debit" : "Débit"}</span><span className="text-right">{en ? "Credit" : "Crédit"}</span><span className="text-center">{en ? "Dimensions" : "Dimensions"}</span><span className="text-right">{en ? "Actions" : "Actions"}</span>
            </div>
            <div className="divide-y divide-dtsc-border/70">
              {lines.map((line, index) => (
                <div key={line.key} className="bg-dtsc-surface odd:bg-transparent even:bg-dtsc-soft/20">
                  <div className="grid grid-cols-[minmax(220px,1.5fr)_minmax(180px,1.2fr)_130px_130px_94px_88px] items-start gap-2 px-2 py-2">
                    <FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="ledger-account" name={`lines.${index}.ledgerAccountId`} label={en ? `Account ${index + 1}` : `Compte ${index + 1}`} locale={locale} required directPosting disabled={busy} compact onOptionChange={(option) => updateLine(line.key, { ledgerAccountId: option?.id || "" })} />
                    <Input value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} maxLength={500} disabled={busy} className="h-9 min-w-[11rem] px-2 text-xs" aria-label={en ? `Line ${index + 1} description` : `Libellé ligne ${index + 1}`} />
                    <Input inputMode="decimal" value={line.debit} onChange={(event) => updateLine(line.key, { debit: event.target.value, ...(decimal(event.target.value) > 0 ? { credit: "" } : {}) })} disabled={busy} className={compactInput} aria-label={`${en ? "Debit" : "Débit"} ${index + 1}`} />
                    <Input inputMode="decimal" value={line.credit} onChange={(event) => updateLine(line.key, { credit: event.target.value, ...(decimal(event.target.value) > 0 ? { debit: "" } : {}) })} disabled={busy} className={compactInput} aria-label={`${en ? "Credit" : "Crédit"} ${index + 1}`} />
                    <Button type="button" variant="ghost" size="sm" disabled={busy} className="h-9 px-2 text-xs" onClick={() => updateLine(line.key, { dimensionsOpen: !line.dimensionsOpen })} aria-expanded={line.dimensionsOpen}><SlidersHorizontal className="mr-1 h-3.5 w-3.5" />{line.dimensionsOpen ? (en ? "Hide" : "Masquer") : (en ? "Open" : "Ouvrir")}</Button>
                    <div className="flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="icon" disabled={busy} className="h-9 w-9" onClick={() => duplicateLine(line)} aria-label={en ? `Duplicate line ${index + 1}` : `Dupliquer la ligne ${index + 1}`}><Copy className="h-3.5 w-3.5" /></Button>
                      <Button type="button" variant="ghost" size="icon" disabled={busy || lines.length <= 2} className="h-9 w-9" onClick={() => removeLine(line.key)} aria-label={en ? `Delete line ${index + 1}` : `Supprimer la ligne ${index + 1}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  {line.dimensionsOpen ? (
                    <div className="grid gap-2 border-t border-dashed border-dtsc-border bg-dtsc-page/40 px-2 py-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                      <FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="business-party" name={`lines.${index}.businessPartyId`} label={en ? "Party" : "Tiers"} locale={locale} disabled={busy} compact onOptionChange={(option) => updateLine(line.key, { businessPartyId: option?.id || "" })} />
                      <FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="project" name={`lines.${index}.projectId`} label={en ? "Project" : "Projet"} locale={locale} disabled={busy} compact onOptionChange={(option) => updateLine(line.key, { projectId: option?.id || "" })} />
                      <FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="department" name={`lines.${index}.departmentId`} label={en ? "Department" : "Département"} locale={locale} disabled={busy} compact onOptionChange={(option) => updateLine(line.key, { departmentId: option?.id || "" })} />
                      <FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="site" name={`lines.${index}.siteId`} label={en ? "Site" : "Site"} locale={locale} disabled={busy} compact onOptionChange={(option) => updateLine(line.key, { siteId: option?.id || "" })} />
                      <FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="asset" name={`lines.${index}.assetId`} label={en ? "Asset" : "Actif"} locale={locale} disabled={busy} compact onOptionChange={(option) => updateLine(line.key, { assetId: option?.id || "" })} />
                      <FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="inventory-item" name={`lines.${index}.inventoryItemId`} label={en ? "Inventory item" : "Article de stock"} locale={locale} disabled={busy} compact onOptionChange={(option) => updateLine(line.key, { inventoryItemId: option?.id || "" })} />
                      <label className="grid gap-1 text-xs font-bold text-dtsc-ink sm:col-span-2 lg:col-span-3 xl:col-span-6">{en ? "Analytical reference" : "Référence analytique"}<Input value={line.analyticReference} onChange={(event) => updateLine(line.key, { analyticReference: event.target.value })} maxLength={160} disabled={busy} className="h-9 px-2 text-xs" /></label>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={addLine} className="mt-3"><Plus className="mr-1.5 h-4 w-4" />{en ? "Add line" : "Ajouter une ligne"}</Button>
        </div>

        <div className="sticky bottom-0 z-[3] grid shrink-0 gap-3 border-t-2 border-dtsc-border bg-dtsc-page px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-xs font-bold tabular-nums sm:text-sm">
            <span>{en ? "Debit" : "Débit"}: <strong>{moneyText(totals.debit, currencyCode, locale)}</strong></span>
            <span>{en ? "Credit" : "Crédit"}: <strong>{moneyText(totals.credit, currencyCode, locale)}</strong></span>
            <span className={totals.balanced ? "inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>{totals.balanced ? <CheckCircle2 className="h-4 w-4" /> : null}{totals.balanced ? (en ? "Balanced" : "Équilibrée") : `${en ? "Difference" : "Écart"}: ${moneyText(Math.abs(totals.difference), currencyCode, locale)}`}</span>
          </div>
          <div className="flex justify-end gap-2 pb-[max(0rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="secondary" disabled={busy} onClick={close}>{en ? "Cancel" : "Annuler"}</Button>
            <Button type="submit" disabled={busy || !totals.balanced}>{busy ? (en ? "Saving…" : "Enregistrement…") : (en ? "Save entry" : "Enregistrer l’écriture")}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
