"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, CheckCircle2, Eye, FileCheck2, PauseCircle, Pencil, Plus, RefreshCcw, RotateCcw, Send, XCircle } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalWorkflowComments } from "@/components/enterprise/professional/professional-workflow-comments";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalSearch,
  ProfessionalTabs,
  professionalMutation,
  useProfessionalCollection,
} from "@/components/enterprise/professional/professional-erp-ui";
import {
  professionalErpDate,
  professionalErpEnumLabel,
  professionalErpMoney,
  professionalErpT,
  type ProfessionalErpLocale,
  useProfessionalErpLocale,
} from "@/components/enterprise/professional/professional-erp-i18n";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Party = { id: string; code: string; legalName: string; displayName: string | null; partyType: string; roles: Array<{ roleCode: string }> };
type Member = { id: string; label: string; email: string; role: string; positionTitle: string | null };
type Department = { id: string; labelFr: string; labelEn: string; departmentCode: string };
type Lookups = { members: Member[]; departments: Department[]; parties: Party[] };
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
  approvedAt: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  revision: number;
  approval: Approval | null;
  capabilities: ContractCapabilities;
};

const CONTRACT_TYPES = ["SERVICE", "SALE", "PARTNERSHIP", "SUPPLY", "CONSULTING", "OTHER"] as const;

