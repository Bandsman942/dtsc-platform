"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck, CreditCard, PackageSearch, RotateCcw, ShieldCheck, ShieldX } from "lucide-react";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { customerFacingError } from "@/lib/customer-facing-language";

type StockDisposition = "RESTOCK" | "QUARANTINE" | "DISPOSE";
type CheckoutLine = { id: string; invoiceItemId: string; inventoryItemId: string | null };
type InvoiceItem = { id: string; description: string; quantity: string; totalAmount: string };
type RequestLine = { id: string; checkoutLineId: string; quantity: string; refundAmount: string; stockDisposition: StockDisposition };
type ReturnRequest = {
  id: string;
  number: string;
  status: string;
  revision: number;
  reason: string;
  refundAmount: string;
  inspectedAt: string | null;
  inspectionNotes: string | null;
  decisionReason: string | null;
  createdAt: string;
  canInspect: boolean;
  canDecide: boolean;
  canPrepareFinance: boolean;
  canSettleFinance: boolean;
  paymentApprovalStatus: string | null;
  creditApprovalStatus: string | null;
  lines: RequestLine[];
};
type ReturnResponse = {
  items: ReturnRequest[];
  canRequest: boolean;
  pagination: { page: number; pageCount: number; total: number };
  message?: string;
};
type Row = { checked: boolean; quantity: string; stockDisposition: StockDisposition };
type Action = { request: ReturnRequest; type: "INSPECT" | "APPROVE" | "REJECT" | "PREPARE_FINANCE" | "SETTLE_FINANCE" };

