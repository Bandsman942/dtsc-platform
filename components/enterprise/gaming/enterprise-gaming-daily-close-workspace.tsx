"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarCheck2, Plus, Trash2 } from "lucide-react";
import { Field, NativeSelect, formatEnterpriseAmount, formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
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
type CloseLine = { id: string; financialAccountId: string; methodType: PaymentMethod; accountType: string; currencyCode: string; cashSessionId: string | null; paymentCount: number; refundCount: number; inboundAmount: string; refundAmount: string; expectedAmount: string; declaredAmount: string; differenceAmount: string; varianceReason: string | null };
type CloseItem = { id: string; reference: string; businessDate: string; siteId: string | null; timezone: string; status: CloseStatus; endedSessionCount: number; paidSessionCount: number; pendingCheckoutCount: number; refundedCheckoutCount: number; submittedByUserId: string; validatedByUserId: string | null; submittedAt: string; validatedAt: string | null; rejectedAt: string | null; rejectionReason: string | null; notes: string | null; revision: number; lines: CloseLine[] };
type Filter = "ALL" | CloseStatus;
type Modal = "create" | "validate" | "reject" | null;
type Declaration = { financialAccountId: string; methodType: PaymentMethod; declaredAmount: number; varianceReason: string };

const methods: PaymentMethod[] = ["CASH", "MOBILE_MONEY", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"];

function tone(status: CloseStatus): StatusBadgeTone {
  if (status === "VALIDATED") return "success";
  if (status === "REJECTED") return "danger";
  return "warning";
}

async function json<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => null) as (T & { message?: string; error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.message || body?.error || "LOAD_FAILED");
  return body;
}

export function EnterpriseGamingDailyCloseWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useAppLocale();
  const copy = gamingDailyCloseCopy(locale);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<CloseItem | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
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
  const collection = useProfessionalCollection<CloseItem>({ endpoint: `/api/enterprise/${organizationId}/gaming/daily-closes`, params, refreshKey });

  async function loadLookups() {
    if (sites.length || accounts.length) return;
    setLookupLoading(true); setMessage("");
    try {
      const [siteBody, accountBody] = await Promise.all([
        json<{ items: Site[] }>(`/api/enterprise/${organizationId}/sites?page=1&pageSize=50&status=ACTIVE`),
        json<{ items: Account[] }>(`/api/enterprise/${organizationId}/financial-accounts?page=1&pageSize=100&status=ACTIVE`),
      ]);
      setSites(siteBody.items); setAccounts(accountBody.items);
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.loadLookupsFailed); }
    finally { setLookupLoading(false); }
  }

  async function openCreate() {
    await loadLookups();
    setDeclarations([{ financialAccountId: "", methodType: "CASH", declaredAmount: 0, varianceReason: "" }]);
    setModal("create");
  }

  async function submitClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setSuccess("");
    try {
      const body = await professionalMutation(`/api/enterprise/${organizationId}/gaming/daily-closes`, {
        businessDate: String(form.get("businessDate") || ""),
        siteId: String(form.get("siteId") || "") || null,
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
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : collection.items.length === 0 ? <EmptyState title={copy.empty} /> : <BusinessList>{collection.items.map((item) => <BusinessListItem key={item.id} title={item.reference} status={<StatusBadge tone={tone(item.status)}>{statusLabel(item.status)}</StatusBadge>} meta={`${copy.businessDate}: ${new Intl.DateTimeFormat(locale === "en" ? "en" : "fr", { dateStyle: "medium", timeZone: item.timezone }).format(new Date(item.businessDate))} · ${copy.timezone}: ${item.timezone}`} description={`${copy.sessionsEnded}: ${item.endedSessionCount} · ${copy.sessionsPaid}: ${item.paidSessionCount} · ${copy.pendingCheckout}: ${item.pendingCheckoutCount}`} onOpen={() => setDetail(item)} openLabel={`${copy.detail} ${item.reference}`} />)}</BusinessList>}
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" disabled={page <= 1 || collection.loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>{copy.previous}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount || collection.loading} onClick={() => setPage((value) => value + 1)}>{copy.next}</Button></div>
      </ModuleSection></ModuleContent>

      <FullscreenEntityDetail open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.reference || copy.detail} description={detail ? `${statusLabel(detail.status)} · ${detail.timezone}` : undefined}>
        {detail ? <div className="grid gap-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.sessionsEnded}</p><p className="text-xl font-black">{detail.endedSessionCount}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.sessionsPaid}</p><p className="text-xl font-black">{detail.paidSessionCount}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.pendingCheckout}</p><p className="text-xl font-black">{detail.pendingCheckoutCount}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.refunded}</p><p className="text-xl font-black">{detail.refundedCheckoutCount}</p></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-dtsc-border text-left text-xs uppercase text-dtsc-muted"><th className="py-2">{copy.financialAccount}</th><th>{copy.method}</th><th>{copy.currency}</th><th>{copy.inbound}</th><th>{copy.refunds}</th><th>{copy.expected}</th><th>{copy.declared}</th><th>{copy.difference}</th></tr></thead><tbody>{detail.lines.map((line) => { const account = accounts.find((item) => item.id === line.financialAccountId); return <tr key={line.id} className="border-b border-dtsc-border"><td className="py-3 font-bold">{account ? `${account.code} · ${account.name}` : line.financialAccountId}</td><td>{labels[line.methodType]}</td><td>{line.currencyCode}</td><td>{formatEnterpriseAmount(line.inboundAmount, line.currencyCode, locale)}</td><td>{formatEnterpriseAmount(line.refundAmount, line.currencyCode, locale)}</td><td className="font-black">{formatEnterpriseAmount(line.expectedAmount, line.currencyCode, locale)}</td><td>{formatEnterpriseAmount(line.declaredAmount, line.currencyCode, locale)}</td><td className={Number(line.differenceAmount) === 0 ? "font-black" : "font-black text-amber-600"}>{formatEnterpriseAmount(line.differenceAmount, line.currencyCode, locale)}</td></tr>; })}</tbody></table></div>
          {detail.status === "SUBMITTED" && collection.canManage ? <div className="flex flex-wrap gap-2"><Button onClick={() => setModal("validate")}>{copy.validate}</Button><Button variant="outline" onClick={() => setModal("reject")}>{copy.reject}</Button></div> : null}
          <p className="text-sm text-dtsc-muted">{copy.businessDate}: {formatEnterpriseDate(detail.businessDate, locale)} · {copy.timezone}: {detail.timezone}</p>
        </div> : null}
      </FullscreenEntityDetail>

      <Dialog open={modal === "create"} onClose={() => setModal(null)} title={copy.newClose} className="h-[92dvh] max-w-4xl">
        <form className="grid gap-5 p-1" onSubmit={submitClose}><div className="grid gap-4 sm:grid-cols-2"><Field label={copy.businessDate} required><Input name="businessDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field><Field label={copy.site}><NativeSelect name="siteId" items={[{ id: "", label: copy.allSites }, ...sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}${site.timezone ? ` · ${site.timezone}` : ""}` }))]} /></Field></div>
          <div className="border-t border-dtsc-border pt-4"><div className="flex items-center justify-between gap-2"><h3 className="font-black">{copy.declaration}</h3><Button type="button" variant="outline" size="sm" onClick={() => setDeclarations((lines) => [...lines, { financialAccountId: "", methodType: "CASH", declaredAmount: 0, varianceReason: "" }])}><Plus className="h-4 w-4" />{copy.addLine}</Button></div><div className="mt-3 grid gap-4">{declarations.map((line, index) => <div key={index} className="grid gap-3 rounded-2xl border border-dtsc-border p-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]"><Field label={copy.financialAccount} required><NativeSelect value={line.financialAccountId} onChange={(value) => setDeclarations((lines) => lines.map((item, itemIndex) => itemIndex === index ? { ...item, financialAccountId: value } : item))} items={accounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${account.currencyCode}` }))} /></Field><Field label={copy.method} required><NativeSelect value={line.methodType} onChange={(value) => setDeclarations((lines) => lines.map((item, itemIndex) => itemIndex === index ? { ...item, methodType: value as PaymentMethod } : item))} items={methods.map((method) => ({ id: method, label: labels[method] }))} /></Field><Field label={copy.declared} required><Input type="number" step="0.01" value={line.declaredAmount} onChange={(event) => setDeclarations((lines) => lines.map((item, itemIndex) => itemIndex === index ? { ...item, declaredAmount: Number(event.target.value) } : item))} /></Field><Field label={copy.varianceReason}><Input value={line.varianceReason} onChange={(event) => setDeclarations((lines) => lines.map((item, itemIndex) => itemIndex === index ? { ...item, varianceReason: event.target.value } : item))} /></Field><Button type="button" variant="outline" aria-label={copy.removeLine} onClick={() => setDeclarations((lines) => lines.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}</div></div>
          <Field label={copy.notes}><Input name="notes" /></Field>{lookupLoading ? <ProfessionalLoading rows={1} /> : null}<Button type="submit" disabled={busy || lookupLoading || declarations.every((line) => !line.financialAccountId)}>{copy.submit}</Button></form>
      </Dialog>

      <Dialog open={modal === "validate" || modal === "reject"} onClose={() => setModal(null)} title={modal === "validate" ? copy.validate : copy.reject} className="max-w-lg"><form className="grid gap-4 p-1" onSubmit={(event) => void decide(event, modal === "validate" ? "VALIDATE" : "REJECT")}><Field label={copy.reason} required={modal === "reject"}><Input name="reason" required={modal === "reject"} minLength={modal === "reject" ? 8 : undefined} /></Field><Button type="submit" disabled={busy}>{modal === "validate" ? copy.validate : copy.reject}</Button></form></Dialog>
    </ModuleWorkspace>
  );
}
