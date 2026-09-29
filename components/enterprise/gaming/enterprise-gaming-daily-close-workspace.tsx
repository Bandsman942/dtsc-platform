"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarCheck2, Plus, Trash2 } from "lucide-react";
import { Field, NativeSelect, formatEnterpriseAmount } from "@/components/enterprise/core-v2/erp-v2-ui";
import { gamingDailyCloseCopy } from "@/components/enterprise/gaming/gaming-daily-close-i18n";
import { ProfessionalError, ProfessionalLoading, ProfessionalTabs, professionalMutation, useProfessionalCollection } from "@/components/enterprise/professional/professional-erp-ui";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { FullscreenEntityDetail } from "@/components/workspace/fullscreen-entity-detail";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type CloseStatus = "SUBMITTED" | "VALIDATED" | "REJECTED";
type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD" | "MOBILE_MONEY" | "CHEQUE" | "OTHER";
type Site = { id: string; code: string; name: string; timezone: string | null; status: string };
type Account = { id: string; code: string; name: string; accountType: string; currencyCode: string; siteId: string | null; status: string };
type Candidate = { userId: string; name: string; email: string; positionTitle: string | null; role: string; isRequester: boolean; selfApprovalOverride: boolean };
type CloseLine = { id: string; financialAccountId: string; methodType: PaymentMethod; accountType: string; currencyCode: string; cashSessionId: string | null; paymentCount: number; refundCount: number; inboundAmount: string; refundAmount: string; expectedAmount: string; declaredAmount: string; differenceAmount: string; varianceReason: string | null };
type CloseItem = { id: string; reference: string; businessDate: string; siteId: string | null; timezone: string; status: CloseStatus; endedSessionCount: number; paidSessionCount: number; pendingCheckoutCount: number; refundedCheckoutCount: number; submittedByUserId: string; approverUserId: string | null; validatedByUserId: string | null; submittedAt: string; validatedAt: string | null; rejectedAt: string | null; rejectionReason: string | null; notes: string | null; revision: number; lines: CloseLine[] };
type Filter = "ALL" | CloseStatus;
type Modal = "create" | "assign" | "validate" | "reject" | null;
type Declaration = { financialAccountId: string; methodType: PaymentMethod; declaredAmount: number; varianceReason: string };

const methods: PaymentMethod[] = ["CASH", "MOBILE_MONEY", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"];

function tone(status: CloseStatus): StatusBadgeTone {
  if (status === "VALIDATED") return "success";
  if (status === "REJECTED") return "danger";
  return "warning";
}

function localCalendarDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function formatBusinessDate(value: string | Date, locale: string | null | undefined, timezone: string | null | undefined) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === "en" ? "en" : "fr", {
    dateStyle: "medium",
    timeZone: timezone || "UTC",
  }).format(date);
}

async function json<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => null) as (T & { message?: string; error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.message || body?.error || "LOAD_FAILED");
  return body;
}

