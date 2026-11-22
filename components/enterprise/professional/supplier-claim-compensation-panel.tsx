"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { financeMutation } from "@/components/enterprise/professional/finance-professional-workspace-shared";
import { financeMoney, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/workspace/status-badge";

type Claim = {
  id: string; reference: string; invoiceReference: string; businessPartyId: string;
  currencyCode: string; creditDate: string; available: string; remaining: string;
};
type Payable = {
  id: string; currencyCode: string; outstandingAmount: string; payableAllocatableAmount?: string;
  supplierInvoice: { number: string };
};
type Compensation = {
  id: string; claimId: string; payableId: string; targetInvoiceNumber: string;
  amount: string; currencyCode: string; supplierReference: string; reason: string;
  status: string; revision: number; submittedAt?: string | null; postedAt?: string | null; approverUserId?: string | null;
  postingJournalEntryId?: string | null; reversalJournalEntryId?: string | null;
  reversedAt?: string | null; reversalReason?: string | null; reservationActive: boolean;
  requestedByName?: string | null; approverName?: string | null; postedByName?: string | null; reversedByName?: string | null;
};
type Preview = {
  maximum: string; targetReserved: string; targetAvailable: string;
  plan?: { amount: string; payableAfter: string; targetUnreservedAfter: string; unreservedClaimAfter: string; treasuryImpact: string; accountingDate: string };
};
type Props = {
  organizationId: string; claim: Claim; locale: FinanceLocale; businessDate?: string;
  canWrite: boolean; canSubmit: boolean; canApprove: boolean; canManage: boolean;
  onMutated?: () => void;
};
const labels = (locale: FinanceLocale, fr: string, en: string) => locale === "en" ? en : fr;

export function SupplierClaimCompensationPanel({
  organizationId, claim, locale, businessDate, canWrite, canSubmit, canApprove, canManage, onMutated,
}: Props) {
  const t = useCallback((fr: string, en: string) => labels(locale, fr, en), [locale]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [pageCount, setPageCount] = useState(1);
  const [payablesLoading, setPayablesLoading] = useState(false);
  const [history, setHistory] = useState<Compensation[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageCount, setHistoryPageCount] = useState(1);
  const [historyStatus, setHistoryStatus] = useState("ALL");
  const [refresh, setRefresh] = useState(0);
  const [selectedPayableId, setSelectedPayableId] = useState("");
  const [amount, setAmount] = useState("");
  const [accountingDate, setAccountingDate] = useState(businessDate || "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  // A panel instance may outlive a claim/tenant switch. Never retain another
  // claim's debts, accounting preview or idempotency key after that switch.
  useEffect(() => {
    setQuery("");
    setPage(1);
    setPayables([]);
    setPageCount(1);
    setHistory([]);
    setHistoryPage(1);
    setHistoryPageCount(1);
    setHistoryStatus("ALL");
    setSelectedPayableId("");
    setAmount("");
    setAccountingDate(businessDate || "");
    setPreview(null);
    setPreviewKey("");
    setError("");
    setMessage("");
    setIdempotencyKey(crypto.randomUUID());
  }, [organizationId, claim.id, businessDate]);

  useEffect(() => {
    const controller = new AbortController();
    setPayablesLoading(true);
    const params = new URLSearchParams({
      status: "OPEN", businessPartyId: claim.businessPartyId, currencyCode: claim.currencyCode,
      page: String(page), pageSize: "25", ...(query.trim() ? { search: query.trim() } : {}),
    });
    void fetch("/api/enterprise/" + encodeURIComponent(organizationId) + "/payables?" + params, {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw Error("PAYABLES_READ_FAILED");
      return response.json() as Promise<{ items?: Payable[]; pagination?: { pageCount?: number } }>;
    }).then(data => {
      if (!controller.signal.aborted) {
        setPayables((data.items || []).filter(item =>
          item.currencyCode === claim.currencyCode && item.supplierInvoice?.number));
        setPageCount(Math.max(1, data.pagination?.pageCount || 1));
      }
    }).catch(() => { if (!controller.signal.aborted) setError(t(
      "Lecture des dettes indisponible. Vérifiez vos droits et réessayez.",
      "Payables are unavailable. Check access and try again.")); })
      .finally(() => { if (!controller.signal.aborted) setPayablesLoading(false); });
    return () => controller.abort();
  }, [organizationId, claim.businessPartyId, claim.currencyCode, query, page, refresh, locale, t]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ claimCompensationsFor: claim.id, page: String(historyPage),
      ...(historyStatus !== "ALL" ? { compensationStatus: historyStatus } : {}) });
    void fetch("/api/enterprise/" + encodeURIComponent(organizationId) + "/payables?" + params, {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw Error("CLAIM_COMPENSATION_HISTORY_FAILED");
      return response.json() as Promise<{ items?: Compensation[]; pagination?: { pageCount?: number } }>;
    }).then(data => {
      if (!controller.signal.aborted) {
        setHistory(data.items || []);
        setHistoryPageCount(Math.max(1, data.pagination?.pageCount || 1));
      }
    }).catch(() => { if (!controller.signal.aborted) setError(t(
      "Historique des compensations indisponible. Actualisez le dossier.",
      "Compensation history unavailable. Refresh the claim.")); });
    return () => controller.abort();
  }, [organizationId, claim.id, historyPage, historyStatus, refresh, locale, t]);

  function resetPreview() { setPreview(null); setPreviewKey(""); }
  const currentKey = [selectedPayableId, amount, accountingDate].join("|");

  async function runPreflight() {
    if (!selectedPayableId || !amount || !accountingDate) return;
    setBusy(true); setError(""); setMessage(""); resetPreview();
    try {
      const params = new URLSearchParams({
        supplierReturnClaimId: claim.id, compensationPayableId: selectedPayableId,
        compensationAmount: amount, compensationDate: accountingDate,
      });
      const response = await fetch("/api/enterprise/" + encodeURIComponent(organizationId) + "/payments?" + params, { cache: "no-store" });
      const data = await response.json() as { claim?: { compensation?: Preview }; message?: string };
      if (!response.ok || !data.claim?.compensation?.plan) throw Error(data.message || "COMPENSATION_PREFLIGHT_FAILED");
      setPreview(data.claim.compensation); setPreviewKey(currentKey);
    } catch {
      setError(t("Ce montant, cette date ou cette dette n'est pas éligible. Rechargez les soldes et vérifiez la période comptable.",
        "This amount, date or payable is not eligible. Refresh balances and check the accounting period."));
    } finally { setBusy(false); }
  }

  async function mutate(data: Record<string, unknown>, successFr: string, successEn: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await financeMutation("/api/enterprise/" + encodeURIComponent(organizationId) + "/payables", data);
      if (!result?.compensation) throw Error("COMPENSATION_RESPONSE_INVALID");
      setMessage(t(successFr, successEn));
      setRefresh(v => v + 1); resetPreview(); onMutated?.();
      return true;
    } catch (failure) {
      setError(safeFinanceError(failure, t("Opération de compensation refusée. Actualisez les soldes et les droits.",
        "Compensation operation declined. Refresh balances and permissions."), locale));
      return false;
    } finally { setBusy(false); }
  }

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || !preview?.plan || previewKey !== currentKey || busy) return;
    const form = new FormData(event.currentTarget);
    const ok = await mutate({
      action: "PREPARE_COMPENSATION", claimId: claim.id, payableId: selectedPayableId,
      amount, accountingDate, supplierReference: String(form.get("supplierReference") || ""),
      reason: String(form.get("reason") || ""), idempotencyKey,
    }, "Brouillon sans réservation créé. Soumettez-le à un validateur indépendant.",
       "Unreserved draft created. Submit it to an independent approver.");
    if (ok) setIdempotencyKey(crypto.randomUUID());
  }

  async function transition(event: FormEvent<HTMLFormElement>, compensation: Compensation, action: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate({
      action, compensationId: compensation.id, revision: compensation.revision,
      ...(action === "SUBMIT_COMPENSATION" ? { approverUserId: String(form.get("approverUserId") || "") } : {}),
      ...(["REJECT_COMPENSATION", "CANCEL_COMPENSATION_DRAFT", "REVERSE_COMPENSATION"].includes(action)
        ? { reason: String(form.get("reason") || "") } : {}),
      ...(action === "REVERSE_COMPENSATION"
        ? { accountingDate: String(form.get("accountingDate") || "") } : {}),
    }, "Action enregistrée. La capacité a été recalculée.",
       "Action recorded. Available capacity has been recalculated.");
  }

  const money = (value: string) => financeMoney(value, claim.currencyCode, locale);

  return <section className="grid min-w-0 gap-3 rounded-xl border border-dtsc-border p-3" data-supplier-claim-compensation>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="font-semibold text-dtsc-ink">{t("Compensation de créance fournisseur", "Offset supplier claim against a payable")}</h3>
        <p className="text-xs leading-5 text-dtsc-muted">{t(
          "Sans banque : une dette envers le même fournisseur est réduite en contrepartie de votre créance. La préparation ne réserve rien.",
          "No bank transfer: a debt owed to the same supplier is offset against its claim. Drafting reserves nothing.")}</p>
      </div>
      <StatusBadge tone="warning">{t("Validation indépendante", "Independent approval")}</StatusBadge>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg bg-dtsc-page p-2 text-sm">
        <p className="text-xs text-dtsc-muted">{t("Créance disponible", "Available claim")}</p>
        <p className="font-semibold">{money(claim.available)}</p>
      </div>
      <div className="rounded-lg bg-dtsc-page p-2 text-sm">
        <p className="text-xs text-dtsc-muted">{t("Devise du rapprochement", "Settlement currency")}</p>
        <p className="font-semibold">{claim.currencyCode}</p>
      </div>
    </div>

    {error ? <p role="alert" className="break-words text-sm font-medium text-red-600">{error}</p> : null}
    {message ? <p role="status" className="break-words text-sm font-medium text-emerald-700 dark:text-emerald-300">{message}</p> : null}

    {canWrite && Number(claim.available) > 0 ? <form onSubmit={prepare} className="grid min-w-0 gap-3 rounded-lg border border-dtsc-border p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t("Rechercher une facture cible", "Search target invoice")}>
          <Input value={query} onChange={event => { setQuery(event.target.value); setPage(1); setSelectedPayableId(""); resetPreview(); }}
            disabled={busy} placeholder={t("Numéro de facture…", "Invoice number…")} />
        </Field>
        <Field label={t("Dette fournisseur à compenser", "Target supplier payable")} required>
          <NativeSelect value={selectedPayableId} disabled={busy || payablesLoading}
            onChange={value => { setSelectedPayableId(value); resetPreview(); }}
            items={[{id:"",label:payablesLoading?t("Chargement…","Loading…"):t("Choisir une dette ouverte","Choose an open payable")},
              ...payables.map(item=>({id:item.id,label:item.supplierInvoice.number + " · " +
                money(item.payableAllocatableAmount || item.outstandingAmount)}))]} />
        </Field>
        <Field label={t("Montant à compenser", "Amount to offset")} required>
          <Input type="text" inputMode="decimal" pattern="[0-9]{1,14}(\.[0-9]{1,6})?"
            value={amount} onChange={event => { setAmount(event.target.value); resetPreview(); }}
            placeholder="0.000000" required disabled={busy} />
        </Field>
        <Field label={t("Date comptable", "Accounting date")} required>
          <Input type="date" value={accountingDate} min={claim.creditDate.slice(0,10)}
            max={businessDate || undefined} onChange={event => { setAccountingDate(event.target.value); resetPreview(); }}
            required disabled={busy} />
        </Field>
        <Field label={t("Référence justificative fournisseur", "Supplier document reference")} required>
          <Input name="supplierReference" maxLength={200} required disabled={busy} />
        </Field>
        <Field label={t("Motif détaillé", "Detailed reason")} required>
          <Input name="reason" minLength={8} maxLength={1000} required disabled={busy} />
        </Field>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" disabled={busy || !selectedPayableId || !amount || !accountingDate}
            onClick={() => void runPreflight()}>{t("Vérifier les comptes et la période", "Verify accounts and period")}</Button>
          {pageCount > 1 ? <>
            <Button type="button" size="sm" variant="outline" disabled={busy || page === 1} onClick={() => setPage(v => Math.max(1,v-1))}>{t("Préc.", "Previous")}</Button>
            <span className="text-xs text-dtsc-muted">{page}/{pageCount}</span>
            <Button type="button" size="sm" variant="outline" disabled={busy || page >= pageCount} onClick={() => setPage(v => v+1)}>{t("Suiv.", "Next")}</Button>
          </> : null}
        </div>
        <Button type="submit" disabled={busy || !preview?.plan || previewKey !== currentKey}>{t("Créer le brouillon", "Create draft")}</Button>
      </div>
      {preview?.plan && previewKey === currentKey ? <div className="grid gap-2 rounded-lg border border-dtsc-border p-3 text-sm sm:grid-cols-2">
        <p>{t("Dette après compensation","Payable after offset")} : <strong>{money(preview.plan.payableAfter)}</strong></p>
        <p>{t("Créance non réservée après compensation","Available claim after offset")} : <strong>{money(preview.plan.unreservedClaimAfter)}</strong></p>
        <p>{t("Dette disponible après réservation","Payable still allocatable after reservation")} : <strong>{money(preview.plan.targetUnreservedAfter)}</strong></p>
        <p>{t("Impact en trésorerie","Cash impact")} : <strong>{money(preview.plan.treasuryImpact)}</strong></p>
        <p className="text-dtsc-muted">{t("Aucune écriture avant validation et comptabilisation","No posting before approval and final execution")}</p>
      </div> : null}
    </form> : null}

    <div className="grid min-w-0 gap-2">
      <h4 className="font-semibold">{t("Demandes de compensation", "Compensation requests")}</h4>
      <div className="flex max-w-full flex-wrap gap-1.5" aria-label={t("Filtrer les compensations par statut","Filter offsets by status")}>
        {([
          ["ALL",t("Toutes","All")],["DRAFT",t("Brouillons","Drafts")],
          ["PENDING_APPROVAL",t("En attente","Pending")],["APPROVED",t("Approuvées","Approved")],
          ["POSTED",t("Comptabilisées","Posted")],["REVERSED",t("Contrepassées","Reversed")],["REJECTED",t("Rejetées","Rejected")],
          ["CANCELLED",t("Annulées","Cancelled")],
        ] as const).map(([id,label]) => <button key={id} type="button" aria-pressed={historyStatus===id}
          onClick={()=>{setHistoryStatus(id);setHistoryPage(1);}}
          className={historyStatus===id?"rounded-full border border-dtsc-blue bg-dtsc-soft px-2.5 py-1.5 text-xs font-semibold text-dtsc-blue":"rounded-full border border-dtsc-border px-2.5 py-1.5 text-xs text-dtsc-muted hover:bg-dtsc-soft"}>
          {label}
        </button>)}
      </div>
      {history.length === 0 ? <p className="text-sm text-dtsc-muted">{t("Aucune demande enregistrée ou accessible.", "No recorded or accessible request.")}</p> : null}
      {history.map(row => <article key={row.id} className="grid min-w-0 gap-2 rounded-lg border border-dtsc-border p-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="break-words font-semibold">{row.targetInvoiceNumber || row.supplierReference}</p>
            <p className="text-xs text-dtsc-muted">{row.supplierReference} · {money(row.amount)}</p>
          </div>
          <StatusBadge tone={row.status === "POSTED" ? "success" :
            row.status === "REJECTED" || row.status === "CANCELLED" || row.status === "REVERSED" ? "danger" : "warning"}>
            {({DRAFT:t("Brouillon","Draft"),PENDING_APPROVAL:t("En validation","Pending approval"),
              APPROVED:t("Approuvée","Approved"),POSTED:t("Comptabilisée","Posted"),REVERSED:t("Contrepassée","Reversed"),
              REJECTED:t("Rejetée","Rejected"),CANCELLED:t("Annulée","Cancelled")} as Record<string,string>)[row.status] || row.status}
          </StatusBadge>
        </div>
        {row.approverName ? <p className="text-xs text-dtsc-muted">{t("Validateur désigné","Assigned reviewer")} : <span className="font-semibold text-dtsc-ink">{row.approverName}</span></p> : null}
        {row.status==="POSTED" && row.postedByName ? <p className="text-xs text-dtsc-muted">{t("Comptabilisé par","Posted by")} : {row.postedByName}</p> : null}
        {row.reservationActive ? <p className="text-xs text-amber-700 dark:text-amber-300">{t(
          "Le montant est réservé sur la créance et la dette.", "Amount reserved against claim and payable.")}</p> : null}
        {row.status === "DRAFT" && canSubmit ? <form onSubmit={event => void transition(event,row,"SUBMIT_COMPENSATION")} className="grid min-w-0 gap-2 sm:grid-cols-[1fr_auto]">
          <EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_PAYABLES" locale={locale}
            label={t("Approbateur indépendant", "Independent approver")} disabled={busy} />
          <Button type="submit" disabled={busy} className="self-end">{t("Soumettre et réserver", "Submit and reserve")}</Button>
        </form> : null}
        {row.status === "DRAFT" && canWrite ? <form onSubmit={event => void transition(event,row,"CANCEL_COMPENSATION_DRAFT")} className="flex min-w-0 flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1"><Field label={t("Motif de l'annulation","Cancellation reason")}><Input name="reason" minLength={8} required disabled={busy}/></Field></div>
          <Button type="submit" variant="outline" disabled={busy}>{t("Annuler le brouillon","Cancel draft")}</Button>
        </form> : null}
        {row.status === "PENDING_APPROVAL" && canApprove ? <div className="grid gap-2">
          <p className="text-xs text-dtsc-muted">{t("Décision réservée à la personne désignée.", "Only the assigned reviewer can decide.")}</p>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void mutate({
              action:"APPROVE_COMPENSATION",compensationId:row.id,revision:row.revision,
            },"Compensation approuvée.","Compensation approved.")}>{t("Approuver","Approve")}</Button>
            <form onSubmit={event => void transition(event,row,"REJECT_COMPENSATION")} className="flex min-w-0 flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1"><Field label={t("Motif du rejet","Rejection reason")}><Input name="reason" minLength={8} required disabled={busy}/></Field></div>
              <Button type="submit" variant="outline" disabled={busy}>{t("Rejeter","Reject")}</Button>
            </form>
          </div>
        </div> : null}
        {row.status === "APPROVED" && canWrite ? <div className="grid gap-1">
          <Button type="button" disabled={busy} onClick={() => void mutate({
            action:"POST_COMPENSATION",compensationId:row.id,revision:row.revision,
          },"Compensation comptabilisée. Aucun mouvement bancaire.","Compensation posted. No bank transfer.")}>
            {t("Comptabiliser la compensation","Post non-cash offset")}
          </Button>
          <p className="text-xs text-dtsc-muted">{t("Exécution par une troisième personne autorisée, après validation indépendante.",
            "Executed by a third authorized person after independent approval.")}</p>
        </div> : null}
        {row.status === "POSTED" ? <p className="text-xs text-dtsc-muted">{t(
          "Dette réduite et créance rapprochée par une écriture canonique. Aucune trésorerie consommée.",
          "Payable reduced and claim settled through a canonical posting. No cash consumed.")}</p> : null}
        {row.status === "POSTED" && canManage ? <form
          onSubmit={event => void transition(event,row,"REVERSE_COMPENSATION")}
          className="grid min-w-0 gap-2 rounded-lg border border-amber-400/40 bg-amber-500/5 p-3">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">{t(
            "Contrepassation comptable exceptionnelle : réservée à une personne indépendante de la préparation, de la validation et de la comptabilisation. La date doit appartenir à une période ouverte.",
            "Exceptional accounting inverse: only an actor independent of request, approval and posting may execute it. Use an open posting period.")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t("Date de contrepassation","Reversal date")}>
              <Input name="accountingDate" type="date" defaultValue={businessDate || ""}
                min={row.postedAt?.slice(0,10)} required disabled={busy}/>
            </Field>
            <Field label={t("Motif détaillé (obligatoire)","Detailed reason (required)")}>
              <Input name="reason" minLength={8} maxLength={1000} required disabled={busy}/>
            </Field>
          </div>
          <Button type="submit" variant="outline" disabled={busy}>{t(
            "Contrepasser et restaurer les soldes","Reverse and restore balances")}</Button>
        </form> : null}
        {row.status === "REVERSED" ? <div className="grid gap-1 text-xs text-amber-800 dark:text-amber-200">
          <p className="font-semibold">{t(
            "Écriture inverse comptabilisée ; la dette et la créance ont été restaurées sans banque.",
            "Reversal posted; payable and claim restored without a bank flow.")}</p>
          {row.reversedByName ? <p>{t("Contrepassée par","Reversed by")} : {row.reversedByName}</p> : null}
          {row.reversalReason ? <p className="break-words">{t("Motif","Reason")} : {row.reversalReason}</p> : null}
        </div> : null}
      </article>)}
      {historyPageCount > 1 ? <div className="flex items-center justify-between gap-2">
        <Button variant="outline" type="button" size="sm" disabled={historyPage <= 1}
          onClick={() => setHistoryPage(v => v-1)}>{t("Précédent","Previous")}</Button>
        <span className="text-xs text-dtsc-muted">{historyPage}/{historyPageCount}</span>
        <Button variant="outline" type="button" size="sm" disabled={historyPage >= historyPageCount}
          onClick={() => setHistoryPage(v => v+1)}>{t("Suivant","Next")}</Button>
      </div> : null}
    </div>
  </section>;
}
