"use client";

import { Archive, Download, Eye, FileText, Link2, Plus, Upload } from "lucide-react";
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

type DocumentItem = { id: string; title: string; description: string | null; documentType: string; category: string | null; status: string; visibility: string; ownerUserId: string | null; departmentId: string | null; currentVersion: number; revision: number; expiresAt: string | null; updatedAt: string; versions?: Array<{ fileName: string }> };
type LegacyRecord = { id: string; title: string; description: string | null; status: string; updatedAt: string };
const documentTypes: EnterpriseChoice[] = ["GENERAL", "CONTRACT", "CERTIFICATE", "QUOTE", "PURCHASE_ORDER", "SUPPLIER_INVOICE", "DELIVERY_NOTE", "RECEIPT_PROOF", "TAX_DOCUMENT"].map((id) => ({ id, label: id.replaceAll("_", " ") }));
const visibilityChoicesFr: EnterpriseChoice[] = [{ id: "ORGANIZATION", label: "Organisation" }, { id: "DEPARTMENT", label: "Département" }, { id: "RESTRICTED", label: "Restreint" }];
const visibilityChoicesEn: EnterpriseChoice[] = [{ id: "ORGANIZATION", label: "Organization" }, { id: "DEPARTMENT", label: "Department" }, { id: "RESTRICTED", label: "Restricted" }];
const linkTypes: EnterpriseChoice[] = ["EnterpriseContract", "EnterpriseTask", "EnterpriseRequest", "EnterpriseApproval", "EnterpriseMeeting", "EnterpriseSupplier", "EnterprisePurchase", "EnterpriseProject", "EnterpriseAsset"].map((id) => ({ id, label: id.replace("Enterprise", "") }));

function visibilityLabel(locale: string | null | undefined, value: string) { const list = locale === "en" ? visibilityChoicesEn : visibilityChoicesFr; return list.find((item) => item.id === value)?.label || value; }

