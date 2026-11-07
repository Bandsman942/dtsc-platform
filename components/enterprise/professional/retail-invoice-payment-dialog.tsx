"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Banknote, CheckCircle2, CreditCard, Send, ShieldCheck, Wallet } from "lucide-react";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { customerFacingError } from "@/lib/customer-facing-language";

type MethodType = "CASH" | "BANK_TRANSFER" | "MOBILE_MONEY" | "CARD" | "CHEQUE";
type Account = { id: string; name: string; code: string; currencyCode: string; accountType: string };
type Session = { id: string; number: string; financialAccountId: string };
type Proposal = {
  id: string; canSubmit: boolean; canCancel: boolean; canAllocate: boolean;
  payment: { id: string; number: string; methodType: string; status: string; amount: string; unallocatedAmount: string; revision: number; currencyCode: string };
};
type PaymentOverview = {
  accounts: Account[]; cashSessions: Session[]; proposals: Proposal[];
  invoiceStatus: string; outstandingAmount: string; currencyCode: string;
  pagination: { page: number; pageCount: number; total: number };
};

const copy = {
  fr: {
    open: "Encaisser", history: "Voir les paiements", unknown: "Statut à vérifier", title: "Encaissements de la boutique", lead: "Un paiement est préparé en Finance, soumis à un validateur indépendant puis confirmé avant affectation à la facture.",
    method: "Mode de paiement", account: "Compte financier de cette boutique", chooseAccount: "Choisir un compte", session: "Session de caisse ouverte", chooseSession: "Choisir une session", amount: "Montant reçu", create: "Préparer le paiement", creating: "Enregistrement…", noAccount: "Configurez un compte actif de cette boutique dans Finance.", noCash: "Ouvrez votre session de caisse sur ce compte avant de préparer un encaissement en espèces.",
    pending: "Paiements liés à cette facture", empty: "Aucun paiement préparé pour cette facture.", draft: "Brouillon", awaiting: "À valider", approved: "Approuvé", confirmed: "Confirmé", reconciled: "Rapproché", cancelled: "Annulé", reversed: "Contrepassé", submitted: "Soumettre", allocate: "Affecter à la facture", settled: "Affecté", cancel: "Annuler", cancelReason: "Motif de l’annulation du brouillon", cancelButton: "Confirmer l’annulation", back: "Retour", approver: "Validateur Finance indépendant", submitTitle: "Validation indépendante du paiement", submitHint: "Le caissier ne peut pas confirmer lui-même son encaissement. Finance effectue les validations et la confirmation ; la sortie de stock intervient après paiement intégral de la facture.", submitButton: "Envoyer au validateur", submitNote: "Commentaire facultatif", reload: "Actualiser", page: "Page", outstanding: "Reste dû", reserved: "Montant encore non affecté", fail: "Impossible de traiter cet encaissement.", created: "Paiement Finance créé en brouillon ; soumettez-le à un validateur indépendant.", submittedOk: "Paiement transmis au validateur Finance.", allocatedOk: "Paiement confirmé affecté à cette facture.", cancelledOk: "Brouillon de paiement annulé sans mouvement de trésorerie.", noMore: "La facture est déjà réglée ou ne peut plus recevoir de nouveaux paiements.",
  },
  en: {
    open: "Collect", history: "View payments", unknown: "Check status", title: "Store collections", lead: "A payment is prepared in Finance, submitted to an independent approver and confirmed before it can settle the invoice.",
    method: "Payment method", account: "This store's financial account", chooseAccount: "Choose account", session: "Open cash session", chooseSession: "Choose a session", amount: "Amount collected", create: "Prepare payment", creating: "Saving…", noAccount: "Configure an active account for this store in Finance.", noCash: "Open your cash session for this account before recording a cash collection.",
    pending: "Payments linked to this invoice", empty: "No payments prepared for this invoice.", draft: "Draft", awaiting: "Awaiting approval", approved: "Approved", confirmed: "Confirmed", reconciled: "Reconciled", cancelled: "Cancelled", reversed: "Reversed", submitted: "Submit", allocate: "Allocate to invoice", settled: "Allocated", cancel: "Cancel", cancelReason: "Reason for cancelling draft", cancelButton: "Confirm cancellation", back: "Back", approver: "Independent Finance approver", submitTitle: "Independent payment approval", submitHint: "Cashiers cannot confirm their own payments. Finance approves and confirms; inventory is released only when the invoice is fully settled.", submitButton: "Send for approval", submitNote: "Optional comment", reload: "Refresh", page: "Page", outstanding: "Outstanding", reserved: "Still unallocated", fail: "Unable to process this payment.", created: "Finance payment saved as draft; submit to an independent approver.", submittedOk: "Payment sent to Finance approver.", allocatedOk: "Confirmed payment allocated to this invoice.", cancelledOk: "Draft payment cancelled without a treasury movement.", noMore: "The invoice is settled or cannot accept further payments.",
  },
} as const;

