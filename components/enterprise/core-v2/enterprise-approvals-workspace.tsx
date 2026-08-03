"use client";

import { CheckCircle2, Eye, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
import { ApprovalCoordinationPanel } from "@/components/enterprise/core-v2/approval-coordination-panel";
import { Field, NativeSelect, formatEnterpriseDate, statusLabel, statusTone } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";

type Approval = { id: string; targetEntityType: string; targetEntityId: string; requestedByUserId: string; approverUserId: string; status: string; requestedAt: string; decidedAt: string | null; decisionComment: string | null; revision: number; target: { title: string; priority?: string | null; status?: string | null } | null };
type LegacyRecord = { id: string; title: string; description: string | null; status: string; updatedAt: string };

export function EnterpriseApprovalsWorkspace({ organizationId, locale, legacyRecords = [] }: { organizationId: string; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const en = locale === "en";
  const searchParams = useSearchParams();
  const deepLinkedApprovalId = searchParams.get("approval");
  const [queue, setQueue] = useState("pending");
  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<Approval | null>(null);
  const [deepLinkResolved, setDeepLinkResolved] = useState(false);
  const [pending, setPending] = useState<{ approval: Approval; action: "APPROVE" | "REJECT" } | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "20", queue });
    if (entityType) value.set("entityType", entityType);
    if (search.trim()) value.set("search", search.trim());
    return value;
  }, [entityType, page, queue, search]);
  const collection = useEnterpriseV2Collection<Approval>({ endpoint: `/api/enterprise/${organizationId}/approvals`, params, refreshKey });

  useEffect(() => {
    if (!deepLinkedApprovalId || deepLinkResolved) return;
    const visible = collection.items.find((item) => item.id === deepLinkedApprovalId);
    if (visible) {
      setDetail(visible);
      setDeepLinkResolved(true);
      return;
    }
    if (collection.loading) return;
    void fetch(`/api/enterprise/${organizationId}/approvals/${deepLinkedApprovalId}/coordination`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) as { approval?: Omit<Approval, "target">; message?: string } | null }))
      .then(({ response, body }) => {
        if (response.ok && body?.approval) setDetail({ ...body.approval, target: null });
        else setMessage(body?.message || (en ? "This approval is unavailable." : "Cette validation est indisponible."));
        setDeepLinkResolved(true);
      });
  }, [collection.items, collection.loading, deepLinkResolved, deepLinkedApprovalId, en, organizationId]);

  async function decide() {
    if (!pending) return;
    if (pending.action === "REJECT" && !comment.trim()) { setMessage(en ? "A rejection reason is required." : "Un motif de rejet est obligatoire."); return; }
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/approvals/${pending.approval.id}/actions`, "POST", { action: pending.action, revision: pending.approval.revision, decisionComment: comment.trim() || undefined, idempotencyKey: `list:${pending.approval.id}:${pending.approval.revision}:${pending.action}` });
      setPending(null); setDetail(null); setComment(""); setRefreshKey((value) => value + 1); setMessage(en ? "Decision saved." : "Décision enregistrée.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  return <div className="grid min-w-0 gap-5">
    <ModuleMetrics label={en ? "Approval indicators" : "Indicateurs validations"}>
      <ModuleMetric label={en ? "Queue" : "File affichée"} value={collection.pagination.total} />
      <ModuleMetric label={en ? "Pending here" : "À traiter ici"} value={collection.items.filter((item) => item.status === "PENDING").length} />
      <ModuleMetric label={en ? "Corrections" : "Corrections"} value={collection.items.filter((item) => item.status === "CORRECTION_REQUESTED").length} />
      <ModuleMetric label={en ? "Historical" : "Historiques"} value={legacyRecords.length} />
    </ModuleMetrics>
    <ModuleSection title={en ? "Approval queue" : "File des validations"} description={en ? "The default view prioritizes decisions assigned to you." : "La vue par défaut privilégie les décisions qui vous sont attribuées."} count={`${collection.pagination.total}`}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-3">
        <div className="flex min-w-0 gap-2 overflow-x-auto"><Button variant={queue === "pending" ? "default" : "outline"} onClick={() => { setQueue("pending"); setPage(1); }} className="shrink-0">{en ? "To process" : "À traiter"}</Button><Button variant={queue === "corrections" ? "default" : "outline"} onClick={() => { setQueue("corrections"); setPage(1); }} className="shrink-0">{en ? "Corrections" : "Corrections"}</Button><Button variant={queue === "treated" ? "default" : "outline"} onClick={() => { setQueue("treated"); setPage(1); }} className="shrink-0">{en ? "Processed" : "Traitées"}</Button></div>
        <NativeSelect value={entityType} onChange={(value) => { setEntityType(value); setPage(1); }} items={[{ id: "EnterpriseRequest", label: en ? "Requests" : "Demandes" }, { id: "EnterpriseTask", label: en ? "Tasks" : "Tâches" }, { id: "EnterpriseMeeting", label: en ? "Meetings" : "Réunions" }, { id: "PharmacyQualityIncident", label: en ? "Pharmacy incidents" : "Incidents pharmacie" }]} />
        <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={en ? "Search context…" : "Rechercher le contexte…"} />
      </div>
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{en ? "Loading…" : "Chargement…"}</p> : collection.items.length ? <BusinessList ariaLabel={en ? "Approvals" : "Validations"}>{collection.items.map((approval) => <BusinessListItem key={approval.id} title={approval.target?.title || `${approval.targetEntityType} · ${approval.targetEntityId}`} status={<StatusBadge tone={statusTone(approval.status)}>{statusLabel(locale, approval.status)}</StatusBadge>} meta={`${approval.targetEntityType} · ${formatEnterpriseDate(approval.requestedAt, locale)}`} description={approval.decisionComment || (approval.status === "PENDING" ? (en ? "Decision required." : "Décision requise.") : (en ? "Decision recorded." : "Décision enregistrée."))} onOpen={() => setDetail(approval)} openLabel={en ? "Open approval" : "Ouvrir la validation"} actions={<ContextActions label={en ? "Approval actions" : "Actions validation"} actions={approvalActions(approval, en, setDetail, setPending)} />} />)}</BusinessList> : <EmptyState compact title={en ? "No approvals" : "Aucune validation"} description={collection.error || (en ? "Nothing to process in this view." : "Aucun élément à traiter dans cette vue.")} />}
      <div className="mt-3 flex items-center justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>Page {collection.pagination.page}/{collection.pagination.pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{en ? "Previous" : "Précédent"}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{en ? "Next" : "Suivant"}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={en ? "Historical validations" : "Historique des validations"} description={en ? "Legacy validation records are read-only." : "Les anciennes validations sont consultables en lecture seule."}><BusinessList ariaLabel="legacy approvals">{legacyRecords.map((record) => <BusinessListItem key={record.id} title={record.title} status={<StatusBadge>{en ? "History" : "Historique"}</StatusBadge>} meta={statusLabel(locale, record.status)} description={record.description || formatEnterpriseDate(record.updatedAt, locale)} />)}</BusinessList></ModuleSection> : null}
    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.target?.title || detail?.targetEntityType || ""} className="h-[94dvh] max-w-5xl">{detail ? <div className="grid gap-3 text-sm"><StatusBadge tone={statusTone(detail.status)}>{statusLabel(locale, detail.status)}</StatusBadge><p>{en ? "Requested" : "Demandée"} : {formatEnterpriseDate(detail.requestedAt, locale)}</p><p>{en ? "Target" : "Cible"} : {detail.targetEntityType} · {detail.targetEntityId}</p>{detail.decisionComment ? <p className="rounded-xl border border-dtsc-border p-3 text-dtsc-muted">{detail.decisionComment}</p> : null}<ApprovalCoordinationPanel organizationId={organizationId} approvalId={detail.id} locale={locale} onChanged={() => setRefreshKey((value) => value + 1)} /></div> : null}</Dialog>
    <Dialog open={Boolean(pending)} onClose={() => { setPending(null); setComment(""); }} title={pending?.action === "REJECT" ? (en ? "Reject approval" : "Rejeter la validation") : (en ? "Approve" : "Approuver")} description={pending?.approval.target?.title || pending?.approval.targetEntityType}>{pending?.action === "REJECT" ? <Field label={en ? "Reason" : "Motif"}><textarea value={comment} onChange={(event) => setComment(event.target.value)} className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field> : <p className="text-sm text-dtsc-muted">{en ? "Confirm this decision?" : "Confirmer cette décision ?"}</p>}<Button onClick={() => void decide()} className="mt-4 bg-dtsc-blue text-white">{en ? "Confirm" : "Confirmer"}</Button></Dialog>
  </div>;
}

function approvalActions(approval: Approval, en: boolean, detail: (item: Approval) => void, decision: (value: { approval: Approval; action: "APPROVE" | "REJECT" }) => void): BusinessContextAction[] {
  const items: BusinessContextAction[] = [{ id: "open", label: en ? "Open" : "Ouvrir", icon: Eye, onSelect: () => detail(approval) }];
  if (approval.status === "PENDING") { items.push({ id: "approve", label: en ? "Approve" : "Approuver", icon: CheckCircle2, onSelect: () => decision({ approval, action: "APPROVE" }) }); items.push({ id: "reject", label: en ? "Reject" : "Rejeter", icon: XCircle, destructive: true, onSelect: () => decision({ approval, action: "REJECT" }) }); }
  return items;
}
