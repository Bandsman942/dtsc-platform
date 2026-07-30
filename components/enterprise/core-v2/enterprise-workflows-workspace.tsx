"use client";

import { Activity, AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Copy, Eye, GitBranch, PauseCircle, Plus, RefreshCw, RotateCcw, Save, Send, ShieldAlert, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { StatusBadge } from "@/components/workspace/status-badge";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { cn } from "@/lib/utils";

type Step = { id?: string; code: string; name: string; description?: string | null; stepType: string; position: number; configurationJson?: Record<string, unknown>; configuration?: Record<string, unknown> };
type Transition = { id?: string; fromStepId?: string; toStepId?: string; fromStep?: { code: string }; toStep?: { code: string }; fromStepCode?: string; toStepCode?: string; outcome?: string | null; priority: number; conditionJson?: Record<string, unknown> | null; condition?: Record<string, unknown> };
type Version = { id: string; versionNumber: number; status: string; steps: Step[]; transitions: Transition[]; publishedAt?: string | null };
type Definition = { id: string; code: string; name: string; description?: string | null; status: string; triggerType: string; triggerEntityType?: string | null; triggerEventType?: string | null; currentVersionId?: string | null; updatedAt: string; versions: Version[]; _count?: { runs: number } };
type Run = { id: string; status: string; sourceEntityType: string; sourceEntityId: string; triggerType: string; startedAt: string; updatedAt: string; revision: number; failureMessage?: string | null; definition: { id: string; code: string; name: string }; version: { versionNumber: number }; stepRuns: Array<{ step: { code: string; name: string; stepType: string } }> };
type WorkflowEvent = { id: string; createdAt: string; summary: string; status?: string | null };
type RunDetail = Run & { events: WorkflowEvent[] };
type Template = { code: string; nameFr: string; nameEn: string; descriptionFr: string; descriptionEn: string; triggerEntityType: string; triggerEventType: string };
type Readiness = { ready: boolean; blockers: Array<{ code: string; message: string; stepCode?: string }> };
type Permissions = { canCreateDraft?: boolean; canEditDraft?: boolean; canPublish?: boolean; canRetire?: boolean; canStartManual?: boolean; canViewAllRuns?: boolean; canRetry?: boolean; canCancel?: boolean };

type Props = { organizationId: string; canManage: boolean; locale?: string | null; members: Array<{ id: string; label: string }>; departments: Array<{ id: string; label: string }>; legacyWorkflows: Array<{ id: string; labelFr: string; isEnabled: boolean; updatedAt: Date }> };

const STEP_TYPES = ["START", "CONDITION", "ASSIGN", "CREATE_APPROVAL", "CREATE_TASK", "DOMAIN_ACTION", "NOTIFICATION", "WAIT_UNTIL", "END"];
const OUTCOMES = ["DEFAULT", "TRUE", "FALSE", "APPROVED", "REJECTED", "CANCELLED"];
const ASSIGNMENTS = ["SPECIFIC_USER", "SPECIFIC_ROLE", "DEPARTMENT_MANAGER", "ENTITY_REQUESTER", "ENTITY_ASSIGNEE", "ENTITY_BUYER", "ENTITY_CREATOR", "PREVIOUS_STEP_ACTOR"];

export function EnterpriseWorkflowsWorkspace({ organizationId, locale, members, departments, legacyWorkflows }: Props) {
  const en = locale === "en";
  const [tab, setTab] = useState<"definitions" | "runs" | "monitoring">("definitions");
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({});
  const [runs, setRuns] = useState<Run[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
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

  const currentDraft = selected?.versions.find((version) => version.status === "DRAFT") || null;
  const published = selected?.versions.find((version) => version.status === "PUBLISHED") || null;
  const monitored = runs.filter((run) => ["BLOCKED", "FAILED", "WAITING_APPROVAL", "WAITING_TIME"].includes(run.status));

  const load = useCallback(async () => {
    setLoading(true);
    const [definitionResponse, runResponse] = await Promise.all([
      fetch(`/api/enterprise/${organizationId}/workflows`),
      fetch(`/api/enterprise/${organizationId}/workflow-runs?pageSize=50`),
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
      setPermissions((current) => ({ ...current, ...(runBody?.permissions || {}) }));
    }
    setLoading(false);
  }, [en, organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDefinition(id: string) {
    const response = await fetch(`/api/enterprise/${organizationId}/workflows/${id}`);
    const body = await response.json().catch(() => null);
    if (!response.ok) return toastError(body?.message || (en ? "Workflow unavailable." : "Workflow indisponible."));
    setSelected(body.definition);
    setReadiness(body.readiness || {});
    const draft = body.definition.versions.find((version: Version) => version.status === "DRAFT");
    setDraftSteps((draft?.steps || []).map((step: Step) => ({ ...step, configuration: step.configurationJson || {} })));
    setDraftTransitions((draft?.transitions || []).map((transition: Transition) => ({ ...transition, fromStepCode: transition.fromStep?.code, toStepCode: transition.toStep?.code, condition: transition.conditionJson || undefined })));
  }

  async function createFromTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const templateCode = String(form.get("templateCode") || "");
    const response = await fetch(`/api/enterprise/${organizationId}/workflows`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateCode, locale: en ? "en" : "fr" }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) return toastError(body?.message || (en ? "Creation failed." : "Création impossible."));
    setCreateOpen(false);
    toastSuccess(en ? "Draft workflow created." : "Workflow brouillon créé.");
    await load();
    await openDefinition(body.definition.id);
  }

  function stepConfig(form: FormData, type: string) {
    const assignment = { strategy: String(form.get("strategy") || "ENTITY_CREATOR"), ...(form.get("userId") ? { userId: String(form.get("userId")) } : {}), ...(form.get("role") ? { role: String(form.get("role")) } : {}), ...(form.get("departmentId") ? { departmentId: String(form.get("departmentId")) } : {}) };
    if (type === "START") return {};
    if (type === "END") return { outcome: String(form.get("endOutcome") || "COMPLETED") };
    if (type === "CONDITION") return { condition: { field: String(form.get("field") || "status"), operator: String(form.get("operator") || "EQUALS"), value: String(form.get("value") || "") } };
    if (type === "ASSIGN") return { assignment };
    if (type === "CREATE_APPROVAL") return { assignment, titleTemplate: String(form.get("titleTemplate") || "Valider {{entity.reference}}") };
    if (type === "CREATE_TASK") return { titleTemplate: String(form.get("titleTemplate") || "Traiter {{entity.reference}}"), descriptionTemplate: String(form.get("bodyTemplate") || ""), taskType: "TASK", priority: String(form.get("priority") || "NORMAL"), assignment };
    if (type === "DOMAIN_ACTION") return { action: String(form.get("domainAction") || "COMPLETE"), commentTemplate: String(form.get("bodyTemplate") || "") };
    if (type === "NOTIFICATION") return { recipient: assignment, titleTemplate: String(form.get("titleTemplate") || "Mise à jour du workflow"), bodyTemplate: String(form.get("bodyTemplate") || "{{entity.reference}} a été mis à jour."), targetUrl: "/enterprise-modules/WORKFLOWS" };
    if (type === "WAIT_UNTIL") return { mode: "RELATIVE_HOURS", hours: Math.max(1, Number(form.get("hours") || 24)) };
    return {};
  }

  function addStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = String(form.get("stepType") || "START");
    const code = String(form.get("code") || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    if (!code || draftSteps.some((step) => step.code === code)) return toastError(en ? "Step code must be unique." : "Le code de l’étape doit être unique.");
    setDraftSteps((current) => [...current, { code, name: String(form.get("name") || code), stepType: type, position: current.length, configuration: stepConfig(form, type) }]);
    setStepOpen(false);
  }

  function addTransition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fromStepCode = String(form.get("from") || "");
    const toStepCode = String(form.get("to") || "");
    const outcome = String(form.get("outcome") || "DEFAULT");
    if (!fromStepCode || !toStepCode || fromStepCode === toStepCode) return toastError(en ? "Choose two different steps." : "Choisissez deux étapes différentes.");
    setDraftTransitions((current) => [...current, { fromStepCode, toStepCode, outcome, priority: current.filter((item) => item.fromStepCode === fromStepCode).length }]);
    setTransitionOpen(false);
  }

  function moveStep(index: number, direction: -1 | 1) {
    setDraftSteps((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((step, position) => ({ ...step, position }));
    });
  }

  function removeStep(code: string) {
    setDraftSteps((current) => current.filter((step) => step.code !== code).map((step, position) => ({ ...step, position })));
    setDraftTransitions((current) => current.filter((transition) => transition.fromStepCode !== code && transition.toStepCode !== code));
  }

  async function saveVersion() {
    if (!selected || !currentDraft) return;
    const response = await fetch(`/api/enterprise/${organizationId}/workflows/${selected.id}/versions/${currentDraft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steps: draftSteps.map(({ configurationJson, ...step }) => ({ ...step, configuration: step.configuration || configurationJson || {} })),
        transitions: draftTransitions.map((transition) => ({ fromStepCode: transition.fromStepCode, toStepCode: transition.toStepCode, outcome: transition.outcome || "DEFAULT", priority: transition.priority, ...(transition.condition ? { condition: transition.condition } : {}) })),
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return toastError(body?.message || (en ? "Save failed." : "Enregistrement impossible."));
    toastSuccess(en ? "Draft saved." : "Brouillon enregistré.");
    await openDefinition(selected.id);
    await load();
  }

  async function publish() {
    if (!selected || !currentDraft) return;
    const response = await fetch(`/api/enterprise/${organizationId}/workflows/${selected.id}/versions/${currentDraft.id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acknowledgeReadiness: true }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) return toastError(body?.message || (en ? "Publication failed." : "Publication impossible."));
    toastSuccess(en ? "Workflow published." : "Workflow publié.");
    await openDefinition(selected.id);
    await load();
  }

  async function duplicateVersion() {
    if (!selected) return;
    const sourceVersionId = published?.id || currentDraft?.id;
    const response = await fetch(`/api/enterprise/${organizationId}/workflows/${selected.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceVersionId }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) return toastError(body?.message || (en ? "Duplication failed." : "Duplication impossible."));
    toastSuccess(en ? "New draft version created." : "Nouvelle version brouillon créée.");
    await openDefinition(selected.id);
  }

  async function openRun(id: string) {
    const response = await fetch(`/api/enterprise/${organizationId}/workflow-runs/${id}`);
    const body = await response.json().catch(() => null);
    if (!response.ok) return toastError(body?.message || (en ? "Run unavailable." : "Exécution indisponible."));
    setRunDetail(body.run as RunDetail);
  }

  async function submitRunAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!runAction) return;
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") || "");
    const response = await fetch(`/api/enterprise/${organizationId}/workflow-runs/${runAction.run.id}/${runAction.action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(runAction.action === "cancel" ? { reason, revision: runAction.run.revision } : { reason }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) return toastError(body?.message || (en ? "Action failed." : "Action impossible."));
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
        <div className="mt-3">{definitions.length ? <BusinessList ariaLabel={en ? "Workflow definitions" : "Définitions de workflow"}>{definitions.map((definition) => <BusinessListItem key={definition.id} title={definition.name} description={`${definition.code} · ${triggerLabel(definition.triggerType, en)} · ${entityLabel(definition.triggerEntityType, en)}`} status={<StatusBadge>{statusLabel(definition.status, en)}</StatusBadge>} actions={<ActionMenu label="Workflow" items={[{ key: "open", label: en ? "Open" : "Ouvrir", icon: Eye, onSelect: () => void openDefinition(definition.id) }, ...(permissions.canCreateDraft ? [{ key: "duplicate", label: en ? "Create new version" : "Créer une nouvelle version", icon: Copy, onSelect: async () => { await openDefinition(definition.id); } }] : [])]} />} />)}</BusinessList> : <EmptyState compact title={en ? "No workflow" : "Aucun workflow"} description={en ? "Start from a controlled draft template." : "Commencez par un modèle brouillon contrôlé."} />}</div>
        {legacyWorkflows.length ? <div className="mt-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3"><p className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{en ? "Legacy catalog" : "Catalogue historique"}</p><p className="mt-1 text-sm text-dtsc-muted">{legacyWorkflows.length} {en ? "catalog entries remain read-only and are never executed by Engine v2." : "configurations restent en lecture seule et ne sont jamais exécutées par Engine v2."}</p></div> : null}
      </section>
      <section className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-4">{selected ? <div className="grid gap-4"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[0.1em] text-cyan-600">{selected.code}</p><h2 className="truncate text-lg font-black text-dtsc-ink">{selected.name}</h2><p className="text-sm text-dtsc-muted">{selected.description}</p></div><StatusBadge>{statusLabel(selected.status, en)}</StatusBadge></div>
        <div className="flex flex-wrap gap-2">{permissions.canCreateDraft && published ? <Button size="sm" variant="outline" onClick={() => void duplicateVersion()}><Copy className="h-4 w-4" />{en ? "New version" : "Nouvelle version"}</Button> : null}{permissions.canEditDraft && currentDraft ? <Button size="sm" variant="outline" onClick={() => setStepOpen(true)}><Plus className="h-4 w-4" />{en ? "Step" : "Étape"}</Button> : null}{permissions.canEditDraft && currentDraft ? <Button size="sm" variant="outline" onClick={() => setTransitionOpen(true)}><GitBranch className="h-4 w-4" />{en ? "Transition" : "Transition"}</Button> : null}{permissions.canEditDraft && currentDraft ? <Button size="sm" onClick={() => void saveVersion()}><Save className="h-4 w-4" />{en ? "Save" : "Enregistrer"}</Button> : null}{permissions.canPublish && currentDraft ? <Button size="sm" disabled={!readinessForDraft?.ready} onClick={() => void publish()}><Send className="h-4 w-4" />{en ? "Publish" : "Publier"}</Button> : null}</div>
        {currentDraft ? <><div className={cn("rounded-xl border p-3", readinessForDraft?.ready ? "border-emerald-400/40 bg-emerald-500/5" : "border-amber-400/40 bg-amber-500/5")}><p className="font-black text-dtsc-ink">{readinessForDraft?.ready ? (en ? "Ready to publish" : "Prêt à publier") : (en ? "Publication blockers" : "Blocages de publication")}</p>{readinessForDraft?.blockers?.length ? <ul className="mt-2 grid gap-1 text-xs text-dtsc-muted">{readinessForDraft.blockers.map((item, index) => <li key={`${item.code}-${index}`}>• {item.stepCode ? `${item.stepCode}: ` : ""}{item.message}</li>)}</ul> : null}</div>
        <div className="grid gap-2">{[...draftSteps].sort((a, b) => a.position - b.position).map((step, index) => <article key={step.code} className="flex min-w-0 items-center gap-2 rounded-xl border border-dtsc-border p-2.5"><span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dtsc-soft text-xs font-black text-dtsc-ink">{index + 1}</span><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-dtsc-ink">{step.name}</strong><span className="block truncate text-xs text-dtsc-muted">{stepTypeLabel(step.stepType, en)} · {step.code}</span></div>{permissions.canEditDraft ? <div className="flex shrink-0"><button type="button" className="p-2 text-dtsc-muted" onClick={() => moveStep(index, -1)}><ArrowUp className="h-4 w-4" /></button><button type="button" className="p-2 text-dtsc-muted" onClick={() => moveStep(index, 1)}><ArrowDown className="h-4 w-4" /></button><button type="button" className="p-2 text-rose-600" onClick={() => removeStep(step.code)}><Trash2 className="h-4 w-4" /></button></div> : null}</article>)}</div>
        <div><h3 className="text-sm font-black text-dtsc-ink">{en ? "Branches" : "Branches"}</h3><div className="mt-2 grid gap-1.5">{draftTransitions.map((transition, index) => <div key={`${transition.fromStepCode}-${transition.toStepCode}-${index}`} className="flex items-center gap-2 rounded-xl bg-dtsc-page px-3 py-2 text-xs"><span className="truncate font-bold text-dtsc-ink">{transition.fromStepCode}</span><GitBranch className="h-3.5 w-3.5 shrink-0 text-cyan-600" /><span className="truncate font-bold text-dtsc-ink">{transition.toStepCode}</span><span className="ml-auto shrink-0 text-dtsc-muted">{outcomeLabel(transition.outcome, en)}</span>{permissions.canEditDraft ? <button type="button" onClick={() => setDraftTransitions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><XCircle className="h-4 w-4 text-rose-600" /></button> : null}</div>)}</div></div></> : <p className="text-sm text-dtsc-muted">{en ? "Create a new draft version to edit this workflow." : "Créez une nouvelle version brouillon pour modifier ce workflow."}</p>}</div> : <EmptyState compact title={en ? "Select a workflow" : "Sélectionnez un workflow"} description={en ? "Open a definition to inspect its versions and readiness." : "Ouvrez une définition pour consulter ses versions et sa readiness."} />}</section>
    </div> : null}

    {tab === "runs" ? <section>{runs.length ? <BusinessList ariaLabel={en ? "Workflow runs" : "Exécutions de workflow"}>{runs.map((run) => <BusinessListItem key={run.id} title={run.definition.name} description={`${entityLabel(run.sourceEntityType, en)} · ${new Date(run.startedAt).toLocaleString(en ? "en-US" : "fr-FR")} · v${run.version.versionNumber}`} status={<StatusBadge>{statusLabel(run.status, en)}</StatusBadge>} actions={<ActionMenu label="Run" items={[{ key: "open", label: en ? "Open timeline" : "Ouvrir la timeline", icon: Eye, onSelect: () => void openRun(run.id) }, ...(permissions.canRetry && ["BLOCKED", "FAILED"].includes(run.status) ? [{ key: "retry", label: en ? "Retry step" : "Réessayer l’étape", icon: RotateCcw, onSelect: () => setRunAction({ run, action: "retry" as const }) }] : []), ...(permissions.canCancel && !["COMPLETED", "REJECTED", "FAILED", "CANCELLED"].includes(run.status) ? [{ key: "cancel", label: en ? "Cancel run" : "Annuler l’exécution", icon: XCircle, destructive: true, onSelect: () => setRunAction({ run, action: "cancel" as const }) }] : [])]} />} />)}</BusinessList> : <EmptyState compact title={en ? "No workflow run" : "Aucune exécution"} description={en ? "Runs appear after a manual start or a matching business event." : "Les exécutions apparaissent après un lancement manuel ou un événement métier correspondant."} />}</section> : null}

    {tab === "monitoring" ? <section className="grid gap-3">{monitored.length ? monitored.map((run) => <article key={run.id} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-3"><div className="flex items-start gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700"><AlertTriangle className="h-4 w-4" /></span><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-dtsc-ink">{run.definition.name}</strong><span className="block text-xs text-dtsc-muted">{statusLabel(run.status, en)} · {run.failureMessage || (en ? "Awaiting the next authorized action." : "En attente de la prochaine action autorisée.")}</span></div><Button size="sm" variant="outline" onClick={() => void openRun(run.id)}>{en ? "Inspect" : "Inspecter"}</Button></div></article>) : <EmptyState compact title={en ? "Nothing to monitor" : "Rien à surveiller"} description={en ? "No blocked, failed or abnormally waiting run." : "Aucune exécution bloquée, en échec ou en attente anormale."} />}</section> : null}

    <Dialog open={createOpen} title={en ? "Create a draft workflow" : "Créer un workflow brouillon"} onClose={() => setCreateOpen(false)}><form onSubmit={createFromTemplate} className="grid gap-3"><label className="grid gap-1 text-sm font-bold text-dtsc-muted">{en ? "Controlled template" : "Modèle contrôlé"}<select name="templateCode" required className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold">{templates.map((template) => <option key={template.code} value={template.code}>{en ? template.nameEn : template.nameFr}</option>)}</select></label><p className="text-xs text-dtsc-muted">{en ? "The template is copied as a draft and never activated automatically." : "Le modèle est copié en brouillon et n’est jamais activé automatiquement."}</p><Button type="submit"><Plus className="h-4 w-4" />{en ? "Create draft" : "Créer le brouillon"}</Button></form></Dialog>

    <Dialog open={stepOpen} title={en ? "Add a structured step" : "Ajouter une étape structurée"} onClose={() => setStepOpen(false)}><form onSubmit={addStep} className="grid gap-3"><div className="grid gap-2 sm:grid-cols-2"><Input name="code" placeholder={en ? "STEP_CODE" : "CODE_ETAPE"} required /><Input name="name" placeholder={en ? "Readable name" : "Nom lisible"} required /></div><select name="stepType" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold">{STEP_TYPES.map((type) => <option key={type} value={type}>{stepTypeLabel(type, en)}</option>)}</select><Input name="field" placeholder={en ? "Condition/date field (e.g. status)" : "Champ condition/date (ex. status)"} /><select name="operator" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold"><option>EQUALS</option><option>NOT_EQUALS</option><option>GREATER_THAN</option><option>LESS_THAN_OR_EQUAL</option><option>EXISTS</option></select><Input name="value" placeholder={en ? "Condition value" : "Valeur de condition"} /><select name="strategy" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold">{ASSIGNMENTS.map((strategy) => <option key={strategy} value={strategy}>{assignmentLabel(strategy, en)}</option>)}</select><div className="grid gap-2 sm:grid-cols-2"><select name="userId" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm"><option value="">{en ? "Specific user (optional)" : "Utilisateur précis (optionnel)"}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select><select name="departmentId" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm"><option value="">{en ? "Department (optional)" : "Département (optionnel)"}</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.label}</option>)}</select></div><Input name="role" placeholder={en ? "Organization role (optional)" : "Rôle entreprise (optionnel)"} /><Input name="titleTemplate" placeholder="Traiter {{entity.reference}}" /><Input name="bodyTemplate" placeholder={en ? "Description or notification body" : "Description ou corps de notification"} /><Input name="domainAction" placeholder={en ? "Allowed domain action" : "Action métier autorisée"} /><Input name="hours" type="number" min={1} max={8760} defaultValue={24} /><select name="endOutcome" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm"><option value="COMPLETED">{en ? "Successful end" : "Fin réussie"}</option><option value="REJECTED">{en ? "Rejected end" : "Fin rejetée"}</option></select><Button type="submit"><Plus className="h-4 w-4" />{en ? "Add step" : "Ajouter l’étape"}</Button></form></Dialog>

    <Dialog open={transitionOpen} title={en ? "Add a branch" : "Ajouter une branche"} onClose={() => setTransitionOpen(false)}><form onSubmit={addTransition} className="grid gap-3"><select name="from" required className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm">{draftSteps.map((step) => <option key={step.code} value={step.code}>{step.name}</option>)}</select><select name="to" required className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm">{draftSteps.map((step) => <option key={step.code} value={step.code}>{step.name}</option>)}</select><select name="outcome" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm">{OUTCOMES.map((outcome) => <option key={outcome} value={outcome}>{outcomeLabel(outcome, en)}</option>)}</select><Button type="submit"><GitBranch className="h-4 w-4" />{en ? "Add branch" : "Ajouter la branche"}</Button></form></Dialog>

    <Dialog open={Boolean(runDetail)} title={en ? "Workflow timeline" : "Timeline du workflow"} onClose={() => setRunDetail(null)}>{runDetail ? <div className="grid gap-3"><div className="rounded-xl bg-dtsc-page p-3"><strong className="text-dtsc-ink">{runDetail.definition.name}</strong><p className="text-xs text-dtsc-muted">{entityLabel(runDetail.sourceEntityType, en)} · {statusLabel(runDetail.status, en)} · v{runDetail.version.versionNumber}</p></div><div className="max-h-[60dvh] overflow-y-auto overscroll-contain border-l-2 border-dtsc-border pl-4">{runDetail.events.map((event) => <article key={event.id} className="relative pb-4"><span className="absolute -left-[1.35rem] top-1 h-2.5 w-2.5 rounded-full bg-cyan-500" /><p className="text-xs font-bold text-dtsc-muted">{new Date(event.createdAt).toLocaleString(en ? "en-US" : "fr-FR")}</p><strong className="text-sm text-dtsc-ink">{event.summary}</strong>{event.status ? <p className="text-xs text-dtsc-muted">{statusLabel(event.status, en)}</p> : null}</article>)}</div></div> : null}</Dialog>

    <Dialog open={Boolean(runAction)} title={runAction?.action === "retry" ? (en ? "Retry current step" : "Réessayer l’étape courante") : (en ? "Cancel workflow run" : "Annuler l’exécution")} onClose={() => setRunAction(null)}><form onSubmit={submitRunAction} className="grid gap-3"><Input name="reason" required minLength={3} placeholder={en ? "Reason" : "Motif"} /><p className="text-xs text-dtsc-muted">{runAction?.action === "cancel" ? (en ? "Successful actions remain recorded; no automatic rollback is performed." : "Les actions réussies restent enregistrées; aucun rollback automatique n’est effectué.") : (en ? "Only the safe current step is retried with the same idempotency key." : "Seule l’étape courante sûre est relancée avec la même clé d’idempotence.")}</p><Button type="submit" variant={runAction?.action === "cancel" ? "destructive" : "default"}>{runAction?.action === "retry" ? <RotateCcw className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{en ? "Confirm" : "Confirmer"}</Button></form></Dialog>
  </div>;
}

function statusLabel(value: string, en: boolean) { const labels: Record<string, [string, string]> = { DRAFT: ["Brouillon", "Draft"], ACTIVE: ["Actif", "Active"], PUBLISHED: ["Publiée", "Published"], RETIRED: ["Retiré", "Retired"], ARCHIVED: ["Archivé", "Archived"], QUEUED: ["En file", "Queued"], RUNNING: ["En cours", "Running"], WAITING_APPROVAL: ["En attente de validation", "Waiting approval"], WAITING_TIME: ["En attente de l’échéance", "Waiting time"], BLOCKED: ["Bloqué", "Blocked"], COMPLETED: ["Terminé", "Completed"], REJECTED: ["Terminé sur rejet", "Rejected"], FAILED: ["Échec", "Failed"], CANCELLED: ["Annulé", "Cancelled"], SUCCEEDED: ["Réussie", "Succeeded"] }; return labels[value]?.[en ? 1 : 0] || value.replaceAll("_", " ").toLowerCase(); }
function triggerLabel(value: string, en: boolean) { const labels: Record<string, [string, string]> = { MANUAL: ["Manuel", "Manual"], ENTITY_CREATED: ["Création d’objet", "Entity created"], ENTITY_STATUS_CHANGED: ["Changement de statut", "Status changed"], DOMAIN_EVENT: ["Événement métier", "Business event"] }; return labels[value]?.[en ? 1 : 0] || value; }
function entityLabel(value?: string | null, en = false) { const labels: Record<string, [string, string]> = { EnterpriseTask: ["Tâche", "Task"], EnterpriseRequest: ["Demande", "Request"], EnterpriseMeeting: ["Réunion", "Meeting"], EnterprisePurchase: ["Achat", "Purchase"], EnterpriseBudget: ["Budget", "Budget"], EnterpriseExpense: ["Dépense", "Expense"], EnterpriseReport: ["Rapport", "Report"] }; return value ? labels[value]?.[en ? 1 : 0] || value : (en ? "No entity" : "Aucun objet"); }
function stepTypeLabel(value: string, en: boolean) { const labels: Record<string, [string, string]> = { START: ["Départ", "Start"], CONDITION: ["Condition", "Condition"], ASSIGN: ["Affectation", "Assignment"], CREATE_APPROVAL: ["Créer une validation", "Create approval"], CREATE_TASK: ["Créer une tâche", "Create task"], DOMAIN_ACTION: ["Commande métier", "Domain action"], NOTIFICATION: ["Notification", "Notification"], WAIT_UNTIL: ["Attente", "Wait"], END: ["Fin", "End"] }; return labels[value]?.[en ? 1 : 0] || value; }
function outcomeLabel(value?: string | null, en = false) { const labels: Record<string, [string, string]> = { DEFAULT: ["Suite normale", "Default"], TRUE: ["Oui", "True"], FALSE: ["Non", "False"], APPROVED: ["Approuvée", "Approved"], REJECTED: ["Rejetée", "Rejected"], CANCELLED: ["Annulée", "Cancelled"] }; return labels[value || "DEFAULT"]?.[en ? 1 : 0] || value || "DEFAULT"; }
function assignmentLabel(value: string, en: boolean) { const labels: Record<string, [string, string]> = { SPECIFIC_USER: ["Utilisateur précis", "Specific user"], SPECIFIC_ROLE: ["Rôle précis", "Specific role"], DEPARTMENT_MANAGER: ["Responsable du département", "Department manager"], ENTITY_REQUESTER: ["Demandeur de l’objet", "Entity requester"], ENTITY_ASSIGNEE: ["Responsable de l’objet", "Entity assignee"], ENTITY_BUYER: ["Acheteur", "Entity buyer"], ENTITY_CREATOR: ["Créateur de l’objet", "Entity creator"], PREVIOUS_STEP_ACTOR: ["Acteur de l’étape précédente", "Previous step actor"] }; return labels[value]?.[en ? 1 : 0] || value; }