function statusTone(status: string) {
  if (["ACTIVE", "APPROVED"].includes(status)) return "success" as const;
  if (["PENDING_APPROVAL", "SUSPENDED"].includes(status)) return "warning" as const;
  if (["TERMINATED", "EXPIRED", "CANCELLED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

export function EnterpriseContractsWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ members: [], departments: [], parties: [] });
  const [lookupsError, setLookupsError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const searchParams = useSearchParams();
  const [detail, setDetail] = useState<Contract | null>(null);
  const [edit, setEdit] = useState<Contract | null>(null);
  const [actionTarget, setActionTarget] = useState<{ contract: Contract; action: string } | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/professional-lookups?module=CONTRACTS`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Lookups & { message?: string; error?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || body?.error || professionalErpT(locale, "common.selectorsUnavailable"));
        if (active) setLookups(body);
      })
      .catch((error) => { if (active) setLookupsError(error instanceof Error ? error.message : professionalErpT(locale, "common.selectorsUnavailable")); });
    return () => { active = false; };
  }, [locale, organizationId, refreshKey]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (search.trim()) value.set("search", search.trim());
    if (tab !== "ALL") value.set("status", tab);
    return value;
  }, [page, search, tab]);
  const collection = useProfessionalCollection<Contract>({ endpoint: `/api/enterprise/${organizationId}/contracts`, params, refreshKey });

  useEffect(() => {
    const contractId = searchParams.get("contract");
    if (!contractId) return;
    const target = collection.items.find((item) => item.id === contractId);
    if (target) setDetail(target);
  }, [collection.items, searchParams]);

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
    event.preventDefault();
    setMessage("");
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/contracts`, contractPayload(new FormData(event.currentTarget)));
      setCreateOpen(false);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("common.createFailed"));
    }
  }

  async function updateContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    setMessage("");
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/contracts`, { contractId: edit.id, revision: edit.revision, ...contractPayload(new FormData(event.currentTarget)), approverUserId: undefined }, "PATCH");
      setEdit(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("common.updateFailed"));
    }
  }

  async function transitionContract(contract: Contract, action: string, payload: Record<string, unknown> = {}) {
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/contracts/${contract.id}/transition`, { action, revision: contract.revision, ...payload });
      setActionTarget(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("contracts.actionFailed"));
    }
  }

  function availableActions(contract: Contract) {
    const actions: Array<{ id: string; label: string; icon: typeof Send }> = [];
    if (contract.status === "DRAFT" && contract.capabilities.canEdit) actions.push({ id: "EDIT", label: t("contracts.edit"), icon: Pencil });
    if (contract.status === "DRAFT" && contract.capabilities.canSubmit) actions.push({ id: "SUBMIT", label: t("contracts.submit"), icon: Send });
    if (contract.status === "PENDING_APPROVAL" && contract.capabilities.canDecide) {
      actions.push(
        { id: "APPROVE", label: t("contracts.approve"), icon: CheckCircle2 },
        { id: "REQUEST_CORRECTION", label: t("contracts.requestCorrection"), icon: RotateCcw },
        { id: "REJECT", label: t("contracts.reject"), icon: XCircle },
      );
    }
    if (!contract.capabilities.canOperate) return actions;
    if (contract.status === "APPROVED") actions.push({ id: "ACTIVATE", label: t("contracts.activate"), icon: CheckCircle2 });
    if (contract.status === "ACTIVE") actions.push({ id: "SUSPEND", label: t("contracts.suspend"), icon: PauseCircle }, { id: "TERMINATE", label: t("contracts.terminate"), icon: XCircle });
    if (contract.status === "SUSPENDED") actions.push({ id: "ACTIVATE", label: t("contracts.reactivate"), icon: CheckCircle2 }, { id: "RENEW", label: t("contracts.renew"), icon: RefreshCcw }, { id: "TERMINATE", label: t("contracts.terminate"), icon: XCircle });
    if (contract.status === "EXPIRED") actions.push({ id: "RENEW", label: t("contracts.renew"), icon: RefreshCcw }, { id: "ARCHIVE", label: t("contracts.archive"), icon: Archive });
    if (["TERMINATED", "CANCELLED"].includes(contract.status)) actions.push({ id: "ARCHIVE", label: t("contracts.archive"), icon: Archive });
    return actions;
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
  const countSuffix = locale === "en" ? (collection.pagination.total === 1 ? "" : "s") : (collection.pagination.total > 1 ? "s" : "");

  return (
    <ModuleWorkspace>
      <ModuleHeader eyebrow={t("contracts.eyebrow", { organization: organizationName })} title={t("contracts.title")} description={locale === "en" ? definition.descriptionEn : definition.descriptionFr} count={t("contracts.count", { count: collection.pagination.total, suffix: countSuffix })} primaryAction={collection.canWrite ? <Button onClick={() => { setMessage(""); setCreateOpen(true); }} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{t("contracts.new")}</Button> : undefined} />
      <ModuleMetrics label={t("contracts.metrics")}>
        <ModuleMetric label={t("contracts.metricDrafts")} value={collection.metrics.draft || 0} />
        <ModuleMetric label={t("contracts.metricPending")} value={collection.metrics.pendingApproval || 0} />
        <ModuleMetric label={t("contracts.metricActive")} value={collection.metrics.active || 0} />
        <ModuleMetric label={t("contracts.metricExpiring")} value={collection.metrics.expiring || 0} />
        <ModuleMetric label={t("contracts.metricTerminated")} value={collection.metrics.terminated || 0} />
      </ModuleMetrics>
      <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("contracts.search")} />} controls={<ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setPage(1); }} items={tabs} label={t("contracts.tabsLabel")} />} summary={t("common.results", { count: collection.pagination.total, suffix: countSuffix })} />
      <ModuleContent>
        {message ? <ProfessionalError message={message} /> : null}
        {lookupsError ? <ProfessionalError message={lookupsError} /> : null}
        <ModuleSection title={t("contracts.portfolio")} description={t("contracts.portfolioDescription")}>
          {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : collection.items.length ? <BusinessList ariaLabel={t("contracts.listAria")}>{collection.items.map((contract) => <BusinessListItem key={contract.id} title={contract.title} leading={<FileCheck2 className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(contract.status)}>{professionalErpEnumLabel(locale, "status", contract.status)}</StatusBadge>} meta={`${contract.reference} · ${professionalErpEnumLabel(locale, "contractType", contract.contractType)} · ${professionalErpMoney(contract.indicativeAmount, contract.currency, locale)}`} description={`${contract.businessParty?.displayName || contract.businessParty?.legalName || t("contracts.partyToReview")} · ${professionalErpDate(contract.startDate, locale)} → ${professionalErpDate(contract.endDate, locale)}`} onOpen={() => setDetail(contract)} openLabel={t("contracts.open", { name: contract.title })} actions={<Button size="sm" variant="outline" onClick={() => setDetail(contract)}><Eye className="h-4 w-4" />{t("common.details")}</Button>} />)}</BusinessList> : <EmptyState compact title={t("contracts.emptyTitle")} description={t("contracts.emptyDescription")} />}
        </ModuleSection>
        <ProfessionalHelp moduleCode="CONTRACTS" />
      </ModuleContent>

      <ContractFormDialog open={createOpen} onClose={() => setCreateOpen(false)} title={t("contracts.new")} onSubmit={createContract} lookups={lookups} message={message} locale={locale} />
      <ContractFormDialog open={Boolean(edit)} onClose={() => setEdit(null)} title={t("contracts.edit")} onSubmit={updateContract} lookups={lookups} message={message} contract={edit} hideApprover locale={locale} />

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.title || t("contracts.fallback")} className="h-[94dvh] max-w-4xl">
        {detail ? <div className="grid gap-6">
          {message ? <ProfessionalError message={message} /> : null}
          <div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(detail.status)}>{professionalErpEnumLabel(locale, "status", detail.status)}</StatusBadge><StatusBadge>{detail.reference}</StatusBadge><StatusBadge>{professionalErpEnumLabel(locale, "contractType", detail.contractType)}</StatusBadge>{detail.capabilities.isApprover ? <StatusBadge tone="warning">{t("contracts.decisionRequired")}</StatusBadge> : null}</div>
          <dl className="grid gap-4 border-y border-dtsc-border py-5 sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("contracts.party")}</dt><dd className="mt-1 text-sm text-dtsc-ink">{detail.businessParty?.displayName || detail.businessParty?.legalName}</dd></div>
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("contracts.period")}</dt><dd className="mt-1 text-sm text-dtsc-ink">{professionalErpDate(detail.startDate, locale)} → {professionalErpDate(detail.endDate, locale)}</dd></div>
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("contracts.indicativeValue")}</dt><dd className="mt-1 text-sm text-dtsc-ink">{professionalErpMoney(detail.indicativeAmount, detail.currency, locale)}</dd></div>
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("contracts.renewal")}</dt><dd className="mt-1 text-sm text-dtsc-ink">{professionalErpEnumLabel(locale, "renewalMode", detail.renewalMode || "NONE")}{detail.renewalNoticeDays !== null ? ` · ${t("contracts.notice", { days: detail.renewalNoticeDays })}` : ""}</dd></div>
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("contracts.approval")}</dt><dd className="mt-1 text-sm text-dtsc-ink">{detail.approval ? professionalErpEnumLabel(locale, "approvalStatus", detail.approval.status) : t("contracts.notRequested")}{detail.approval?.decisionComment ? ` · ${detail.approval.decisionComment}` : ""}</dd></div>
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("contracts.revision")}</dt><dd className="mt-1 text-sm text-dtsc-ink">{t("contracts.version", { revision: detail.revision })}</dd></div>
          </dl>
          {detail.description ? <section><h3 className="font-black text-dtsc-ink">{t("contracts.summary")}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-dtsc-muted">{detail.description}</p></section> : null}
          {detail.terms ? <section><h3 className="font-black text-dtsc-ink">{t("contracts.terms")}</h3><p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap border-y border-dtsc-border py-3 text-sm leading-6 text-dtsc-muted">{detail.terms}</p></section> : null}
          {detail.terminationReason ? <ProfessionalError message={t("contracts.terminationReason", { reason: detail.terminationReason })} /> : null}
          <section><h3 className="font-black text-dtsc-ink">{t("contracts.documents")}</h3><p className="mt-1 text-sm text-dtsc-muted">{t("contracts.documentsDescription")}</p><Link className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-dtsc-border px-4 text-sm font-black text-dtsc-blue" href={`/enterprise-modules/DOCUMENTS?sourceEntityType=EnterpriseContract&sourceEntityId=${encodeURIComponent(detail.id)}&sourceReference=${encodeURIComponent(detail.reference)}&action=upload`}>{t("contracts.documentsAction")}</Link></section>
          {detail.capabilities.canComment ? <ProfessionalWorkflowComments endpoint={`/api/enterprise/${organizationId}/contracts/${detail.id}/comments`} /> : null}
          {availableActions(detail).length ? <section id="validation" className="sticky bottom-0 border-t border-dtsc-border bg-dtsc-surface py-3"><div className="flex flex-wrap justify-end gap-2">{availableActions(detail).map((action) => { const Icon = action.icon; return <Button key={action.id} variant={action.id === "TERMINATE" || action.id === "REJECT" ? "destructive" : "outline"} onClick={() => action.id === "EDIT" ? setEdit(detail) : ["ACTIVATE", "ARCHIVE"].includes(action.id) ? void transitionContract(detail, action.id) : setActionTarget({ contract: detail, action: action.id })}><Icon className="h-4 w-4" />{action.label}</Button>; })}</div></section> : null}
        </div> : null}
      </Dialog>

      <Dialog open={Boolean(actionTarget)} onClose={() => setActionTarget(null)} title={actionTarget ? actionTitle(locale, actionTarget.action) : t("contracts.actionFallback")} className="max-w-xl">
        {actionTarget ? <ActionForm target={actionTarget} members={lookups.members} onCancel={() => setActionTarget(null)} onSubmit={(payload) => void transitionContract(actionTarget.contract, actionTarget.action, payload)} locale={locale} /> : null}
      </Dialog>
    </ModuleWorkspace>
  );
}

