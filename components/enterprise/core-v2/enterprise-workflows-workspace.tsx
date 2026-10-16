"use client";
import { WorkflowVisualStudio } from "@/components/enterprise/core-v2/workflow-visual-studio";
import { applyWorkflowVisualPositions } from "@/lib/enterprise/workflows/visual-projection";
import { workflowStepSchema, workflowVersionSchema, type WorkflowVersionInput } from "@/lib/enterprise/workflows/validators";

import { Activity, AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Copy, Eye, GitBranch, PauseCircle, Plus, RefreshCw, RotateCcw, Play, Save, ShieldAlert, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { StatusBadge } from "@/components/workspace/status-badge";
import { WorkflowPublishReview } from "@/components/enterprise/core-v2/workflow-publish-review";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { getWorkflowRecoveryMessage, getWorkflowValidationFieldMessage } from "@/lib/enterprise/workflows/recovery-messages";
import { cn } from "@/lib/utils";
import { workflowReadinessMessage } from "@/lib/enterprise/workflows/readiness-messages";

type Step = { id?: string; code: string; name: string; description?: string | null; stepType: string; position: number; configurationJson?: Record<string, unknown>; configuration?: Record<string, unknown> };
type Transition = { id?: string; fromStepId?: string; toStepId?: string; fromStep?: { code: string }; toStep?: { code: string }; fromStepCode?: string; toStepCode?: string; outcome?: string | null; priority: number; conditionJson?: Record<string, unknown> | null; condition?: Record<string, unknown> };
type Version = { id: string; versionNumber: number; status: string; steps: Step[]; transitions: Transition[]; configurationJson?: Record<string, string | number | boolean | null> | null; publishedAt?: string | null };
type Definition = { id: string; code: string; name: string; description?: string | null; status: string; triggerType: string; triggerEntityType?: string | null; triggerEventType?: string | null; currentVersionId?: string | null; allowManualStart?: boolean; updatedAt: string; versions: Version[]; _count?: { runs: number } };
type Run = { id: string; status: string; sourceEntityType: string; sourceEntityId: string; triggerType: string; startedAt: string; updatedAt: string; revision: number; failureMessage?: string | null; failureCode?: string | null; definition: { id: string; code: string; name: string }; version: { versionNumber: number }; stepRuns: Array<{ step: { code: string; name: string; stepType: string } }> };
type WorkflowEvent = { eventType?: string; id: string; createdAt: string; summary: string; status?: string | null };
type RunDetail = Run & { events: WorkflowEvent[] };
type Template = { code: string; nameFr: string; nameEn: string; descriptionFr: string; descriptionEn: string; triggerEntityType: string; triggerEventType: string; compatibility: Readiness };
type Readiness = { ready: boolean; blockers: Array<{ code: string; message: string; stepCode?: string }> };
type WorkflowObservability = { sampledAt: string; windowDays: number; sampleSize: number; sampleLimit: number; capped: boolean; completedSamples: number; durationUnit: "ms"; completedLatency: { p50: number | null; p95: number | null; p99: number | null }; waitingSamples: number; oldestWaitingAgeMs: number | null };
type Permissions = { canCreateDraft?: boolean; canEditDraft?: boolean; canPublish?: boolean; canRetire?: boolean; canStartManual?: boolean; canViewAllRuns?: boolean; canRetry?: boolean; canCancel?: boolean };

type AssignmentOptions = {
  members: Array<{ id: string; label: string; isCurrentUser: boolean }>;
  roles: Array<{ id: string; label: string }>;
  departments: Array<{ id: string; label: string; hasEligibleManager: boolean }>;
};
type SourceEmptyReason = "NO_RECORDS" | "NO_VISIBLE_RECORDS" | null;
type Props = { organizationId: string; canManage: boolean; locale?: string | null; members: Array<{ id: string; label: string }>; departments: Array<{ id: string; label: string }>; legacyWorkflows: Array<{ id: string; labelFr: string; isEnabled: boolean; updatedAt: Date }> };

const STEP_TYPES = ["START", "CONDITION", "ASSIGN", "CREATE_APPROVAL", "CREATE_TASK", "DOMAIN_ACTION", "NOTIFICATION", "WAIT_UNTIL", "END"];
const OUTCOMES = ["DEFAULT", "TRUE", "FALSE", "APPROVED", "REJECTED", "CANCELLED"];
const ASSIGNMENTS = ["SPECIFIC_USER", "SPECIFIC_ROLE", "DEPARTMENT_MANAGER", "ENTITY_REQUESTER", "ENTITY_ASSIGNEE", "ENTITY_BUYER", "ENTITY_CREATOR", "PREVIOUS_STEP_ACTOR"];

export function EnterpriseWorkflowsWorkspace({ organizationId, locale, members, departments, legacyWorkflows }: Props) {
  const en = locale === "en";
  const [tab, setTab] = useState<"definitions" | "runs" | "monitoring">("definitions");
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState("");
  const [permissions, setPermissions] = useState<Permissions>({});
  const [runs, setRuns] = useState<Run[]>([]);
  const [runPage, setRunPage] = useState(1);
  const [runPageCount, setRunPageCount] = useState(1);
  const [runTotal, setRunTotal] = useState(0);
  const [runFilter, setRunFilter] = useState("");
  const [startDefinition, setStartDefinition] = useState<Definition | null>(null);
  const [startOptions, setStartOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [startEmptyReason, setStartEmptyReason] = useState<SourceEmptyReason>(null);
  const [startCreateHref, setStartCreateHref] = useState<string | null>(null);
  const [assignmentOptions, setAssignmentOptions] = useState<AssignmentOptions>({ members: [], roles: [], departments: [] });
  const [assignmentLoadError, setAssignmentLoadError] = useState("");
  const [startLoading, setStartLoading] = useState(false);
  const [startSubmitting, setStartSubmitting] = useState(false);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [observability, setObservability] = useState<WorkflowObservability | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Definition | null>(null);
  const [readiness, setReadiness] = useState<Record<string, Readiness>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [stepOpen, setStepOpen] = useState(false);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [runAction, setRunAction] = useState<{ run: Run; action: "retry" | "cancel" } | null>(null);
  const [draftSteps, setDraftSteps] = useState<Step[]>([]);
  const [draftTransitions, setDraftTransitions] = useState<Transition[]>([]);
  const [draftConfiguration, setDraftConfiguration] = useState<Record<string, string | number | boolean | null>>({});
  const [draftEditToken, setDraftEditToken] = useState("");
  type DraftSnapshot = { steps: Step[]; transitions: Transition[]; configuration: Record<string, string | number | boolean | null> };
  const [undoHistory, setUndoHistory] = useState<DraftSnapshot[]>([]);
  const [redoHistory, setRedoHistory] = useState<DraftSnapshot[]>([]);
  const [draftDirty, setDraftDirty] = useState(false);
  const [stepError, setStepError] = useState("");
  const [transitionError, setTransitionError] = useState("");

  const selectedTemplate = templates.find((template) => template.code === selectedTemplateCode) || templates[0];
  const currentDraft = selected?.versions.find((version) => version.status === "DRAFT") || null;
  const published = selected?.versions.find((version) => version.status === "PUBLISHED") || null;
  const monitored = runs.filter((run) => ["BLOCKED", "FAILED", "WAITING_APPROVAL", "WAITING_TIME"].includes(run.status));

  const load = useCallback(async () => {
    setLoading(true);
    const [definitionResponse, runResponse] = await Promise.all([
      fetch(`/api/enterprise/${organizationId}/workflows`),
      fetch(`/api/enterprise/${organizationId}/workflow-runs?pageSize=20&page=${runPage}${runFilter ? `&status=${encodeURIComponent(runFilter)}` : ""}`),
    ]);
    const definitionBody = await definitionResponse.json().catch(() => null);
    const runBody = await runResponse.json().catch(() => null);
    if (definitionResponse.ok) {
      setDefinitions(definitionBody?.definitions || []);
      setTemplates(definitionBody?.templates || []);
      setPermissions(definitionBody?.permissions || {});
    } else {
      toastError(definitionBody?.message || (en ? "Unable to load workflows." : "Chargement des workflows impossible."));
    }
    if (runResponse.ok) {
      setRuns(runBody?.runs || []);
      setMetrics(runBody?.metrics || {});
      setObservability(runBody?.observability || null);
      setRunPageCount(runBody?.pagination?.pageCount || 1);
      setRunTotal(runBody?.pagination?.total || 0);
      setPermissions((current) => ({ ...current, ...(runBody?.permissions || {}) }));
    }
    setLoading(false);
  }, [en, organizationId, runPage, runFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDefinition(id: string) {
    const response = await fetch(`/api/enterprise/${organizationId}/workflows/${id}`);
    const body = await response.json().catch(() => null);
    if (!response.ok) return toastError(getWorkflowRecoveryMessage(body?.error, locale) || body?.message || (en ? "Workflow unavailable." : "Workflow indisponible."));
    setSelected(body.definition);
    setReadiness(body.readiness || {});
    const draft = body.definition.versions.find((version: Version) => version.status === "DRAFT");
    setDraftSteps((draft?.steps || []).map((step: Step) => ({ ...step, configuration: step.configurationJson || {} })));
    setDraftTransitions((draft?.transitions || []).map((transition: Transition) => ({ ...transition, fromStepCode: transition.fromStep?.code, toStepCode: transition.toStep?.code, condition: transition.conditionJson || undefined })));
    setDraftConfiguration(draft?.configurationJson || {});
    setDraftEditToken(draft ? (body.editTokens?.[draft.id] || "") : "");
    setUndoHistory([]);
    setRedoHistory([]);
    setDraftDirty(false);
    setStepError("");
    setTransitionError("");
    setAssignmentOptions({ members: [], roles: [], departments: [] });
    setAssignmentLoadError("");
    if (draft) {
      try {
        const response = await fetch(`/api/enterprise/${organizationId}/workflows/${id}/assignees`, { cache: "no-store" });
        const options = await response.json().catch(() => null);
        if (response.ok && Array.isArray(options?.members) && Array.isArray(options?.roles) && Array.isArray(options?.departments)) {
          setAssignmentOptions({ members: options.members, roles: options.roles, departments: options.departments });
        } else if (response.status !== 403) {
          setAssignmentLoadError(getWorkflowRecoveryMessage(options?.error, locale) || (en ? "Unable to load eligible approvers." : "Impossible de charger les validateurs éligibles."));
        }
      } catch {
        setAssignmentLoadError(en ? "Unable to load eligible approvers." : "Impossible de charger les validateurs éligibles.");
      }
    }
  }

  async function createFromTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTemplate?.compatibility.ready) return;
    const form = new FormData(event.currentTarget);
    const templateCode = String(form.get("templateCode") || "");
    const response = await fetch(`/api/enterprise/${organizationId}/workflows`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateCode, locale: en ? "en" : "fr" }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) return toastError(getWorkflowRecoveryMessage(body?.error, locale) || body?.message || (en ? "Creation failed." : "Création impossible."));
    setCreateOpen(false);
    toastSuccess(en ? "Draft workflow created." : "Workflow brouillon créé.");
    await load();
    await openDefinition(body.definition.id);
  }

  function stepConfig(form: FormData, type: string) {
    const assignment = { strategy: String(form.get("strategy") || "ENTITY_CREATOR"), ...(form.get("userId") ? { userId: String(form.get("userId")) } : {}), ...(form.get("role") ? { role: String(form.get("role")) } : {}), ...(form.get("departmentId") ? { departmentId: String(form.get("departmentId")) } : {}) };
    if (type === "START") return {};
    if (type === "END") return { outcome: String(form.get("endOutcome") || "COMPLETED") };
    if (type === "CONDITION") {
      const operator = String(form.get("operator") || "EQUALS");
      return { condition: { field: String(form.get("field") || "status"), operator, ...(["EXISTS", "NOT_EXISTS"].includes(operator) ? {} : { value: String(form.get("value") || "") }) } };
    }
    if (type === "ASSIGN") return { assignment };
    if (type === "CREATE_APPROVAL") return { assignment, titleTemplate: String(form.get("titleTemplate") || "Valider {{entity.reference}}") };
    if (type === "CREATE_TASK") return { titleTemplate: String(form.get("titleTemplate") || "Traiter {{entity.reference}}"), descriptionTemplate: String(form.get("bodyTemplate") || ""), taskType: "TASK", priority: String(form.get("priority") || "NORMAL"), assignment };
    if (type === "DOMAIN_ACTION") return { action: String(form.get("domainAction") || "COMPLETE"), commentTemplate: String(form.get("bodyTemplate") || "") };
    if (type === "NOTIFICATION") return { recipient: assignment, titleTemplate: String(form.get("titleTemplate") || "Mise à jour du workflow"), bodyTemplate: String(form.get("bodyTemplate") || "{{entity.reference}} a été mis à jour."), targetUrl: "/enterprise-modules/WORKFLOWS" };
    if (type === "WAIT_UNTIL") return { mode: "RELATIVE_HOURS", hours: Math.max(1, Number(form.get("hours") || 24)) };
    return {};
  }

  function checkpoint() {
    setUndoHistory((current) => [...current.slice(-19), { steps: draftSteps, transitions: draftTransitions, configuration: draftConfiguration }]);
    setRedoHistory([]);
  }

  function undoDraft() {
    if (!undoHistory.length) return;
    const previous = undoHistory[undoHistory.length - 1];
    setRedoHistory((current) => [...current.slice(-19), { steps: draftSteps, transitions: draftTransitions, configuration: draftConfiguration }]);
    setUndoHistory((current) => current.slice(0, -1));
    setDraftSteps(previous.steps);
    setDraftTransitions(previous.transitions);
    setDraftConfiguration(previous.configuration);
    setDraftDirty(true);
  }

  function redoDraft() {
    if (!redoHistory.length) return;
    const next = redoHistory[redoHistory.length - 1];
    setUndoHistory((current) => [...current.slice(-19), { steps: draftSteps, transitions: draftTransitions, configuration: draftConfiguration }]);
    setRedoHistory((current) => current.slice(0, -1));
    setDraftSteps(next.steps);
    setDraftTransitions(next.transitions);
    setDraftConfiguration(next.configuration);
    setDraftDirty(true);
  }

  function moveVisualNode(code: string, x: number, y: number) {
    checkpoint();
    const updated = applyWorkflowVisualPositions({
      steps: draftSteps, transitions: draftTransitions, configuration: draftConfiguration,
    } as unknown as WorkflowVersionInput, [{ id: code, x, y }]);
    setDraftConfiguration(updated.configuration || {});
    setDraftDirty(true);
  }

  function renameVisualNode(code: string, name: string, description: string) {
    if (!name.trim()) return;
    checkpoint();
    setDraftSteps((current) => current.map((item) => item.code === code ? { ...item, name: name.trim(), description } : item));
    setDraftDirty(true);
  }

  function connectVisualNodes(fromStepCode: string, toStepCode: string, outcome: string) {
    if (fromStepCode === toStepCode || draftTransitions.some((t) => t.fromStepCode === fromStepCode && t.toStepCode === toStepCode && (t.outcome || "DEFAULT") === outcome)) return;
    checkpoint();
    setDraftTransitions((current) => [...current, { fromStepCode, toStepCode, outcome, priority: current.filter(t => t.fromStepCode === fromStepCode).length }]);
    setDraftDirty(true);
  }

  function addStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = String(form.get("stepType") || "START");
    const code = String(form.get("code") || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    if (!code) {
      setStepError(en ? "Enter a valid step code." : "Saisissez un code d’étape valide.");
      return;
    }
    if (draftSteps.some((step) => step.code === code)) {
      setStepError(en ? "Step code must be unique." : "Le code de l’étape doit être unique.");
      return;
    }
    setStepError("");
    checkpoint();
    setDraftSteps((current) => [...current, { code, name: String(form.get("name") || code), stepType: type, position: current.length, configuration: stepConfig(form, type) }]);
    setDraftDirty(true);
    setStepOpen(false);
  }

  function addTransition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fromStepCode = String(form.get("from") || "");
    const toStepCode = String(form.get("to") || "");
    const outcome = String(form.get("outcome") || "DEFAULT");
    if (!fromStepCode || !toStepCode) {
      setTransitionError(en ? "Choose a source and destination step." : "Choisissez une étape source et une étape de destination.");
      return;
    }
    if (fromStepCode === toStepCode) {
      setTransitionError(en ? "Choose two different steps." : "Choisissez deux étapes différentes.");
      return;
    }
    if (draftTransitions.some((item) => item.fromStepCode === fromStepCode && item.toStepCode === toStepCode && (item.outcome || "DEFAULT") === outcome)) {
      setTransitionError(en ? "This branch already exists." : "Cette branche existe déjà.");
      return;
    }
    setTransitionError("");
    checkpoint();
    setDraftTransitions((current) => [...current, { fromStepCode, toStepCode, outcome, priority: current.filter((item) => item.fromStepCode === fromStepCode).length }]);
    setDraftDirty(true);
    setTransitionOpen(false);
  }

  function moveStep(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= draftSteps.length) return;
    checkpoint();
    setDraftSteps((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      setDraftDirty(true);
      return next.map((step, position) => ({ ...step, position }));
    });
  }

  function updateVisualStepConfiguration(code: string, input: string): string | null {
    const step = draftSteps.find((item) => item.code === code);
    if (!step) return en ? "Step not found." : "Étape introuvable.";
    let configuration: unknown;
    try { configuration = JSON.parse(input); }
    catch { return en ? "Invalid JSON settings." : "Les paramètres JSON sont invalides."; }
    if (!configuration || Array.isArray(configuration) || typeof configuration !== "object") return en ? "Settings must be a JSON object." : "Les paramètres doivent former un objet JSON.";
    const candidate = workflowStepSchema.safeParse({
      code: step.code, name: step.name, description: step.description || undefined,
      position: step.position, stepType: step.stepType, configuration,
    });
    if (!candidate.success) return getWorkflowValidationFieldMessage(candidate.error.issues, locale, [step.name]);
    checkpoint();
    setDraftSteps((current) => current.map((item) => item.code === code ? {
      ...item, configuration: candidate.data.configuration,
    } : item));
    setDraftDirty(true);
    return null;
  }

  function duplicateVisualStep(code: string) {
    const original = draftSteps.find((step) => step.code === code);
    if (!original || ["START", "END"].includes(original.stepType)) return;
    let suffix = 1;
    let newCode = "";
    do {
      const tail = suffix === 1 ? "_COPY" : `_COPY_${suffix}`;
      newCode = original.code.slice(0, 80 - tail.length) + tail;
      suffix++;
    } while (draftSteps.some((step) => step.code === newCode));
    checkpoint();
    setDraftSteps((current) => [...current, {
      ...original, id: undefined, code: newCode,
      name: en ? `${original.name} (copy)` : `${original.name} (copie)`,
      position: current.length, configuration: { ...(original.configuration || original.configurationJson || {}) },
    }]);
    // Do not copy edges: they must be explicitly reviewed and connected.
    setDraftDirty(true);
  }

  function removeStep(code: string) {
    checkpoint();
    setDraftSteps((current) => current.filter((step) => step.code !== code).map((step, position) => ({ ...step, position })));
    setDraftTransitions((current) => current.filter((transition) => transition.fromStepCode !== code && transition.toStepCode !== code));
    setDraftDirty(true);
  }

  async function saveVersion() {
    if (!selected || !currentDraft) return;
    if (!draftEditToken) {
      toastError(getWorkflowRecoveryMessage("WORKFLOW_DRAFT_CONFLICT", locale) || "");
      return;
    }
    const payload = {
      steps: draftSteps.map(({ configurationJson, ...step }) => ({ ...step, configuration: step.configuration || configurationJson || {} })),
      transitions: draftTransitions.map((transition) => ({
        fromStepCode: transition.fromStepCode, toStepCode: transition.toStepCode,
        outcome: transition.outcome || "DEFAULT", priority: transition.priority,
        ...(transition.condition ? { condition: transition.condition } : {}),
      })),
      configuration: draftConfiguration,
    };
    const validated = workflowVersionSchema.safeParse(payload);
    if (!validated.success) {
      toastError(getWorkflowValidationFieldMessage(validated.error.issues, locale, draftSteps.map((item) => item.name)));
      return;
    }
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/workflows/${selected.id}/versions/${currentDraft.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validated.data, editToken: draftEditToken }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toastError(
          body?.error === "INVALID_WORKFLOW_VERSION_PAYLOAD" && Array.isArray(body?.issues)
            ? getWorkflowValidationFieldMessage(body.issues, locale, draftSteps.map((item) => item.name))
            : getWorkflowRecoveryMessage(body?.error, locale) ||
              (en ? "Unable to save the draft. Verify permissions or try again." : "Enregistrement impossible. Vérifiez vos droits et réessayez."),
        );
        return;
      }
      toastSuccess(en ? "Draft saved." : "Brouillon enregistré.");
      await openDefinition(selected.id);
      await load();
    } catch {
      toastError(en ? "Network error: changes were not saved. Please retry." : "Erreur réseau : les modifications n’ont pas été enregistrées. Réessayez.");
    }
  }

  async function duplicateVersion() {
    if (!selected) return;
    const sourceVersionId = published?.id || currentDraft?.id;
    const response = await fetch(`/api/enterprise/${organizationId}/workflows/${selected.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceVersionId }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) return toastError(getWorkflowRecoveryMessage(body?.error, locale) || body?.message || (en ? "Duplication failed." : "Duplication impossible."));
    toastSuccess(en ? "New draft version created." : "Nouvelle version brouillon créée.");
    await openDefinition(selected.id);
  }

  const openRun = useCallback(async (id: string) => {
    const response = await fetch(`/api/enterprise/${organizationId}/workflow-runs/${id}`);
    const body = await response.json().catch(() => null);
    if (!response.ok) return toastError(getWorkflowRecoveryMessage(body?.error, locale) || body?.message || (en ? "Run unavailable." : "Exécution indisponible."));
    setRunDetail(body.run as RunDetail);
  }, [organizationId, locale, en]);

  useEffect(() => {
    const runId = new URLSearchParams(window.location.search).get("runId");
    if (runId) { setTab("runs"); void openRun(runId); }
  }, [organizationId, openRun]);

  async function openManualStart(definition: Definition) {
    setStartDefinition(definition);
    setStartOptions([]);
    setStartEmptyReason(null);
    setStartCreateHref(null);
    setStartLoading(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/workflow-runs/sources?definitionId=${encodeURIComponent(definition.id)}`);
      const body = await response.json().catch(() => null);
      if (!response.ok) toastError(getWorkflowRecoveryMessage(body?.error, locale) || body?.message || (en ? "Source selection unavailable." : "Sélection de la source indisponible."));
      else {
        setStartOptions(body?.sources || []);
        setStartEmptyReason(body?.emptyReason || null);
        setStartCreateHref(typeof body?.createModuleHref === "string" ? body.createModuleHref : null);
      }
    } catch { toastError(en ? "Unable to load available records." : "Chargement des objets disponibles impossible."); }
    finally { setStartLoading(false); }
  }

  async function submitManualStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startDefinition?.triggerEntityType || startSubmitting) return;
    const sourceEntityId = String(new FormData(event.currentTarget).get("sourceEntityId") || "");
    if (!startOptions.some((source) => source.id === sourceEntityId)) return;
    setStartSubmitting(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/workflow-runs/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workflowDefinitionId: startDefinition.id, sourceEntityType: startDefinition.triggerEntityType, sourceEntityId }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) { toastError(getWorkflowRecoveryMessage(body?.error, locale) || body?.message || (en ? "Unable to start workflow." : "Démarrage du workflow impossible.")); return; }
      toastSuccess(en ? "Workflow started." : "Workflow démarré.");
      setStartDefinition(null);
      setTab("runs");
      setRunPage(1);
      window.history.replaceState(window.history.state, "", `${window.location.pathname}?runId=${encodeURIComponent(body.run.id)}`);
      await load();
      await openRun(body.run.id);
    } catch { toastError(en ? "Unable to start workflow." : "Démarrage du workflow impossible."); }
    finally { setStartSubmitting(false); }
  }

  async function submitRunAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!runAction) return;
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") || "");
    const response = await fetch(`/api/enterprise/${organizationId}/workflow-runs/${runAction.run.id}/${runAction.action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(runAction.action === "cancel" ? { reason, revision: runAction.run.revision } : { reason }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) return toastError(getWorkflowRecoveryMessage(body?.error, locale) || body?.message || (en ? "Action failed." : "Action impossible."));
    setRunAction(null);
    toastSuccess(en ? "Run updated." : "Exécution mise à jour.");
    await load();
  }

  const readinessForDraft = currentDraft ? readiness[currentDraft.id] : null;

  return <div className="grid min-w-0 gap-4">
    <ModuleMetrics label={en ? "Workflow indicators" : "Indicateurs workflows"}>
      <ModuleMetric label={en ? "Published" : "Publiés"} value={definitions.filter((item) => item.status === "ACTIVE").length} hint={<CheckCircle2 className="h-3.5 w-3.5" />} />
      <ModuleMetric label={en ? "Running" : "En cours"} value={(metrics.RUNNING || 0) + (metrics.QUEUED || 0)} hint={<Activity className="h-3.5 w-3.5" />} />
      <ModuleMetric label={en ? "Waiting approval" : "En validation"} value={metrics.WAITING_APPROVAL || 0} hint={<PauseCircle className="h-3.5 w-3.5" />} />
      <ModuleMetric label={en ? "Blocked / failed" : "Bloqués / échecs"} value={(metrics.BLOCKED || 0) + (metrics.FAILED || 0)} hint={<ShieldAlert className="h-3.5 w-3.5" />} />
    </ModuleMetrics>

    <div className="flex min-w-0 gap-1 overflow-x-auto border-b border-dtsc-border pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {(["definitions", "runs", "monitoring"] as const).map((key) => <button key={key} type="button" onClick={() => setTab(key)} className={cn("shrink-0 rounded-full px-3 py-2 text-xs font-black", tab === key ? "bg-dtsc-blue text-white" : "text-dtsc-muted hover:bg-dtsc-soft")}>{key === "definitions" ? (en ? "Definitions" : "Définitions") : key === "runs" ? (en ? "Runs" : "Exécutions") : (en ? "Monitoring" : "À surveiller")}</button>)}
      <Button type="button" variant="ghost" size="icon" className="ml-auto shrink-0 rounded-full" onClick={() => void load()} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></Button>
    </div>

    {tab === "definitions" ? <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className="min-w-0"><div className="flex items-center justify-between gap-2"><div><h2 className="font-black text-dtsc-ink">{en ? "Workflow definitions" : "Définitions de workflow"}</h2><p className="text-xs text-dtsc-muted">{en ? "Published versions are immutable." : "Les versions publiées sont immuables."}</p></div>{permissions.canCreateDraft ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{en ? "New" : "Nouveau"}</Button> : null}</div>
        <div className="mt-3">{definitions.length ? <BusinessList ariaLabel={en ? "Workflow definitions" : "Définitions de workflow"}>{definitions.map((definition) => <BusinessListItem key={definition.id} title={definition.name} description={`${definition.code} · ${triggerLabel(definition.triggerType, en)} · ${entityLabel(definition.triggerEntityType, en)}`} status={<StatusBadge>{statusLabel(definition.status, en)}</StatusBadge>} actions={<ActionMenu label="Workflow" items={[{ key: "open", label: en ? "Open" : "Ouvrir", icon: Eye, onSelect: () => void openDefinition(definition.id) }, ...(permissions.canStartManual && definition.status === "ACTIVE" && definition.allowManualStart ? [{ key: "start", label: en ? "Start workflow" : "Lancer le workflow", icon: Play, onSelect: () => void openManualStart(definition) }] : []), ...(permissions.canCreateDraft ? [{ key: "duplicate", label: en ? "Create new version" : "Créer une nouvelle version", icon: Copy, onSelect: async () => { await openDefinition(definition.id); } }] : [])]} />} />)}</BusinessList> : <EmptyState compact title={en ? "No workflow" : "Aucun workflow"} description={en ? "Start from a controlled draft template." : "Commencez par un modèle brouillon contrôlé."} />}</div>
        {legacyWorkflows.length ? <div className="mt-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3"><p className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{en ? "Legacy catalog" : "Catalogue historique"}</p><p className="mt-1 text-sm text-dtsc-muted">{legacyWorkflows.length} {en ? "catalog entries remain read-only and are never executed by Engine v2." : "configurations restent en lecture seule et ne sont jamais exécutées par Engine v2."}</p></div> : null}
      </section>
      <section className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-4">{selected ? <div className="grid gap-4"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[0.1em] text-cyan-600">{selected.code}</p><h2 className="truncate text-lg font-black text-dtsc-ink">{selected.name}</h2><p className="text-sm text-dtsc-muted">{selected.description}</p></div><StatusBadge>{statusLabel(selected.status, en)}</StatusBadge></div>
        <div className="flex flex-wrap gap-2">{permissions.canStartManual && selected.status === "ACTIVE" && selected.allowManualStart ? <Button size="sm" onClick={() => void openManualStart(selected)}><Play className="h-4 w-4" />{en ? "Start" : "Lancer"}</Button> : null}{permissions.canCreateDraft && published ? <Button size="sm" variant="outline" onClick={() => void duplicateVersion()}><Copy className="h-4 w-4" />{en ? "New version" : "Nouvelle version"}</Button> : null}{permissions.canEditDraft && currentDraft ? <Button size="sm" variant="outline" onClick={() => { setStepError(""); setStepOpen(true); }}><Plus className="h-4 w-4" />{en ? "Step" : "Étape"}</Button> : null}{permissions.canEditDraft && currentDraft ? <Button size="sm" variant="outline" onClick={() => { setTransitionError(""); setTransitionOpen(true); }}><GitBranch className="h-4 w-4" />{en ? "Transition" : "Transition"}</Button> : null}{permissions.canEditDraft && currentDraft ? <Button size="sm" onClick={() => void saveVersion()} disabled={!draftDirty}><Save className="h-4 w-4" />{en ? "Save" : "Enregistrer"}</Button> : null}{permissions.canPublish && currentDraft ? <WorkflowPublishReview organizationId={organizationId} definitionId={selected.id} versionId={currentDraft.id} locale={locale} disabled={!readinessForDraft?.ready || draftDirty} onPublished={async () => { await openDefinition(selected.id); await load(); }} /> : null}</div>
        {draftDirty ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">{en ? "Unsaved graph changes are present. Save the draft before opening the publication review." : "Des modifications du graphe ne sont pas enregistrées. Enregistrez le brouillon avant d’ouvrir la revue de publication."}</div> : null}
        {currentDraft && assignmentLoadError ? <p role="alert" className="text-sm text-amber-700">{assignmentLoadError}</p> : null}
         {currentDraft ? <WorkflowVisualStudio key={currentDraft.id} locale={locale} assignmentMembers={assignmentOptions.members} assignmentRoles={assignmentOptions.roles} assignmentDepartments={assignmentOptions.departments} steps={draftSteps} transitions={draftTransitions} configuration={draftConfiguration} editable={Boolean(permissions.canEditDraft)} onAddStep={() => { setStepError(""); setStepOpen(true); }} onMove={moveVisualNode} onRename={renameVisualNode} onConnect={connectVisualNodes} onDeleteStep={removeStep} onDuplicateStep={duplicateVisualStep} onUpdateConfiguration={updateVisualStepConfiguration} onUndo={undoDraft} onRedo={redoDraft} undoAvailable={undoHistory.length > 0} redoAvailable={redoHistory.length > 0} /> : null}
        {currentDraft ? <><div className={cn("rounded-xl border p-3", readinessForDraft?.ready ? "border-emerald-400/40 bg-emerald-500/5" : "border-amber-400/40 bg-amber-500/5")}><p className="font-black text-dtsc-ink">{readinessForDraft?.ready ? (en ? "Ready to publish" : "Prêt à publier") : (en ? "Publication blockers" : "Blocages de publication")}</p>{readinessForDraft?.blockers?.length ? <ul className="mt-2 grid gap-1 text-xs text-dtsc-muted">{readinessForDraft.blockers.map((item, index) => <li key={`${item.code}-${index}`}>• {item.stepCode ? `${item.stepCode}: ` : ""}{workflowReadinessMessage(item.code, locale)}</li>)}</ul> : null}</div>
        <div className="grid gap-2">{[...draftSteps].sort((a, b) => a.position - b.position).map((step, index) => <article key={step.code} className="flex min-w-0 items-center gap-2 rounded-xl border border-dtsc-border p-2.5"><span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dtsc-soft text-xs font-black text-dtsc-ink">{index + 1}</span><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-dtsc-ink">{step.name}</strong><span className="block truncate text-xs text-dtsc-muted">{stepTypeLabel(step.stepType, en)} · {step.code}</span></div>{permissions.canEditDraft ? <div className="flex shrink-0"><button type="button" className="p-2 text-dtsc-muted" onClick={() => moveStep(index, -1)} aria-label={en ? "Move step up" : "Monter l’étape"}><ArrowUp className="h-4 w-4" /></button><button type="button" className="p-2 text-dtsc-muted" onClick={() => moveStep(index, 1)} aria-label={en ? "Move step down" : "Descendre l’étape"}><ArrowDown className="h-4 w-4" /></button><button type="button" className="p-2 text-rose-600" onClick={() => removeStep(step.code)} aria-label={en ? "Delete step" : "Supprimer l’étape"}><Trash2 className="h-4 w-4" /></button></div> : null}</article>)}</div>
        <div><h3 className="text-sm font-black text-dtsc-ink">{en ? "Branches" : "Branches"}</h3><div className="mt-2 grid gap-1.5">{draftTransitions.map((transition, index) => <div key={`${transition.fromStepCode}-${transition.toStepCode}-${index}`} className="flex items-center gap-2 rounded-xl bg-dtsc-page px-3 py-2 text-xs"><span className="truncate font-bold text-dtsc-ink">{transition.fromStepCode}</span><GitBranch className="h-3.5 w-3.5 shrink-0 text-cyan-600" /><span className="truncate font-bold text-dtsc-ink">{transition.toStepCode}</span><span className="ml-auto shrink-0 text-dtsc-muted">{outcomeLabel(transition.outcome, en)}</span>{permissions.canEditDraft ? <button type="button" onClick={() => { checkpoint(); setDraftTransitions((current) => current.filter((_, itemIndex) => itemIndex !== index)); setDraftDirty(true); }} aria-label={en ? "Delete branch" : "Supprimer la branche"}><XCircle className="h-4 w-4 text-rose-600" /></button> : null}</div>)}</div></div></> : <p className="text-sm text-dtsc-muted">{en ? "Create a new draft version to edit this workflow." : "Créez une nouvelle version brouillon pour modifier ce workflow."}</p>}</div> : <EmptyState compact title={en ? "Select a workflow" : "Sélectionnez un workflow"} description={en ? "Open a definition to inspect its versions and readiness." : "Ouvrez une définition pour consulter ses versions et sa readiness."} />}</section>
    </div> : null}

    {tab === "runs" ? <section className="grid gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><label className="text-sm text-dtsc-muted">{en ? "Filter by status" : "Filtrer par statut"} <select className="ml-2 h-10 rounded-xl border border-dtsc-border bg-dtsc-page px-3" value={runFilter} onChange={(event) => { setRunPage(1); setRunFilter(event.target.value); }}><option value="">{en ? "All" : "Tous"}</option>{["RUNNING", "WAITING_APPROVAL", "WAITING_TIME", "BLOCKED", "FAILED", "COMPLETED", "CANCELLED"].map((status) => <option key={status} value={status}>{statusLabel(status, en)}</option>)}</select></label><span className="text-xs text-dtsc-muted">{runTotal} {en ? "visible runs" : "exécutions visibles"}</span></div>{runs.length ? <BusinessList ariaLabel={en ? "Workflow runs" : "Exécutions de workflow"}>{runs.map((run) => <BusinessListItem key={run.id} title={run.definition.name} description={`${entityLabel(run.sourceEntityType, en)} · ${new Date(run.startedAt).toLocaleString(en ? "en-US" : "fr-FR")} · v${run.version.versionNumber}`} status={<StatusBadge>{statusLabel(run.status, en)}</StatusBadge>} actions={<ActionMenu label="Run" items={[{ key: "open", label: en ? "Open timeline" : "Ouvrir la timeline", icon: Eye, onSelect: () => void openRun(run.id) }, ...(permissions.canRetry && ["BLOCKED", "FAILED"].includes(run.status) ? [{ key: "retry", label: en ? "Retry step" : "Réessayer l’étape", icon: RotateCcw, onSelect: () => setRunAction({ run, action: "retry" as const }) }] : []), ...(permissions.canCancel && !["COMPLETED", "REJECTED", "FAILED", "CANCELLED"].includes(run.status) ? [{ key: "cancel", label: en ? "Cancel run" : "Annuler l’exécution", icon: XCircle, destructive: true, onSelect: () => setRunAction({ run, action: "cancel" as const }) }] : [])]} />} />)}</BusinessList> : <EmptyState compact title={en ? "No workflow run" : "Aucune exécution"} description={en ? "Runs appear after a manual start or a matching business event." : "Les exécutions apparaissent après un lancement manuel ou un événement métier correspondant."} />}<nav aria-label={en ? "Run pages" : "Pages des exécutions"} className="flex items-center justify-between gap-2"><Button type="button" variant="outline" size="sm" disabled={runPage <= 1 || loading} onClick={() => setRunPage((page) => Math.max(1, page - 1))}>{en ? "Previous" : "Précédent"}</Button><span aria-live="polite" className="text-xs text-dtsc-muted">{runPage} / {runPageCount}</span><Button type="button" variant="outline" size="sm" disabled={runPage >= runPageCount || loading} onClick={() => setRunPage((page) => page + 1)}>{en ? "Next" : "Suivant"}</Button></nav></section> : null}

    {tab === "monitoring" ? <section className="grid gap-3">{observability ? <div className="grid min-w-0 gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3" aria-label={en ? "Workflow runtime statistics" : "Statistiques des workflows"}><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-dtsc-muted"><strong className="text-dtsc-ink">{en ? "Recent completed run latency" : "Durée des exécutions terminées"}</strong><span>{en ? "Sampled" : "Échantillonné"} : {new Date(observability.sampledAt).toLocaleString(en ? "en-US" : "fr-FR")}</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(["p50", "p95", "p99"] as const).map((key) => <div key={key}><div className="text-xs uppercase text-dtsc-muted">{key}</div><strong className="text-base text-dtsc-ink">{observability.completedLatency[key] === null ? "—" : `${(observability.completedLatency[key]! / 1000).toFixed(1)} s`}</strong></div>)}<div><div className="text-xs text-dtsc-muted">{en ? "Oldest waiting" : "Plus ancienne attente"}</div><strong className="text-base text-dtsc-ink">{observability.oldestWaitingAgeMs === null ? "—" : `${Math.round(observability.oldestWaitingAgeMs / 60000)} min`}</strong></div></div><p className="text-xs text-dtsc-muted">{observability.completedSamples} {en ? "completed runs" : "exécutions terminées"} / {observability.sampleSize} {en ? "visible runs sampled across" : "exécutions visibles examinées sur"} {observability.windowDays} {en ? "days" : "jours"}{observability.capped ? (en ? " — Capped sample, not exhaustive." : " — Échantillon plafonné, non exhaustif.") : "."} {en ? "Missing values are not zero." : "Une donnée absente ne vaut pas zéro."}</p></div> : null}{monitored.length ? monitored.map((run) => <article key={run.id} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-3"><div className="flex items-start gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700"><AlertTriangle className="h-4 w-4" /></span><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-dtsc-ink">{run.definition.name}</strong><span className="block text-xs text-dtsc-muted">{statusLabel(run.status, en)} · {getWorkflowRecoveryMessage(run.failureCode, locale) || run.failureMessage || (en ? "Awaiting the next authorized action." : "En attente de la prochaine action autorisée.")}</span></div><Button size="sm" variant="outline" onClick={() => void openRun(run.id)}>{en ? "Inspect" : "Inspecter"}</Button></div></article>) : <EmptyState compact title={en ? "Nothing to monitor" : "Rien à surveiller"} description={en ? "No blocked, failed or abnormally waiting run." : "Aucune exécution bloquée, en échec ou en attente anormale."} />}</section> : null}

    <Dialog open={Boolean(startDefinition)} title={en ? "Start a workflow" : "Lancer un workflow"} onClose={() => setStartDefinition(null)} presentation="editor" className="h-[94dvh] max-w-3xl">{startDefinition ? <form onSubmit={submitManualStart} className="grid min-w-0 gap-4"><p className="text-sm text-dtsc-muted">{startDefinition.name} · {entityLabel(startDefinition.triggerEntityType, en)}</p><label className="grid gap-1 text-sm font-semibold text-dtsc-ink">{en ? "Business record" : "Objet métier"}<select required name="sourceEntityId" disabled={startLoading || startSubmitting || !startOptions.length} className="h-11 min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3" defaultValue=""><option value="">{startLoading ? (en ? "Loading records…" : "Chargement des objets…") : (en ? "Select a record" : "Sélectionnez un objet")}</option>{startOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>{!startLoading && !startOptions.length ? <div role="status" className="grid gap-2 text-sm text-dtsc-muted">
          <p>{startDefinition.triggerEntityType === "EnterpriseExpense"
            ? (startEmptyReason === "NO_RECORDS"
              ? (en ? "No expense has been created yet in this company." : "Aucune dépense n’a encore été créée dans cette entreprise.")
              : (en ? "No expense is available to your account. Create an expense or ask for access to its ERP module." : "Aucune dépense n’est accessible à votre compte. Créez une dépense ou vérifiez vos droits sur le module ERP."))
            : (en ? "No eligible record is visible for this workflow." : "Aucun objet métier admissible n’est visible pour ce workflow.")}</p>
          {startCreateHref ? <a className="inline-flex min-h-11 items-center font-bold text-cyan-600 underline underline-offset-4" href={startCreateHref}>{startDefinition.triggerEntityType === "EnterpriseExpense" ? (en ? "Open Budgets and Expenses to create an expense" : "Ouvrir Budgets et dépenses pour créer une dépense") : (en ? "Open Budgets and Expenses" : "Ouvrir Budgets et dépenses")}</a> : null}
        </div> : null}<Button type="submit" disabled={startLoading || startSubmitting || !startOptions.length}><Play className="h-4 w-4" />{startSubmitting ? (en ? "Starting…" : "Démarrage…") : (en ? "Start workflow" : "Démarrer le workflow")}</Button></form> : null}</Dialog>

    <Dialog open={createOpen} title={en ? "Create a draft workflow" : "Créer un workflow brouillon"} onClose={() => setCreateOpen(false)} presentation="editor" className="h-[94dvh] max-w-4xl">
      <form onSubmit={createFromTemplate} className="grid min-w-0 gap-3">
        <label className="grid min-w-0 gap-1 text-sm font-bold text-dtsc-muted">{en ? "Controlled template" : "Modèle contrôlé"}
          <select name="templateCode" required value={selectedTemplate?.code || ""} onChange={(event) => setSelectedTemplateCode(event.target.value)} aria-describedby="workflow-template-compatibility" className="h-11 min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold">
            {templates.map((template) => <option key={template.code} value={template.code}>{en ? template.nameEn : template.nameFr}{!template.compatibility.ready ? (en ? " — Unavailable" : " — Indisponible") : ""}</option>)}
          </select>
        </label>
        <div id="workflow-template-compatibility" aria-live="polite" className="grid min-w-0 gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-muted">
          {selectedTemplate ? <p className="break-words">{en ? selectedTemplate.descriptionEn : selectedTemplate.descriptionFr}</p> : null}
          {selectedTemplate?.compatibility.ready ? <p>{en ? "Available as a draft. Assignments and publication checks still apply." : "Disponible en brouillon. Les affectations et les contrôles de publication restent à vérifier."}</p> : <>
            <strong className="text-dtsc-ink">{en ? "This template is not available" : "Ce modèle n’est pas disponible"}</strong>
            <ul className="grid list-disc gap-1 pl-4">{[...new Set(selectedTemplate?.compatibility.blockers.map((blocker) => blocker.code) || [])].map((code) => <li key={code}>{workflowReadinessMessage(code, locale)}</li>)}</ul>
          </>}
        </div>
        <p className="text-xs text-dtsc-muted">{en ? "The template is copied as a draft and never activated automatically." : "Le modèle est copié en brouillon et n’est jamais activé automatiquement."}</p>
        <Button type="submit" disabled={!selectedTemplate?.compatibility.ready}><Plus className="h-4 w-4" />{en ? "Create draft" : "Créer le brouillon"}</Button>
      </form>
    </Dialog>

    <Dialog open={stepOpen} title={en ? "Add a structured step" : "Ajouter une étape structurée"} onClose={() => setStepOpen(false)} presentation="editor" className="h-[94dvh] max-w-4xl"><form onSubmit={addStep} className="grid gap-3">{stepError ? <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{stepError}</p> : null}<div className="grid gap-2 sm:grid-cols-2"><Input name="code" placeholder={en ? "STEP_CODE" : "CODE_ETAPE"} required aria-invalid={Boolean(stepError)} /><Input name="name" placeholder={en ? "Readable name" : "Nom lisible"} required /></div><select name="stepType" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold">{STEP_TYPES.map((type) => <option key={type} value={type}>{stepTypeLabel(type, en)}</option>)}</select><Input name="field" placeholder={en ? "Condition/date field (e.g. status)" : "Champ condition/date (ex. status)"} /><select name="operator" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold"><option>EQUALS</option><option>NOT_EQUALS</option><option>GREATER_THAN</option><option>LESS_THAN_OR_EQUAL</option><option>EXISTS</option></select><Input name="value" placeholder={en ? "Condition value" : "Valeur de condition"} /><select name="strategy" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold">{ASSIGNMENTS.map((strategy) => <option key={strategy} value={strategy}>{assignmentLabel(strategy, en)}</option>)}</select><div className="grid gap-2 sm:grid-cols-2"><select name="userId" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm"><option value="">{en ? "Eligible approver (optional)" : "Validateur autorisé (optionnel)"}</option>{assignmentOptions.members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select><select name="departmentId" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm"><option value="">{en ? "Department (optional)" : "Département (optionnel)"}</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.label}</option>)}</select></div><select name="role" aria-label={en ? "Eligible organization role" : "Rôle entreprise autorisé"} className="h-11 min-w-0 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm"><option value="">{en ? "Choose an eligible role" : "Choisissez un rôle autorisé"}</option>{assignmentOptions.roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select><Input name="titleTemplate" placeholder="Traiter {{entity.reference}}" /><Input name="bodyTemplate" placeholder={en ? "Description or notification body" : "Description ou corps de notification"} /><Input name="domainAction" placeholder={en ? "Allowed domain action" : "Action métier autorisée"} /><Input name="hours" type="number" min={1} max={8760} defaultValue={24} /><select name="endOutcome" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm"><option value="COMPLETED">{en ? "Successful end" : "Fin réussie"}</option><option value="REJECTED">{en ? "Rejected end" : "Fin rejetée"}</option></select><Button type="submit"><Plus className="h-4 w-4" />{en ? "Add step" : "Ajouter l’étape"}</Button></form></Dialog>

    <Dialog open={transitionOpen} title={en ? "Add a branch" : "Ajouter une branche"} onClose={() => setTransitionOpen(false)} presentation="editor" className="h-[94dvh] max-w-4xl"><form onSubmit={addTransition} className="grid gap-3">{transitionError ? <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{transitionError}</p> : null}<select name="from" required aria-invalid={Boolean(transitionError)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm">{draftSteps.map((step) => <option key={step.code} value={step.code}>{step.name}</option>)}</select><select name="to" required aria-invalid={Boolean(transitionError)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm">{draftSteps.map((step) => <option key={step.code} value={step.code}>{step.name}</option>)}</select><select name="outcome" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm">{OUTCOMES.map((outcome) => <option key={outcome} value={outcome}>{outcomeLabel(outcome, en)}</option>)}</select><Button type="submit"><GitBranch className="h-4 w-4" />{en ? "Add branch" : "Ajouter la branche"}</Button></form></Dialog>

    <Dialog open={Boolean(runDetail)} title={en ? "Workflow timeline" : "Timeline du workflow"} onClose={() => setRunDetail(null)} presentation="editor" className="h-[94dvh] max-w-5xl">{runDetail ? <div className="grid gap-3"><div className="rounded-xl bg-dtsc-page p-3"><strong className="text-dtsc-ink">{runDetail.definition.name}</strong><p className="text-xs text-dtsc-muted">{entityLabel(runDetail.sourceEntityType, en)} · {statusLabel(runDetail.status, en)} · v{runDetail.version.versionNumber}</p></div><div className="max-h-[60dvh] overflow-y-auto overscroll-contain border-l-2 border-dtsc-border pl-4">{runDetail.events.map((event) => <article key={event.id} className="relative pb-4"><span className="absolute -left-[1.35rem] top-1 h-2.5 w-2.5 rounded-full bg-cyan-500" /><p className="text-xs font-bold text-dtsc-muted">{new Date(event.createdAt).toLocaleString(en ? "en-US" : "fr-FR")}</p><strong className="text-sm text-dtsc-ink">{getWorkflowRecoveryMessage(event.eventType, locale) || event.summary}</strong>{event.status ? <p className="text-xs text-dtsc-muted">{statusLabel(event.status, en)}</p> : null}</article>)}</div></div> : null}</Dialog>

    <Dialog open={Boolean(runAction)} title={runAction?.action === "retry" ? (en ? "Retry current step" : "Réessayer l’étape courante") : (en ? "Cancel workflow run" : "Annuler l’exécution")} onClose={() => setRunAction(null)} presentation="editor" className="h-[94dvh] max-w-3xl"><form onSubmit={submitRunAction} className="grid gap-3"><Input name="reason" required minLength={3} placeholder={en ? "Reason" : "Motif"} /><p className="text-xs text-dtsc-muted">{runAction?.action === "cancel" ? (en ? "Successful actions remain recorded; no automatic rollback is performed." : "Les actions réussies restent enregistrées; aucun rollback automatique n’est effectué.") : (en ? "Only the safe current step is retried with the same idempotency key." : "Seule l’étape courante sûre est relancée avec la même clé d’idempotence.")}</p><Button type="submit" variant={runAction?.action === "cancel" ? "destructive" : "default"}>{runAction?.action === "retry" ? <RotateCcw className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{en ? "Confirm" : "Confirmer"}</Button></form></Dialog>
  </div>;
}

function statusLabel(value: string, en: boolean) { const labels: Record<string, [string, string]> = { DRAFT: ["Brouillon", "Draft"], ACTIVE: ["Actif", "Active"], PUBLISHED: ["Publiée", "Published"], RETIRED: ["Retiré", "Retired"], ARCHIVED: ["Archivé", "Archived"], QUEUED: ["En file", "Queued"], RUNNING: ["En cours", "Running"], WAITING_APPROVAL: ["En attente de validation", "Waiting approval"], WAITING_TIME: ["En attente de l’échéance", "Waiting time"], BLOCKED: ["Bloqué", "Blocked"], COMPLETED: ["Terminé", "Completed"], REJECTED: ["Terminé sur rejet", "Rejected"], FAILED: ["Échec", "Failed"], CANCELLED: ["Annulé", "Cancelled"], SUCCEEDED: ["Réussie", "Succeeded"] }; return labels[value]?.[en ? 1 : 0] || value.replaceAll("_", " ").toLowerCase(); }
function triggerLabel(value: string, en: boolean) { const labels: Record<string, [string, string]> = { MANUAL: ["Manuel", "Manual"], ENTITY_CREATED: ["Création d’objet", "Entity created"], ENTITY_STATUS_CHANGED: ["Changement de statut", "Status changed"], DOMAIN_EVENT: ["Événement métier", "Business event"] }; return labels[value]?.[en ? 1 : 0] || value; }
function entityLabel(value?: string | null, en = false) { const labels: Record<string, [string, string]> = { EnterpriseTask: ["Tâche", "Task"], EnterpriseRequest: ["Demande", "Request"], EnterpriseMeeting: ["Réunion", "Meeting"], EnterprisePurchase: ["Achat", "Purchase"], EnterpriseBudget: ["Budget", "Budget"], EnterpriseExpense: ["Dépense", "Expense"], EnterpriseReport: ["Rapport", "Report"] }; return value ? labels[value]?.[en ? 1 : 0] || value : (en ? "No entity" : "Aucun objet"); }
function stepTypeLabel(value: string, en: boolean) { const labels: Record<string, [string, string]> = { START: ["Départ", "Start"], CONDITION: ["Condition", "Condition"], ASSIGN: ["Affectation", "Assignment"], CREATE_APPROVAL: ["Créer une validation", "Create approval"], CREATE_TASK: ["Créer une tâche", "Create task"], DOMAIN_ACTION: ["Commande métier", "Domain action"], NOTIFICATION: ["Notification", "Notification"], WAIT_UNTIL: ["Attente", "Wait"], END: ["Fin", "End"] }; return labels[value]?.[en ? 1 : 0] || value; }
function outcomeLabel(value?: string | null, en = false) { const labels: Record<string, [string, string]> = { DEFAULT: ["Suite normale", "Default"], TRUE: ["Oui", "True"], FALSE: ["Non", "False"], APPROVED: ["Approuvée", "Approved"], REJECTED: ["Rejetée", "Rejected"], CANCELLED: ["Annulée", "Cancelled"] }; return labels[value || "DEFAULT"]?.[en ? 1 : 0] || value || "DEFAULT"; }
function assignmentLabel(value: string, en: boolean) { const labels: Record<string, [string, string]> = { SPECIFIC_USER: ["Utilisateur précis", "Specific user"], SPECIFIC_ROLE: ["Rôle précis", "Specific role"], DEPARTMENT_MANAGER: ["Responsable du département", "Department manager"], ENTITY_REQUESTER: ["Demandeur de l’objet", "Entity requester"], ENTITY_ASSIGNEE: ["Responsable de l’objet", "Entity assignee"], ENTITY_BUYER: ["Acheteur", "Entity buyer"], ENTITY_CREATOR: ["Créateur de l’objet", "Entity creator"], PREVIOUS_STEP_ACTOR: ["Acteur de l’étape précédente", "Previous step actor"] }; return labels[value]?.[en ? 1 : 0] || value; }