const METHODS: { type: MethodType; fr: string; en: string; account: string }[] = [
  { type: "CASH", fr: "Espèces", en: "Cash", account: "CASH" },
  { type: "MOBILE_MONEY", fr: "Mobile Money", en: "Mobile Money", account: "MOBILE_MONEY" },
  { type: "BANK_TRANSFER", fr: "Virement", en: "Bank transfer", account: "BANK" },
  { type: "CARD", fr: "Carte", en: "Card", account: "BANK" },
  { type: "CHEQUE", fr: "Chèque", en: "Cheque", account: "BANK" },
];

export function RetailInvoicePaymentDialog({ organizationId, invoiceId, invoiceNumber, siteName, invoiceStatus, locale, onChanged }: {
  organizationId: string; invoiceId: string; invoiceNumber: string; siteName: string; invoiceStatus: string; locale: "fr" | "en"; onChanged: () => void;
}) {
  const t = copy[locale];
  const base = `/api/enterprise/${organizationId}/retail/invoices/${encodeURIComponent(invoiceId)}/payments`;
  const [open, setOpen] = useState(false);
  const [overview, setOverview] = useState<PaymentOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [method, setMethod] = useState<MethodType>("CASH");
  const [accountId, setAccountId] = useState("");
  const [cashSessionId, setCashSessionId] = useState("");
  const [amount, setAmount] = useState("");
  const [page, setPage] = useState(1);
  const [approval, setApproval] = useState<Proposal | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Proposal | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const idempotency = useRef("");

  const load = useCallback(async (nextPage = 1, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(`${base}?page=${nextPage}`, { cache: "no-store", signal });
      const result = await response.json().catch(() => null) as (PaymentOverview & { message?: string }) | null;
      if (!response.ok || !result) throw new Error(result?.message || t.fail);
      if (signal?.aborted) return;
      setOverview(result); setPage(nextPage); setError("");
    } catch (failure) {
      if (!signal?.aborted) setError(customerFacingError(failure, locale));
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [base, locale, t.fail]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void load(1, controller.signal);
    return () => controller.abort();
  }, [load, open]);

  const methodAccountType = METHODS.find((entry) => entry.type === method)?.account;
  const accounts = overview?.accounts.filter((account) => account.accountType === methodAccountType) || [];
  const sessions = overview?.cashSessions.filter((session) => session.financialAccountId === accountId) || [];
  const canCreate = Boolean(overview && ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(overview.invoiceStatus) && Number(overview.outstandingAmount) > 0);

  async function mutate(url: string, body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || t.fail);
      toastSuccess(success); setError(""); await load(page); onChanged(); return true;
    } catch (failure) {
      const message = customerFacingError(failure, locale); setError(message); toastError(message); return false;
    } finally { setBusy(false); }
  }

  async function createPayment() {
    if (!canCreate || !accountId || busy || Number(amount) <= 0 || (method === "CASH" && !cashSessionId)) return;
    if (!idempotency.current) idempotency.current = crypto.randomUUID();
    const ok = await mutate(base, { idempotencyKey: idempotency.current, methodType: method, financialAccountId: accountId, amount,
      ...(method === "CASH" ? { cashSessionId } : {}) }, t.created);
    if (ok) { idempotency.current = ""; setAmount(""); }
  }

  function statusLabel(status: string) {
    const values: Record<string, string> = { DRAFT: t.draft, PENDING_APPROVAL: t.awaiting, APPROVED: t.approved,
      CONFIRMED: t.confirmed, RECONCILED: t.reconciled, CANCELLED: t.cancelled, REVERSED: t.reversed };
    return values[status] || t.unknown;
  }

  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}><Wallet className="h-4 w-4 text-emerald-600" />{invoiceStatus === "PAID" ? t.history : t.open}</Button>
    <Dialog open={open && !approval && !cancelTarget} onClose={() => { if (!busy) { setOpen(false); setApproval(null); setCancelTarget(null); } }} title={t.title} description={`${invoiceNumber} · ${siteName}`} presentation="editor" className="max-w-3xl">
      <div className="grid min-w-0 gap-4">
        <p className="rounded-xl bg-blue-500/10 p-3 text-sm leading-6 text-dtsc-ink"><ShieldCheck className="mr-2 inline h-4 w-4 text-dtsc-blue" />{t.lead}</p>
        {error ? <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
        {loading ? <p role="status" className="text-sm text-dtsc-muted">{locale === "fr" ? "Chargement des encaissements…" : "Loading payments…"}</p> : null}
        {overview ? <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-dtsc-page p-3"><div className="text-xs text-dtsc-muted">{t.outstanding}<p className="mt-1 text-lg font-black tabular-nums text-dtsc-ink">{overview.outstandingAmount} {overview.currencyCode}</p></div><Button type="button" variant="outline" onClick={() => void load(page)} disabled={busy || loading}>{t.reload}</Button></div>
          {canCreate ? <form onSubmit={(event) => { event.preventDefault(); void createPayment(); }} className="grid min-w-0 gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-xs font-bold text-dtsc-ink">{t.method}<select className="min-h-11 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page p-2 text-sm" value={method} onChange={(event) => { setMethod(event.target.value as MethodType); setAccountId(""); setCashSessionId(""); idempotency.current = ""; }}>{METHODS.map((item) => <option key={item.type} value={item.type}>{item[locale]}</option>)}</select></label>
            <label className="grid min-w-0 gap-1 text-xs font-bold text-dtsc-ink">{t.account}<select required className="min-h-11 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page p-2 text-sm" value={accountId} onChange={(event) => { setAccountId(event.target.value); setCashSessionId(""); idempotency.current = ""; }}><option value="">{t.chooseAccount}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.code}</option>)}</select>{!accounts.length ? <span className="text-xs text-amber-700 dark:text-amber-300">{t.noAccount}</span> : null}</label>
            {method === "CASH" ? <label className="grid min-w-0 gap-1 text-xs font-bold text-dtsc-ink">{t.session}<select required value={cashSessionId} onChange={(event) => { setCashSessionId(event.target.value); idempotency.current = ""; }} className="min-h-11 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page p-2 text-sm"><option value="">{t.chooseSession}</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.number}</option>)}</select>{accountId && !sessions.length ? <span className="text-xs text-amber-700 dark:text-amber-300">{t.noCash}</span> : null}</label> : null}
            <label className="grid min-w-0 gap-1 text-xs font-bold text-dtsc-ink">{t.amount} ({overview.currencyCode})<input required inputMode="decimal" type="number" step="0.01" min="0.01" max={overview.outstandingAmount} value={amount} onChange={(event) => { setAmount(event.target.value); idempotency.current = ""; }} className="min-h-11 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page p-2 text-base" /></label>
            <div data-responsive-actions className="flex flex-wrap items-end justify-end sm:col-span-2"><Button type="submit" disabled={busy || !accountId || Number(amount) <= 0 || (method === "CASH" && !cashSessionId)}><CreditCard className="h-4 w-4" />{busy ? t.creating : t.create}</Button></div>
          </form> : <p className="text-xs text-dtsc-muted">{t.noMore}</p>}
          <div className="min-w-0 border-t border-dtsc-border pt-3"><h3 className="mb-3 flex items-center gap-2 text-sm font-black text-dtsc-ink"><Banknote className="h-4 w-4 text-emerald-600" />{t.pending}</h3>
            {overview.proposals.length ? <div className="grid min-w-0 gap-2">{overview.proposals.map((item) => <div key={item.id} className="rounded-lg border border-dtsc-border bg-dtsc-page p-3"><div className="flex min-w-0 flex-wrap justify-between gap-2"><strong className="break-words text-sm text-dtsc-ink">{item.payment.number} · {item.payment.amount} {item.payment.currencyCode}</strong><span className="rounded-full bg-blue-500/10 px-2 py-1 text-xs font-bold text-dtsc-blue">{statusLabel(item.payment.status)}</span></div><p className="mt-1 text-xs text-dtsc-muted">{t.reserved} : {item.payment.unallocatedAmount} {item.payment.currencyCode}</p>
              <div data-responsive-actions className="mt-2 flex flex-wrap gap-2">{item.canSubmit ? <Button type="button" variant="outline" disabled={busy} onClick={() => setApproval(item)}><Send className="h-4 w-4" />{t.submitted}</Button> : null}{item.canAllocate ? <Button type="button" disabled={busy} onClick={() => void mutate(`${base}/${encodeURIComponent(item.payment.id)}/allocate`, {}, t.allocatedOk)}><CheckCircle2 className="h-4 w-4" />{t.allocate}</Button> : null}{item.canCancel ? <Button type="button" variant="outline" disabled={busy} onClick={() => { setCancelTarget(item); setCancelReason(""); }}>{t.cancel}</Button> : null}</div>
            </div>)}</div> : <p className="rounded-lg bg-dtsc-page p-3 text-sm text-dtsc-muted">{t.empty}</p>}
            {overview.pagination.pageCount > 1 ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-dtsc-muted">{t.page} {overview.pagination.page} / {overview.pagination.pageCount}<div className="flex gap-2"><Button type="button" variant="outline" disabled={busy || loading || page <= 1} onClick={() => void load(page - 1)}>‹</Button><Button type="button" variant="outline" disabled={busy || loading || page >= overview.pagination.pageCount} onClick={() => void load(page + 1)}>›</Button></div></div> : null}
          </div>
        </> : null}
      </div>
    </Dialog>
    <Dialog open={Boolean(approval)} onClose={() => { if (!busy) setApproval(null); }} title={t.submitTitle} description={t.submitHint} presentation="editor" className="max-w-xl">
      {approval ? <form className="grid min-w-0 gap-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void mutate(`${base}/${encodeURIComponent(approval.payment.id)}/transition`, { action: "SUBMIT", revision: approval.payment.revision, approverUserId: String(form.get("approverUserId") || ""), reason: String(form.get("reason") || "") }, t.submittedOk).then((ok) => { if (ok) setApproval(null); }); }}>
        <strong className="text-sm text-dtsc-ink">{approval.payment.number}</strong>
        <EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_PAYMENTS" locale={locale} label={t.approver} disabled={busy} candidatesEndpoint={`${base}/approval-candidates`} />
        <label className="grid min-w-0 gap-1 text-sm font-semibold text-dtsc-ink">{t.submitNote}<textarea name="reason" maxLength={1000} className="min-h-20 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page p-2 text-base" disabled={busy} /></label>
        <div data-responsive-actions className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setApproval(null)}>{t.back}</Button><Button type="submit" disabled={busy}>{t.submitButton}</Button></div>
      </form> : null}
    </Dialog>
    <Dialog open={Boolean(cancelTarget)} onClose={() => { if (!busy) setCancelTarget(null); }} title={t.cancel} description={cancelTarget?.payment.number || ""} presentation="editor" className="max-w-xl">
      {cancelTarget ? <form className="grid min-w-0 gap-3" onSubmit={(event) => { event.preventDefault(); void mutate(`${base}/${encodeURIComponent(cancelTarget.payment.id)}/transition`, { action: "CANCEL", revision: cancelTarget.payment.revision, reason: cancelReason.trim() }, t.cancelledOk).then((ok) => { if (ok) setCancelTarget(null); }); }}><label className="grid gap-1 text-sm font-semibold text-dtsc-ink">{t.cancelReason}<textarea required minLength={4} maxLength={1000} className="min-h-24 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page p-2 text-base" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} disabled={busy} /></label><div data-responsive-actions className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setCancelTarget(null)}>{t.back}</Button><Button type="submit" disabled={busy || cancelReason.trim().length < 4}>{t.cancelButton}</Button></div></form> : null}
    </Dialog>
  </>;
}
