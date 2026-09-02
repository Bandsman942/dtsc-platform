"use client";

import { Archive, Download, Eye, FileText, Link2, Pencil, Plus, Upload } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { Field, NativeSelect, formatEnterpriseDate, statusLabel, statusTone, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";
import { enterpriseCoreT, type EnterpriseCoreKey } from "@/lib/enterprise-core-i18n";
import { moduleCodeForEnterpriseEntity } from "@/lib/enterprise/cross-module/deep-links";

type DocumentItem = { id: string; title: string; description: string | null; documentType: string; category: string | null; status: string; visibility: string; ownerUserId: string | null; departmentId: string | null; currentVersion: number; revision: number; expiresAt: string | null; updatedAt: string; versions?: Array<{ fileName: string }> };
type LegacyRecord = { id: string; title: string; description: string | null; status: string; updatedAt: string };
type LinkTargetChoice = { id: string; reference?: string | null; title?: string | null; status?: string | null; date?: string | null; relatedEntityType?: string | null };

const documentTypeIds = ["GENERAL", "CONTRACT", "CERTIFICATE", "QUOTE", "PURCHASE_ORDER", "SUPPLIER_INVOICE", "DELIVERY_NOTE", "RECEIPT_PROOF", "TAX_DOCUMENT"] as const;
const visibilityIds = ["ORGANIZATION", "DEPARTMENT", "RESTRICTED"] as const;
const linkTypeIds = ["EnterpriseContract", "EnterpriseTask", "EnterpriseRequest", "EnterpriseApproval", "EnterpriseMeeting", "EnterpriseSupplier", "EnterprisePurchase", "EnterpriseProject", "EnterpriseAsset"] as const;
type LinkTypeId = (typeof linkTypeIds)[number];

const documentUi = {
  fr: {
    editTitle: "Modifier le document",
    save: "Enregistrer",
    archiveReview: "Vérifiez le document avant de l’archiver. Le fichier et son historique restent conservés.",
    archiveReason: "Motif professionnel",
    archiveReasonHelp: "Expliquez brièvement pourquoi ce document doit être retiré des documents actifs.",
    sourceUnavailable: "La source de ce document ne possède pas de module canonique reconnu. Le document n’a pas été créé.",
  },
  en: {
    editTitle: "Edit document",
    save: "Save",
    archiveReview: "Review the document before archiving it. The file and its history remain preserved.",
    archiveReason: "Business reason",
    archiveReasonHelp: "Briefly explain why this document should be removed from active documents.",
    sourceUnavailable: "This document source has no recognized canonical module. The document was not created.",
  },
} as const;

function localizedChoice(locale: string | null | undefined, prefix: string, id: string): EnterpriseChoice {
  return { id, label: enterpriseCoreT(locale, `${prefix}.${id}` as EnterpriseCoreKey) };
}
function documentTypeLabel(locale: string | null | undefined, value: string) { return enterpriseCoreT(locale, `documents.type.${value}` as EnterpriseCoreKey); }
function visibilityLabel(locale: string | null | undefined, value: string) { return enterpriseCoreT(locale, `documents.visibility.${value}` as EnterpriseCoreKey); }
function linkTargetLabel(locale: string | null | undefined, target: LinkTargetChoice) {
  const relatedType = target.relatedEntityType ? enterpriseCoreT(locale, `documents.target.${target.relatedEntityType}` as EnterpriseCoreKey) : "";
  return [target.reference, target.title, relatedType, target.status ? statusLabel(locale, target.status) : "", target.date ? formatEnterpriseDate(target.date, locale) : ""].filter(Boolean).join(" · ") || enterpriseCoreT(locale, "common.notSpecified");
}

export function EnterpriseDocumentsWorkspace({ organizationId, members, departments, canCreate, canManage, locale, legacyRecords = [] }: { organizationId: string; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; canCreate: boolean; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const t = (key: EnterpriseCoreKey, vars?: Record<string, string | number>) => enterpriseCoreT(locale, key, vars);
  const language = locale === "en" ? "en" : "fr";
  const searchParams = useSearchParams();
  const sourceEntityType = searchParams.get("sourceEntityType") || "";
  const sourceEntityId = searchParams.get("sourceEntityId") || "";
  const sourceReference = searchParams.get("sourceReference") || "";
  const requestedAction = searchParams.get("action") || "";
  const sourceModule = searchParams.get("sourceModule") || moduleCodeForEnterpriseEntity(sourceEntityType) || "";
  const linkedContext = Boolean(sourceEntityType && sourceEntityId);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [visibility, setVisibility] = useState("");
  const [type, setType] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<DocumentItem | null>(null);
  const [editTarget, setEditTarget] = useState<DocumentItem | null>(null);
  const [uploadTarget, setUploadTarget] = useState<DocumentItem | null>(null);
  const [linkTarget, setLinkTarget] = useState<DocumentItem | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<DocumentItem | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [linkEntityType, setLinkEntityType] = useState<LinkTypeId>("EnterpriseContract");
  const [linkTargets, setLinkTargets] = useState<LinkTargetChoice[]>([]);
  const [linkTargetsLoading, setLinkTargetsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useToastMessage(message);

  const documentTypes = useMemo(() => documentTypeIds.map((id) => localizedChoice(locale, "documents.type", id)), [locale]);
  const visibilityChoices = useMemo(() => visibilityIds.map((id) => localizedChoice(locale, "documents.visibility", id)), [locale]);
  const linkTypes = useMemo(() => linkTypeIds.map((id) => localizedChoice(locale, "documents.target", id)), [locale]);
  const linkTargetItems = useMemo(() => linkTargets.map((target) => ({ id: target.id, label: linkTargetLabel(locale, target) })), [linkTargets, locale]);

  useEffect(() => { if (requestedAction === "upload" && linkedContext && canCreate) setCreateOpen(true); }, [canCreate, linkedContext, requestedAction]);
  useEffect(() => {
    if (!linkTarget) { setLinkTargets([]); setLinkTargetsLoading(false); return; }
    let active = true; setLinkTargets([]); setLinkTargetsLoading(true);
    void fetch(`/api/enterprise/${organizationId}/documents/link-targets?type=${encodeURIComponent(linkEntityType)}`, { cache: "no-store" })
      .then(async (response) => { const body = await response.json().catch(() => null) as { targets?: LinkTargetChoice[]; error?: string } | null; if (!response.ok || !body) throw new Error(body?.error || "ACTION_FAILED"); if (active) setLinkTargets(body.targets || []); })
      .catch((error) => { if (active) { setLinkTargets([]); setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); } })
      .finally(() => { if (active) setLinkTargetsLoading(false); });
    return () => { active = false; };
  }, [organizationId, linkEntityType, linkTarget]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "20" }); if (search.trim()) value.set("search", search.trim()); if (status) value.set("status", status); if (visibility) value.set("visibility", visibility); if (type) value.set("type", type); return value; }, [page, search, status, visibility, type]);
  const collection = useEnterpriseV2Collection<DocumentItem>({ endpoint: `/api/enterprise/${organizationId}/documents`, params, refreshKey });
  const metrics = collection.meta.metrics || {};

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (linkedContext && !sourceModule) { setMessage(documentUi[language].sourceUnavailable); return; }
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (linkedContext) Object.assign(data, { sourceModule, sourceEntityType, sourceEntityId });
    setBusy(true);
    try {
      const body = await enterpriseV2Mutation(`/api/enterprise/${organizationId}/documents`, "POST", data) as { document?: DocumentItem } | null;
      const document = body?.document;
      setCreateOpen(false); setRefreshKey((value) => value + 1); setMessage(linkedContext ? t("documents.createdLinked") : t("documents.created"));
      if (document) setUploadTarget({ ...document, currentVersion: document.currentVersion || 0, revision: document.revision || 1 });
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
    finally { setBusy(false); }
  }

  async function editDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editTarget || busy) return; setBusy(true);
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/documents/${editTarget.id}`, "PATCH", { ...Object.fromEntries(new FormData(event.currentTarget).entries()), revision: editTarget.revision });
      setEditTarget(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(t("common.saveChanges"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
    finally { setBusy(false); }
  }

  async function uploadVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!uploadTarget || busy) return; const form = new FormData(event.currentTarget); form.set("revision", String(uploadTarget.revision)); setBusy(true);
    try { const response = await fetch(`/api/enterprise/${organizationId}/documents/${uploadTarget.id}/versions`, { method: "POST", body: form }); const body = await response.json().catch(() => null) as { message?: string } | null; if (!response.ok) throw new Error(body?.message || "UPLOAD_FAILED"); setUploadTarget(null); setRefreshKey((value) => value + 1); setMessage(t("documents.versionUploaded")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "UPLOAD_FAILED"); }
    finally { setBusy(false); }
  }

  async function linkDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!linkTarget || busy) return; setBusy(true);
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/documents/${linkTarget.id}/links`, "POST", Object.fromEntries(new FormData(event.currentTarget).entries())); setLinkTarget(null); setLinkTargets([]); setMessage(t("documents.linked")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
    finally { setBusy(false); }
  }

  async function download(item: DocumentItem) {
    try { const response = await fetch(`/api/enterprise/${organizationId}/documents/${item.id}/download`); const body = await response.json().catch(() => null) as { signedUrl?: string; message?: string } | null; if (!response.ok || !body?.signedUrl) throw new Error(body?.message || "DOWNLOAD_FAILED"); window.open(body.signedUrl, "_blank", "noopener,noreferrer"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "DOWNLOAD_FAILED"); }
  }

  async function archive() {
    if (!archiveTarget || busy) return;
    if (archiveReason.trim().length < 3) { setMessage(documentUi[language].archiveReasonHelp); return; }
    setBusy(true);
    try { const response = await fetch(`/api/enterprise/${organizationId}/documents/${archiveTarget.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: archiveTarget.revision, reason: archiveReason.trim() }) }); const body = await response.json().catch(() => null) as { message?: string } | null; if (!response.ok) throw new Error(body?.message || "ACTION_FAILED"); setArchiveTarget(null); setArchiveReason(""); setDetail(null); setRefreshKey((value) => value + 1); setMessage(t("documents.archived")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
    finally { setBusy(false); }
  }

  const actionsFor = (item: DocumentItem): BusinessContextAction[] => [
    { id: "open", label: t("documents.action.open"), icon: Eye, onSelect: () => setDetail(item) },
    ...(item.currentVersion > 0 ? [{ id: "download", label: t("documents.action.download"), icon: Download, onSelect: () => void download(item) }] : []),
    ...(canManage ? [
      { id: "edit", label: t("common.edit"), icon: Pencil, onSelect: () => setEditTarget(item) },
      { id: "version", label: t("documents.action.newVersion"), icon: Upload, onSelect: () => setUploadTarget(item) },
      { id: "link", label: t("documents.action.link"), icon: Link2, onSelect: () => { setLinkEntityType("EnterpriseContract"); setLinkTargets([]); setLinkTarget(item); } },
      { id: "archive", label: t("documents.action.archive"), icon: Archive, destructive: true, separatorBefore: true, onSelect: () => { setArchiveReason(""); setArchiveTarget(item); } },
    ] : []),
  ];
  const linkedReference = sourceReference || t("documents.form.workflowFallback");

  return <div className="grid min-w-0 gap-5">
    {linkedContext ? <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm leading-6 text-dtsc-ink"><strong className="block">{t("documents.form.linkedTitle", { reference: linkedReference })}</strong><span className="text-dtsc-muted">{t("documents.linked.description")}</span>{canCreate ? <Button type="button" className="mt-3" onClick={() => setCreateOpen(true)}><Upload className="h-4 w-4" />{t("documents.linked.upload")}</Button> : null}</div> : null}
    <ModuleMetrics label={t("documents.indicators")}><ModuleMetric label={t("documents.metric.active")} value={metrics.active || 0} /><ModuleMetric label={t("documents.metric.recent")} value={metrics.recent || 0} /><ModuleMetric label={t("documents.metric.expiring")} value={metrics.expiring || 0} /><ModuleMetric label={t("documents.metric.archived")} value={metrics.archived || 0} /></ModuleMetrics>
    <ModuleSection title={t("documents.section.title")} description={t("documents.section.description")} count={`${collection.pagination.total}`} action={canCreate ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{linkedContext ? t("documents.linked.upload") : t("documents.form.newTitle")}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 sm:grid-cols-2 xl:grid-cols-4"><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("documents.search")} /><NativeSelect value={status} onChange={setStatus} items={[{ id: "", label: t("documents.filter.allStatuses") }, ...["DRAFT", "ACTIVE"].map((id) => ({ id, label: statusLabel(locale, id) }))]} /><NativeSelect value={visibility} onChange={setVisibility} items={[{ id: "", label: t("documents.filter.allVisibility") }, ...visibilityChoices]} /><NativeSelect value={type} onChange={setType} items={[{ id: "", label: t("documents.filter.allTypes") }, ...documentTypes]} /></div>
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{t("common.loading")}</p> : collection.items.length ? <BusinessList ariaLabel={t("documents.aria")}>{collection.items.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge tone={statusTone(item.status)}>{statusLabel(locale, item.status)}</StatusBadge>} meta={`${documentTypeLabel(locale, item.documentType)} · v${item.currentVersion} · ${visibilityLabel(locale, item.visibility)}`} description={`${item.description || ""}${item.expiresAt ? ` · ${t("documents.expires", { date: formatEnterpriseDate(item.expiresAt, locale) })}` : ""}`} onOpen={() => setDetail(item)} openLabel={t("documents.openNamed", { title: item.title })} actions={<ContextActions label={t("documents.actions")} actions={actionsFor(item)} />} />)}</BusinessList> : <EmptyState compact title={t("documents.noDocuments")} description={collection.error || t("documents.noMatch")} />}
      <div className="mt-3 flex justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>{t("common.page", { current: collection.pagination.page, total: collection.pagination.pageCount })}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("common.previous")}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={t("documents.historical.title")} description={t("documents.historical.description")}><BusinessList ariaLabel={t("documents.historical.aria")}>{legacyRecords.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge>{t("documents.historyBadge")}</StatusBadge>} description={item.description || formatEnterpriseDate(item.updatedAt, locale)} />)}</BusinessList></ModuleSection> : null}

    <Dialog open={createOpen} onClose={() => { if (!busy) setCreateOpen(false); }} title={linkedContext ? t("documents.form.linkedTitle", { reference: linkedReference }) : t("documents.form.newTitle")} presentation="editor" className="max-w-3xl"><form onSubmit={createDocument} className="grid gap-4"><DocumentMetadataFields t={t} documentTypes={documentTypes} visibilityChoices={visibilityChoices} members={members} departments={departments} linkedContext={linkedContext} sourceEntityType={sourceEntityType} sourceReference={sourceReference} /><Button disabled={busy} className="bg-dtsc-blue text-white"><FileText className="h-4 w-4" />{busy ? t("common.loading") : linkedContext ? t("documents.form.createThenUpload") : t("documents.form.createMetadata")}</Button></form></Dialog>
    <Dialog open={Boolean(editTarget)} onClose={() => { if (!busy) setEditTarget(null); }} title={documentUi[language].editTitle} description={editTarget?.title} presentation="editor" className="max-w-3xl">{editTarget ? <form onSubmit={editDocument} className="grid gap-4"><Field label={t("documents.form.title")}><Input name="title" defaultValue={editTarget.title} required /></Field><Field label={t("documents.form.description")}><textarea name="description" defaultValue={editTarget.description || ""} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" /></Field><div className="grid gap-3 md:grid-cols-2"><Field label={t("documents.form.type")}><NativeSelect name="documentType" required defaultValue={editTarget.documentType} items={documentTypes} /></Field><Field label={t("documents.form.visibility")}><NativeSelect name="visibility" required defaultValue={editTarget.visibility} items={visibilityChoices} /></Field><Field label={t("documents.form.owner")}><NativeSelect name="ownerUserId" defaultValue={editTarget.ownerUserId || ""} items={members} /></Field><Field label={t("documents.form.department")}><NativeSelect name="departmentId" defaultValue={editTarget.departmentId || ""} items={departments} /></Field><Field label={t("documents.form.category")}><Input name="category" defaultValue={editTarget.category || ""} /></Field><Field label={t("documents.form.expiry")}><Input name="expiresAt" type="date" defaultValue={editTarget.expiresAt ? new Date(editTarget.expiresAt).toISOString().slice(0, 10) : ""} /></Field></div><Button disabled={busy} className="bg-dtsc-blue text-white">{busy ? t("common.loading") : documentUi[language].save}</Button></form> : null}</Dialog>
    <Dialog open={Boolean(uploadTarget)} onClose={() => { if (!busy) setUploadTarget(null); }} title={t("documents.upload.title")} description={uploadTarget?.title} presentation="editor"><form onSubmit={uploadVersion} className="grid gap-4"><Field label={t("documents.upload.privateFile")}><Input name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" /></Field><p className="text-xs text-dtsc-muted">{t("documents.upload.help")}</p><Button disabled={busy} className="bg-dtsc-blue text-white"><Upload className="h-4 w-4" />{busy ? t("common.loading") : t("documents.upload.submit")}</Button></form></Dialog>
    <Dialog open={Boolean(linkTarget)} onClose={() => { if (!busy) { setLinkTarget(null); setLinkTargets([]); } }} title={t("documents.link.title")} description={linkTarget?.title} presentation="editor"><form onSubmit={linkDocument} className="grid gap-4"><Field label={t("documents.link.targetType")}><NativeSelect name="targetEntityType" required value={linkEntityType} onChange={(value) => setLinkEntityType(value as LinkTypeId)} items={linkTypes} /></Field><Field label={t("documents.link.targetIdentifier")} help={t("documents.link.targetHelp")}><NativeSelect key={linkEntityType} name="targetEntityId" required disabled={linkTargetsLoading || !linkTargetItems.length} items={linkTargetItems} /></Field>{linkTargetsLoading ? <p className="text-sm text-dtsc-muted">{t("common.loading")}</p> : null}<Field label={t("documents.link.label")}><Input name="label" /></Field><Button disabled={busy || linkTargetsLoading || !linkTargetItems.length} className="bg-dtsc-blue text-white"><Link2 className="h-4 w-4" />{busy ? t("common.loading") : t("documents.link.submit")}</Button></form></Dialog>
    <Dialog open={Boolean(archiveTarget)} onClose={() => { if (!busy) { setArchiveTarget(null); setArchiveReason(""); } }} title={t("documents.action.archive")} description={documentUi[language].archiveReview} presentation="editor">{archiveTarget ? <div className="grid gap-4"><div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm"><strong>{archiveTarget.title}</strong><p className="mt-1 text-dtsc-muted">{documentTypeLabel(locale, archiveTarget.documentType)} · v{archiveTarget.currentVersion}</p></div><Field label={documentUi[language].archiveReason} help={documentUi[language].archiveReasonHelp} required><textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} minLength={3} required className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" /></Field><Button disabled={busy} onClick={() => void archive()} className="bg-dtsc-blue text-white">{busy ? t("common.loading") : t("common.confirm")}</Button></div> : null}</Dialog>
    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.title || ""} presentation="editor" className="max-w-4xl">{detail ? <div className="grid gap-3 text-sm"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(detail.status)}>{statusLabel(locale, detail.status)}</StatusBadge><StatusBadge>{visibilityLabel(locale, detail.visibility)}</StatusBadge><StatusBadge>v{detail.currentVersion}</StatusBadge></div><p className="leading-6 text-dtsc-muted">{detail.description || t("common.noDescription")}</p><p>{t("documents.detail.type")}: {documentTypeLabel(locale, detail.documentType)}</p><p>{t("documents.detail.updated")}: {formatEnterpriseDate(detail.updatedAt, locale)}</p>{detail.currentVersion > 0 ? <Button type="button" onClick={() => void download(detail)}><Download className="h-4 w-4" />{t("documents.detail.downloadLatest")}</Button> : canManage ? <Button type="button" onClick={() => setUploadTarget(detail)}><Upload className="h-4 w-4" />{t("documents.detail.uploadFirst")}</Button> : null}</div> : null}</Dialog>
  </div>;
}

function DocumentMetadataFields({ t, documentTypes, visibilityChoices, members, departments, linkedContext, sourceEntityType, sourceReference }: { t: (key: EnterpriseCoreKey, vars?: Record<string, string | number>) => string; documentTypes: EnterpriseChoice[]; visibilityChoices: EnterpriseChoice[]; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; linkedContext: boolean; sourceEntityType: string; sourceReference: string }) {
  return <><Field label={t("documents.form.title")}><Input name="title" defaultValue={sourceReference ? t("documents.form.contractTitle", { reference: sourceReference }) : ""} required /></Field><Field label={t("documents.form.description")}><textarea name="description" defaultValue={linkedContext ? t("documents.form.linkedDescription", { reference: sourceReference || t("documents.form.workflowFallback") }) : ""} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" /></Field><div className="grid gap-3 md:grid-cols-2"><Field label={t("documents.form.type")}><NativeSelect name="documentType" required defaultValue={sourceEntityType === "EnterpriseContract" ? "CONTRACT" : "GENERAL"} items={documentTypes} /></Field><Field label={t("documents.form.visibility")}><NativeSelect name="visibility" required defaultValue="RESTRICTED" items={visibilityChoices} /></Field><Field label={t("documents.form.owner")}><NativeSelect name="ownerUserId" items={members} /></Field><Field label={t("documents.form.department")}><NativeSelect name="departmentId" items={departments} /></Field><Field label={t("documents.form.category")}><Input name="category" defaultValue={sourceEntityType === "EnterpriseContract" ? "CONTRAT" : ""} /></Field><Field label={t("documents.form.expiry")}><Input name="expiresAt" type="date" /></Field></div></>;
}