const translations = {
  fr: {
    trigger: "Retours et avoirs", title: "Retours de marchandise", explain: "Un retour nécessite trois intervenants indépendants : demande, inspection physique et validation Finance. Aucun avoir, stock ou remboursement n’est comptabilisé à ce stade.",
    refresh: "Actualiser", loading: "Chargement des demandes…", empty: "Aucune demande de retour enregistrée.", error: "Impossible de charger les retours de cette facture.",
    new: "Demander un retour", newHint: "Seules les factures entièrement réglées et dont le stock a été livré peuvent faire l’objet d’un retour.",
    item: "Article", quantity: "Quantité retournée", disposition: "Traitement physique", restock: "Réintégrer en stock", quarantine: "Placer en quarantaine", dispose: "Écarter / détruire", reason: "Motif du retour", approver: "Validateur Finance indépendant", send: "Soumettre la demande", cancel: "Annuler", sending: "Enregistrement…", createSuccess: "Demande de retour enregistrée. L’inspection physique indépendante est maintenant attendue.",
    requests: "Historique des retours", amount: "Montant proposé", submitted: "En attente d’inspection", inspected: "Inspectée — validation attendue", approved: "Approuvée — aucun remboursement effectué", financePending: "Pièces Finance en attente", rejected: "Refusée", completed: "Remboursement terminé", unknown: "À vérifier", inspection: "Inspecter la réception", approve: "Approuver la demande", reject: "Refuser", inspectionNotes: "Constat de réception physique", inspectionHint: "Confirmez uniquement les articles réellement reçus et contrôlés. L’inspection ne réintègre pas encore le stock.", confirmInspection: "Confirmer l’inspection", decisionHint: "La validation de cette demande ne crée pas encore d’avoir ni de remboursement. Le traitement financier et du stock suivra un circuit distinct.", rejectionReason: "Motif du refus (obligatoire)", decisionReason: "Commentaire de validation (facultatif)", confirmApprove: "Confirmer l’approbation", confirmReject: "Confirmer le refus", inspectionSuccess: "Inspection physique enregistrée. Le validateur Finance peut maintenant statuer.", approvalSuccess: "Retour approuvé. L’avoir et le remboursement restent en attente du circuit de liquidation.", rejectionSuccess: "Retour refusé avec motif conservé.", noAmount: "Les montants proposés sont calculés par le serveur, après validation des quantités.",
    prepareFinance: "Préparer avoir et remboursement", prepareFinanceHint: "Deux pièces Finance seront créées et envoyées au validateur déjà désigné. Aucun argent ni stock ne sera mouvementé avant l'approbation de ces pièces.", confirmPrepareFinance: "Envoyer en validation Finance", prepareFinanceSuccess: "Avoir et remboursement créés ensemble et soumis à validation Finance.", settleFinance: "Liquider le retour", settleFinanceHint: "Cette étape confirme le remboursement, comptabilise l'avoir et réintègre uniquement les articles acceptés en stock dans une transaction indivisible.", settlementReason: "Motif de liquidation", confirmSettleFinance: "Confirmer la liquidation", settleFinanceSuccess: "Remboursement, avoir et stock traités dans une même transaction.", paymentApproval: "Remboursement", creditApproval: "Avoir", financeApproved: "Approuvé", financeAwaiting: "Validation attendue", financeGuide: "Validez les deux documents dans Finance puis actualisez les retours.",
    previous: "Précédente", next: "Suivante", close: "Fermer", select: "Sélectionner", rowMissing: "Aucune ligne facturée n’est disponible pour créer un retour.", itemRequired: "Sélectionnez au moins un article avec une quantité valide.", invalidQuantity: "La quantité doit être positive, ne pas dépasser la facture et avoir au plus 3 décimales pour un article en stock. Les quantités déjà engagées sont revérifiées par le serveur.",
  },
  en: {
    trigger: "Returns and credits", title: "Merchandise returns", explain: "Returns require three independent actors: requester, physical inspector and Finance approver. No credit, stock or reimbursement is posted at this stage.",
    refresh: "Refresh", loading: "Loading return requests…", empty: "No return requests yet.", error: "Unable to load this invoice's returns.",
    new: "Request a return", newHint: "Only fully paid invoices with delivered inventory are eligible for returns.",
    item: "Item", quantity: "Quantity returned", disposition: "Physical disposition", restock: "Return to stock", quarantine: "Quarantine", dispose: "Discard / destroy", reason: "Return reason", approver: "Independent Finance approver", send: "Submit request", cancel: "Cancel", sending: "Saving…", createSuccess: "Return request registered. Independent physical inspection is now required.",
    requests: "Return history", amount: "Proposed amount", submitted: "Awaiting inspection", inspected: "Inspected — awaiting approval", approved: "Approved — not refunded", financePending: "Finance documents pending", rejected: "Rejected", completed: "Refund completed", unknown: "Check status", inspection: "Inspect receipt", approve: "Approve request", reject: "Reject", inspectionNotes: "Physical receipt findings", inspectionHint: "Only confirm goods that were actually received and inspected. This does not restock inventory yet.", confirmInspection: "Confirm inspection", decisionHint: "Approving this request does not yet create a credit note or a refund. Financial and inventory settlement will follow a separate process.", rejectionReason: "Rejection reason (required)", decisionReason: "Approval note (optional)", confirmApprove: "Confirm approval", confirmReject: "Confirm rejection", inspectionSuccess: "Physical inspection recorded. Finance may now decide.", approvalSuccess: "Return approved. The credit and refund still await settlement.", rejectionSuccess: "Return rejected with the reason preserved.", noAmount: "Proposed amounts are calculated by the server after quantity validation.",
    prepareFinance: "Prepare credit and refund", prepareFinanceHint: "Two Finance documents will be created and sent to the assigned approver. No cash or inventory moves before independent approval.", confirmPrepareFinance: "Submit for Finance approval", prepareFinanceSuccess: "Credit note and refund created together and submitted for Finance approval.", settleFinance: "Settle return", settleFinanceHint: "This step confirms the refund, posts the credit note and restocks accepted items in one indivisible transaction.", settlementReason: "Settlement reason", confirmSettleFinance: "Confirm settlement", settleFinanceSuccess: "Refund, credit note and inventory completed in the same transaction.", paymentApproval: "Refund", creditApproval: "Credit note", financeApproved: "Approved", financeAwaiting: "Awaiting approval", financeGuide: "Approve both documents in Finance, then refresh returns.",
    previous: "Previous", next: "Next", close: "Close", select: "Select", rowMissing: "No invoice lines are available for this return.", itemRequired: "Select at least one item with a valid quantity.", invalidQuantity: "Quantity must be positive, not exceed the invoice and use no more than 3 decimal places for stocked items. Existing commitments are checked again by the server.",
  },
} as const;

