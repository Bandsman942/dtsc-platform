"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck, CreditCard, PackageSearch, RotateCcw, ShieldCheck, ShieldX } from "lucide-react";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { FinanceCriticalStepUpFields, performFinanceCriticalStepUp } from "@/components/enterprise/professional/finance-critical-step-up";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { customerFacingError } from "@/lib/customer-facing-language";

type StockDisposition = "RESTOCK" | "QUARANTINE" | "DISPOSE" | "SERVICE_CREDIT" | "UNDELIVERED_CREDIT";
type CheckoutLine = { id: string; invoiceItemId: string; inventoryItemId: string | null };
type InvoiceItem = { id: string; description: string; quantity: string; totalAmount: string };
type BatchChoice = { stockLotId: string; quantity: string };
type BatchOption = { stockLotId: string; lotNumber: string; quantityIssued: string; quantityAvailable: string };
type RequestLine = { id: string; checkoutLineId: string; quantity: string; refundAmount: string; stockDisposition: StockDisposition; lotAllocations?: BatchChoice[] | null };
type ReturnRequest = {
  id: string;
  number: string;
  status: string;
  revision: number;
  reason: string;
  refundAmount: string;
  refundPayoutAmount: string | null;
  payoutPreviewAmount?: string;
  refundChoice?: "NOW" | "LATER" | null;
  canExpress?: boolean;
  expressLimitFallback?: "FX_RATE_REQUIRED_OR_STALE" | "LIMIT_EXCEEDED" | "STANDARD_APPROVAL_REQUIRED" | null;
  canFinalizeDeferred?: boolean;
  deferredCashDisbursementRequired?: boolean;
  inspectedAt: string | null;
  inspectionNotes: string | null;
  inspectionMode?: "SELF_ATTESTED" | "INDEPENDENT" | null;
  canSelfInspect?: boolean;
  decisionReason: string | null;
  createdAt: string;
  canInspect: boolean;
  requiresPhysicalInspection: boolean;
  canDecide: boolean;
  canPrepareFinance: boolean;
  canSettleFinance: boolean;
  paymentApprovalStatus: string | null;
  paymentApprovalCount: number;
  paymentApprovalTotal: number;
  creditApprovalStatus: string | null;
  lines: RequestLine[];
};
type ReturnResponse = {
  items: ReturnRequest[];
  stockPostedAt: boolean;
  batchOptions?: Record<string, BatchOption[]>;
  canRequest: boolean;
  pagination: { page: number; pageCount: number; total: number };
  message?: string;
};
type Row = { checked: boolean; quantity: string; stockDisposition: StockDisposition; batches?: Record<string, string> };
type Action = { request: ReturnRequest; type: "INSPECT" | "APPROVE" | "REJECT" | "PREPARE_FINANCE" | "SETTLE_FINANCE" | "COMPLETE_DEFERRED" };

