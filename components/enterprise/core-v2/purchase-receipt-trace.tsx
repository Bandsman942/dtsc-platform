"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/workspace/status-badge";
import { formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import { purchaseFormGuidance, type PurchaseFormGuidanceKey } from "@/lib/enterprise/purchase-form-i18n";

type ReturnRequestSummary = { id?: string; reference: string; status: string; quantity: string; approvalId: string | null; revision?: number; unitCost?: string; creditUnitPrice?: string; nonrecoverableTaxAmount?: string; totalCost?: string; recoverableTaxAmount?: string; creditTotal?: string; currencyCode?: string; canDispatch?: boolean; canWithdraw?: boolean; canCreateCredit?: boolean; canReplaceCredit?: boolean; supplierCreditStatus?: string|null; supplierCreditRevision?: number|null; previousCreditNoteId?: string|null; previousSupplierCreditReference?: string|null; dispatchReference?: string | null; dispatchedAt?: string | null; dispatchBusinessDate?: string | null; supplierCreditNoteId?: string | null; supplierCreditReference?: string | null; supplierInvoiceId?: string; supplierInvoiceItemId?: string };
type TraceRow = {
  supplierReturnRequest?: ReturnRequestSummary | null;
  supplierReturnHistory?: ReturnRequestSummary[];
  id: string; receiptReference: string | null; quantity: string; occurredAt: string;
  inventoryItem: { catalogItem: { name: string; code: string; sku: string | null; unitOfMeasure: { symbol: string } | null } };
  warehouse: { name: string; code: string };
  storageLocation: { name: string; code: string } | null;
  stockLot: { lotNumber: string; productionDate: string | null; expiryDate: string | null; status: string; recallReference: string | null } | null;
};
type TraceResponse = { items: TraceRow[]; canCheckSupplierReturn?: boolean; pagination: { page: number; pageSize: number; total: number; pageCount: number } };

type ReturnPreview = { eligible: true; readOnly: true; settlement: { payableReduction: string; supplierClaim: string; remainingPayable: string; requiresSupplierClaim: boolean }; quantity: string; remaining: string; unitCost: string; creditUnitPrice: string; nonrecoverableTaxAmount: string; totalCost: string; recoverableTaxAmount: string; creditTotal: string; currencyCode: string; receiptReference: string; invoiceReference: string; canSubmitRequest?: boolean };

function SupplierReturnCheck({ organizationId, purchaseId, row, locale, onRefresh }: { organizationId: string; purchaseId: string; row: TraceRow; locale: string; onRefresh: () => void }) {
  const t = (key: PurchaseFormGuidanceKey) => purchaseFormGuidance(locale, key);
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ReturnPreview | null>(null);
  const [request, setRequest] = useState<ReturnRequestSummary | null>(row.supplierReturnRequest?.status === "RECONCILED" ? null : row.supplierReturnRequest || null);
  const [message, setMessage] = useState("");
  const retryIdentity = useRef<{ fingerprint: string; key: string } | null>(null);
  useToastMessage(message);
  const valid = /^\d{1,12}(?:\.\d{1,3})?$/.test(quantity.trim()) && Number(quantity) > 0;
  const money = (amount: string, currency: string) => new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 6 }).format(Number(amount));
  async function check() {
    if (!valid || busy) return;
    setBusy(true); setPreview(null); setError("");
    try {
      const params = new URLSearchParams({ view: "supplier-return-preflight", movementId: row.id, quantity: quantity.trim() });
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/purchases/${encodeURIComponent(purchaseId)}?${params}`, { cache: "no-store", headers: { "Accept-Language": locale } });
      const body = await response.json();
      if (!response.ok) { setError(typeof body.message === "string" ? body.message : t("returnCheckError")); return; }
      if (body.eligible !== true || body.readOnly !== true || !body.settlement) { setError(t("returnCheckError")); return; }
      setPreview(body as ReturnPreview);
    } catch { setError(t("returnCheckError")); }
    finally { setBusy(false); }
  }
  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !preview?.canSubmitRequest || request || !valid) return;
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") || "").trim();
    const approverUserId = String(form.get("approverUserId") || "");
    if (reason.length < 8 || !approverUserId) { setError(t("returnRequestMissing")); return; }
    const draft = { movementId: row.id, quantity: quantity.trim(), reason, approverUserId };
    const fingerprint = JSON.stringify(draft);
    if (retryIdentity.current?.fingerprint !== fingerprint) retryIdentity.current = { fingerprint, key: "rtv:" + crypto.randomUUID() };
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/purchases/${encodeURIComponent(purchaseId)}?action=submit-supplier-return`, {
        method: "POST", headers: { "Content-Type": "application/json", "Accept-Language": locale }, body: JSON.stringify({ ...draft, idempotencyKey: retryIdentity.current.key }),
      });
      const body = await response.json();
      if (!response.ok || body.ok !== true || !body.request) { setError(typeof body.message === "string" ? body.message : t("returnRequestFailed")); return; }
      setRequest({ id:body.request.id, reference: body.request.reference, status: body.request.status, quantity: body.request.quantity, approvalId: body.approvalId, revision:body.request.revision, unitCost:preview.unitCost, creditUnitPrice:preview.creditUnitPrice, nonrecoverableTaxAmount:preview.nonrecoverableTaxAmount, totalCost:preview.totalCost, recoverableTaxAmount:preview.recoverableTaxAmount, creditTotal:preview.creditTotal, currencyCode:preview.currencyCode });
      setPreview(null); setOpen(false); setMessage(t("returnRequestSubmitted"));
    } catch { setError(t("returnRequestFailed")); }
    finally { setBusy(false); }
  }
  async function withdrawReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !request?.id || !request.revision || !request.canWithdraw) return;
    const form=new FormData(event.currentTarget);
    const reason=String(form.get("withdrawReason")||"").trim();
    if(reason.length<8||form.get("confirmWithdrawal")!=="on")return;
    setBusy(true);setError("");setMessage("");
    try {
      const response=await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/purchases/${encodeURIComponent(purchaseId)}?action=withdraw-supplier-return`,{method:"POST",headers:{"Content-Type":"application/json","Accept-Language":locale},body:JSON.stringify({requestId:request.id,revision:request.revision,reason,confirmUndispatched:true})});
      const body=await response.json();
      if(!response.ok||!body.ok){setError(body.message||t("returnWithdrawFailed"));return;}
      setRequest({...request,status:"CANCELLED",canWithdraw:false,canDispatch:false,revision:body.request.revision});setMessage(t("returnWithdrawDone"));
    }catch{setError(t("returnWithdrawFailed"));}finally{setBusy(false);}
  }
  async function dispatchReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !request?.id || !request.revision || !request.canDispatch) return;
    const form = new FormData(event.currentTarget);
    const dispatchReference = String(form.get("dispatchReference") || "").trim();
    if (dispatchReference.length < 5 || form.get("confirmDispatch") !== "on") return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/purchases/${encodeURIComponent(purchaseId)}?action=dispatch-supplier-return`,{method:"POST",headers:{"Content-Type":"application/json","Accept-Language":locale},body:JSON.stringify({requestId:request.id,revision:request.revision,dispatchReference})});
      const body=await response.json();
      if (!response.ok || !body.ok) { setError(body.message || t("returnDispatchFailed")); return; }
      setRequest({...request,status:"DISPATCHED",canDispatch:false,canWithdraw:false,dispatchReference,revision:body.request.revision});setMessage(t("returnDispatchDone"));onRefresh();
    } catch { setError(t("returnDispatchFailed")); } finally { setBusy(false); }
  }
  async function createLinkedCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !request?.id || !(request.canCreateCredit||request.canReplaceCredit) || !request.supplierInvoiceId || !request.supplierInvoiceItemId || !request.unitCost) return;
    const replacing=request.canReplaceCredit===true;
    if(replacing&&(!request.supplierCreditNoteId||!request.supplierCreditRevision))return;
    const form = new FormData(event.currentTarget);
    const supplierCreditReference=String(form.get("supplierCreditReference")||"").trim(),creditDate=String(form.get("creditDate")||""),reason=String(form.get("creditReason")||"").trim();
    if(supplierCreditReference.length<3||!creditDate||reason.length<8)return;
    if(replacing&&supplierCreditReference.toUpperCase()===request.supplierCreditReference?.toUpperCase()){setError(t("returnCreditReplacementInvalid"));return;}
    setBusy(true);setError("");setMessage("");
    try {
      const response=await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/supplier-credit-notes`,{method:"POST",headers:{"Content-Type":"application/json","Accept-Language":locale},body:JSON.stringify({invoiceId:request.supplierInvoiceId,supplierReturnId:request.id,supplierCreditReference,creditDate,reason,...(replacing?{replacesCreditNoteId:request.supplierCreditNoteId,replacesCreditRevision:request.supplierCreditRevision}:{}),items:[{sourceInvoiceItemId:request.supplierInvoiceItemId,description:row.inventoryItem.catalogItem.name,quantity:request.quantity,unitPrice:request.creditUnitPrice||request.unitCost}]})});
      const body=await response.json();
      if(!response.ok||!body.ok||!body.creditNote){setError(body.error==="SUPPLIER_RETURN_CREDIT_REPLACEMENT_INVALID"?t("returnCreditReplacementInvalid"):body.message||t("returnCreditFailed"));return;}
      setRequest({...request,canCreateCredit:false,canReplaceCredit:false,supplierCreditStatus:body.creditNote.status,supplierCreditRevision:body.creditNote.revision,supplierCreditNoteId:body.creditNote.id,supplierCreditReference,...(replacing?{previousCreditNoteId:request.supplierCreditNoteId,previousSupplierCreditReference:request.supplierCreditReference}:{})});setMessage(t("returnCreditCreated"));onRefresh();
    } catch {setError(t("returnCreditFailed"));} finally {setBusy(false);}
  }
  if (request) return <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border border-dtsc-border p-2 text-xs">
    <div className="flex min-w-0 flex-wrap items-center gap-2"><strong className="break-words">{request.reference}</strong><StatusBadge tone={request.status==="RECONCILED"?"success":request.status==="APPROVED"?"info":"warning"}>{t(request.status==="CANCELLED"?"returnWithdrawn":request.status==="RECONCILED"?"returnReconciled":request.status==="DISPATCHED"?"returnDispatched":request.status==="APPROVED"?"returnRequestApproved":"returnRequestPending")}</StatusBadge></div>
    <p>{t("returnCheckQuantity")} : <strong>{request.quantity} {row.inventoryItem.catalogItem.unitOfMeasure?.symbol || ""}</strong></p>
    {request.status==="PENDING_APPROVAL"||request.status==="APPROVED"?<p className="text-dtsc-muted">{t("returnRequestHelp")}</p>:null}
    {request.totalCost&&request.currencyCode?<div className="grid gap-1">
      <p>{t("returnCreditStockValue")} : <strong>{money(request.totalCost,request.currencyCode)}</strong></p>
      {request.recoverableTaxAmount&&Number(request.recoverableTaxAmount)>0?<p>{t("returnCreditRecoverableTax")} : <strong>{money(request.recoverableTaxAmount,request.currencyCode)}</strong></p>:null}
      {request.nonrecoverableTaxAmount&&Number(request.nonrecoverableTaxAmount)>0?<p>{t("returnCreditCapitalizedTax")} : <strong>{money(request.nonrecoverableTaxAmount,request.currencyCode)}</strong></p>:null}
      <p>{t("returnCreditAmount")} : <strong>{money(request.creditTotal||request.totalCost,request.currencyCode)}</strong></p>
    </div>:null}
    {request.dispatchReference?<p className="break-words">{t("returnDispatchReference")} : {request.dispatchReference}</p>:null}
    {request.supplierCreditReference?<p className="break-words">{t("returnCreditReference")} : {request.supplierCreditReference}</p>:null}
    {request.status==="CANCELLED"?<p className="text-dtsc-muted">{t("returnWithdrawHistory")}</p>:null}
    {request.canWithdraw&&request.status==="APPROVED"?<details className="grid min-w-0 rounded-lg border border-dtsc-border p-2">
      <summary className="cursor-pointer font-medium text-dtsc-ink">{t("returnWithdrawTitle")}</summary>
      <form onSubmit={withdrawReturn} className="mt-2 grid min-w-0 gap-2">
        <p className="text-dtsc-muted">{t("returnWithdrawHelp")}</p>
        <label className="grid min-w-0 gap-1">{t("returnWithdrawReason")}<textarea name="withdrawReason" required minLength={8} maxLength={2000} disabled={busy} className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-2 text-base text-dtsc-ink md:text-sm"/></label>
        <label className="flex items-start gap-2"><input type="checkbox" name="confirmWithdrawal" required disabled={busy}/><span>{t("returnWithdrawConfirm")}</span></label>
        <Button type="submit" variant="outline" disabled={busy} className="whitespace-normal">{t("returnWithdrawAction")}</Button>
      </form>
    </details>:null}
    {request.canDispatch&&request.status==="APPROVED"?<form onSubmit={dispatchReturn} className="grid min-w-0 gap-2 border-t border-dtsc-border pt-2">
      <strong>{t("returnDispatchTitle")}</strong><p className="text-dtsc-muted">{t("returnDispatchHelp")}</p>
      <label className="grid min-w-0 gap-1">{t("returnDispatchReference")}<Input name="dispatchReference" required minLength={5} maxLength={200} disabled={busy}/></label>
      <label className="flex items-start gap-2"><input name="confirmDispatch" type="checkbox" required disabled={busy} className="mt-1"/><span>{t("returnDispatchConfirm")}</span></label>
      <Button type="submit" disabled={busy} className="whitespace-normal">{t("returnDispatchAction")}</Button>
    </form>:null}
    {request.supplierCreditStatus==="REJECTED"?<StatusBadge tone="danger">{t("returnCreditRejected")}</StatusBadge>:null}
    {request.previousCreditNoteId?<a className="w-fit break-words text-dtsc-blue underline" href={`/enterprise-modules/FINANCE_PAYABLES?supplierCreditNoteId=${encodeURIComponent(request.previousCreditNoteId)}`}>{t("returnCreditPrevious")} · {request.previousSupplierCreditReference}</a>:null}
    {(request.canCreateCredit||request.canReplaceCredit)&&request.status==="DISPATCHED"?<form key={request.supplierCreditNoteId||"initial"} onSubmit={createLinkedCredit} className="grid min-w-0 gap-2 border-t border-dtsc-border pt-2">
      <strong>{t(request.canReplaceCredit?"returnCreditReplaceTitle":"returnCreditTitle")}</strong><p className="text-dtsc-muted">{t(request.canReplaceCredit?"returnCreditReplaceHelp":"returnCreditHelp")}</p>
      <label className="grid min-w-0 gap-1">{t("returnCreditReference")}<Input name="supplierCreditReference" required minLength={3} maxLength={160} disabled={busy}/></label>
      <label className="grid min-w-0 gap-1">{t("returnCreditDate")}<Input name="creditDate" type="date" min={request.dispatchBusinessDate || undefined} required disabled={busy}/></label>
      <label className="grid min-w-0 gap-1">{t("returnCreditReason")}<textarea name="creditReason" required minLength={8} maxLength={1000} disabled={busy} className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-2 text-base text-dtsc-ink md:text-sm"/></label>
      <Button type="submit" disabled={busy} className="whitespace-normal">{t(request.canReplaceCredit?"returnCreditReplaceAction":"returnCreditAction")}</Button>
    </form>:null}
    {error?<p role="alert" className="break-words text-red-700 dark:text-red-300">{error}</p>:null}
    {request.supplierCreditNoteId?<a className="w-fit break-words text-dtsc-blue underline" href={`/enterprise-modules/FINANCE_PAYABLES?supplierCreditNoteId=${encodeURIComponent(request.supplierCreditNoteId)}`}>{t("returnCreditReview")}</a>:null}
    <Button type="button" variant="outline" disabled={busy} className="w-fit" onClick={onRefresh}>{t("returnRefresh")}</Button>
    {request.approvalId ? <a className="w-fit break-words text-dtsc-blue underline" href={`/enterprise-modules/VALIDATIONS?approval=${encodeURIComponent(request.approvalId)}`}>{t("returnRequestReview")}</a> : null}
  </div>;
  if (!open) return <Button type="button" variant="outline" className="mt-2 w-fit max-w-full whitespace-normal" onClick={() => setOpen(true)} aria-expanded={false}>{t("returnCheckTitle")}</Button>;
  return <div className="mt-2 grid min-w-0 gap-2 rounded-lg border border-dtsc-border p-2" data-supplier-return-preflight>
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{t("returnCheckTitle")}</strong><Button type="button" variant="outline" disabled={busy} onClick={() => { setOpen(false); setPreview(null); setError(""); setQuantity(""); }}>{t("returnCheckClose")}</Button></div>
    <p className="text-xs text-dtsc-muted">{t("returnCheckHelp")}</p>
    <div className="flex flex-wrap items-end gap-2" data-responsive-actions>
      <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium">{t("returnCheckQuantity")}<Input inputMode="decimal" value={quantity} disabled={busy} maxLength={16} onChange={(event) => { setQuantity(event.target.value.replace(",", ".")); setPreview(null); setError(""); }} /></label>
      <Button type="button" variant="outline" disabled={!valid || busy} onClick={() => void check()}>{busy ? "…" : preview ? t("returnCheckRefresh") : t("returnCheckAction")}</Button>
    </div>
    <div aria-live="polite" aria-busy={busy} className="grid min-w-0 gap-1">
      {error ? <p role="alert" className="break-words text-xs text-red-700 dark:text-red-300">{error}</p> : null}
      {preview ? <div className="grid min-w-0 gap-1 text-xs">
        <div><StatusBadge tone={preview.settlement.requiresSupplierClaim ? "warning" : "success"}>{t(preview.settlement.requiresSupplierClaim ? "returnSettlementBlocked" : "returnCheckReady")}</StatusBadge></div>
        <p>{t("returnCheckRemaining")} : <strong>{preview.remaining} {row.inventoryItem.catalogItem.unitOfMeasure?.symbol || ""}</strong></p>
        <p>{t("returnCheckUnitCost")} : {money(preview.unitCost, preview.currencyCode)}</p>
        <p>{t("returnCheckAmount")} : <strong>{money(preview.totalCost, preview.currencyCode)}</strong></p>
        {Number(preview.recoverableTaxAmount)>0?<p>{t("returnCreditRecoverableTax")} : <strong>{money(preview.recoverableTaxAmount,preview.currencyCode)}</strong></p>:null}
        {Number(preview.nonrecoverableTaxAmount)>0?<p>{t("returnCreditCapitalizedTax")} : <strong>{money(preview.nonrecoverableTaxAmount,preview.currencyCode)}</strong></p>:null}
        <p>{t("returnCreditAmount")} : <strong>{money(preview.creditTotal,preview.currencyCode)}</strong></p>
        <p className="break-words">{t("returnCheckInvoice")} : {preview.invoiceReference}</p>
        <p>{t("returnSettlementPayableReduction")} : <strong>{money(preview.settlement.payableReduction, preview.currencyCode)}</strong></p>
        <p>{t("returnSettlementRemainingPayable")} : <strong>{money(preview.settlement.remainingPayable, preview.currencyCode)}</strong></p>
        <p>{t("returnSettlementClaim")} : <strong>{money(preview.settlement.supplierClaim, preview.currencyCode)}</strong></p>
        {preview.settlement.requiresSupplierClaim ? <p role="alert" className="break-words text-amber-700 dark:text-amber-300">{t("returnSettlementClaimHelp")}</p> : null}
        <p className="text-dtsc-muted">{t("returnCheckHelp")}</p>
        {preview.canSubmitRequest ? <form onSubmit={submitReturn} className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-t border-dtsc-border pt-2">
          <strong>{t("returnRequestTitle")}</strong><p className="text-dtsc-muted">{t("returnRequestHelp")}</p>
          <label className="grid min-w-0 gap-1 font-medium">{t("returnRequestReason")}<textarea name="reason" minLength={8} maxLength={2000} required disabled={busy} className="min-h-20 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-2 text-base text-dtsc-ink md:text-sm" /></label>
          <EnterpriseApproverSelect organizationId={organizationId} moduleCode="INVENTORY_LOGISTICS" locale={locale} label={t("returnRequestApprover")} disabled={busy} candidatesEndpoint={`/api/enterprise/${encodeURIComponent(organizationId)}/purchases/${encodeURIComponent(purchaseId)}?view=supplier-return-approvers`} />
          <Button type="submit" disabled={busy} className="max-w-full whitespace-normal">{t("returnRequestSubmit")}</Button>
        </form> : !preview.settlement.requiresSupplierClaim ? <p className="text-dtsc-muted">{t("returnRequestNoAccess")}</p> : null}
      </div> : null}
    </div>
  </div>;
}

export function PurchaseReceiptTrace({ organizationId, purchaseId, locale, focusMovementId }: { organizationId: string; purchaseId: string; locale: string; focusMovementId?: string | null }) {
  const t = (key: PurchaseFormGuidanceKey) => purchaseFormGuidance(locale, key);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [result, setResult] = useState<TraceResponse | null>(null);
  const date = (value: string | null) => value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)) : "—";

  useEffect(() => {
    if (!focusMovementId) return;
    let active = true;
    setOpen(true); setBusy(true); setFailed(false); setResult(null); setSearch(""); setAppliedSearch("");
    const params = new URLSearchParams({ view: "receipt-lots", page: "1", pageSize: "20", movementId: focusMovementId });
    void fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/purchases/${encodeURIComponent(purchaseId)}?${params}`, { cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("RECEIPT_TRACE_UNAVAILABLE"); return await response.json() as TraceResponse; })
      .then((body) => { if (active) setResult(body); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [organizationId, purchaseId, focusMovementId]);

  async function load(page: number, query: string) {
    if (busy) return;
    setBusy(true); setFailed(false); setResult(null);
    const params = new URLSearchParams({ view: "receipt-lots", page: String(page), pageSize: "20", search: query });
    try {
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/purchases/${encodeURIComponent(purchaseId)}?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("RECEIPT_TRACE_UNAVAILABLE");
      const body = await response.json() as TraceResponse;
      setResult(body); setAppliedSearch(query);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void load(1, search.trim()); }

  return <section data-purchase-receipt-trace className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-3 border-t border-dtsc-border pt-3">
    <div className="min-w-0">
      <h3 className="font-semibold text-dtsc-ink">{t("receiptTraceTitle")}</h3>
      <p className="mt-1 text-xs text-dtsc-muted">{t("receiptTraceHelp")}</p>
    </div>
    {!open ? <Button type="button" variant="outline" onClick={() => { setOpen(true); void load(1, ""); }} className="w-fit max-w-full" aria-expanded={false}>{t("receiptTraceOpen")}</Button> : <>
      <form onSubmit={submit} className="flex min-w-0 flex-wrap gap-2" data-responsive-actions>
        <Input className="min-w-0 flex-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("receiptTraceSearch")} aria-label={t("receiptTraceSearch")} maxLength={120} disabled={busy} />
        <Button type="submit" variant="outline" disabled={busy}>{t("receiptTraceOpen")}</Button>
      </form>
      <div aria-live="polite" aria-busy={busy} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        {busy ? <p className="text-dtsc-muted">…</p> : null}
        {failed ? <p role="alert" className="break-words text-red-700 dark:text-red-300">{t("receiptTraceError")}</p> : null}
        {result && !result.items.length ? <p className="text-dtsc-muted">{t("receiptTraceEmpty")}</p> : null}
        {result?.items.map((row) => {
          const lot = row.stockLot;
          const stateKey: PurchaseFormGuidanceKey = lot?.recallReference ? "receiptTraceRecall" : lot?.status === "AVAILABLE" ? "receiptTraceAvailable" : lot?.status === "BLOCKED" ? "receiptTraceBlocked" : lot?.status === "QUARANTINED" ? "receiptTraceQuarantine" : "receiptTraceOther";
          const product = row.inventoryItem.catalogItem;
          return <article key={row.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-xl border border-dtsc-border p-3">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2"><strong className="min-w-0 break-words text-dtsc-ink">{product.name} · {product.sku || product.code}</strong><span className="font-semibold tabular-nums text-dtsc-ink">{row.quantity} {product.unitOfMeasure?.symbol || ""}</span></div>
            <p className="break-words text-xs text-dtsc-muted">{t("receiptTraceReceipt")} : {row.receiptReference || "—"} · {formatEnterpriseDate(row.occurredAt, locale)}</p>
            <p className="break-words text-xs text-dtsc-muted">{row.warehouse.name}{row.storageLocation ? " · " + row.storageLocation.name : ""}</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="min-w-0 break-words font-medium">{lot?.lotNumber || t("receiptTraceNoLot")}</span>{lot ? <StatusBadge tone={lot.recallReference || lot.status === "BLOCKED" || lot.status === "QUARANTINED" ? "warning" : lot.status === "AVAILABLE" ? "success" : "neutral"}>{t(stateKey)}</StatusBadge> : null}</div>
            {lot ? <p className="break-words text-xs text-dtsc-muted">{t("receiptBatchProduction")} : {date(lot.productionDate)} · {t("receiptBatchExpiry")} : {date(lot.expiryDate)}{lot.recallReference ? " · " + lot.recallReference : ""}</p> : null}
            {Boolean(row.supplierReturnHistory?.length)?<details className="mt-2 min-w-0 rounded-lg border border-dtsc-border p-2 text-xs">
              <summary className="cursor-pointer font-semibold text-dtsc-ink">{t("returnReconciledHistory")} · {row.supplierReturnHistory!.length}</summary>
              <div className="mt-2 grid min-w-0 gap-2">{row.supplierReturnHistory!.map(previous=><div key={previous.id} className="grid min-w-0 gap-1 rounded-lg border border-dtsc-border p-2">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-1"><strong className="break-words">{previous.reference}</strong><StatusBadge tone="success">{t("returnReconciled")}</StatusBadge></div>
                <span>{t("returnCheckQuantity")} : {previous.quantity} {product.unitOfMeasure?.symbol||""}</span>
                {previous.creditTotal&&previous.currencyCode?<span>{t("returnCreditAmount")} : {new Intl.NumberFormat(locale,{style:"currency",currency:previous.currencyCode,maximumFractionDigits:6}).format(Number(previous.creditTotal))}</span>:null}
                {previous.dispatchReference?<span className="break-words">{t("returnDispatchReference")} : {previous.dispatchReference}</span>:null}
                {previous.supplierCreditNoteId?<a className="w-fit break-words text-dtsc-blue underline" href={`/enterprise-modules/FINANCE_PAYABLES?supplierCreditNoteId=${encodeURIComponent(previous.supplierCreditNoteId)}`}>{t("returnCreditReview")} · {previous.supplierCreditReference}</a>:null}
                {previous.approvalId?<a className="w-fit break-words text-dtsc-blue underline" href={`/enterprise-modules/VALIDATIONS?approval=${encodeURIComponent(previous.approvalId)}`}>{t("returnRequestReview")}</a>:null}
              </div>)}</div>
            </details>:null}
            {lot && result?.canCheckSupplierReturn ? <SupplierReturnCheck organizationId={organizationId} purchaseId={purchaseId} row={row} locale={locale} onRefresh={() => void load(result.pagination.page,appliedSearch)} /> : null}
          </article>;
        })}
      </div>
      {result ? <div className="flex min-w-0 flex-wrap items-center justify-between gap-2" data-responsive-actions><Button type="button" variant="outline" disabled={busy || result.pagination.page <= 1} onClick={() => void load(result.pagination.page - 1, appliedSearch)}>{t("receiptTracePrevious")}</Button><span className="text-xs tabular-nums text-dtsc-muted">{result.pagination.page} / {result.pagination.pageCount} · {result.pagination.total}</span><Button type="button" variant="outline" disabled={busy || result.pagination.page >= result.pagination.pageCount} onClick={() => void load(result.pagination.page + 1, appliedSearch)}>{t("receiptTraceNext")}</Button></div> : null}
    </>}
  </section>;
}
