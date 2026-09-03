"use client";

import { useState } from "react";
import { CheckCircle2, CircleStop, RotateCcw, Send, ShieldAlert, Wrench } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { professionalErpDate, professionalErpEnumLabel } from "@/components/enterprise/professional/professional-erp-i18n";
import { ProfessionalFormSection, professionalMutation } from "@/components/enterprise/professional/professional-erp-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";

type Milestone = {
  id: string;
  reference: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  status: string;
  approvalRequired: boolean;
  revision: number;
};

type Risk = {
  id: string;
  reference: string;
  title: string;
  description: string;
  probability: string;
  impact: string;
  severity: string;
  status: string;
  mitigationPlan: string | null;
  dueDate: string | null;
  revision: number;
};

type Issue = {
  id: string;
  reference: string;
  title: string;
  description: string;
  issueType: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  resolution: string | null;
  revision: number;
};

type ApprovalCandidate = {
  userId: string;
  name: string;
  email: string;
  positionTitle: string | null;
  role: string;
  isRequester: boolean;
  selfApprovalOverride: boolean;
};

type ControlAction =
  | { kind: "MILESTONE"; action: "COMPLETE" | "SUBMIT_APPROVAL"; item: Milestone }
  | { kind: "RISK"; action: "CLOSE" | "REOPEN"; item: Risk }
  | { kind: "ISSUE"; action: "RESOLVE" | "CLOSE" | "REOPEN"; item: Issue };