const translations = {
  fr: {
    batchTitle: "Lots réellement rapportés", batchHelp: "Indiquez les quantités par lot ; leur somme doit correspondre à la quantité créditée.", batchAvailable: "Encore retournable", batchMismatch: "Vérifiez les quantités réellement rapportées par lot. Leur somme doit correspondre au retour et ne pas dépasser le solde retournable.", batchConfirm: "Je confirme avoir physiquement contrôlé les numéros de lots et les quantités ci-dessus.", batchMissing: "Aucun lot retournable identifié. Actualisez ou contactez le support.",
    trigger: "Annulation et avoirs", title: "Annulation, retour et avoir", explain: "Une facture comptabilisée n'est jamais effacée. L'avoir réduit la créance et le remboursement se limite au trop-perçu déjà encaissé. Les articles livrés exigent un contrôle documenté ; les prestations et articles non livrés une vérification enregistrée. Le gérant autorisé ne liquide jamais lui-même l'opération.",
    refresh: "Actualiser", loading: "Chargement des demandes…", empty: "Aucune demande de retour enregistrée.", error: "Impossible de charger les retours de cette facture.",
    undeliveredCredit: "Article non encore livré : libérer la réservation sans mouvement de stock",
    independentCheck: "Vérification indépendante (service ou marchandise non livrée)",
    new: "Demander l'annulation / un avoir", newHint: "Facture émise, partiellement payée ou soldée : sélectionnez les lignes à créditer. Le calcul final protège la créance, le taux de taxe et le montant effectivement encaissé.",
    item: "Article ou prestation", quantity: "Quantité créditée", disposition: "Traitement de ligne", restock: "Réintégrer en stock", quarantine: "Placer en quarantaine", dispose: "Écarter / détruire", serviceCredit: "Prestation / article non stocké : avoir sans mouvement de stock", payout: "Remboursement réel", payoutPending: "À déterminer en Finance", financeApprover: "Validateur Finance indépendant", reason: "Motif du retour", approver: "Validateur Finance (vous-même si exception accordée)", send: "Soumettre la demande", cancel: "Annuler", sending: "Enregistrement…", createSuccess: "Demande enregistrée. Un contrôle de réception autorisé est maintenant attendu.",
    selfInspection: "Attester mon contrôle", selfAttested: "Contrôle effectué par le demandeur habilité", independentAttested: "Contrôle indépendant enregistré",
    refundChoiceLabel: "Traitement après validation", refundChoiceStandard: "Circuit Finance standard",
    refundChoiceNow: "Rembourser immédiatement (espèces réellement remises)",
    refundChoiceLater: "Comptabiliser l’avoir et rembourser plus tard",
    refundChoiceHelp: "Le montant encaissé remboursable est calculé par le serveur. Mode express sous plafond de 100 USD. Aucun paiement fictif n’est créé pour une facture impayée.",
    cashHandedOver: "Je confirme avoir réellement remis les espèces au client",
    expressCompleted: "Avoir comptabilisé, stock régularisé et remboursement confirmé.",
    expressDeferred: "Avoir comptabilisé, remboursement enregistré en attente de paiement.",
    deferred: "Remboursement différé en attente", deferredAction: "Finaliser le remboursement différé", deferredHint: "L’avoir et le stock sont déjà comptabilisés. Pour les espèces, attestez la remise au client ; pour les paiements externes, la confirmation préalable dans Finance par un intervenant indépendant est obligatoire. Aucun nouvel avoir ni mouvement de stock.", deferredSuccess: "Remboursement différé confirmé et dossier clôturé.",
    requests: "Historique des retours", amount: "Montant de l'avoir", submitted: "En attente d’inspection", inspected: "Inspectée — validation attendue", approved: "Approuvée — aucun remboursement effectué", financePending: "Pièces Finance en attente", rejected: "Refusée", completed: "Avoir et liquidation terminés", unknown: "À vérifier", inspection: "Inspecter / vérifier", approve: "Approuver la demande", reject: "Refuser", inspectionNotes: "Constat de contrôle", inspectionHint: "Confirmez uniquement les articles réellement reçus et contrôlés. L’inspection ne réintègre pas encore le stock.", confirmInspection: "Confirmer l’inspection", decisionHint: "La validation de cette demande ne crée pas encore d’avoir ni de remboursement. Le traitement financier et du stock suivra un circuit distinct.", rejectionReason: "Motif du refus (obligatoire)", decisionReason: "Commentaire de validation (facultatif)", confirmApprove: "Confirmer l’approbation", confirmReject: "Confirmer le refus", inspectionSuccess: "Contrôle enregistré. Le validateur désigné peut maintenant statuer.", approvalSuccess: "Retour approuvé. L’avoir et le remboursement restent en attente du circuit de liquidation.", rejectionSuccess: "Retour refusé avec motif conservé.", noAmount: "Les montants proposés sont calculés par le serveur, après validation des quantités.",
    prepareFinance: "Préparer avoir et remboursement", prepareFinanceHint: "Le serveur sépare la valeur de l'avoir et les éventuels remboursements des paiements déjà reçus. Un avoir sans trop-perçu ne génère aucun paiement. Désignez un validateur Finance indépendant pour les pièces.", confirmPrepareFinance: "Envoyer en validation Finance", prepareFinanceSuccess: "Avoir et paiements de remboursement créés ensemble et soumis à validation Finance.", settleFinance: "Liquider le retour", settleFinanceHint: "Cette étape confirme tous les paiements de remboursement, comptabilise l'avoir unique et réintègre uniquement les articles acceptés en stock dans une transaction indivisible.", settlementReason: "Motif de liquidation", confirmSettleFinance: "Confirmer la liquidation", settleFinanceSuccess: "Remboursements, avoir et stock traités dans une même transaction.", paymentApproval: "Remboursements", creditApproval: "Avoir", financeApproved: "Approuvé", financeAwaiting: "Validation attendue", financeGuide: "Validez tous les paiements et l'avoir dans Finance puis actualisez les retours.",
    previous: "Précédente", next: "Suivante", close: "Fermer", select: "Sélectionner", rowMissing: "Aucune ligne facturée n’est disponible pour créer un retour.", itemRequired: "Sélectionnez au moins un article avec une quantité valide.", invalidQuantity: "La quantité doit être positive, ne pas dépasser la facture et avoir au plus 3 décimales pour un article en stock. Les quantités déjà engagées sont revérifiées par le serveur.",
  },
  en: {
    batchTitle: "Batches actually returned", batchHelp: "Enter quantities by batch; their sum must match the credited quantity.", batchAvailable: "Still returnable", batchMismatch: "Check the physical quantities by batch. Their sum must match the return and stay within the returnable balance.", batchConfirm: "I confirm that I physically checked the batch numbers and quantities above.", batchMissing: "No identified returnable batch. Refresh or contact support.",
    trigger: "Cancellation and credits", title: "Cancellation, returns and credit notes", explain: "Posted invoices are never erased. The credit note reduces receivables and refunds cover only excess amounts already collected. Delivered goods require a documented inspection; services and unfulfilled goods require a recorded verification. An authorized manager cannot settle their own request.",
    refresh: "Refresh", loading: "Loading return requests…", empty: "No return requests yet.", error: "Unable to load this invoice's returns.",
    undeliveredCredit: "Goods not yet delivered: release stock hold, no inventory movement",
    independentCheck: "Independent verification (service or undelivered goods)",
    new: "Request cancellation / credit", newHint: "Issued, partly paid or settled invoice: select the lines to credit. The server protects outstanding receivables, taxes and amounts previously collected.",
    item: "Item or service", quantity: "Quantity credited", disposition: "Line treatment", restock: "Return to stock", quarantine: "Quarantine", dispose: "Discard / destroy", serviceCredit: "Service / non-stock item: credit with no inventory movement", payout: "Cash refund", payoutPending: "To be determined by Finance", financeApprover: "Independent Finance approver", reason: "Return reason", approver: "Finance approver (yourself if owner-authorized)", send: "Submit request", cancel: "Cancel", sending: "Saving…", createSuccess: "Request registered. An authorized return inspection is now required.",
    selfInspection: "Record my inspection", selfAttested: "Inspected by authorized requester", independentAttested: "Independent inspection recorded",
    refundChoiceLabel: "Action after approval", refundChoiceStandard: "Standard Finance workflow",
    refundChoiceNow: "Refund now (cash physically handed to customer)",
    refundChoiceLater: "Post credit note and refund later",
    refundChoiceHelp: "The refundable part of money already collected is computed by the server. Express mode is capped at USD 100. An unpaid invoice never creates a phantom refund.",
    cashHandedOver: "I confirm I have physically handed the cash to the customer",
    expressCompleted: "Credit posted, stock reconciled and cash refund confirmed.",
    expressDeferred: "Credit posted; customer refund recorded as pending.",
    deferred: "Deferred customer refund outstanding", deferredAction: "Finalize deferred refund", deferredHint: "The credit and inventory have already been posted. For cash, confirm actual handover; for external payouts, a prior independent Finance confirmation is required. No duplicate credit or inventory movement.", deferredSuccess: "Deferred refund confirmed; return completed.",
    requests: "Return history", amount: "Credit note amount", submitted: "Awaiting inspection", inspected: "Inspected — awaiting approval", approved: "Approved — not refunded", financePending: "Finance documents pending", rejected: "Rejected", completed: "Credit and settlement completed", unknown: "Check status", inspection: "Inspect / verify", approve: "Approve request", reject: "Reject", inspectionNotes: "Inspection findings", inspectionHint: "Only confirm goods that were actually received and inspected. This does not restock inventory yet.", confirmInspection: "Confirm inspection", decisionHint: "Approving this request does not yet create a credit note or a refund. Financial and inventory settlement will follow a separate process.", rejectionReason: "Rejection reason (required)", decisionReason: "Approval note (optional)", confirmApprove: "Confirm approval", confirmReject: "Confirm rejection", inspectionSuccess: "Inspection recorded. The designated approver can now decide.", approvalSuccess: "Return approved. The credit and refund still await settlement.", rejectionSuccess: "Return rejected with the reason preserved.", noAmount: "Proposed amounts are calculated by the server after quantity validation.",
    prepareFinance: "Prepare credit and refund", prepareFinanceHint: "The server separates credit-note value from any actual cash refund due. Credits without excess payment create no outgoing payment. Choose an independent Finance reviewer for credit and refund documents.", confirmPrepareFinance: "Submit for Finance approval", prepareFinanceSuccess: "Credit note and refund payouts created together and submitted for Finance approval.", settleFinance: "Settle return", settleFinanceHint: "This step confirms every refund payout, posts the single credit note and restocks accepted items in one indivisible transaction.", settlementReason: "Settlement reason", confirmSettleFinance: "Confirm settlement", settleFinanceSuccess: "Refund payouts, credit note and inventory completed in the same transaction.", paymentApproval: "Refund payouts", creditApproval: "Credit note", financeApproved: "Approved", financeAwaiting: "Awaiting approval", financeGuide: "Approve all refund payouts and the credit note in Finance, then refresh returns.",
    previous: "Previous", next: "Next", close: "Close", select: "Select", rowMissing: "No invoice lines are available for this return.", itemRequired: "Select at least one item with a valid quantity.", invalidQuantity: "Quantity must be positive, not exceed the invoice and use no more than 3 decimal places for stocked items. Existing commitments are checked again by the server.",
  },
} as const;