function actionTitle(locale: ProfessionalErpLocale, action: string) {
  const key = ({ SUBMIT: "contracts.actionSubmitTitle", APPROVE: "contracts.actionApproveTitle", REQUEST_CORRECTION: "contracts.actionCorrectionTitle", REJECT: "contracts.actionRejectTitle", SUSPEND: "contracts.actionSuspendTitle", RENEW: "contracts.actionRenewTitle", TERMINATE: "contracts.actionTerminateTitle" } as const)[action as "SUBMIT" | "APPROVE" | "REQUEST_CORRECTION" | "REJECT" | "SUSPEND" | "RENEW" | "TERMINATE"];
  return key ? professionalErpT(locale, key) : professionalErpT(locale, "contracts.actionFallback");
}

function ActionForm({ target, members, onCancel, onSubmit, locale }: { target: { contract: Contract; action: string }; members: Member[]; onCancel: () => void; onSubmit: (payload: Record<string, unknown>) => void; locale: ProfessionalErpLocale }) {
  const t = (key: Parameters<typeof professionalErpT>[1]) => professionalErpT(locale, key);
  const needsReason = ["REQUEST_CORRECTION", "REJECT", "SUSPEND", "TERMINATE"].includes(target.action);
  return <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ approverUserId: String(form.get("approverUserId") || "") || null, reason: String(form.get("reason") || "") || null, renewedEndDate: String(form.get("renewedEndDate") || "") || null }); }} className="grid gap-4">
    {target.action === "SUBMIT" ? <Field label={t("contracts.validator")}><NativeSelect name="approverUserId" required items={[{ id: "", label: t("contracts.selectValidator") }, ...members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field> : null}
    {needsReason ? <Field label={target.action === "REQUEST_CORRECTION" ? t("contracts.requestedCorrections") : t("contracts.decisionReason")}><textarea name="reason" required className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" placeholder={target.action === "REQUEST_CORRECTION" ? t("contracts.correctionPlaceholder") : t("contracts.reasonPlaceholder")} /></Field> : null}
    {target.action === "APPROVE" ? <Field label={t("contracts.optionalComment")}><textarea name="reason" className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" /></Field> : null}
    {target.action === "RENEW" ? <Field label={t("contracts.newEndDate")}><Input name="renewedEndDate" type="date" required /></Field> : null}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>{t("common.cancel")}</Button><Button type="submit" variant={target.action === "REJECT" || target.action === "TERMINATE" ? "destructive" : "default"}>{t("common.confirm")}</Button></div>
  </form>;
}

function ContractFormDialog({ open, onClose, title, onSubmit, lookups, message, contract, hideApprover = false, locale }: { open: boolean; onClose: () => void; title: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; lookups: Lookups; message: string; contract?: Contract | null; hideApprover?: boolean; locale: ProfessionalErpLocale }) {
  const t = (key: Parameters<typeof professionalErpT>[1]) => professionalErpT(locale, key);
  return <Dialog open={open} onClose={onClose} title={title} className="h-[94dvh] max-w-4xl">
    <form onSubmit={onSubmit} className="grid gap-6">
      {message ? <ProfessionalError message={message} /> : null}
      <ProfessionalFormSection title={t("contracts.identification")}>
        <Field label={t("contracts.partyField")}><NativeSelect name="businessPartyId" required defaultValue={contract?.businessPartyId || ""} items={[{ id: "", label: t("contracts.selectParty") }, ...lookups.parties.map((party) => ({ id: party.id, label: `${party.displayName || party.legalName} · ${party.code}` }))]} /></Field>
        <Field label={t("contracts.type")}><NativeSelect name="contractType" defaultValue={contract?.contractType || "SERVICE"} items={CONTRACT_TYPES.map((type) => ({ id: type, label: professionalErpEnumLabel(locale, "contractType", type) }))} /></Field>
        <Field label={t("contracts.titleField")}><Input name="title" required defaultValue={contract?.title || ""} /></Field>
        <Field label={t("contracts.owner")}><NativeSelect name="ownerUserId" defaultValue={contract?.ownerUserId || ""} items={[{ id: "", label: t("common.myself") }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field>
        <Field label={t("contracts.department")}><NativeSelect name="departmentId" defaultValue={contract?.departmentId || ""} items={[{ id: "", label: t("common.none") }, ...lookups.departments.map((department) => ({ id: department.id, label: locale === "en" ? department.labelEn : department.labelFr }))]} /></Field>
        {!hideApprover ? <Field label={t("contracts.initialApprover")}><NativeSelect name="approverUserId" items={[{ id: "", label: t("contracts.saveDraft") }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field> : null}
      </ProfessionalFormSection>
      <ProfessionalFormSection title={t("contracts.periodValueRenewal")}>
        <Field label={t("contracts.startDate")}><Input name="startDate" type="date" defaultValue={contract?.startDate?.slice(0, 10) || ""} /></Field><Field label={t("contracts.endDate")}><Input name="endDate" type="date" defaultValue={contract?.endDate?.slice(0, 10) || ""} /></Field>
        <Field label={t("contracts.amount")}><Input name="indicativeAmount" type="number" min="0" step="0.01" defaultValue={contract?.indicativeAmount !== null && contract?.indicativeAmount !== undefined ? String(contract.indicativeAmount) : ""} /></Field><Field label={t("contracts.currency")}><Input name="currency" defaultValue={contract?.currency || "USD"} maxLength={3} /></Field>
        <Field label={t("contracts.renewal")}><NativeSelect name="renewalMode" defaultValue={contract?.renewalMode || "NONE"} items={["NONE", "MANUAL", "AUTOMATIC"].map((mode) => ({ id: mode, label: professionalErpEnumLabel(locale, "renewalMode", mode) }))} /></Field><Field label={t("contracts.noticeDays")}><Input name="renewalNoticeDays" type="number" min="0" max="3650" defaultValue={contract?.renewalNoticeDays ?? ""} /></Field>
      </ProfessionalFormSection>
      <ProfessionalFormSection title={t("contracts.content")}>
        <Field label={t("contracts.description")}><textarea name="description" defaultValue={contract?.description || ""} className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" /></Field>
        <Field label={t("contracts.terms")}><textarea name="terms" defaultValue={contract?.terms || ""} className="min-h-40 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" /></Field>
      </ProfessionalFormSection>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" className="bg-dtsc-blue text-white">{t("common.save")}</Button></div>
    </form>
  </Dialog>;
}
