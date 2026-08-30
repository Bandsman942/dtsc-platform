"use client";

import { AlertTriangle, CheckCircle2, GitBranch, RefreshCw, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/workspace/status-badge";
import { toastSuccess } from "@/lib/client-toast";

type ReviewStep = {
  id: string;
  code: string;
  name: string;
  stepType: string;
  position: number;
  configurationJson: unknown;
};

type ReviewTransition = {
  id: string;
  fromStepCode: string;
  toStepCode: string;
  outcome: string | null;
  priority: number;
  conditionJson: unknown;
};

type PublishReview = {
  definition: {
    id: string;
    code: string;
    name: string;
    triggerType: string;
    triggerEntityType: string | null;
    triggerEventType: string | null;
  };
  version: {
    id: string;
    versionNumber: number;
    status: string;
    steps: ReviewStep[];
    transitions: ReviewTransition[];
  };
  readiness: {
    ready: boolean;
    blockers: Array<{ code: string; message: string; stepCode?: string }>;
    orderedStepCodes: string[];
  };
  reviewToken: string;
};

type Props = {
  organizationId: string;
  definitionId: string;
  versionId: string;
  locale?: string | null;
  disabled?: boolean;
  onPublished: () => Promise<void> | void;
};

export function WorkflowPublishReview({ organizationId, definitionId, versionId, locale, disabled, onPublished }: Props) {
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<PublishReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  async function openReview() {
    setOpen(true);
    setReview(null);
    setError("");
    setLoading(true);
    const response = await fetch(`/api/enterprise/${organizationId}/workflows/${definitionId}/versions/${versionId}/publish`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { review?: PublishReview; message?: string } | null;
    if (!response.ok || !body?.review) setError(body?.message || (en ? "Unable to prepare the publication review." : "Impossible de préparer la revue de publication."));
    else setReview(body.review);
    setLoading(false);
  }

  async function publish() {
    if (!review || !review.readiness.ready) return;
    setPublishing(true);
    setError("");
    const response = await fetch(`/api/enterprise/${organizationId}/workflows/${definitionId}/versions/${versionId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledgeReadiness: true, reviewedVersionId: review.version.id, reviewToken: review.reviewToken }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setError(body?.message || (en ? "Publication failed." : "Publication impossible."));
      setPublishing(false);
      return;
    }
    setPublishing(false);
    setOpen(false);
    setReview(null);
    toastSuccess(en ? "Workflow published." : "Workflow publié.");
    await onPublished();
  }

  return <>
    <Button size="sm" disabled={disabled || loading} onClick={() => void openReview()}>
      {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      {en ? "Review & publish" : "Revoir et publier"}
    </Button>
    <Dialog
      open={open}
      onClose={() => { if (!publishing) setOpen(false); }}
      title={en ? "Publication review" : "Revue avant publication"}
      description={en ? "Review the exact immutable candidate below. If the draft changes, this review becomes invalid." : "Vérifiez exactement la version candidate ci-dessous. Toute modification du brouillon invalide cette revue."}
      presentation="editor"
      className="h-[94dvh] max-w-6xl"
    >
      <div className="grid min-w-0 gap-5">
        {error ? <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</div> : null}
        {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-dtsc-muted"><RefreshCw className="h-4 w-4 animate-spin" />{en ? "Preparing review…" : "Préparation de la revue…"}</div> : null}
        {review ? <>
          <section className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
            <div className="flex min-w-0 flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-600">{review.definition.code} · v{review.version.versionNumber}</p>
                <h3 className="mt-1 break-words text-lg font-black text-dtsc-ink">{review.definition.name}</h3>
                <p className="mt-1 text-sm text-dtsc-muted">{triggerLabel(review.definition.triggerType, en)} · {entityLabel(review.definition.triggerEntityType, en)}{review.definition.triggerEventType ? ` · ${review.definition.triggerEventType}` : ""}</p>
              </div>
              <StatusBadge>{review.version.status}</StatusBadge>
            </div>
          </section>

          <section className={`rounded-2xl border p-4 ${review.readiness.ready ? "border-emerald-300 bg-emerald-50/70" : "border-amber-300 bg-amber-50/70"}`}>
            <div className="flex items-center gap-2 font-black text-dtsc-ink">
              {review.readiness.ready ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 text-amber-700" />}
              {review.readiness.ready ? (en ? "Ready to publish" : "Prêt à publier") : (en ? "Publication blocked" : "Publication bloquée")}
            </div>
            {review.readiness.blockers.length ? <ul className="mt-3 grid gap-1 text-sm text-dtsc-muted">{review.readiness.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}>• {blocker.stepCode ? `${blocker.stepCode} — ` : ""}{blocker.message}</li>)}</ul> : <p className="mt-2 text-sm text-dtsc-muted">{en ? "The server-side graph, assignments and business configuration checks are valid." : "Les contrôles serveur du graphe, des affectations et de la configuration métier sont valides."}</p>}
          </section>

          <section className="grid gap-3">
            <h4 className="font-black text-dtsc-ink">{en ? "Execution path" : "Parcours d’exécution"}</h4>
            <div className="grid gap-2">{review.version.steps.map((step, index) => <article key={step.id} className="grid gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-[auto_minmax(0,1fr)]">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-dtsc-soft text-xs font-black text-dtsc-ink">{index + 1}</span>
              <div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2"><strong className="break-words text-sm text-dtsc-ink">{step.name}</strong><StatusBadge>{stepTypeLabel(step.stepType, en)}</StatusBadge></div><p className="mt-1 text-xs text-dtsc-muted">{step.code}</p><StepSummary step={step} en={en} /></div>
            </article>)}</div>
          </section>

          <section className="grid gap-3">
            <h4 className="flex items-center gap-2 font-black text-dtsc-ink"><GitBranch className="h-4 w-4" />{en ? "Branches" : "Branches"}</h4>
            <div className="grid gap-2">{review.version.transitions.map((transition) => <div key={transition.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm"><strong className="break-all text-dtsc-ink">{transition.fromStepCode}</strong><span aria-hidden="true">→</span><strong className="break-all text-dtsc-ink">{transition.toStepCode}</strong><StatusBadge>{outcomeLabel(transition.outcome, en)}</StatusBadge></div>)}</div>
          </section>

          <div className="sticky bottom-0 flex flex-col gap-2 border-t border-dtsc-border bg-dtsc-surface/95 py-3 backdrop-blur sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={publishing} onClick={() => setOpen(false)}>{en ? "Return to draft" : "Retour au brouillon"}</Button>
            <Button type="button" disabled={!review.readiness.ready || publishing} onClick={() => void publish()} className="bg-dtsc-blue text-white">{publishing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{en ? "Publish reviewed version" : "Publier la version revue"}</Button>
          </div>
        </> : null}
      </div>
    </Dialog>
  </>;
}

function StepSummary({ step, en }: { step: ReviewStep; en: boolean }) {
  const configuration = isRecord(step.configurationJson) ? step.configurationJson : {};
  const rows: string[] = [];
  const assignment = isRecord(configuration.assignment) ? configuration.assignment : isRecord(configuration.recipient) ? configuration.recipient : null;
  if (assignment?.strategy) rows.push(`${en ? "Assignment" : "Affectation"}: ${assignmentLabel(String(assignment.strategy), en)}`);
  if (configuration.action) rows.push(`${en ? "Business action" : "Action métier"}: ${String(configuration.action)}`);
  if (configuration.titleTemplate) rows.push(`${en ? "Title" : "Titre"}: ${String(configuration.titleTemplate)}`);
  if (configuration.mode === "RELATIVE_HOURS" && configuration.hours) rows.push(`${en ? "Wait" : "Attente"}: ${String(configuration.hours)} h`);
  if (configuration.outcome) rows.push(`${en ? "Outcome" : "Résultat"}: ${outcomeLabel(String(configuration.outcome), en)}`);
  const condition = isRecord(configuration.condition) ? configuration.condition : null;
  if (condition?.field) rows.push(`${en ? "Condition" : "Condition"}: ${String(condition.field)} ${String(condition.operator || "")} ${condition.value === undefined ? "" : String(condition.value)}`.trim());
  if (!rows.length) return null;
  return <ul className="mt-2 grid gap-1 text-xs text-dtsc-muted">{rows.map((row) => <li key={row}>• {row}</li>)}</ul>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stepTypeLabel(value: string, en: boolean) {
  const labels: Record<string, [string, string]> = {
    START: ["Départ", "Start"], CONDITION: ["Condition", "Condition"], ASSIGN: ["Affectation", "Assignment"], CREATE_APPROVAL: ["Créer une validation", "Create approval"], CREATE_TASK: ["Créer une tâche", "Create task"], DOMAIN_ACTION: ["Action métier", "Business action"], NOTIFICATION: ["Notification", "Notification"], WAIT_UNTIL: ["Attente", "Wait"], END: ["Fin", "End"],
  };
  return labels[value]?.[en ? 1 : 0] || value;
}

function outcomeLabel(value: string | null | undefined, en: boolean) {
  const labels: Record<string, [string, string]> = { DEFAULT: ["Suite normale", "Default"], TRUE: ["Oui", "True"], FALSE: ["Non", "False"], APPROVED: ["Approuvée", "Approved"], REJECTED: ["Rejetée", "Rejected"], CANCELLED: ["Annulée", "Cancelled"], COMPLETED: ["Terminée", "Completed"] };
  return labels[value || "DEFAULT"]?.[en ? 1 : 0] || value || "DEFAULT";
}

function triggerLabel(value: string, en: boolean) {
  const labels: Record<string, [string, string]> = { MANUAL: ["Manuel", "Manual"], ENTITY_CREATED: ["Création d’objet", "Entity created"], ENTITY_STATUS_CHANGED: ["Changement de statut", "Status changed"], DOMAIN_EVENT: ["Événement métier", "Business event"] };
  return labels[value]?.[en ? 1 : 0] || value;
}

function entityLabel(value: string | null | undefined, en: boolean) {
  const labels: Record<string, [string, string]> = { EnterpriseTask: ["Tâche", "Task"], EnterpriseRequest: ["Demande", "Request"], EnterpriseMeeting: ["Réunion", "Meeting"], EnterprisePurchase: ["Achat", "Purchase"], EnterpriseBudget: ["Budget", "Budget"], EnterpriseExpense: ["Dépense", "Expense"], EnterpriseReport: ["Rapport", "Report"] };
  return value ? labels[value]?.[en ? 1 : 0] || value : (en ? "No source entity" : "Aucun objet source");
}

function assignmentLabel(value: string, en: boolean) {
  const labels: Record<string, [string, string]> = { SPECIFIC_USER: ["Utilisateur précis", "Specific user"], SPECIFIC_ROLE: ["Rôle précis", "Specific role"], DEPARTMENT_MANAGER: ["Responsable du département", "Department manager"], ENTITY_REQUESTER: ["Demandeur de l’objet", "Entity requester"], ENTITY_ASSIGNEE: ["Responsable de l’objet", "Entity assignee"], ENTITY_BUYER: ["Acheteur", "Entity buyer"], ENTITY_CREATOR: ["Créateur de l’objet", "Entity creator"], PREVIOUS_STEP_ACTOR: ["Acteur de l’étape précédente", "Previous step actor"] };
  return labels[value]?.[en ? 1 : 0] || value;
}