function statusLabel(status: string, copy: typeof translations.fr | typeof translations.en) {
  return ({ SUBMITTED: copy.submitted, INSPECTED: copy.inspected, APPROVED: copy.approved,
    FINANCE_PENDING: copy.financePending, REFUND_PENDING: copy.deferred, REJECTED: copy.rejected, COMPLETED: copy.completed } as Record<string, string>)[status] || copy.unknown;
}

export function RetailInvoiceReturnDialog({ organizationId, invoiceId, invoiceNumber, invoiceStatus, siteId, currencyCode, checkoutLines, invoiceItems, locale, onChanged, autoOpen = false }: {
  organizationId: string; invoiceId: string; invoiceNumber: string; invoiceStatus?: string; siteId: string; currencyCode: string;
  checkoutLines: CheckoutLine[]; invoiceItems: InvoiceItem[]; locale: "fr" | "en"; onChanged: () => void; autoOpen?: boolean;
}) {
  const copy = translations[locale];
  const [open, setOpen] = useState(autoOpen);
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
  const [batchConfirmed, setBatchConfirmed] = useState(false);
  const [refundChoice, setRefundChoice] = useState<"STANDARD" | "NOW" | "LATER">("LATER");
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
    const defaultDisposition: StockDisposition = !hasStock ? "SERVICE_CREDIT" : data?.stockPostedAt ? "RESTOCK" : "UNDELIVERED_CREDIT";
    setRows((previous) => ({ ...previous, [id]: { ...(previous[id] || { checked: false, quantity: "1", stockDisposition: defaultDisposition }), ...change } }));
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
      options: data?.batchOptions?.[line.id],
      lotAllocations: Object.entries(rows[line.id].batches || {}).filter(([,quantity]) => Number(quantity) > 0).map(([stockLotId,quantity]) => ({ stockLotId, quantity })),
    }));
    if (!selected.length) { setError(copy.itemRequired); return; }
    if (selected.some((line) => !/^\d+(?:\.\d{1,6})?$/.test(line.quantity) ||
      Number(line.quantity) <= 0 || Number(line.quantity) > Number(line.invoicedQuantity) ||
      (line.hasStock && !/^\d+(?:\.\d{1,3})?$/.test(line.quantity)))) {
      setError(copy.invalidQuantity); return;
    }
    if (selected.some(line => line.options !== undefined && (!line.lotAllocations.length ||
      line.lotAllocations.some(batch => !/^\d+(\.\d{1,3})?$/.test(batch.quantity) || !line.options!.some(option => option.stockLotId === batch.stockLotId && Number(batch.quantity) <= Number(option.quantityAvailable))) ||
      line.lotAllocations.reduce((sum,batch) => sum + Math.round(Number(batch.quantity)*1000),0) !== Math.round(Number(line.quantity)*1000)))) { setError(copy.batchMismatch); return; }
    setBusy(true); setError("");
    try {
      if (!key.current) key.current = crypto.randomUUID();
      const response = await fetch(`/api/enterprise/${organizationId}/retail/invoices/${encodeURIComponent(invoiceId)}/returns`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: key.current, approverUserId, reason: reason.trim(),
          lines: selected.map(({ checkoutLineId, quantity, stockDisposition, options, lotAllocations }) => ({ checkoutLineId, quantity, stockDisposition, ...(options !== undefined ? { lotAllocations } : {}) })) }),
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || copy.error);
      toastSuccess(copy.createSuccess); setCreating(false); setRows({}); key.current = "";
      await load(1); onChanged();
    } catch (caught) { const message = customerFacingError(caught, locale); setError(message); toastError(message); }
    finally { setBusy(false); }
  }

  async function completeAction(form?: FormData) {
    if (!action || busy || (action.type === "INSPECT" && (actionNotes.trim().length < 5 || (action.request.lines.some(line => line.lotAllocations?.length) && !batchConfirmed))) ||
      (["REJECT", "SETTLE_FINANCE", "COMPLETE_DEFERRED"].includes(action.type) && actionNotes.trim().length < 4)) return;
    setBusy(true); setError("");
    try {
      const target = `/api/enterprise/${organizationId}/retail/invoices/${encodeURIComponent(invoiceId)}/returns/${encodeURIComponent(action.request.id)}`;
      const inspection = action.type === "INSPECT";
      const financePrepare = action.type === "PREPARE_FINANCE";
      const deferredSettlement = action.type === "COMPLETE_DEFERRED";
      const financeSettlement = action.type === "SETTLE_FINANCE" || deferredSettlement;
      const expressChoice = action.type === "APPROVE" && action.request.canExpress &&
        Number(action.request.payoutPreviewAmount || 0) > 0 && refundChoice !== "STANDARD"
        ? refundChoice : null;
      if (financeSettlement || expressChoice) {
        if (!form) throw new Error(locale === "fr" ? "Vérification de sécurité requise." : "Security verification required.");
        if ((expressChoice === "NOW" || deferredSettlement && action.request.deferredCashDisbursementRequired) && form.get("cashHandedOver") !== "on") {
          throw new Error(locale === "fr" ? "Confirmez la remise effective des espèces au client." : "Confirm that cash was physically handed to the customer.");
        }
        await performFinanceCriticalStepUp(form, "CONFIRM");
      }
      const path = financePrepare ? "prepare" : financeSettlement ? "settle" : inspection ? "inspection" : "decision";
      const response = await fetch(`${target}/${path}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(financePrepare ? { revision: action.request.revision, financeApproverUserId: String(form?.get("financeApproverUserId") || "") } : financeSettlement
          ? { revision: action.request.revision, reason: actionNotes.trim(), ...(deferredSettlement ? { completeDeferred: true,
            ...(action.request.deferredCashDisbursementRequired ? { cashHandedOver: true } : {}) } : {}) } : inspection
          ? { revision: action.request.revision, receivedAndInspected: true, notes: actionNotes.trim(), ...(action.request.lines.some(line => line.lotAllocations?.length) ? { confirmedBatchSelection: true } : {}) }
          : { revision: action.request.revision, decision: action.type === "APPROVE" ? "APPROVE" : "REJECT",
            ...(actionNotes.trim() ? { reason: actionNotes.trim() } : {}),
            ...(expressChoice ? { refundChoice: expressChoice,
              ...(expressChoice === "NOW" ? { cashHandedOver: true } : {}) } : {}) }),
      });
      const payload = await response.json().catch(() => null) as { message?: string; error?: string; request?: { status: string } } | null;
      if (!response.ok) throw new Error(payload?.message || payload?.error || copy.error);
      toastSuccess(financePrepare ? copy.prepareFinanceSuccess : deferredSettlement ? copy.deferredSuccess : financeSettlement ? copy.settleFinanceSuccess :
        inspection ? copy.inspectionSuccess : action.type === "APPROVE" && payload?.request?.status === "REFUND_PENDING" ? copy.expressDeferred :
        action.type === "APPROVE" && payload?.request?.status === "COMPLETED" ? copy.expressCompleted :
        action.type === "APPROVE" ? copy.approvalSuccess : copy.rejectionSuccess);
      setAction(null); setActionNotes(""); await load(page); onChanged();
    } catch (caught) { const message = customerFacingError(caught, locale); setError(message); toastError(message); }
    finally { setBusy(false); }
  }

  const batchLabel = (line: RequestLine, batch: BatchChoice) => data?.batchOptions?.[line.checkoutLineId]?.find(option => option.stockLotId === batch.stockLotId)?.lotNumber || batch.stockLotId;
  const money = (amount: string) => `${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 2 }).format(Number(amount))} ${currencyCode}`;
  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}><RotateCcw className="h-4 w-4" />{copy.trigger}</Button>
    <Dialog open={open} onClose={() => { if (!busy) { setOpen(false); setCreating(false); setAction(null); } }} title={`${copy.title} · ${invoiceNumber}`} description={copy.explain} className="max-w-3xl" presentation="editor">
      <div className="grid min-w-0 gap-4">
        {invoiceStatus === "PAID" ? <p data-testid="retail-fully-paid-return-guidance" role="note" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-dtsc-ink">
          {locale === "fr"
            ? "Facture intégralement payée : elle ne peut plus être effacée ni annulée directement. Le retour crée un avoir comptable et le remboursement doit correspondre aux fonds réellement encaissés. Si le plafond express de 100 USD par facture est dépassé (y compris en CDF), choisissez le circuit Finance standard. Les articles déjà sortis exigent l'inspection réelle et, le cas échéant, les lots d'origine."
            : "Fully paid invoice: it cannot be erased or directly voided. A return creates a credit note, with refunds limited to actually collected funds. Above the USD 100 per-invoice express cap (including FX), use Standard Finance workflow. Posted goods require real inspection and original batches when applicable."}
        </p> : null}
        {error ? <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
        <div className="flex min-w-0 flex-wrap justify-between gap-2">
          <Button type="button" variant="outline" disabled={loading || busy} onClick={() => void load(page)}>{copy.refresh}</Button>
          {data?.canRequest && !creating && !action ? <Button type="button" disabled={busy} onClick={startCreate}><RotateCcw className="h-4 w-4" />{copy.new}</Button> : null}
        </div>
        {creating && data?.canRequest ? <form className="grid min-w-0 gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void createRequest(String(form.get("approverUserId") || "")); }}>
          <h3 className="text-sm font-black text-dtsc-ink">{copy.new}</h3>
          <p className="text-xs leading-5 text-dtsc-muted">{copy.newHint}</p>
          {!sourceItems.length ? <p className="text-sm text-amber-700 dark:text-amber-300">{copy.rowMissing}</p> : sourceItems.map((line) => {
            const batchOptions = data.batchOptions?.[line.id];
            const value: Row = rows[line.id] || { checked: false, quantity: "1", stockDisposition: !line.inventoryItemId ? "SERVICE_CREDIT" : data.stockPostedAt ? "RESTOCK" : "UNDELIVERED_CREDIT" };
            return <div key={line.id} className="grid min-w-0 gap-2 rounded-lg border border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,7rem)_minmax(0,12rem)] sm:items-end">
              <label className="flex min-w-0 items-start gap-2 text-sm font-semibold text-dtsc-ink"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-dtsc-blue" checked={value.checked} disabled={busy} onChange={(event) => rowUpdate(line.id, { checked: event.target.checked }, Boolean(line.inventoryItemId))} /><span className="min-w-0 break-words">{line.item.description}<span className="mt-1 block text-xs font-normal text-dtsc-muted">{copy.quantity} ≤ {line.item.quantity}</span></span></label>
              <label className="grid min-w-0 gap-1 text-xs font-semibold text-dtsc-ink">{copy.quantity}<input type="number" inputMode="decimal" className="min-h-11 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-base" step={line.inventoryItemId ? "0.001" : "0.000001"} min={line.inventoryItemId ? "0.001" : "0.000001"} max={line.item.quantity} value={value.quantity} disabled={!value.checked || busy} onChange={(event) => rowUpdate(line.id, { quantity: event.target.value }, Boolean(line.inventoryItemId))} /></label>
              <label className="grid min-w-0 gap-1 text-xs font-semibold text-dtsc-ink">{copy.disposition}<select className="min-h-11 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-sm" value={value.stockDisposition} disabled={!value.checked || busy} onChange={(event) => rowUpdate(line.id, { stockDisposition: event.target.value as StockDisposition }, Boolean(line.inventoryItemId))}>{!line.inventoryItemId ? <option value="SERVICE_CREDIT">{copy.serviceCredit}</option> : !data.stockPostedAt ? <option value="UNDELIVERED_CREDIT">{copy.undeliveredCredit}</option> : <><option value="RESTOCK">{copy.restock}</option><option value="QUARANTINE">{copy.quarantine}</option><option value="DISPOSE">{copy.dispose}</option></>}</select></label>
              {batchOptions !== undefined && value.checked ? <div className="grid min-w-0 gap-2 rounded-lg border border-dtsc-border bg-dtsc-page p-3 sm:col-span-3"><p className="text-sm font-bold">{copy.batchTitle}</p><p className="text-xs text-dtsc-muted">{copy.batchHelp}</p>{batchOptions.length ? batchOptions.map(option => <label key={option.stockLotId} className="grid min-w-0 grid-cols-[minmax(0,1fr)_7rem] items-center gap-2 text-xs"><span className="break-words"><strong>{option.lotNumber}</strong><span className="block text-dtsc-muted">{copy.batchAvailable}: {option.quantityAvailable}</span></span><input aria-label={option.lotNumber} type="number" min="0" max={option.quantityAvailable} step="0.001" value={value.batches?.[option.stockLotId] || ""} disabled={busy || Number(option.quantityAvailable) <= 0} onChange={event => rowUpdate(line.id, { batches: { ...value.batches, [option.stockLotId]: event.target.value } }, Boolean(line.inventoryItemId))} className="min-h-10 min-w-0 rounded-lg border border-dtsc-border bg-dtsc-surface px-2 text-sm" /></label>) : <p className="text-xs text-amber-700 dark:text-amber-200">{copy.batchMissing}</p>}</div> : null}
            </div>;
          })}
          <p className="text-xs text-dtsc-muted">{copy.noAmount}</p>
          <label className="grid min-w-0 gap-1 text-sm font-semibold text-dtsc-ink">{copy.reason}<textarea className="min-h-24 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-surface p-3 text-base" minLength={4} maxLength={1000} required disabled={busy} value={reason} onChange={(event) => { setReason(event.target.value); key.current = ""; }} /></label>
          <EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_RECEIVABLES" locale={locale} label={copy.approver} disabled={busy} candidatesEndpoint={`/api/enterprise/${organizationId}/retail/invoices/return-approval-candidates?siteId=${encodeURIComponent(siteId)}`} />
          <div data-responsive-actions className="flex min-w-0 flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={stopCreate}>{copy.cancel}</Button><Button type="submit" disabled={busy || !sourceItems.some((line) => rows[line.id]?.checked) || reason.trim().length < 4}><ClipboardCheck className="h-4 w-4" />{busy ? copy.sending : copy.send}</Button></div>
        </form> : null}
        {action ? <form className="grid min-w-0 gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 sm:p-4" onSubmit={(event) => { event.preventDefault(); void completeAction(new FormData(event.currentTarget)); }}>
          <h3 className="text-sm font-black text-dtsc-ink">{action.type === "INSPECT" ? copy.inspection : action.type === "APPROVE" ? copy.approve : action.type === "REJECT" ? copy.reject : action.type === "PREPARE_FINANCE" ? copy.prepareFinance : action.type === "COMPLETE_DEFERRED" ? copy.deferredAction : copy.settleFinance} · {action.request.number}</h3>
          <p className="text-sm leading-6 text-dtsc-muted">{action.type === "INSPECT" && !action.request.requiresPhysicalInspection ? copy.independentCheck : action.type === "INSPECT" ? copy.inspectionHint : action.type === "PREPARE_FINANCE" ? copy.prepareFinanceHint : action.type === "COMPLETE_DEFERRED" ? copy.deferredHint : action.type === "SETTLE_FINANCE" ? copy.settleFinanceHint : copy.decisionHint}</p>
          {action.type === "INSPECT" && action.request.lines.some(line => line.lotAllocations?.length) ? <div className="grid gap-2 rounded-lg border border-dtsc-border bg-dtsc-surface p-3"><p className="text-sm font-bold">{copy.batchTitle}</p>{action.request.lines.flatMap(line => (line.lotAllocations || []).map(batch => <p key={line.id + batch.stockLotId} className="break-words text-xs">{sourceItems.find(item => item.id === line.checkoutLineId)?.item.description} · {batchLabel(line,batch)} · {batch.quantity}</p>))}<label className="flex gap-2 text-sm"><input type="checkbox" required checked={batchConfirmed} disabled={busy} onChange={event => setBatchConfirmed(event.target.checked)} />{copy.batchConfirm}</label></div> : null}
          {action.type === "COMPLETE_DEFERRED" && action.request.deferredCashDisbursementRequired ? <label className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm font-semibold text-dtsc-ink">
            <input type="checkbox" name="cashHandedOver" required disabled={busy} />{copy.cashHandedOver}
          </label> : null}
          {action.type === "PREPARE_FINANCE" ? <EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_RECEIVABLES" locale={locale} name="financeApproverUserId" label={copy.financeApprover} disabled={busy} required /> : null}
          {action.type !== "PREPARE_FINANCE" ? <label className="grid min-w-0 gap-1 text-sm font-semibold text-dtsc-ink">{action.type === "INSPECT" ? copy.inspectionNotes : action.type === "REJECT" ? copy.rejectionReason : ["SETTLE_FINANCE", "COMPLETE_DEFERRED"].includes(action.type) ? copy.settlementReason : copy.decisionReason}<textarea className="min-h-28 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-surface p-3 text-base" minLength={action.type === "INSPECT" ? 5 : ["REJECT", "SETTLE_FINANCE", "COMPLETE_DEFERRED"].includes(action.type) ? 4 : undefined} maxLength={1000} required={["INSPECT", "REJECT", "SETTLE_FINANCE", "COMPLETE_DEFERRED"].includes(action.type)} value={actionNotes} disabled={busy} onChange={(event) => setActionNotes(event.target.value)} /></label> : null}
          {action.type === "APPROVE" && action.request.expressLimitFallback ? <p role="note" data-testid="retail-return-standard-finance-fallback" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-5 text-dtsc-ink">
            {action.request.expressLimitFallback === "LIMIT_EXCEEDED"
              ? locale === "fr" ? "Le remboursement réel dépasse le plafond express cumulé de 100 USD. Ce retour doit être approuvé puis traité dans le circuit Finance standard, avec des intervenants indépendants." : "The real refund exceeds the USD 100 cumulative express cap. Approve this return and complete it through Standard Finance workflow with independent actors."
              : action.request.expressLimitFallback === "FX_RATE_REQUIRED_OR_STALE"
                ? locale === "fr" ? "Aucun taux Finance USD récent ne permet de vérifier le plafond express. Utilisez le circuit Finance standard, ou mettez les taux à jour avant d'actualiser." : "No fresh Finance USD exchange rate is available for the express cap. Use Standard Finance workflow or update the exchange rate."
                : locale === "fr" ? "Le remboursement express n'est pas autorisé pour ce dossier ; terminez la procédure Finance standard." : "Express refund is not authorized for this return. Complete the standard Finance workflow."}
          </p> : null}
          {action.type === "APPROVE" && action.request.canExpress && Number(action.request.payoutPreviewAmount || 0) > 0 ? <div className="grid gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
            <h4 className="text-sm font-black text-dtsc-ink">{copy.refundChoiceLabel} · {money(action.request.payoutPreviewAmount || "0")}</h4>
            <p className="text-xs leading-5 text-dtsc-muted">{copy.refundChoiceHelp}</p>
            <div className="grid gap-2">
              {([["LATER", copy.refundChoiceLater], ["NOW", copy.refundChoiceNow], ["STANDARD", copy.refundChoiceStandard]] as const).map(([value, label]) =>
                <label key={value} className="flex min-h-11 items-center gap-3 rounded-lg border border-dtsc-border bg-dtsc-surface p-3 text-sm font-medium text-dtsc-ink">
                  <input type="radio" name="refundChoice" value={value} checked={refundChoice === value} disabled={busy} onChange={() => setRefundChoice(value)} />{label}
                </label>)}
            </div>
            {refundChoice === "NOW" ? <label className="flex gap-3 text-sm font-semibold text-dtsc-ink"><input type="checkbox" name="cashHandedOver" required disabled={busy} />{copy.cashHandedOver}</label> : null}
          </div> : null}
          {(["SETTLE_FINANCE", "COMPLETE_DEFERRED"].includes(action.type) ||
            (action.type === "APPROVE" && action.request.canExpress && Number(action.request.payoutPreviewAmount || 0) > 0 && refundChoice !== "STANDARD")) ?
            <FinanceCriticalStepUpFields action="CONFIRM" locale={locale} /> : null}
          <div data-responsive-actions className="flex min-w-0 flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => { setAction(null); setActionNotes(""); }}>{copy.cancel}</Button><Button type="submit" disabled={busy || (action.type === "INSPECT" && actionNotes.trim().length < 5) || (["REJECT", "SETTLE_FINANCE", "COMPLETE_DEFERRED"].includes(action.type) && actionNotes.trim().length < 4)}>{action.type === "INSPECT" ? copy.confirmInspection : action.type === "APPROVE" ? copy.confirmApprove : action.type === "REJECT" ? copy.confirmReject : action.type === "PREPARE_FINANCE" ? copy.confirmPrepareFinance : action.type === "COMPLETE_DEFERRED" ? copy.deferredAction : copy.confirmSettleFinance}</Button></div>
        </form> : null}
        <div className="grid min-w-0 gap-3 border-t border-dtsc-border pt-3">
          <h3 className="text-sm font-black text-dtsc-ink">{copy.requests}</h3>
          {loading ? <p role="status" className="text-sm text-dtsc-muted">{copy.loading}</p> : null}
          {!loading && data && !data.items.length ? <p className="text-sm text-dtsc-muted">{copy.empty}</p> : null}
          {data?.items.map((request) => <article key={request.id} className="grid min-w-0 gap-2 rounded-lg border border-dtsc-border bg-dtsc-page p-3">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><span className="min-w-0 break-words text-sm font-black text-dtsc-ink">{request.number}</span><span className={`rounded-full px-2 py-1 text-xs font-bold ${request.status === "REJECTED" ? "bg-red-500/10 text-red-700 dark:text-red-300" : request.status === "APPROVED" ? "bg-amber-500/10 text-amber-800 dark:text-amber-200" : "bg-blue-500/10 text-blue-700 dark:text-blue-300"}`}>{statusLabel(request.status, copy)}</span></div>
            <p className="text-sm text-dtsc-ink">{request.reason}</p>
            <p className="text-xs text-dtsc-muted">{copy.amount} : <strong className="text-dtsc-ink">{money(request.refundAmount)}</strong> · {copy.payout} : <strong className="text-dtsc-ink">{request.refundPayoutAmount !== null ? money(request.refundPayoutAmount) : copy.payoutPending}</strong> · {new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", { dateStyle: "medium" }).format(new Date(request.createdAt))}</p>
            <ul className="grid min-w-0 gap-1 text-xs text-dtsc-muted">{request.lines.map((line) => <li key={line.id} className="break-words">{sourceItems.find((item) => item.id === line.checkoutLineId)?.item.description || copy.item} · {line.quantity} · {line.stockDisposition === "RESTOCK" ? copy.restock : line.stockDisposition === "SERVICE_CREDIT" ? copy.serviceCredit : line.stockDisposition === "UNDELIVERED_CREDIT" ? copy.undeliveredCredit : line.stockDisposition === "QUARANTINE" ? copy.quarantine : copy.dispose}{line.lotAllocations?.map(batch => <span className="block" key={batch.stockLotId}>{batchLabel(line,batch)} · {batch.quantity}</span>)}</li>)}</ul>
            {request.inspectionNotes ? <p className="text-xs text-dtsc-muted"><PackageSearch className="mr-1 inline h-3.5 w-3.5" />
              {request.inspectionMode === "SELF_ATTESTED" ? copy.selfAttested : copy.independentAttested} · {request.inspectionNotes}
            </p> : null}
            {request.decisionReason ? <p className="text-xs text-dtsc-muted">{request.decisionReason}</p> : null}
            {request.status === "FINANCE_PENDING" ? <div className="grid gap-1 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2 text-xs text-dtsc-ink">
              <p>{copy.paymentApproval} ({request.paymentApprovalCount}/{request.paymentApprovalTotal}): <strong>{request.paymentApprovalStatus === "APPROVED" && request.paymentApprovalCount === request.paymentApprovalTotal ? copy.financeApproved : copy.financeAwaiting}</strong> · {copy.creditApproval}: <strong>{request.creditApprovalStatus === "APPROVED" ? copy.financeApproved : copy.financeAwaiting}</strong></p>
              {!request.canSettleFinance ? <p className="text-dtsc-muted">{copy.financeGuide}</p> : null}
            </div> : null}
            <div data-responsive-actions className="flex min-w-0 flex-wrap justify-end gap-2">
              {request.canInspect ? <Button type="button" variant="outline" disabled={busy} onClick={() => { setCreating(false); setAction({ request, type: "INSPECT" }); setActionNotes(""); setBatchConfirmed(false); }}><PackageSearch className="h-4 w-4" />{request.canSelfInspect ? copy.selfInspection : request.requiresPhysicalInspection ? copy.inspection : copy.independentCheck}</Button> : null}
              {request.canDecide && request.status === "INSPECTED" ? <Button type="button" disabled={busy} onClick={() => { setCreating(false); setAction({ request, type: "APPROVE" }); setActionNotes(""); }}><ShieldCheck className="h-4 w-4" />{copy.approve}</Button> : null}
              {request.canDecide ? <Button type="button" variant="outline" disabled={busy} onClick={() => { setCreating(false); setAction({ request, type: "REJECT" }); setActionNotes(""); }}><ShieldX className="h-4 w-4" />{copy.reject}</Button> : null}
              {request.canPrepareFinance ? <Button type="button" variant="outline" disabled={busy} onClick={() => { setCreating(false); setAction({ request, type: "PREPARE_FINANCE" }); setActionNotes(""); }}><CreditCard className="h-4 w-4" />{copy.prepareFinance}</Button> : null}
              {request.canSettleFinance ? <Button type="button" disabled={busy} onClick={() => { setCreating(false); setAction({ request, type: "SETTLE_FINANCE" }); setActionNotes(""); }}><CreditCard className="h-4 w-4" />{copy.settleFinance}</Button> : null}
              {request.canFinalizeDeferred ? <Button type="button" disabled={busy} onClick={() => { setCreating(false); setAction({ request, type: "COMPLETE_DEFERRED" }); setActionNotes(""); }}><CreditCard className="h-4 w-4" />{copy.deferredAction}</Button> : null}
            </div>
          </article>)}
          {data && data.pagination.pageCount > 1 ? <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-dtsc-muted"><span>{page} / {data.pagination.pageCount} · {data.pagination.total}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={busy || loading || page <= 1} onClick={() => void load(page - 1)}>{copy.previous}</Button><Button type="button" variant="outline" disabled={busy || loading || page >= data.pagination.pageCount} onClick={() => void load(page + 1)}>{copy.next}</Button></div></div> : null}
        </div>
        <div className="flex justify-end"><Button type="button" variant="outline" disabled={busy} onClick={() => { setOpen(false); setCreating(false); setAction(null); }}>{copy.close}</Button></div>
      </div>
    </Dialog>
  </>;
}
