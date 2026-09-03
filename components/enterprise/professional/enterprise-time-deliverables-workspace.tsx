"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, FileCheck2, Plus, RotateCcw, Send, XCircle } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  professionalErpDate,
  professionalErpEnumLabel,
  professionalErpT,
  useProfessionalErpLocale,
} from "@/components/enterprise/professional/professional-erp-i18n";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalSearch,
  professionalMutation,
  useProfessionalCollection,
} from "@/components/enterprise/professional/professional-erp-ui";
import { ProfessionalPager } from "@/components/enterprise/professional/professional-pager";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Project = { id: string; reference: string; name: string; status: string };
type Document = { id: string; title: string; documentType: string; status: string; visibility: string };
type Member = { id: string; label: string; role: string; positionTitle: string | null };
type Milestone = { id: string; reference: string; name: string; status: string; dueDate: string | null };
type Lookups = { projects: Project[]; documents: Document[]; members: Member[]; canReadDocuments: boolean };
type Deliverable = {
  id: string;
  projectId: string;
  reference: string;
  name: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  reviewComment: string | null;
  revision: number;
  approvedMinutes: number;
  billableMinutes: number;
  project: Project;
  milestone: Milestone | null;
  canSubmit: boolean;
  canAccept: boolean;
  canRequestChanges: boolean;
  canReject: boolean;
};
type ReviewAction = "SUBMIT" | "ACCEPT" | "REQUEST_CHANGES" | "REJECT";

const STATUSES = ["DRAFT", "SUBMITTED", "CHANGES_REQUESTED", "ACCEPTED", "REJECTED"];

function statusTone(status: string) {
  if (status === "ACCEPTED") return "success" as const;
  if (["SUBMITTED", "CHANGES_REQUESTED"].includes(status)) return "warning" as const;
  if (status === "REJECTED") return "danger" as const;
  return "neutral" as const;
}

function minutesLabel(minutes: number, locale: string) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (locale === "en") return `${hours}h ${rest}m approved`;
  return `${hours} h ${rest} min approuvées`;
}

export function EnterpriseTimeDeliverablesWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const tr = (fr: string, en: string) => locale === "en" ? en : fr;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ projects: [], documents: [], members: [], canReadDocuments: false });
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [review, setReview] = useState<{ item: Deliverable; action: ReviewAction } | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  useToastMessage(message);

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/projects-assets-lookups?module=TIME_DELIVERABLES`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Lookups & { message?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || t("projects.selectorsUnavailable"));
        if (active) setLookups({ projects: body.projects || [], documents: body.documents || [], members: body.members || [], canReadDocuments: Boolean(body.canReadDocuments) });
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : t("projects.selectorsUnavailable")); });
    return () => { active = false; };
  }, [organizationId, locale, refreshKey]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (search.trim()) value.set("search", search.trim());
    if (status) value.set("status", status);
    return value;
  }, [page, search, status]);
  const deliverables = useProfessionalCollection<Deliverable>({ endpoint: `/api/enterprise/${organizationId}/deliverables`, params, refreshKey });
  const statusItems = [{ id: "", label: t("projects.allStatuses") }, ...STATUSES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "projectStatus", id) }))];

  async function loadMilestones(projectId: string) {
    setSelectedProjectId(projectId);
    setMilestones([]);
    if (!projectId) return;
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/projects/${projectId}/overview`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { project?: { milestones?: Milestone[] }; message?: string } | null;
      if (!response.ok || !body?.project) throw new Error(body?.message || t("projects.openFailed"));
      setMilestones(body.project.milestones || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("projects.openFailed"));
    }
  }

  async function createDeliverable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || busyAction) return;
    const form = new FormData(event.currentTarget);
    setBusyAction("create");
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/projects/${selectedProjectId}/deliverables`, {
        milestoneId: String(form.get("milestoneId") || "") || null,
        name: String(form.get("name") || ""),
        description: String(form.get("description") || "") || null,
        ownerUserId: String(form.get("ownerUserId") || "") || null,
        dueDate: String(form.get("dueDate") || "") || null,
        documentId: String(form.get("documentId") || "") || null,
      });
      setCreateOpen(false);
      setSelectedProjectId("");
      setMilestones([]);
      setRefreshKey((value) => value + 1);
      setMessage(t("projects.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("projects.elementCreateFailed"));
    } finally {
      setBusyAction("");
    }
  }

  function openReview(item: Deliverable, action: ReviewAction) {
    setReview({ item, action });
    setReviewComment("");
  }

  async function confirmReview() {
    if (!review || busyAction) return;
    const needsComment = ["REQUEST_CHANGES", "REJECT"].includes(review.action);
    if (needsComment && reviewComment.trim().length < 3) return;
    setBusyAction(`review:${review.item.id}`);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/deliverables/${review.item.id}/transition`, {
        action: review.action,
        revision: review.item.revision,
        comment: reviewComment.trim() || null,
      });
      setReview(null);
      setReviewComment("");
      setRefreshKey((value) => value + 1);
      setMessage(review.action === "ACCEPT" ? t("projects.deliverableAccepted") : t("projects.deliverableUpdated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("projects.deliverableUpdateFailed"));
    } finally {
      setBusyAction("");
    }
  }

  function actionsFor(item: Deliverable): BusinessContextAction[] {
    const actions: BusinessContextAction[] = [];
    if (item.canSubmit) actions.push({ id: "submit", label: t("projects.submit"), icon: Send, onSelect: () => openReview(item, "SUBMIT") });
    if (item.canAccept) actions.push({ id: "accept", label: t("projects.accept"), icon: CheckCircle2, onSelect: () => openReview(item, "ACCEPT") });
    if (item.canRequestChanges) actions.push({ id: "changes", label: t("projects.requestChanges"), icon: RotateCcw, onSelect: () => openReview(item, "REQUEST_CHANGES") });
    if (item.canReject) actions.push({ id: "reject", label: t("projects.reject"), icon: XCircle, destructive: true, onSelect: () => openReview(item, "REJECT") });
    return actions.map((action) => ({ ...action, disabled: Boolean(busyAction) }));
  }

  const reviewNeedsComment = Boolean(review && ["REQUEST_CHANGES", "REJECT"].includes(review.action));
  const reviewActionLabel = review?.action === "SUBMIT" ? t("projects.submit") : review?.action === "ACCEPT" ? t("projects.accept") : review?.action === "REQUEST_CHANGES" ? t("projects.requestChanges") : t("projects.reject");

  return <ModuleWorkspace>
    <ModuleHeader
      eyebrow={t("projects.eyebrow", { organization: organizationName })}
      title={t("projects.titleDeliverables")}
      description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${tr("Les temps affichés proviennent uniquement des feuilles de temps approuvées.", "Displayed time comes only from approved timesheets.")}`}
      count={t("projects.count", { count: deliverables.pagination.total, suffix: deliverables.pagination.total === 1 ? "" : "s" })}
      primaryAction={deliverables.canWrite ? <Button disabled={Boolean(busyAction)} onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{t("projects.newDeliverable")}</Button> : undefined}
    />
    <ModuleMetrics label={t("projects.metrics")}>
      <ModuleMetric label={tr("À revoir", "Awaiting review")} value={deliverables.metrics.submitted || 0} />
      <ModuleMetric label={tr("Acceptés", "Accepted")} value={deliverables.metrics.accepted || 0} />
      <ModuleMetric label={t("projects.overdue")} value={deliverables.metrics.overdue || 0} />
    </ModuleMetrics>
    <ModuleToolbar
      search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("projects.search")} />}
      controls={<NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={statusItems} />}
      summary={tr("Registre consolidé des livrables, revues et temps projet approuvés.", "Consolidated register of deliverables, reviews and approved project time.")}
    />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold">{message}</div> : null}
      <ModuleSection title={t("projects.tabDeliverables")} description={tr("La revue est indépendante du créateur et toutes les transitions sont versionnées côté serveur.", "Review is independent from the creator and every transition is server-versioned.")}>
        {deliverables.error ? <ProfessionalError message={deliverables.error} /> : deliverables.loading ? <ProfessionalLoading /> : deliverables.items.length ? <>
          <BusinessList ariaLabel={t("projects.deliverablesAria")}>
            {deliverables.items.map((item) => {
              const actions = actionsFor(item);
              return <BusinessListItem
                key={item.id}
                title={`${item.reference} · ${item.name}`}
                leading={<FileCheck2 className="h-5 w-5 text-dtsc-blue" />}
                status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "projectStatus", item.status)}</StatusBadge>}
                meta={`${item.project.reference} · ${item.project.name}${item.dueDate ? ` · ${professionalErpDate(item.dueDate, locale)}` : ""}`}
                description={`${item.reviewComment || item.description || t("projects.noDescription")} · ${minutesLabel(item.approvedMinutes, locale)}`}
                actions={actions.length ? <ContextActions label={t("projects.deliverableActions")} actions={actions} /> : undefined}
              />;
            })}
          </BusinessList>
          <ProfessionalPager pagination={deliverables.pagination} onPageChange={setPage} locale={locale} />
        </> : <EmptyState compact title={t("projects.noDeliverable")} description={t("projects.noDeliverableDescription")} />}
      </ModuleSection>
      <ProfessionalHelp moduleCode="TIME_DELIVERABLES" />
    </ModuleContent>

    <Dialog open={createOpen} onClose={() => { if (!busyAction) setCreateOpen(false); }} title={t("projects.newDeliverable")} presentation="editor" className="max-w-5xl">
      <form onSubmit={createDeliverable} className="grid gap-5 p-4 sm:p-5">
        <ProfessionalFormSection title={t("projects.information")} description={tr("Reliez le livrable au projet canonique et, si disponible, à un jalon ou un document autorisé.", "Link the deliverable to its canonical project and, when available, an authorized milestone or document.")}>
          <Field label={tr("Projet", "Project")}><NativeSelect value={selectedProjectId} onChange={(value) => void loadMilestones(value)} required items={[{ id: "", label: t("projects.select") }, ...lookups.projects.map((project) => ({ id: project.id, label: `${project.reference} · ${project.name}` }))]} /></Field>
          <Field label={t("projects.milestone")}><NativeSelect name="milestoneId" items={[{ id: "", label: t("projects.noMilestone") }, ...milestones.map((milestone) => ({ id: milestone.id, label: `${milestone.reference} · ${milestone.name}` }))]} /></Field>
          <Field label={t("projects.name")}><Input name="name" required /></Field>
          <Field label={t("projects.responsible")}><NativeSelect name="ownerUserId" items={[{ id: "", label: t("projects.unassigned") }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label}${member.positionTitle ? ` · ${member.positionTitle}` : ""}` }))]} /></Field>
          <Field label={t("projects.dueDate")}><Input name="dueDate" type="date" /></Field>
          {lookups.canReadDocuments ? <Field label={tr("Document lié", "Linked document")}><NativeSelect name="documentId" items={[{ id: "", label: tr("Aucun document", "No document") }, ...lookups.documents.map((document) => ({ id: document.id, label: `${document.documentType} · ${document.title}` }))]} /></Field> : null}
          <Field label={t("projects.description")}><textarea name="description" rows={5} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field>
        </ProfessionalFormSection>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3">
          <Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={() => setCreateOpen(false)}>{t("projects.cancel")}</Button>
          <Button type="submit" disabled={Boolean(busyAction) || !selectedProjectId}>{busyAction === "create" ? tr("Enregistrement…", "Saving…") : t("projects.save")}</Button>
        </div>
      </form>
    </Dialog>

    <Dialog open={Boolean(review)} onClose={() => { if (!busyAction) setReview(null); }} title={reviewActionLabel} presentation="editor" className="max-w-3xl">
      {review ? <div className="grid gap-5 p-4 sm:p-5">
        <ProfessionalFormSection title={tr("Revue de la transition", "Transition review")} description={tr("Vérifiez le livrable avant de confirmer. La décision sera auditée et protégée par sa révision courante.", "Review the deliverable before confirming. The decision will be audited and protected by its current revision.")}>
          <div className="md:col-span-2 rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm">
            <p className="font-black text-dtsc-ink">{review.item.reference} · {review.item.name}</p>
            <p className="mt-1 text-dtsc-muted">{review.item.project.reference} · {review.item.project.name}</p>
            <p className="mt-2 text-dtsc-muted">{review.item.description || t("projects.noDescription")}</p>
          </div>
          {reviewNeedsComment ? <Field label={t("projects.reviewComment")}><textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} rows={6} required className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field> : <div className="md:col-span-2 text-sm text-dtsc-muted">{tr("Aucun motif supplémentaire n’est requis pour cette transition.", "No additional reason is required for this transition.")}</div>}
        </ProfessionalFormSection>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3">
          <Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={() => setReview(null)}>{t("projects.cancel")}</Button>
          <Button type="button" disabled={Boolean(busyAction) || (reviewNeedsComment && reviewComment.trim().length < 3)} onClick={() => void confirmReview()}>{busyAction ? tr("Traitement…", "Processing…") : reviewActionLabel}</Button>
        </div>
      </div> : null}
    </Dialog>
  </ModuleWorkspace>;
}