function statusTone(status: string) {
  if (["COMPLETED", "APPROVED", "CLOSED", "RESOLVED"].includes(status)) return "success" as const;
  if (["SUBMITTED", "PLANNED", "OPEN", "REJECTED"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export function EnterpriseProjectControlActions({
  organizationId,
  projectId,
  locale,
  milestones,
  risks,
  issues,
  canWrite,
  disabled,
  onChanged,
  onMessage,
}: {
  organizationId: string;
  projectId: string;
  locale: string;
  milestones: Milestone[];
  risks: Risk[];
  issues: Issue[];
  canWrite: boolean;
  disabled: boolean;
  onChanged: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const tr = (fr: string, en: string) => locale === "en" ? en : fr;
  const [control, setControl] = useState<ControlAction | null>(null);
  const [comment, setComment] = useState("");
  const [approverUserId, setApproverUserId] = useState("");
  const [candidates, setCandidates] = useState<ApprovalCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [saving, setSaving] = useState(false);

  async function openControl(next: ControlAction) {
    setControl(next);
    setComment("");
    setApproverUserId("");
    setCandidates([]);
    if (next.kind !== "MILESTONE" || next.action !== "SUBMIT_APPROVAL") return;
    setLoadingCandidates(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/approval-candidates?moduleCode=PROJECTS_SERVICES`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { candidates?: ApprovalCandidate[]; message?: string } | null;
      if (!response.ok || !body) throw new Error(body?.message || tr("Impossible de charger les validateurs.", "Unable to load approvers."));
      const independent = (body.candidates || []).filter((candidate) => !candidate.isRequester && !candidate.selfApprovalOverride);
      setCandidates(independent);
      if (independent.length === 1) setApproverUserId(independent[0]!.userId);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : tr("Impossible de charger les validateurs.", "Unable to load approvers."));
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function applyControl() {
    if (!control || saving) return;
    if (control.kind === "MILESTONE" && control.action === "SUBMIT_APPROVAL" && !approverUserId) return;
    if (control.kind === "RISK" && control.action === "CLOSE" && comment.trim().length < 3) return;
    if (control.kind === "ISSUE" && control.action === "RESOLVE" && comment.trim().length < 3) return;
    setSaving(true);
    try {
      if (control.kind === "MILESTONE") {
        await professionalMutation(`/api/enterprise/${organizationId}/projects/${projectId}/milestones/${control.item.id}/transition`, {
          action: control.action,
          revision: control.item.revision,
          approverUserId: control.action === "SUBMIT_APPROVAL" ? approverUserId : null,
          comment: comment.trim() || null,
        });
      } else if (control.kind === "RISK") {
        await professionalMutation(`/api/enterprise/${organizationId}/project-risks/${control.item.id}/transition`, {
          action: control.action,
          revision: control.item.revision,
          comment: comment.trim() || null,
        });
      } else {
        await professionalMutation(`/api/enterprise/${organizationId}/project-issues/${control.item.id}/transition`, {
          action: control.action,
          revision: control.item.revision,
          resolution: control.action === "RESOLVE" ? comment.trim() : null,
        });
      }
      const success = control.kind === "MILESTONE"
        ? control.action === "SUBMIT_APPROVAL"
          ? tr("Jalon soumis à validation.", "Milestone submitted for approval.")
          : tr("Jalon terminé.", "Milestone completed.")
        : control.kind === "RISK"
          ? control.action === "CLOSE" ? tr("Risque clôturé.", "Risk closed.") : tr("Risque rouvert.", "Risk reopened.")
          : control.action === "RESOLVE" ? tr("Incident résolu.", "Issue resolved.") : control.action === "CLOSE" ? tr("Incident clôturé.", "Issue closed.") : tr("Incident rouvert.", "Issue reopened.");
      setControl(null);
      setComment("");
      setApproverUserId("");
      onMessage(success);
      await onChanged();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : tr("L’action n’a pas pu être appliquée.", "The action could not be applied."));
    } finally {
      setSaving(false);
    }
  }

  function milestoneActions(item: Milestone): BusinessContextAction[] {
    if (!canWrite || disabled || !["PLANNED", "REJECTED"].includes(item.status)) return [];
    if (item.approvalRequired) return [{ id: "submit-approval", label: tr("Soumettre à validation", "Submit for approval"), icon: Send, onSelect: () => void openControl({ kind: "MILESTONE", action: "SUBMIT_APPROVAL", item }) }];
    if (item.status === "PLANNED") return [{ id: "complete", label: tr("Terminer le jalon", "Complete milestone"), icon: CheckCircle2, onSelect: () => void openControl({ kind: "MILESTONE", action: "COMPLETE", item }) }];
    return [];
  }

  function riskActions(item: Risk): BusinessContextAction[] {
    if (!canWrite || disabled) return [];
    return item.status === "OPEN"
      ? [{ id: "close", label: tr("Clôturer le risque", "Close risk"), icon: CircleStop, onSelect: () => void openControl({ kind: "RISK", action: "CLOSE", item }) }]
      : item.status === "CLOSED"
        ? [{ id: "reopen", label: tr("Rouvrir le risque", "Reopen risk"), icon: RotateCcw, onSelect: () => void openControl({ kind: "RISK", action: "REOPEN", item }) }]
        : [];
  }

  function issueActions(item: Issue): BusinessContextAction[] {
    if (!canWrite || disabled) return [];
    if (item.status === "OPEN") return [{ id: "resolve", label: tr("Résoudre", "Resolve"), icon: Wrench, onSelect: () => void openControl({ kind: "ISSUE", action: "RESOLVE", item }) }];
    if (item.status === "RESOLVED") return [
      { id: "close", label: tr("Clôturer", "Close"), icon: CircleStop, onSelect: () => void openControl({ kind: "ISSUE", action: "CLOSE", item }) },
      { id: "reopen", label: tr("Rouvrir", "Reopen"), icon: RotateCcw, onSelect: () => void openControl({ kind: "ISSUE", action: "REOPEN", item }) },
    ];
    if (item.status === "CLOSED") return [{ id: "reopen", label: tr("Rouvrir", "Reopen"), icon: RotateCcw, onSelect: () => void openControl({ kind: "ISSUE", action: "REOPEN", item }) }];
    return [];
  }

  const needsText = Boolean(control && ((control.kind === "RISK" && control.action === "CLOSE") || (control.kind === "ISSUE" && control.action === "RESOLVE")));
  const needsApprover = Boolean(control?.kind === "MILESTONE" && control.action === "SUBMIT_APPROVAL");
  const canConfirm = !saving && (!needsText || comment.trim().length >= 3) && (!needsApprover || Boolean(approverUserId));

  return <>
    <ModuleSection title={tr("Pilotage des jalons", "Milestone controls")} description={tr("Terminez les jalons simples ou envoyez les jalons gouvernés dans la file Validations.", "Complete simple milestones or send governed milestones to the Approvals queue.")}>
      {milestones.length ? <BusinessList ariaLabel={tr("Pilotage des jalons", "Milestone controls")}>{milestones.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.name}`} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "projectStatus", item.status)}</StatusBadge>} meta={item.dueDate ? professionalErpDate(item.dueDate, locale) : tr("Sans échéance", "No due date")} description={item.approvalRequired ? tr("Validation indépendante obligatoire", "Independent approval required") : item.description || tr("Complétion directe autorisée", "Direct completion allowed")} actions={milestoneActions(item).length ? <ContextActions label={tr("Actions du jalon", "Milestone actions")} actions={milestoneActions(item)} /> : undefined} />)}</BusinessList> : <EmptyState compact title={tr("Aucun jalon", "No milestone")} description={tr("Ajoutez un jalon pour piloter les étapes du projet.", "Add a milestone to control project stages.")} />}
    </ModuleSection>
    <ModuleSection title={tr("Pilotage des risques", "Risk controls")} description={tr("Un projet ne peut pas être terminé tant qu’un risque reste ouvert.", "A project cannot be completed while a risk remains open.")}>
      {risks.length ? <BusinessList ariaLabel={tr("Pilotage des risques", "Risk controls")}>{risks.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.title}`} status={<StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>} meta={`${professionalErpEnumLabel(locale, "riskLevel", item.severity)} · ${item.dueDate ? professionalErpDate(item.dueDate, locale) : tr("sans échéance", "no due date")}`} description={item.mitigationPlan || item.description} actions={riskActions(item).length ? <ContextActions label={tr("Actions du risque", "Risk actions")} actions={riskActions(item)} /> : undefined} />)}</BusinessList> : <EmptyState compact title={tr("Aucun risque", "No risk")} description={tr("Aucun risque n’est enregistré sur ce projet.", "No risk is recorded on this project.")} />}
    </ModuleSection>
    <ModuleSection title={tr("Pilotage des incidents", "Issue controls")} description={tr("Résolvez puis clôturez les incidents ; une résolution peut être rouverte si nécessaire.", "Resolve then close issues; a resolution can be reopened when needed.")}>
      {issues.length ? <BusinessList ariaLabel={tr("Pilotage des incidents", "Issue controls")}>{issues.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.title}`} leading={<ShieldAlert className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>} meta={`${item.issueType || tr("Autre", "Other")} · ${professionalErpEnumLabel(locale, "priority", item.priority)}`} description={item.resolution || item.description} actions={issueActions(item).length ? <ContextActions label={tr("Actions de l’incident", "Issue actions")} actions={issueActions(item)} /> : undefined} />)}</BusinessList> : <EmptyState compact title={tr("Aucun incident", "No issue")} description={tr("Aucun incident n’est enregistré sur ce projet.", "No issue is recorded on this project.")} />}
    </ModuleSection>

    <Dialog open={Boolean(control)} onClose={() => { if (!saving) setControl(null); }} title={tr("Action métier", "Business action")} presentation="editor" className="max-w-3xl">
      {control ? <div className="grid gap-5 p-4 sm:p-5">
        <ProfessionalFormSection title={control.kind === "MILESTONE" ? `${control.item.reference} · ${control.item.name}` : `${control.item.reference} · ${control.item.title}`} description={tr("Cette action est versionnée, auditée et revalidée côté serveur.", "This action is versioned, audited and revalidated server-side.")}>
          {needsApprover ? <Field label={tr("Validateur indépendant", "Independent approver")}><NativeSelect value={approverUserId} onChange={setApproverUserId} disabled={loadingCandidates} items={[{ id: "", label: loadingCandidates ? tr("Chargement…", "Loading…") : candidates.length ? tr("Sélectionner un validateur", "Select an approver") : tr("Aucun validateur indépendant disponible", "No independent approver available") }, ...candidates.map((candidate) => ({ id: candidate.userId, label: `${candidate.name || candidate.email}${candidate.positionTitle ? ` · ${candidate.positionTitle}` : ""}` }))]} /></Field> : null}
          {needsText ? <Field label={control.kind === "ISSUE" ? tr("Résolution", "Resolution") : tr("Motif de clôture", "Closure reason")}><textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={5} required className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field> : control.kind === "MILESTONE" ? <Field label={tr("Commentaire", "Comment")}><textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field> : null}
        </ProfessionalFormSection>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" disabled={saving} onClick={() => setControl(null)}>{tr("Annuler", "Cancel")}</Button><Button type="button" disabled={!canConfirm} onClick={() => void applyControl()}>{saving ? tr("Traitement…", "Processing…") : tr("Confirmer", "Confirm")}</Button></div>
      </div> : null}
    </Dialog>
  </>;
}