export function EnterpriseDocumentsWorkspace({ organizationId, members, departments, canCreate, canManage, locale, legacyRecords = [] }: { organizationId: string; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; canCreate: boolean; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const en = locale === "en";
  const searchParams = useSearchParams();
  const sourceEntityType = searchParams.get("sourceEntityType") || "";
  const sourceEntityId = searchParams.get("sourceEntityId") || "";
  const sourceReference = searchParams.get("sourceReference") || "";
  const requestedAction = searchParams.get("action") || "";
  const linkedContext = Boolean(sourceEntityType && sourceEntityId);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [visibility, setVisibility] = useState("");
  const [type, setType] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<DocumentItem | null>(null);
  const [uploadTarget, setUploadTarget] = useState<DocumentItem | null>(null);
  const [linkTarget, setLinkTarget] = useState<DocumentItem | null>(null);
  const [message, setMessage] = useState("");
  useToastMessage(message);

  useEffect(() => {
    if (requestedAction === "upload" && linkedContext && canCreate) setCreateOpen(true);
  }, [canCreate, linkedContext, requestedAction]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "20" }); if (search.trim()) value.set("search", search.trim()); if (status) value.set("status", status); if (visibility) value.set("visibility", visibility); if (type) value.set("type", type); return value; }, [page, search, status, visibility, type]);
  const collection = useEnterpriseV2Collection<DocumentItem>({ endpoint: `/api/enterprise/${organizationId}/documents`, params, refreshKey });
  const metrics = collection.meta.metrics || {};

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const body = await enterpriseV2Mutation(`/api/enterprise/${organizationId}/documents`, "POST", data) as { document?: DocumentItem } | null;
      const document = body?.document;
      if (document && linkedContext) {
        await enterpriseV2Mutation(`/api/enterprise/${organizationId}/documents/${document.id}/links`, "POST", {
          targetEntityType: sourceEntityType,
          targetEntityId: sourceEntityId,
          label: sourceReference ? `Pièce liée à ${sourceReference}` : "Pièce liée au workflow",
        });
      }
      setCreateOpen(false);
      setRefreshKey((v) => v + 1);
      setMessage(linkedContext ? (en ? "Document metadata created and linked. Upload the file now." : "Métadonnées créées et document lié. Téléversez maintenant le fichier réel.") : (en ? "Document created." : "Document créé."));
      if (document) setUploadTarget({ ...document, currentVersion: document.currentVersion || 0, revision: document.revision || 1 });
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function uploadVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!uploadTarget) return;
    const form = new FormData(event.currentTarget); form.set("revision", String(uploadTarget.revision));
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/documents/${uploadTarget.id}/versions`, { method: "POST", body: form });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "UPLOAD_FAILED");
      setUploadTarget(null); setRefreshKey((v) => v + 1); setMessage(en ? "New version uploaded." : "Fichier réel téléversé et nouvelle version ajoutée.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "UPLOAD_FAILED"); }
  }

  async function linkDocument(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!linkTarget) return; try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/documents/${linkTarget.id}/links`, "POST", Object.fromEntries(new FormData(event.currentTarget).entries())); setLinkTarget(null); setMessage(en ? "Document linked." : "Document lié."); } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); } }
  async function download(item: DocumentItem) { try { const response = await fetch(`/api/enterprise/${organizationId}/documents/${item.id}/download`); const body = await response.json().catch(() => null) as { signedUrl?: string; message?: string } | null; if (!response.ok || !body?.signedUrl) throw new Error(body?.message || "DOWNLOAD_FAILED"); window.open(body.signedUrl, "_blank", "noopener,noreferrer"); } catch (error) { setMessage(error instanceof Error ? error.message : "DOWNLOAD_FAILED"); } }
  async function archive(item: DocumentItem) { try { const response = await fetch(`/api/enterprise/${organizationId}/documents/${item.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: item.revision }) }); const body = await response.json().catch(() => null) as { message?: string } | null; if (!response.ok) throw new Error(body?.message || "ACTION_FAILED"); setRefreshKey((v) => v + 1); setMessage(en ? "Document archived." : "Document archivé."); } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); } }
  const actionsFor = (item: DocumentItem): BusinessContextAction[] => [{ id: "open", label: en ? "Open" : "Ouvrir", icon: Eye, onSelect: () => setDetail(item) }, ...(item.currentVersion > 0 ? [{ id: "download", label: en ? "Download" : "Télécharger", icon: Download, onSelect: () => void download(item) }] : []), ...(canManage ? [{ id: "version", label: en ? "New version" : "Téléverser une version", icon: Upload, onSelect: () => setUploadTarget(item) }, { id: "link", label: en ? "Link" : "Lier", icon: Link2, onSelect: () => setLinkTarget(item) }, { id: "archive", label: en ? "Archive" : "Archiver", icon: Archive, destructive: true, separatorBefore: true, onSelect: () => void archive(item) }] : [])];

  return <div className="grid min-w-0 gap-5">
    {linkedContext ? <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm leading-6 text-dtsc-ink"><strong className="block">Document lié au workflow {sourceReference || "sélectionné"}</strong><span className="text-dtsc-muted">Créez les métadonnées, puis le formulaire de téléversement du fichier réel s’ouvrira automatiquement.</span>{canCreate ? <Button type="button" className="mt-3" onClick={() => setCreateOpen(true)}><Upload className="h-4 w-4" />Téléverser un document lié</Button> : null}</div> : null}
    <ModuleMetrics label={en ? "Document indicators" : "Indicateurs documents"}><ModuleMetric label={en ? "Active" : "Actifs"} value={metrics.active || 0} /><ModuleMetric label={en ? "Recently added" : "Ajoutés récemment"} value={metrics.recent || 0} /><ModuleMetric label={en ? "Expiring" : "À expiration"} value={metrics.expiring || 0} /><ModuleMetric label={en ? "Archived" : "Archivés"} value={metrics.archived || 0} /></ModuleMetrics>
    <ModuleSection title={en ? "Enterprise documents" : "Documents entreprise"} description={en ? "Private, versioned documents with controlled visibility." : "Documents privés, versionnés et à visibilité contrôlée."} count={`${collection.pagination.total}`} action={canCreate ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{linkedContext ? "Téléverser un document lié" : en ? "New document" : "Nouveau document"}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 sm:grid-cols-2 xl:grid-cols-4"><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={en ? "Search documents…" : "Rechercher un document…"} /><NativeSelect value={status} onChange={setStatus} items={[{ id: "", label: en ? "All statuses" : "Tous les statuts" }, ...["DRAFT", "ACTIVE"].map((id) => ({ id, label: statusLabel(locale, id) }))]} /><NativeSelect value={visibility} onChange={setVisibility} items={[{ id: "", label: en ? "All visibility" : "Toutes les visibilités" }, ...(en ? visibilityChoicesEn : visibilityChoicesFr)]} /><NativeSelect value={type} onChange={setType} items={[{ id: "", label: en ? "All types" : "Tous les types" }, ...documentTypes]} /></div>
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{en ? "Loading…" : "Chargement…"}</p> : collection.items.length ? <BusinessList ariaLabel={en ? "Documents" : "Documents"}>{collection.items.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge tone={statusTone(item.status)}>{statusLabel(locale, item.status)}</StatusBadge>} meta={`${item.documentType.replaceAll("_", " ")} · v${item.currentVersion} · ${visibilityLabel(locale, item.visibility)}`} description={`${item.description || ""}${item.expiresAt ? ` · ${en ? "Expires" : "Expire"} ${formatEnterpriseDate(item.expiresAt, locale)}` : ""}`} onOpen={() => setDetail(item)} openLabel={`${en ? "Open" : "Ouvrir"} ${item.title}`} actions={<ContextActions label={en ? "Document actions" : "Actions document"} actions={actionsFor(item)} />} />)}</BusinessList> : <EmptyState compact title={en ? "No documents" : "Aucun document"} description={collection.error || (en ? "No document matches the filters." : "Aucun document ne correspond aux filtres.")} />}
      <div className="mt-3 flex justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>Page {collection.pagination.page}/{collection.pagination.pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>{en ? "Previous" : "Précédent"}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((v) => v + 1)}>{en ? "Next" : "Suivant"}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={en ? "Historical documents" : "Documents historiques"} description={en ? "Legacy documents remain readable and read-only." : "Les anciens documents restent lisibles et non modifiables."}><BusinessList ariaLabel="legacy documents">{legacyRecords.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge>{en ? "History" : "Historique"}</StatusBadge>} description={item.description || formatEnterpriseDate(item.updatedAt, locale)} />)}</BusinessList></ModuleSection> : null}
    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={linkedContext ? `Document lié à ${sourceReference || "ce workflow"}` : en ? "New document" : "Nouveau document"} className="h-[94dvh] max-w-3xl"><form onSubmit={createDocument} className="grid gap-4"><Field label={en ? "Title" : "Titre"}><Input name="title" defaultValue={sourceReference ? `Pièce contractuelle ${sourceReference}` : ""} required /></Field><Field label={en ? "Description" : "Description"}><textarea name="description" defaultValue={linkedContext ? `Document lié à ${sourceReference || sourceEntityType}` : ""} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" /></Field><div className="grid gap-3 md:grid-cols-2"><Field label={en ? "Type" : "Type"}><NativeSelect name="documentType" required defaultValue={sourceEntityType === "EnterpriseContract" ? "CONTRACT" : "GENERAL"} items={documentTypes} /></Field><Field label={en ? "Visibility" : "Visibilité"}><NativeSelect name="visibility" required defaultValue="RESTRICTED" items={en ? visibilityChoicesEn : visibilityChoicesFr} /></Field><Field label={en ? "Owner" : "Propriétaire"}><NativeSelect name="ownerUserId" items={members} /></Field><Field label={en ? "Department" : "Département"}><NativeSelect name="departmentId" items={departments} /></Field><Field label={en ? "Category" : "Catégorie"}><Input name="category" defaultValue={sourceEntityType === "EnterpriseContract" ? "CONTRAT" : ""} /></Field><Field label={en ? "Expiry" : "Expiration"}><Input name="expiresAt" type="date" /></Field></div><Button className="bg-dtsc-blue text-white"><FileText className="h-4 w-4" />{linkedContext ? "Créer puis téléverser le fichier" : en ? "Create metadata" : "Créer les métadonnées"}</Button></form></Dialog>
    <Dialog open={Boolean(uploadTarget)} onClose={() => setUploadTarget(null)} title={en ? "Upload a new version" : "Téléverser le fichier réel"} description={uploadTarget?.title}><form onSubmit={uploadVersion} className="grid gap-4"><Field label={en ? "Private file" : "Fichier privé"}><Input name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" /></Field><p className="text-xs text-dtsc-muted">{en ? "Maximum 10 MB. The storage path is generated by the server." : "Maximum 10 Mo. Le chemin privé est généré par le serveur et n’est jamais demandé à l’utilisateur."}</p><Button className="bg-dtsc-blue text-white"><Upload className="h-4 w-4" />{en ? "Upload" : "Téléverser"}</Button></form></Dialog>
    <Dialog open={Boolean(linkTarget)} onClose={() => setLinkTarget(null)} title={en ? "Link document" : "Lier le document"} description={linkTarget?.title}><form onSubmit={linkDocument} className="grid gap-4"><Field label={en ? "Target type" : "Type de cible"}><NativeSelect name="targetEntityType" required items={linkTypes} /></Field><Field label={en ? "Target identifier" : "Référence interne de la cible"} help={en ? "The server verifies that the target exists in this organization." : "Le serveur vérifie que la cible existe dans cette organisation."}><Input name="targetEntityId" required /></Field><Field label={en ? "Label" : "Libellé"}><Input name="label" /></Field><Button className="bg-dtsc-blue text-white"><Link2 className="h-4 w-4" />{en ? "Create link" : "Créer le lien"}</Button></form></Dialog>
    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.title || ""}>{detail ? <div className="grid gap-3 text-sm"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(detail.status)}>{statusLabel(locale, detail.status)}</StatusBadge><StatusBadge>{visibilityLabel(locale, detail.visibility)}</StatusBadge><StatusBadge>v{detail.currentVersion}</StatusBadge></div><p className="leading-6 text-dtsc-muted">{detail.description || (en ? "No description." : "Aucune description.")}</p><p>{en ? "Type" : "Type"}: {detail.documentType.replaceAll("_", " ")}</p><p>{en ? "Updated" : "Mis à jour"}: {formatEnterpriseDate(detail.updatedAt, locale)}</p>{detail.currentVersion > 0 ? <Button type="button" onClick={() => void download(detail)}><Download className="h-4 w-4" />Télécharger la dernière version</Button> : canManage ? <Button type="button" onClick={() => setUploadTarget(detail)}><Upload className="h-4 w-4" />Téléverser la première version</Button> : null}</div> : null}</Dialog>
  </div>;
}