function statusLabel(status: string, copy: typeof translations.fr | typeof translations.en) {
  return ({ SUBMITTED: copy.submitted, INSPECTED: copy.inspected, APPROVED: copy.approved,
    FINANCE_PENDING: copy.financePending, REJECTED: copy.rejected, COMPLETED: copy.completed } as Record<string, string>)[status] || copy.unknown;
}

export function RetailInvoiceReturnDialog({ organizationId, invoiceId, invoiceNumber, siteId, currencyCode, checkoutLines, invoiceItems, locale, onChanged }: {
  organizationId: string; invoiceId: string; invoiceNumber: string; siteId: string; currencyCode: string;
  checkoutLines: CheckoutLine[]; invoiceItems: InvoiceItem[]; locale: "fr" | "en"; onChanged: () => void;
}) {
  const copy = translations[locale];
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ReturnResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const key = useRef("");
  const sourceItems = checkoutLines.flatMap((line) => {
    const item = invoiceItems.find((entry) => entry.id === line.invoiceItemId);
    return item ? [{ ...line, item }] : [];
  });

  const load = useCallback(async (nextPage: number, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/invoices/${encodeURIComponent(invoiceId)}/returns?page=${nextPage}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => null) as ReturnResponse | null;
      if (!response.ok || !payload?.items) throw new Error(payload?.message || copy.error);
      if (!signal?.aborted) { setData(payload); setPage(nextPage); setError(""); }
    } catch (caught) {
      if (!signal?.aborted) setError(customerFacingError(caught, locale));
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [copy.error, invoiceId, locale, organizationId]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void load(1, controller.signal);
    return () => controller.abort();
  }, [load, open]);

  function startCreate() {
    setRows({}); setReason(""); setError(""); setAction(null); setCreating(true); key.current = "";
  }
  function stopCreate() { if (!busy) { setCreating(false); setRows({}); key.current = ""; } }
  function rowUpdate(id: string, change: Partial<Row>, hasStock: boolean) {
    setRows((previous) => ({ ...previous, [id]: { ...(previous[id] || { checked: false, quantity: "1", stockDisposition: hasStock ? "RESTOCK" : "QUARANTINE" }), ...change } }));
    key.current = "";
  }

  async function createRequest(approverUserId: string) {
    if (!approverUserId || reason.trim().length < 4 || busy) return;
    const selected = sourceItems.filter((line) => rows[line.id]?.checked).map((line) => ({
      checkoutLineId: line.id,
      quantity: rows[line.id].quantity.trim(),
      stockDisposition: rows[line.id].stockDisposition,
      invoicedQuantity: line.item.quantity,
      hasStock: Boolean(line.inventoryItemId),
    }));
    if (!selected.length) { setError(copy.itemRequired); return; }
    if (selected.some((line) => !/^\d+(?:\.\d{1,6})?$/.test(line.quantity) ||
      Number(line.quantity) <= 0 || Number(line.quantity) > Number(line.invoicedQuantity) ||
      (line.hasStock && !/^\d+(?:\.\d{1,3})?$/.test(line.quantity)))) {
      setError(copy.invalidQuantity); return;
    }
    setBusy(true); setError("");
    try {
      if (!key.current) key.current = crypto.randomUUID();
      const response = await fetch(`/api/enterprise/${organizationId}/retail/invoices/${encodeURIComponent(invoiceId)}/returns`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: key.current, approverUserId, reason: reason.trim(),
          lines: selected.map(({ checkoutLineId, quantity, stockDisposition }) => ({ checkoutLineId, quantity, stockDisposition })) }),
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || copy.error);
      toastSuccess(copy.createSuccess); setCreating(false); setRows({}); key.current = "";
      await load(1); onChanged();
    } catch (caught) { const message = customerFacingError(caught, locale); setError(message); toastError(message); }
    finally { setBusy(false); }
  }

  async function completeAction() {
    if (!action || busy || (action.type === "INSPECT" && actionNotes.trim().length < 5) ||
      (["REJECT", "SETTLE_FINANCE"].includes(action.type) && actionNotes.trim().length < 4)) return;
    setBusy(true); setError("");
    try {
      const target = `/api/enterprise/${organizationId}/retail/invoices/${encodeURIComponent(invoiceId)}/returns/${encodeURIComponent(action.request.id)}`;
      const inspection = action.type === "INSPECT";
      const financePrepare = action.type === "PREPARE_FINANCE";
      const financeSettlement = action.type === "SETTLE_FINANCE";
      const path = financePrepare ? "prepare" : financeSettlement ? "settle" : inspection ? "inspection" : "decision";
      const response = await fetch(`${target}/${path}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(financePrepare ? { revision: action.request.revision } : financeSettlement
          ? { revision: action.request.revision, reason: actionNotes.trim() } : inspection
          ? { revision: action.request.revision, receivedAndInspected: true, notes: actionNotes.trim() }
          : { revision: action.request.revision, decision: action.type === "APPROVE" ? "APPROVE" : "REJECT",
            ...(actionNotes.trim() ? { reason: actionNotes.trim() } : {}) }),
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || copy.error);
      toastSuccess(financePrepare ? copy.prepareFinanceSuccess : financeSettlement ? copy.settleFinanceSuccess :
        inspection ? copy.inspectionSuccess : action.type === "APPROVE" ? copy.approvalSuccess : copy.rejectionSuccess);
      setAction(null); setActionNotes(""); await load(page); onChanged();
    } catch (caught) { const message = customerFacingError(caught, locale); setError(message); toastError(message); }
    finally { setBusy(false); }
  }

  const money = (amount: string) => `${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 2 }).format(Number(amount))} ${currencyCode}`;
  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}><RotateCcw className="h-4 w-4" />{copy.trigger}</Button>
    <Dialog open={open} onClose={() => { if (!busy) { setOpen(false); setCreating(false); setAction(null); } }} title={`${copy.title} · ${invoiceNumber}`} description={copy.explain} className="max-w-3xl" presentation="editor">
      <div className="grid min-w-0 gap-4">
        {error ? <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
        <div className="flex min-w-0 flex-wrap justify-between gap-2">
          <Button type="button" variant="outline" disabled={loading || busy} onClick={() => void load(page)}>{copy.refresh}</Button>
          {data?.canRequest && !creating && !action ? <Button type="button" disabled={busy} onClick={startCreate}><RotateCcw className="h-4 w-4" />{copy.new}</Button> : null}
        </div>
        {creating && data?.canRequest ? <form className="grid min-w-0 gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void createRequest(String(form.get("approverUserId") || "")); }}>
          <h3 className="text-sm font-black text-dtsc-ink">{copy.new}</h3>
          <p className="text-xs leading-5 text-dtsc-muted">{copy.newHint}</p>
          {!sourceItems.length ? <p className="text-sm text-amber-700 dark:text-amber-300">{copy.rowMissing}</p> : sourceItems.map((line) => {
            const value = rows[line.id] || { checked: false, quantity: "1", stockDisposition: line.inventoryItemId ? "RESTOCK" : "QUARANTINE" };
            return <div key={line.id} className="grid min-w-0 gap-2 rounded-lg border border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,7rem)_minmax(0,12rem)] sm:items-end">
              <label className="flex min-w-0 items-start gap-2 text-sm font-semibold text-dtsc-ink"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-dtsc-blue" checked={value.checked} disabled={busy} onChange={(event) => rowUpdate(line.id, { checked: event.target.checked }, Boolean(line.inventoryItemId))} /><span className="min-w-0 break-words">{line.item.description}<span className="mt-1 block text-xs font-normal text-dtsc-muted">{copy.quantity} ≤ {line.item.quantity}</span></span></label>
              <label className="grid min-w-0 gap-1 text-xs font-semibold text-dtsc-ink">{copy.quantity}<input type="number" inputMode="decimal" className="min-h-11 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-base" step={line.inventoryItemId ? "0.001" : "0.000001"} min={line.inventoryItemId ? "0.001" : "0.000001"} max={line.item.quantity} value={value.quantity} disabled={!value.checked || busy} onChange={(event) => rowUpdate(line.id, { quantity: event.target.value }, Boolean(line.inventoryItemId))} /></label>
              <label className="grid min-w-0 gap-1 text-xs font-semibold text-dtsc-ink">{copy.disposition}<select className="min-h-11 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-sm" value={value.stockDisposition} disabled={!value.checked || busy} onChange={(event) => rowUpdate(line.id, { stockDisposition: event.target.value as StockDisposition }, Boolean(line.inventoryItemId))}>{line.inventoryItemId ? <option value="RESTOCK">{copy.restock}</option> : null}<option value="QUARANTINE">{copy.quarantine}</option><option value="DISPOSE">{copy.dispose}</option></select></label>
            </div>;
          })}
          <p className="text-xs text-dtsc-muted">{copy.noAmount}</p>
          <label className="grid min-w-0 gap-1 text-sm font-semibold text-dtsc-ink">{copy.reason}<textarea className="min-h-24 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-surface p-3 text-base" minLength={4} maxLength={1000} required disabled={busy} value={reason} onChange={(event) => { setReason(event.target.value); key.current = ""; }} /></label>
          <EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_RECEIVABLES" locale={locale} label={copy.approver} disabled={busy} candidatesEndpoint={`/api/enterprise/${organizationId}/retail/invoices/return-approval-candidates?siteId=${encodeURIComponent(siteId)}`} />
          <div data-responsive-actions className="flex min-w-0 flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={stopCreate}>{copy.cancel}</Button><Button type="submit" disabled={busy || !sourceItems.some((line) => rows[line.id]?.checked) || reason.trim().length < 4}><ClipboardCheck className="h-4 w-4" />{busy ? copy.sending : copy.send}</Button></div>
        </form> : null}
        {action ? <form className="grid min-w-0 gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 sm:p-4" onSubmit={(event) => { event.preventDefault(); void completeAction(); }}>
          <h3 className="text-sm font-black text-dtsc-ink">{action.type === "INSPECT" ? copy.inspection : action.type === "APPROVE" ? copy.approve : action.type === "REJECT" ? copy.reject : action.type === "PREPARE_FINANCE" ? copy.prepareFinance : copy.settleFinance} · {action.request.number}</h3>
          <p className="text-sm leading-6 text-dtsc-muted">{action.type === "INSPECT" ? copy.inspectionHint : action.type === "PREPARE_FINANCE" ? copy.prepareFinanceHint : action.type === "SETTLE_FINANCE" ? copy.settleFinanceHint : copy.decisionHint}</p>
          {action.type !== "PREPARE_FINANCE" ? <label className="grid min-w-0 gap-1 text-sm font-semibold text-dtsc-ink">{action.type === "INSPECT" ? copy.inspectionNotes : action.type === "REJECT" ? copy.rejectionReason : action.type === "SETTLE_FINANCE" ? copy.settlementReason : copy.decisionReason}<textarea className="min-h-28 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-surface p-3 text-base" minLength={action.type === "INSPECT" ? 5 : ["REJECT", "SETTLE_FINANCE"].includes(action.type) ? 4 : undefined} maxLength={1000} required={["INSPECT", "REJECT", "SETTLE_FINANCE"].includes(action.type)} value={actionNotes} disabled={busy} onChange={(event) => setActionNotes(event.target.value)} /></label> : null}
          <div data-responsive-actions className="flex min-w-0 flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => { setAction(null); setActionNotes(""); }}>{copy.cancel}</Button><Button type="submit" disabled={busy || (action.type === "INSPECT" && actionNotes.trim().length < 5) || (["REJECT", "SETTLE_FINANCE"].includes(action.type) && actionNotes.trim().length < 4)}>{action.type === "INSPECT" ? copy.confirmInspection : action.type === "APPROVE" ? copy.confirmApprove : action.type === "REJECT" ? copy.confirmReject : action.type === "PREPARE_FINANCE" ? copy.confirmPrepareFinance : copy.confirmSettleFinance}</Button></div>
        </form> : null}
        <div className="grid min-w-0 gap-3 border-t border-dtsc-border pt-3">
          <h3 className="text-sm font-black text-dtsc-ink">{copy.requests}</h3>
          {loading ? <p role="status" className="text-sm text-dtsc-muted">{copy.loading}</p> : null}
          {!loading && data && !data.items.length ? <p className="text-sm text-dtsc-muted">{copy.empty}</p> : null}
          {data?.items.map((request) => <article key={request.id} className="grid min-w-0 gap-2 rounded-lg border border-dtsc-border bg-dtsc-page p-3">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><span className="min-w-0 break-words text-sm font-black text-dtsc-ink">{request.number}</span><span className={`rounded-full px-2 py-1 text-xs font-bold ${request.status === "REJECTED" ? "bg-red-500/10 text-red-700 dark:text-red-300" : request.status === "APPROVED" ? "bg-amber-500/10 text-amber-800 dark:text-amber-200" : "bg-blue-500/10 text-blue-700 dark:text-blue-300"}`}>{statusLabel(request.status, copy)}</span></div>
            <p className="text-sm text-dtsc-ink">{request.reason}</p>
            <p className="text-xs text-dtsc-muted">{copy.amount} : <strong className="text-dtsc-ink">{money(request.refundAmount)}</strong> · {new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", { dateStyle: "medium" }).format(new Date(request.createdAt))}</p>
            <ul className="grid min-w-0 gap-1 text-xs text-dtsc-muted">{request.lines.map((line) => <li key={line.id} className="break-words">{sourceItems.find((item) => item.id === line.checkoutLineId)?.item.description || copy.item} · {line.quantity} · {line.stockDisposition === "RESTOCK" ? copy.restock : line.stockDisposition === "QUARANTINE" ? copy.quarantine : copy.dispose}</li>)}</ul>
            {request.inspectionNotes ? <p className="text-xs text-dtsc-muted"><PackageSearch className="mr-1 inline h-3.5 w-3.5" />{request.inspectionNotes}</p> : null}
            {request.decisionReason ? <p className="text-xs text-dtsc-muted">{request.decisionReason}</p> : null}
            {request.status === "FINANCE_PENDING" ? <div className="grid gap-1 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2 text-xs text-dtsc-ink">
              <p>{copy.paymentApproval}: <strong>{request.paymentApprovalStatus === "APPROVED" ? copy.financeApproved : copy.financeAwaiting}</strong> · {copy.creditApproval}: <strong>{request.creditApprovalStatus === "APPROVED" ? copy.financeApproved : copy.financeAwaiting}</strong></p>
              {!request.canSettleFinance ? <p className="text-dtsc-muted">{copy.financeGuide}</p> : null}
            </div> : null}
            <div data-responsive-actions className="flex min-w-0 flex-wrap justify-end gap-2">
              {request.canInspect ? <Button type="button" variant="outline" disabled={busy} onClick={() => { setCreating(false); setAction({ request, type: "INSPECT" }); setActionNotes(""); }}><PackageSearch className="h-4 w-4" />{copy.inspection}</Button> : null}
              {request.canDecide && request.status === "INSPECTED" ? <Button type="button" disabled={busy} onClick={() => { setCreating(false); setAction({ request, type: "APPROVE" }); setActionNotes(""); }}><ShieldCheck className="h-4 w-4" />{copy.approve}</Button> : null}
              {request.canDecide ? <Button type="button" variant="outline" disabled={busy} onClick={() => { setCreating(false); setAction({ request, type: "REJECT" }); setActionNotes(""); }}><ShieldX className="h-4 w-4" />{copy.reject}</Button> : null}
              {request.canPrepareFinance ? <Button type="button" variant="outline" disabled={busy} onClick={() => { setCreating(false); setAction({ request, type: "PREPARE_FINANCE" }); setActionNotes(""); }}><CreditCard className="h-4 w-4" />{copy.prepareFinance}</Button> : null}
              {request.canSettleFinance ? <Button type="button" disabled={busy} onClick={() => { setCreating(false); setAction({ request, type: "SETTLE_FINANCE" }); setActionNotes(""); }}><CreditCard className="h-4 w-4" />{copy.settleFinance}</Button> : null}
            </div>
          </article>)}
          {data && data.pagination.pageCount > 1 ? <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-dtsc-muted"><span>{page} / {data.pagination.pageCount} · {data.pagination.total}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={busy || loading || page <= 1} onClick={() => void load(page - 1)}>{copy.previous}</Button><Button type="button" variant="outline" disabled={busy || loading || page >= data.pagination.pageCount} onClick={() => void load(page + 1)}>{copy.next}</Button></div></div> : null}
        </div>
        <div className="flex justify-end"><Button type="button" variant="outline" disabled={busy} onClick={() => { setOpen(false); setCreating(false); setAction(null); }}>{copy.close}</Button></div>
      </div>
    </Dialog>
  </>;
}