export function EnterpriseGamingDailyCloseWorkspace({ organizationId, organizationName, definition, currentUserId }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition; currentUserId: string }) {
  const locale = useAppLocale();
  const copy = gamingDailyCloseCopy(locale);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<CloseItem | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [approverUserId, setApproverUserId] = useState("");
  const [lookupsLoaded, setLookupsLoaded] = useState(false);
  const [declarations, setDeclarations] = useState<Declaration[]>([{ financialAccountId: "", methodType: "CASH", declaredAmount: 0, varianceReason: "" }]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  useToastMessage(message, "error");
  useToastMessage(success, "success");

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (filter !== "ALL") value.set("status", filter);
    return value;
  }, [filter, page]);
  const collection = useProfessionalCollection<CloseItem, { canApprove?: boolean }>({ endpoint: `/api/enterprise/${organizationId}/gaming/daily-closes`, params, refreshKey });

  async function loadLookups() {
    if (lookupsLoaded) return;
    setLookupLoading(true); setMessage("");
    try {
      const [siteBody, accountBody, candidateBody] = await Promise.all([
        json<{ items: Site[] }>(`/api/enterprise/${organizationId}/sites?page=1&pageSize=50&status=ACTIVE`),
        json<{ items: Account[] }>(`/api/enterprise/${organizationId}/financial-accounts?page=1&pageSize=100&status=ACTIVE`),
        json<{ candidates: Candidate[] }>(`/api/enterprise/${organizationId}/approval-candidates?moduleCode=GAMING_DAILY_CLOSE`),
      ]);
      setSites(siteBody.items);
      setAccounts(accountBody.items);
      setCandidates(candidateBody.candidates.filter((candidate) => !candidate.isRequester && candidate.userId !== currentUserId));
      setLookupsLoaded(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.loadLookupsFailed); }
    finally { setLookupLoading(false); }
  }

  async function openCreate() {
    await loadLookups();
    setDeclarations([{ financialAccountId: "", methodType: "CASH", declaredAmount: 0, varianceReason: "" }]);
    setApproverUserId("");
    setModal("create");
  }

  async function openAssignApprover() {
    await loadLookups();
    setApproverUserId("");
    setModal("assign");
  }

  async function submitClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setSuccess("");
    try {
      const body = await professionalMutation(`/api/enterprise/${organizationId}/gaming/daily-closes`, {
        businessDate: String(form.get("businessDate") || ""),
        siteId: String(form.get("siteId") || "") || null,
        approverUserId,
        notes: String(form.get("notes") || "") || null,
        idempotencyKey: `gaming-close:${crypto.randomUUID()}`,
        declarations: declarations.filter((line) => line.financialAccountId).map((line) => ({ ...line, varianceReason: line.varianceReason || null })),
      });
      const close = (body as { close?: CloseItem }).close;
      setModal(null); setSuccess(copy.actionDone); setRefreshKey((value) => value + 1);
      if (close) setDetail(close);
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.actionFailed); }
    finally { setBusy(false); }
  }

  async function assignApprover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !approverUserId) return;
    setBusy(true); setMessage(""); setSuccess("");
    try {
      const body = await professionalMutation(`/api/enterprise/${organizationId}/gaming/daily-closes/${detail.id}`, {
        action: "ASSIGN_APPROVER",
        revision: detail.revision,
        approverUserId,
      }, "PATCH") as { close?: CloseItem };
      if (body.close) setDetail(body.close);
      setModal(null); setSuccess(copy.actionDone); setRefreshKey((value) => value + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.actionFailed); }
    finally { setBusy(false); }
  }

  async function decide(event: FormEvent<HTMLFormElement>, action: "VALIDATE" | "REJECT") {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setSuccess("");
    try {
      const body = await professionalMutation(`/api/enterprise/${organizationId}/gaming/daily-closes/${detail.id}`, { action, revision: detail.revision, reason: String(form.get("reason") || "") || undefined }, "PATCH") as { close?: CloseItem };
      if (body.close) setDetail(body.close);
      setModal(null); setSuccess(copy.actionDone); setRefreshKey((value) => value + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.actionFailed); }
    finally { setBusy(false); }
  }

  const labels = { CASH: "Cash", MOBILE_MONEY: "Mobile Money", CARD: "Card", BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque", OTHER: "Other" } as const;
  const statusLabel = (status: CloseStatus) => status === "VALIDATED" ? copy.validated : status === "REJECTED" ? copy.rejected : copy.submitted;

  return (
    <ModuleWorkspace>
      <ModuleHeader eyebrow={copy.eyebrow} title={copy.title} description={`${copy.description} · ${organizationName}`} count={collection.pagination.total} primaryAction={collection.canWrite ? <Button onClick={() => void openCreate()}><CalendarCheck2 className="h-4 w-4" />{copy.newClose}</Button> : undefined} />
      <ModuleMetrics>
        <ModuleMetric label={copy.submitted} value={collection.metrics.SUBMITTED || 0} />
        <ModuleMetric label={copy.validated} value={collection.metrics.VALIDATED || 0} />
        <ModuleMetric label={copy.rejected} value={collection.metrics.REJECTED || 0} />
        <ModuleMetric label={copy.title} value={collection.pagination.total} />
      </ModuleMetrics>
      <ModuleToolbar controls={<ProfessionalTabs value={filter} onChange={(value) => { setFilter(value); setPage(1); }} items={[{ id: "ALL", label: copy.all }, { id: "SUBMITTED", label: copy.submitted }, { id: "VALIDATED", label: copy.validated }, { id: "REJECTED", label: copy.rejected }]} />} summary={`${copy.page} ${collection.pagination.page}/${collection.pagination.pageCount}`} />
      <ModuleContent><ModuleSection title={copy.title} description={locale === "en" ? definition.descriptionEn : definition.descriptionFr} count={collection.pagination.total} defaultOpen>
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : collection.items.length === 0 ? <EmptyState title={copy.empty} /> : <BusinessList>{collection.items.map((item) => <BusinessListItem key={item.id} title={item.reference} status={<StatusBadge tone={tone(item.status)}>{statusLabel(item.status)}</StatusBadge>} meta={`${copy.businessDate}: ${formatBusinessDate(item.businessDate, locale, item.timezone)} · ${copy.timezone}: ${item.timezone}`} description={`${copy.sessionsEnded}: ${item.endedSessionCount} · ${copy.sessionsPaid}: ${item.paidSessionCount} · ${copy.pendingCheckout}: ${item.pendingCheckoutCount}`} onOpen={() => setDetail(item)} openLabel={`${copy.detail} ${item.reference}`} />)}</BusinessList>}
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" disabled={page <= 1 || collection.loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>{copy.previous}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount || collection.loading} onClick={() => setPage((value) => value + 1)}>{copy.next}</Button></div>
      </ModuleSection></ModuleContent>

      <FullscreenEntityDetail open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.reference || copy.detail} description={detail ? `${statusLabel(detail.status)} · ${detail.timezone}` : undefined}>
        {detail ? <div className="grid gap-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.sessionsEnded}</p><p className="text-xl font-black">{detail.endedSessionCount}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.sessionsPaid}</p><p className="text-xl font-black">{detail.paidSessionCount}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.pendingCheckout}</p><p className="text-xl font-black">{detail.pendingCheckoutCount}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.refunded}</p><p className="text-xl font-black">{detail.refundedCheckoutCount}</p></div></div>
          <div className="grid gap-3 md:hidden">{detail.lines.map((line) => { const account = accounts.find((item) => item.id === line.financialAccountId); return <div key={line.id} className="grid gap-3 rounded-2xl border border-dtsc-border p-4"><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.financialAccount}</p><p className="font-bold break-words">{account ? `${account.code} · ${account.name}` : line.financialAccountId}</p></div><div className="grid grid-cols-2 gap-3"><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.method}</p><p>{labels[line.methodType]}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.currency}</p><p>{line.currencyCode}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.inbound}</p><p>{formatEnterpriseAmount(line.inboundAmount, line.currencyCode, locale)}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.refunds}</p><p>{formatEnterpriseAmount(line.refundAmount, line.currencyCode, locale)}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.expected}</p><p className="font-black">{formatEnterpriseAmount(line.expectedAmount, line.currencyCode, locale)}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.declared}</p><p>{formatEnterpriseAmount(line.declaredAmount, line.currencyCode, locale)}</p></div><div className="col-span-2"><p className="text-xs font-black uppercase text-dtsc-muted">{copy.difference}</p><p className={Number(line.differenceAmount) === 0 ? "font-black" : "font-black text-amber-600"}>{formatEnterpriseAmount(line.differenceAmount, line.currencyCode, locale)}</p></div></div></div>; })}</div>
          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1120px] table-auto text-sm"><thead><tr className="border-b border-dtsc-border text-left text-xs uppercase text-dtsc-muted"><th className="whitespace-nowrap px-3 py-3">{copy.financialAccount}</th><th className="whitespace-nowrap px-3 py-3">{copy.method}</th><th className="whitespace-nowrap px-3 py-3">{copy.currency}</th><th className="whitespace-nowrap px-3 py-3">{copy.inbound}</th><th className="whitespace-nowrap px-3 py-3">{copy.refunds}</th><th className="whitespace-nowrap px-3 py-3">{copy.expected}</th><th className="whitespace-nowrap px-3 py-3">{copy.declared}</th><th className="whitespace-nowrap px-3 py-3">{copy.difference}</th></tr></thead><tbody>{detail.lines.map((line) => { const account = accounts.find((item) => item.id === line.financialAccountId); return <tr key={line.id} className="border-b border-dtsc-border"><td className="min-w-[280px] px-3 py-3 font-bold">{account ? `${account.code} · ${account.name}` : line.financialAccountId}</td><td className="whitespace-nowrap px-3 py-3">{labels[line.methodType]}</td><td className="whitespace-nowrap px-3 py-3">{line.currencyCode}</td><td className="whitespace-nowrap px-3 py-3">{formatEnterpriseAmount(line.inboundAmount, line.currencyCode, locale)}</td><td className="whitespace-nowrap px-3 py-3">{formatEnterpriseAmount(line.refundAmount, line.currencyCode, locale)}</td><td className="whitespace-nowrap px-3 py-3 font-black">{formatEnterpriseAmount(line.expectedAmount, line.currencyCode, locale)}</td><td className="whitespace-nowrap px-3 py-3">{formatEnterpriseAmount(line.declaredAmount, line.currencyCode, locale)}</td><td className={`whitespace-nowrap px-3 py-3 ${Number(line.differenceAmount) === 0 ? "font-black" : "font-black text-amber-600"}`}>{formatEnterpriseAmount(line.differenceAmount, line.currencyCode, locale)}</td></tr>; })}</tbody></table></div>
          <div className="rounded-2xl border border-dtsc-border p-3 text-sm"><span className="font-black">{copy.assignedApprover}: </span>{candidates.find((candidate) => candidate.userId === detail.approverUserId)?.name || (detail.approverUserId ? copy.assignedApprover : copy.noApprover)}</div>
          {detail.status === "SUBMITTED" && !detail.approverUserId && detail.submittedByUserId === currentUserId && collection.canWrite ? <div className="flex flex-wrap gap-2"><Button onClick={() => void openAssignApprover()}>{copy.assignApprover}</Button></div> : null}
          {detail.status === "SUBMITTED" && Boolean(collection.extra.canApprove) && detail.approverUserId === currentUserId ? <div className="flex flex-wrap gap-2"><Button onClick={() => setModal("validate")}>{copy.validate}</Button><Button variant="outline" onClick={() => setModal("reject")}>{copy.reject}</Button></div> : detail.status === "SUBMITTED" && detail.approverUserId ? <p className="text-sm text-dtsc-muted">{copy.decisionReserved}</p> : null}
          <p className="text-sm text-dtsc-muted">{copy.businessDate}: {formatBusinessDate(detail.businessDate, locale, detail.timezone)} · {copy.timezone}: {detail.timezone}</p>
        </div> : null}
      </FullscreenEntityDetail>

      <Dialog open={modal === "create"} onClose={() => setModal(null)} title={copy.newClose} className="h-[92dvh] max-w-4xl">
        <form className="grid gap-5 p-1" onSubmit={submitClose}><div className="grid gap-4 md:grid-cols-3"><Field label={copy.businessDate} required><Input name="businessDate" type="date" required defaultValue={localCalendarDate()} /></Field><Field label={copy.site}><NativeSelect name="siteId" items={[{ id: "", label: copy.allSites }, ...sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}${site.timezone ? ` · ${site.timezone}` : ""}` }))]} /></Field><Field label={copy.approver} required><NativeSelect value={approverUserId} onChange={setApproverUserId} items={[{ id: "", label: copy.selectApprover }, ...candidates.map((candidate) => ({ id: candidate.userId, label: `${candidate.name}${candidate.positionTitle ? ` · ${candidate.positionTitle}` : ""}` }))]} /></Field></div>{!lookupLoading && candidates.length === 0 ? <ProfessionalError message={copy.noApprover} /> : null}
          <div className="border-t border-dtsc-border pt-4"><div className="flex items-center justify-between gap-2"><h3 className="font-black">{copy.declaration}</h3><Button type="button" variant="outline" size="sm" onClick={() => setDeclarations((lines) => [...lines, { financialAccountId: "", methodType: "CASH", declaredAmount: 0, varianceReason: "" }])}><Plus className="h-4 w-4" />{copy.addLine}</Button></div><div className="mt-3 grid gap-4">{declarations.map((line, index) => <div key={index} className="grid gap-3 rounded-2xl border border-dtsc-border p-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]"><Field label={copy.financialAccount} required><NativeSelect value={line.financialAccountId} onChange={(value) => setDeclarations((lines) => lines.map((item, itemIndex) => itemIndex === index ? { ...item, financialAccountId: value } : item))} items={accounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${account.currencyCode}` }))} /></Field><Field label={copy.method} required><NativeSelect value={line.methodType} onChange={(value) => setDeclarations((lines) => lines.map((item, itemIndex) => itemIndex === index ? { ...item, methodType: value as PaymentMethod } : item))} items={methods.map((method) => ({ id: method, label: labels[method] }))} /></Field><Field label={copy.declared} required><Input type="number" step="0.01" value={line.declaredAmount} onChange={(event) => setDeclarations((lines) => lines.map((item, itemIndex) => itemIndex === index ? { ...item, declaredAmount: Number(event.target.value) } : item))} /></Field><Field label={copy.varianceReason}><Input value={line.varianceReason} onChange={(event) => setDeclarations((lines) => lines.map((item, itemIndex) => itemIndex === index ? { ...item, varianceReason: event.target.value } : item))} /></Field><Button type="button" variant="outline" aria-label={copy.removeLine} onClick={() => setDeclarations((lines) => lines.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}</div></div>
          <Field label={copy.notes}><Input name="notes" /></Field>{lookupLoading ? <ProfessionalLoading rows={1} /> : null}<Button type="submit" disabled={busy || lookupLoading || candidates.length === 0 || !approverUserId || declarations.every((line) => !line.financialAccountId)}>{copy.submit}</Button></form>
      </Dialog>

      <Dialog open={modal === "assign"} onClose={() => setModal(null)} title={copy.assignApprover} className="max-w-lg"><form className="grid gap-4 p-1" onSubmit={assignApprover}><Field label={copy.approver} required><NativeSelect value={approverUserId} onChange={setApproverUserId} items={[{ id: "", label: copy.selectApprover }, ...candidates.map((candidate) => ({ id: candidate.userId, label: `${candidate.name}${candidate.positionTitle ? ` · ${candidate.positionTitle}` : ""}` }))]} /></Field>{!lookupLoading && candidates.length === 0 ? <ProfessionalError message={copy.noApprover} /> : null}<Button type="submit" disabled={busy || lookupLoading || !approverUserId}>{copy.saveApprover}</Button></form></Dialog>

      <Dialog open={modal === "validate" || modal === "reject"} onClose={() => setModal(null)} title={modal === "validate" ? copy.validate : copy.reject} className="max-w-lg"><form className="grid gap-4 p-1" onSubmit={(event) => void decide(event, modal === "validate" ? "VALIDATE" : "REJECT")}><Field label={copy.reason} required={modal === "reject"}><Input name="reason" required={modal === "reject"} minLength={modal === "reject" ? 8 : undefined} />{modal === "reject" ? <p className="mt-1 text-xs text-dtsc-muted">{copy.rejectReasonHint}</p> : null}</Field><Button type="submit" disabled={busy}>{modal === "validate" ? copy.validate : copy.reject}</Button></form></Dialog>
    </ModuleWorkspace>
  );
}
