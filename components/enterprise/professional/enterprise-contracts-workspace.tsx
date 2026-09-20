"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, CheckCircle2, Eye, FileCheck2, PauseCircle, Pencil, Plus, RefreshCcw, RotateCcw, Send, XCircle } from "lucide-react";
import { currencyChoices, Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { commercialHotfixCopy } from "@/components/enterprise/professional/commercial-hotfix-copy";
import { ProfessionalWorkflowComments } from "@/components/enterprise/professional/professional-workflow-comments";
import { ProfessionalError, ProfessionalFormSection, ProfessionalHelp, ProfessionalLoading, ProfessionalSearch, ProfessionalTabs, professionalMutation, useProfessionalCollection } from "@/components/enterprise/professional/professional-erp-ui";
import { professionalErpDate, professionalErpEnumLabel, professionalErpMoney, professionalErpT, type ProfessionalErpLocale, useProfessionalErpLocale } from "@/components/enterprise/professional/professional-erp-i18n";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Party = { id: string; code: string; legalName: string; displayName: string | null; partyType: string; roles: Array<{ roleCode: string }> };
type Member = { id: string; label: string; email: string; role: string; positionTitle: string | null };
type Department = { id: string; labelFr: string; labelEn: string; departmentCode: string };
type Lookups = { members: Member[]; departments: Department[]; parties: Party[]; currencies: string[] };
type Approval = { id: string; status: string; approverUserId: string; requestedByUserId: string; requestedAt: string; decidedAt: string | null; decisionComment: string | null };
type ContractCapabilities = { isRequester: boolean; isApprover: boolean; canEdit: boolean; canSubmit: boolean; canDecide: boolean; canOperate: boolean; canComment: boolean };
type Contract = {
  id: string;
  reference: string;
  businessPartyId: string;
  businessParty: { id: string; code: string; legalName: string; displayName: string | null } | null;
  opportunityId: string | null;
  quoteId: string | null;
  contractType: string;
  title: string;
  description: string | null;
  status: string;
  ownerUserId: string | null;
  departmentId: string | null;
  startDate: string | null;
  endDate: string | null;
  indicativeAmount: string | number | null;
  currency: string | null;
  renewalMode: string | null;
  renewalNoticeDays: number | null;
  terms: string | null;
  terminationReason: string | null;
  revision: number;
  approval: Approval | null;
  capabilities: ContractCapabilities;
};

type ContractAction = "SUBMIT" | "APPROVE" | "REQUEST_CORRECTION" | "REJECT" | "ACTIVATE" | "SUSPEND" | "RENEW" | "TERMINATE" | "ARCHIVE";
type ActionTarget = { contract: Contract; action: ContractAction };

const CONTRACT_TYPES = ["SERVICE", "SALE", "PARTNERSHIP", "SUPPLY", "CONSULTING", "OTHER"] as const;

function statusTone(status: string) {
  if (["ACTIVE", "APPROVED"].includes(status)) return "success" as const;
  if (["PENDING_APPROVAL", "SUSPENDED"].includes(status)) return "warning" as const;
  if (["TERMINATED", "EXPIRED", "CANCELLED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

function availableActions(contract: Contract, t: (key: Parameters<typeof professionalErpT>[1]) => string) {
  const actions: Array<{ id: "EDIT" | ContractAction; label: string; icon: typeof Send; destructive?: boolean }> = [];
  if (contract.status === "DRAFT" && contract.capabilities.canEdit) actions.push({ id: "EDIT", label: t("contracts.edit"), icon: Pencil });
  if (contract.status === "DRAFT" && contract.capabilities.canSubmit) actions.push({ id: "SUBMIT", label: t("contracts.submit"), icon: Send });
  if (contract.status === "PENDING_APPROVAL" && contract.capabilities.canDecide) {
    actions.push(
      { id: "APPROVE", label: t("contracts.approve"), icon: CheckCircle2 },
      { id: "REQUEST_CORRECTION", label: t("contracts.requestCorrection"), icon: RotateCcw },
      { id: "REJECT", label: t("contracts.reject"), icon: XCircle, destructive: true },
    );
  }
  if (!contract.capabilities.canOperate) return actions;
  if (contract.status === "APPROVED") actions.push({ id: "ACTIVATE", label: t("contracts.activate"), icon: CheckCircle2 });
  if (contract.status === "ACTIVE") actions.push({ id: "SUSPEND", label: t("contracts.suspend"), icon: PauseCircle }, { id: "TERMINATE", label: t("contracts.terminate"), icon: XCircle, destructive: true });
  if (contract.status === "SUSPENDED") actions.push({ id: "ACTIVATE", label: t("contracts.reactivate"), icon: CheckCircle2 }, { id: "RENEW", label: t("contracts.renew"), icon: RefreshCcw }, { id: "TERMINATE", label: t("contracts.terminate"), icon: XCircle, destructive: true });
  if (contract.status === "EXPIRED") actions.push({ id: "RENEW", label: t("contracts.renew"), icon: RefreshCcw }, { id: "ARCHIVE", label: t("contracts.archive"), icon: Archive, destructive: true });
  if (["TERMINATED", "CANCELLED"].includes(contract.status)) actions.push({ id: "ARCHIVE", label: t("contracts.archive"), icon: Archive, destructive: true });
  return actions;
}

export function EnterpriseContractsWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const hotfix = commercialHotfixCopy(locale);
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ members: [], departments: [], parties: [], currencies: [] });
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Contract | null>(null);
  const [edit, setEdit] = useState<Contract | null>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const searchParams = useSearchParams();
  useToastMessage(success, "success");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/professional-lookups?module=CONTRACTS`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => null) as (Lookups & { message?: string; error?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.message || body?.error || t("common.selectorsUnavailable"));
      if (active) setLookups({ members: body.members || [], departments: body.departments || [], parties: body.parties || [], currencies: body.currencies || [] });
    }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : t("common.selectorsUnavailable")); });
    return () => { active = false; };
  }, [locale, organizationId, refreshKey]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (search.trim()) value.set("search", search.trim());
    if (tab !== "ALL") value.set("status", tab);
    return value;
  }, [page, search, tab]);
  const collection = useProfessionalCollection<Contract>({ endpoint: `/api/enterprise/${organizationId}/contracts`, params, refreshKey });
  const currencies = lookups.currencies.length ? lookups.currencies.map((code) => ({ id: code, label: code })) : currencyChoices(locale);

  useEffect(() => {
    const contractId = searchParams.get("contract");
    if (!contractId) return;
    const target = collection.items.find((item) => item.id === contractId);
    if (target) setDetail(target);
  }, [collection.items, searchParams]);

  function clearFeedback() { setMessage(""); setActionError(""); setSuccess(""); }
  function openEdit(contract: Contract) { clearFeedback(); setDetail(null); setEdit(contract); }
  function openAction(contract: Contract, action: ContractAction) { clearFeedback(); setDetail(null); setActionTarget({ contract, action }); }

  function contractPayload(form: FormData) {
    return {
      businessPartyId: String(form.get("businessPartyId") || ""),
      contractType: String(form.get("contractType") || "SERVICE"),
      title: String(form.get("title") || ""),
      description: String(form.get("description") || "") || null,
      ownerUserId: String(form.get("ownerUserId") || "") || null,
      departmentId: String(form.get("departmentId") || "") || null,
      startDate: String(form.get("startDate") || "") || null,
      endDate: String(form.get("endDate") || "") || null,
      indicativeAmount: String(form.get("indicativeAmount") || "") || null,
      currency: String(form.get("currency") || "") || null,
      renewalMode: String(form.get("renewalMode") || "NONE"),
      renewalNoticeDays: String(form.get("renewalNoticeDays") || "") || null,
      terms: String(form.get("terms") || "") || null,
      approverUserId: String(form.get("approverUserId") || "") || null,
    };
  }

  async function createContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); clearFeedback(); const form = new FormData(event.currentTarget);
    const startDate = String(form.get("startDate") || ""); const endDate = String(form.get("endDate") || "");
    if (startDate && endDate && endDate < startDate) { setMessage(locale === "en" ? "The end date must be on or after the start date." : "La date de fin doit être postérieure ou égale à la date de début."); return; }
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/contracts`, contractPayload(form));
      setCreateOpen(false); setRefreshKey((value) => value + 1); setSuccess(hotfix.savedContract);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.createFailed")); } finally { setBusy(false); }
  }

  async function updateContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!edit) return; clearFeedback(); const form = new FormData(event.currentTarget);
    const startDate = String(form.get("startDate") || ""); const endDate = String(form.get("endDate") || "");
    if (startDate && endDate && endDate < startDate) { setMessage(locale === "en" ? "The end date must be on or after the start date." : "La date de fin doit être postérieure ou égale à la date de début."); return; }
    setBusy(true);
    try {
      const payload = contractPayload(form);
      await professionalMutation(`/api/enterprise/${organizationId}/contracts`, { contractId: edit.id, revision: edit.revision, ...payload, approverUserId: undefined }, "PATCH");
      setEdit(null); setRefreshKey((value) => value + 1); setSuccess(hotfix.updatedContract);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.updateFailed")); } finally { setBusy(false); }
  }

  async function transitionContract(payload: Record<string, unknown>) {
    if (!actionTarget) return;
    setActionError(""); setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/contracts/${actionTarget.contract.id}/transition`, { action: actionTarget.action, revision: actionTarget.contract.revision, ...payload });
      setActionTarget(null); setRefreshKey((value) => value + 1); setSuccess(hotfix.contractActionDone);
    } catch (error) { setActionError(error instanceof Error ? error.message : t("contracts.actionFailed")); } finally { setBusy(false); }
  }

  const tabs = [
    { id: "ALL", label: t("contracts.tabAll"), count: collection.pagination.total },
    { id: "DRAFT", label: t("contracts.tabDrafts"), count: collection.metrics.draft },
    { id: "PENDING_APPROVAL", label: t("contracts.tabPending"), count: collection.metrics.pendingApproval },
    { id: "ACTIVE", label: t("contracts.tabActive"), count: collection.metrics.active },
    { id: "SUSPENDED", label: t("contracts.tabSuspended"), count: collection.metrics.suspended },
    { id: "EXPIRED", label: t("contracts.tabExpired"), count: collection.metrics.expired },
    { id: "TERMINATED", label: t("contracts.tabTerminated"), count: collection.metrics.terminated },
  ];

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={t("contracts.eyebrow", { organization: organizationName })} title={t("contracts.title")} description={locale === "en" ? definition.descriptionEn : definition.descriptionFr} count={t("contracts.count", { count: collection.pagination.total, suffix: collection.pagination.total === 1 ? "" : "s" })} primaryAction={collection.canWrite ? <Button onClick={() => { clearFeedback(); setCreateOpen(true); }}><Plus className="h-4 w-4" />{t("contracts.new")}</Button> : undefined} />
    <ModuleMetrics label={t("contracts.metrics")}><ModuleMetric label={t("contracts.metricDrafts")} value={collection.metrics.draft || 0} /><ModuleMetric label={t("contracts.metricPending")} value={collection.metrics.pendingApproval || 0} /><ModuleMetric label={t("contracts.metricActive")} value={collection.metrics.active || 0} /><ModuleMetric label={t("contracts.metricExpiring")} value={collection.metrics.expiring || 0} /><ModuleMetric label={t("contracts.metricTerminated")} value={collection.metrics.terminated || 0} /></ModuleMetrics>
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("contracts.search")} />} controls={<ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setPage(1); }} items={tabs} label={t("contracts.tabsLabel")} />} summary={t("common.results", { count: collection.pagination.total, suffix: collection.pagination.total === 1 ? "" : "s" })} />
    <ModuleContent>
      {message && !createOpen && !edit ? <ProfessionalError message={message} /> : null}
      <ModuleSection title={t("contracts.portfolio")} description={t("contracts.portfolioDescription")}>
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : collection.items.length ? <BusinessList ariaLabel={t("contracts.listAria")}>{collection.items.map((contract) => <BusinessListItem key={contract.id} title={contract.title} leading={<FileCheck2 className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(contract.status)}>{professionalErpEnumLabel(locale, "status", contract.status)}</StatusBadge>} meta={`${contract.reference} · ${professionalErpEnumLabel(locale, "contractType", contract.contractType)} · ${professionalErpMoney(contract.indicativeAmount, contract.currency, locale)}`} description={`${contract.businessParty?.displayName || contract.businessParty?.legalName || t("contracts.partyToReview")} · ${professionalErpDate(contract.startDate, locale)} → ${professionalErpDate(contract.endDate, locale)}`} onOpen={() => setDetail(contract)} openLabel={t("contracts.open", { name: contract.title })} actions={<Button size="sm" variant="outline" onClick={() => setDetail(contract)}><Eye className="h-4 w-4" />{t("common.details")}</Button>} />)}</BusinessList> : <EmptyState compact title={t("contracts.emptyTitle")} description={t("contracts.emptyDescription")} />}
        <div className="mt-4 flex items-center justify-between gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("common.previous")}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div>
      </ModuleSection><ProfessionalHelp moduleCode="CONTRACTS" />
    </ModuleContent>

    <ContractFormDialog open={createOpen} onClose={() => { if (!busy) setCreateOpen(false); }} title={t("contracts.new")} formId="contract-create-form" onSubmit={createContract} lookups={lookups} currencies={currencies} message={message} busy={busy} locale={locale} />
    <ContractFormDialog open={Boolean(edit)} onClose={() => { if (!busy) setEdit(null); }} title={t("contracts.edit")} formId="contract-edit-form" onSubmit={updateContract} lookups={lookups} currencies={currencies} message={message} busy={busy} contract={edit} hideApprover locale={locale} />

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.title || t("contracts.fallback")} className="h-[94dvh] max-w-5xl" presentation="editor">{detail ? <div className="grid gap-6 p-4 sm:p-5"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(detail.status)}>{professionalErpEnumLabel(locale, "status", detail.status)}</StatusBadge><StatusBadge>{detail.reference}</StatusBadge>{detail.approval?.status === "PENDING" ? <StatusBadge tone="warning">{t("contracts.decisionRequired")}</StatusBadge> : null}</div><dl className="grid gap-3 sm:grid-cols-2"><DetailBlock title={t("contracts.party")} value={detail.businessParty?.displayName || detail.businessParty?.legalName || t("contracts.partyToReview")} /><DetailBlock title={t("contracts.period")} value={`${professionalErpDate(detail.startDate, locale)} → ${professionalErpDate(detail.endDate, locale)}`} /><DetailBlock title={t("contracts.indicativeValue")} value={professionalErpMoney(detail.indicativeAmount, detail.currency, locale)} /><DetailBlock title={t("contracts.renewal")} value={`${professionalErpEnumLabel(locale, "renewalMode", detail.renewalMode || "NONE")}${detail.renewalNoticeDays !== null ? ` · ${t("contracts.notice", { days: detail.renewalNoticeDays })}` : ""}`} /><DetailBlock title={t("contracts.approval")} value={detail.approval ? professionalErpEnumLabel(locale, "approvalStatus", detail.approval.status) : t("contracts.notRequested")} /><DetailBlock title={t("contracts.revision")} value={t("contracts.version", { revision: detail.revision })} /></dl>{detail.description ? <section><h3 className="font-black text-dtsc-ink">{t("contracts.summary")}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-dtsc-muted">{detail.description}</p></section> : null}{detail.terms ? <section><h3 className="font-black text-dtsc-ink">{t("contracts.terms")}</h3><p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap border-y border-dtsc-border py-3 text-sm leading-6 text-dtsc-muted">{detail.terms}</p></section> : null}{detail.terminationReason ? <section className="rounded-xl border border-dtsc-border bg-dtsc-soft p-4"><h3 className="font-black text-dtsc-ink">{hotfix.contractTerminationInfo}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-dtsc-muted">{detail.terminationReason}</p></section> : null}<section><h3 className="font-black text-dtsc-ink">{t("contracts.documents")}</h3><p className="mt-1 text-sm text-dtsc-muted">{t("contracts.documentsDescription")}</p><Link className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-dtsc-border px-4 text-sm font-black text-dtsc-blue" href={`/enterprise-modules/DOCUMENTS?sourceEntityType=EnterpriseContract&sourceEntityId=${encodeURIComponent(detail.id)}&sourceReference=${encodeURIComponent(detail.reference)}&action=upload`}>{t("contracts.documentsAction")}</Link></section>{detail.capabilities.canComment ? <ProfessionalWorkflowComments endpoint={`/api/enterprise/${organizationId}/contracts/${detail.id}/comments`} /> : null}{availableActions(detail, (key) => t(key)).length ? <section className="border-t border-dtsc-border pt-4"><div className="flex flex-wrap justify-end gap-2">{availableActions(detail, (key) => t(key)).map((action) => { const Icon = action.icon; return <Button key={action.id} variant={action.destructive ? "destructive" : "outline"} onClick={() => action.id === "EDIT" ? openEdit(detail) : openAction(detail, action.id)}><Icon className="h-4 w-4" />{action.label}</Button>; })}</div></section> : null}</div> : null}</Dialog>

    <Dialog open={Boolean(actionTarget)} onClose={() => { if (!busy) setActionTarget(null); }} title={actionTarget?.action === "ARCHIVE" ? hotfix.confirmArchiveTitle : actionTitle(locale, actionTarget?.action)} description={actionTarget?.action === "ARCHIVE" ? hotfix.confirmArchiveHelp : undefined} className="max-w-xl">{actionTarget ? <ActionForm target={actionTarget} members={lookups.members} error={actionError} busy={busy} onCancel={() => setActionTarget(null)} onSubmit={(payload) => void transitionContract(payload)} locale={locale} /> : null}</Dialog>
  </ModuleWorkspace>;
}

function actionTitle(locale: ProfessionalErpLocale, action?: ContractAction) {
  const map: Partial<Record<ContractAction, Parameters<typeof professionalErpT>[1]>> = { SUBMIT: "contracts.actionSubmitTitle", APPROVE: "contracts.actionApproveTitle", REQUEST_CORRECTION: "contracts.actionCorrectionTitle", REJECT: "contracts.actionRejectTitle", SUSPEND: "contracts.actionSuspendTitle", RENEW: "contracts.actionRenewTitle", TERMINATE: "contracts.actionTerminateTitle" };
  return map[action || "ACTIVATE"] ? professionalErpT(locale, map[action || "ACTIVATE"]!) : professionalErpT(locale, "contracts.actionFallback");
}

function ActionForm({ target, members, error, busy, onCancel, onSubmit, locale }: { target: ActionTarget; members: Member[]; error: string; busy: boolean; onCancel: () => void; onSubmit: (payload: Record<string, unknown>) => void; locale: ProfessionalErpLocale }) {
  const t = (key: Parameters<typeof professionalErpT>[1]) => professionalErpT(locale, key);
  const hotfix = commercialHotfixCopy(locale);
  const needsReason = ["REQUEST_CORRECTION", "REJECT", "SUSPEND", "TERMINATE"].includes(target.action);
  return <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ approverUserId: String(form.get("approverUserId") || "") || null, reason: String(form.get("reason") || "") || null, renewedEndDate: String(form.get("renewedEndDate") || "") || null }); }} className="grid gap-4">{error ? <><ProfessionalError message={error} /><p className="text-sm text-dtsc-muted">{hotfix.actionErrorHelp}</p></> : null}{target.action === "SUBMIT" ? <Field label={t("contracts.validator")} required><NativeSelect name="approverUserId" required items={[{ id: "", label: t("contracts.selectValidator") }, ...members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field> : null}{needsReason ? <Field label={target.action === "REQUEST_CORRECTION" ? t("contracts.requestedCorrections") : t("contracts.decisionReason")} required><textarea name="reason" required className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" placeholder={target.action === "REQUEST_CORRECTION" ? t("contracts.correctionPlaceholder") : t("contracts.reasonPlaceholder")} /></Field> : null}{target.action === "APPROVE" ? <Field label={t("contracts.optionalComment")}><textarea name="reason" className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" /></Field> : null}{target.action === "RENEW" ? <Field label={t("contracts.newEndDate")} required><Input name="renewedEndDate" type="date" required /></Field> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{t("common.cancel")}</Button><Button type="submit" disabled={busy} variant={target.action === "REJECT" || target.action === "TERMINATE" || target.action === "ARCHIVE" ? "destructive" : "default"}>{busy ? t("common.saving") : t("common.confirm")}</Button></div></form>;
}

function ContractFormDialog({ open, onClose, title, formId, onSubmit, lookups, currencies, message, busy, contract, hideApprover = false, locale }: { open: boolean; onClose: () => void; title: string; formId: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; lookups: Lookups; currencies: Array<{ id: string; label: string }>; message: string; busy: boolean; contract?: Contract | null; hideApprover?: boolean; locale: ProfessionalErpLocale }) {
  const t = (key: Parameters<typeof professionalErpT>[1]) => professionalErpT(locale, key);
  const hotfix = commercialHotfixCopy(locale);
  return <Dialog open={open} onClose={onClose} title={title} className="h-[94dvh] max-w-4xl" presentation="editor" footer={<><Button variant="outline" disabled={busy} onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" form={formId} disabled={busy}>{busy ? t("common.saving") : t("common.save")}</Button></>}><form id={formId} onSubmit={onSubmit} className="grid gap-6 p-4 sm:p-5">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title={t("contracts.identification")}><Field label={t("contracts.partyField")} required><NativeSelect name="businessPartyId" required defaultValue={contract?.businessPartyId || ""} items={[{ id: "", label: t("contracts.selectParty") }, ...lookups.parties.map((party) => ({ id: party.id, label: `${party.displayName || party.legalName} · ${party.code}` }))]} /></Field><Field label={t("contracts.type")} required><NativeSelect name="contractType" required defaultValue={contract?.contractType || "SERVICE"} items={CONTRACT_TYPES.map((type) => ({ id: type, label: professionalErpEnumLabel(locale, "contractType", type) }))} /></Field><Field label={t("contracts.titleField")} required><Input name="title" required defaultValue={contract?.title || ""} /></Field><Field label={t("contracts.owner")}><NativeSelect name="ownerUserId" defaultValue={contract?.ownerUserId || ""} items={[{ id: "", label: t("common.myself") }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field><Field label={t("contracts.department")}><NativeSelect name="departmentId" defaultValue={contract?.departmentId || ""} items={[{ id: "", label: t("common.none") }, ...lookups.departments.map((department) => ({ id: department.id, label: locale === "en" ? department.labelEn : department.labelFr }))]} /></Field>{!hideApprover ? <Field label={t("contracts.initialApprover")}><NativeSelect name="approverUserId" items={[{ id: "", label: t("contracts.saveDraft") }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field> : null}</ProfessionalFormSection><ProfessionalFormSection title={t("contracts.periodValueRenewal")}><Field label={t("contracts.startDate")}><Input name="startDate" type="date" defaultValue={contract?.startDate?.slice(0, 10) || ""} /></Field><Field label={t("contracts.endDate")}><Input name="endDate" type="date" defaultValue={contract?.endDate?.slice(0, 10) || ""} /></Field><Field label={t("contracts.amount")}><Input name="indicativeAmount" type="number" min="0" step="0.01" defaultValue={contract?.indicativeAmount != null ? String(contract.indicativeAmount) : ""} /></Field><Field label={t("contracts.currency")} help={hotfix.currencyConfigurationHelp}><NativeSelect name="currency" defaultValue={contract?.currency || currencies[0]?.id || ""} items={currencies} /></Field><Field label={t("contracts.renewal")}><NativeSelect name="renewalMode" defaultValue={contract?.renewalMode || "NONE"} items={["NONE", "MANUAL", "AUTOMATIC"].map((mode) => ({ id: mode, label: professionalErpEnumLabel(locale, "renewalMode", mode) }))} /></Field><Field label={t("contracts.noticeDays")}><Input name="renewalNoticeDays" type="number" min="0" max="3650" defaultValue={contract?.renewalNoticeDays ?? ""} /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("contracts.content")}><Field label={t("contracts.description")}><textarea name="description" defaultValue={contract?.description || ""} className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" /></Field><Field label={t("contracts.terms")}><textarea name="terms" defaultValue={contract?.terms || ""} className="min-h-40 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" /></Field></ProfessionalFormSection></form></Dialog>;
}

function DetailBlock({ title, value }: { title: string; value: string }) { return <div className="border-y border-dtsc-border py-3"><dt className="text-xs font-black uppercase text-dtsc-muted">{title}</dt><dd className="mt-1 break-words text-sm text-dtsc-ink">{value}</dd></div>; }
