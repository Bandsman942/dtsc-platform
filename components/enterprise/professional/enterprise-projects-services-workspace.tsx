"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, CircleStop, Eye, Flag, PauseCircle, PlayCircle, Plus, ShieldAlert, UserPlus, XCircle } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { EnterpriseProjectControlActions } from "@/components/enterprise/professional/enterprise-project-control-actions";
import {
  professionalErpDate,
  professionalErpEnumLabel,
  professionalErpMoney,
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

type Employee = { id: string; employeeNumber: string; displayName: string; workEmail?: string | null };
type Member = { id: string; label: string; role: string; positionTitle: string | null };
type Party = { id: string; code: string; legalName: string; displayName: string | null };
type Department = { id: string; departmentCode: string; labelFr: string; labelEn?: string | null };
type Site = { id: string; code: string; name: string };
type Contract = { id: string; reference: string; title: string; businessPartyId: string | null; status: string; currency: string | null };
type Budget = { id: string; reference: string; title: string; status: string; currency: string };
type Document = { id: string; title: string; documentType: string; status: string };
type Lookups = { employees: Employee[]; members: Member[]; parties: Party[]; departments: Department[]; sites: Site[]; contracts: Contract[]; budgets: Budget[]; documents: Document[]; canReadBudgets: boolean; canReadDocuments: boolean };
type ProjectListItem = { id: string; reference: string; name: string; description: string | null; projectType: string; status: string; currency: string | null; indicativeBudget: string | number | null; startDate: string | null; targetEndDate: string | null; progressPercent: number; revision: number; _count: { members: number; milestones: number; deliverables: number; risks: number; issues: number } };
type ProjectOverview = ProjectListItem & {
  contract: { id: string; reference: string; title: string; status: string } | null;
  members: Array<{ id: string; role: string; allocationPercent: number | null; employee: Employee }>;
  milestones: Array<{ id: string; reference: string; name: string; description: string | null; dueDate: string | null; status: string; approvalRequired: boolean; revision: number }>;
  deliverables: Array<{ id: string; reference: string; name: string; description: string | null; milestoneId: string | null; status: string; dueDate: string | null; ownerUserId: string | null; reviewComment: string | null; revision: number }>;
  risks: Array<{ id: string; reference: string; title: string; description: string; probability: string; impact: string; severity: string; status: string; mitigationPlan: string | null; dueDate: string | null; revision: number }>;
  issues: Array<{ id: string; reference: string; title: string; description: string; issueType: string | null; priority: string; status: string; dueDate: string | null; resolution: string | null; revision: number }>;
};
type Subform = "MILESTONE" | "DELIVERABLE" | "RISK" | "ISSUE" | "MEMBER";
type ProjectAction = "PLAN" | "START" | "MARK_AT_RISK" | "BLOCK" | "RESUME" | "COMPLETE" | "CLOSE" | "CANCEL";

const PROJECT_STATUSES = ["DRAFT", "PLANNED", "ACTIVE", "AT_RISK", "BLOCKED", "COMPLETED", "CLOSED", "CANCELLED"];
const PROJECT_TYPES = ["CLIENT", "INTERNAL", "SERVICE", "IMPLEMENTATION"];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"];
const PROJECT_ROLES = ["MEMBER", "PROJECT_MANAGER", "CONTRIBUTOR", "OBSERVER"];
const RISK_CATEGORIES = ["SCOPE", "SCHEDULE", "BUDGET", "RESOURCE", "QUALITY", "TECHNICAL", "LEGAL", "OTHER"];
const ISSUE_TYPES = ["BLOCKER", "DEPENDENCY", "QUALITY", "CLIENT", "TECHNICAL", "OTHER"];
const PROJECT_EDITABLE_STATUSES = new Set(["DRAFT", "PLANNED", "ACTIVE", "IN_PROGRESS", "AT_RISK", "BLOCKED"]);

function isProjectEditableStatus(status: string) {
  return PROJECT_EDITABLE_STATUSES.has(status);
}

function statusTone(status: string) {
  if (["ACTIVE", "COMPLETED", "CLOSED"].includes(status)) return "success" as const;
  if (["PLANNED", "AT_RISK"].includes(status)) return "warning" as const;
  if (["BLOCKED", "CANCELLED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

export function EnterpriseProjectsServicesWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const tr = (fr: string, en: string) => locale === "en" ? en : fr;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ employees: [], members: [], parties: [], departments: [], sites: [], contracts: [], budgets: [], documents: [], canReadBudgets: false, canReadDocuments: false });
  const [projectOpen, setProjectOpen] = useState(false);
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [subform, setSubform] = useState<Subform | null>(null);
  const [transition, setTransition] = useState<{ action: ProjectAction; project: ProjectOverview } | null>(null);
  const [transitionComment, setTransitionComment] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  useToastMessage(message);

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/projects-assets-lookups?module=PROJECTS_SERVICES`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Lookups & { message?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || t("projects.selectorsUnavailable"));
        if (active) setLookups({
          employees: body.employees || [], members: body.members || [], parties: body.parties || [], departments: body.departments || [], sites: body.sites || [], contracts: body.contracts || [], budgets: body.budgets || [], documents: body.documents || [], canReadBudgets: Boolean(body.canReadBudgets), canReadDocuments: Boolean(body.canReadDocuments),
        });
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
  const projects = useProfessionalCollection<ProjectListItem>({ endpoint: `/api/enterprise/${organizationId}/projects`, params, refreshKey });
  const statusItems = [{ id: "", label: t("projects.allStatuses") }, ...PROJECT_STATUSES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "projectStatus", id) }))];
  const projectTypeItems = PROJECT_TYPES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "projectType", id) }));
  const riskLevelItems = RISK_LEVELS.map((id) => ({ id, label: professionalErpEnumLabel(locale, "riskLevel", id) }));
  const priorityItems = PRIORITIES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "priority", id) }));
  const filteredContracts = selectedPartyId ? lookups.contracts.filter((contract) => contract.businessPartyId === selectedPartyId) : lookups.contracts;

  async function openProject(project: ProjectListItem) {
    setOverviewLoading(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/projects/${project.id}/overview`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { project?: ProjectOverview; message?: string } | null;
      if (!response.ok || !body?.project) throw new Error(body?.message || t("projects.openFailed"));
      setOverview(body.project);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("projects.openFailed"));
    } finally {
      setOverviewLoading(false);
    }
  }

  async function reloadOverview() {
    if (!overview) return;
    const response = await fetch(`/api/enterprise/${organizationId}/projects/${overview.id}/overview`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as { project?: ProjectOverview } | null;
    if (response.ok && body?.project) setOverview(body.project);
    setRefreshKey((value) => value + 1);
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction) return;
    const form = new FormData(event.currentTarget);
    setBusyAction("create-project");
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/projects`, {
        name: String(form.get("name") || ""), description: String(form.get("description") || "") || null,
        projectType: String(form.get("projectType") || "CLIENT"), businessPartyId: selectedPartyId || null,
        contractId: String(form.get("contractId") || "") || null, ownerUserId: String(form.get("ownerUserId") || "") || null,
        departmentId: String(form.get("departmentId") || "") || null, siteId: String(form.get("siteId") || "") || null,
        budgetId: String(form.get("budgetId") || "") || null, currency: String(form.get("currency") || "") || null,
        indicativeBudget: String(form.get("indicativeBudget") || "") ? Number(form.get("indicativeBudget")) : null,
        startDate: String(form.get("startDate") || "") || null, targetEndDate: String(form.get("targetEndDate") || "") || null,
        members: selectedMembers.map((employeeId) => ({ employeeId, role: "MEMBER", allocationPercent: 100 })),
      });
      setProjectOpen(false); setSelectedPartyId(""); setSelectedMembers([]); setRefreshKey((value) => value + 1); setMessage(t("projects.created"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("projects.createFailed"));
    } finally {
      setBusyAction("");
    }
  }

  async function createSubrecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || !subform || busyAction) return;
    const form = new FormData(event.currentTarget);
    setBusyAction(`create-${subform.toLowerCase()}`);
    try {
      if (subform === "MILESTONE") await professionalMutation(`/api/enterprise/${organizationId}/projects/${overview.id}/milestones`, { name: String(form.get("name") || ""), description: String(form.get("description") || "") || null, dueDate: String(form.get("dueDate") || "") || null, ownerUserId: String(form.get("ownerUserId") || "") || null, approvalRequired: form.get("approvalRequired") === "on" });
      if (subform === "DELIVERABLE") await professionalMutation(`/api/enterprise/${organizationId}/projects/${overview.id}/deliverables`, { milestoneId: String(form.get("milestoneId") || "") || null, name: String(form.get("name") || ""), description: String(form.get("description") || "") || null, ownerUserId: String(form.get("ownerUserId") || "") || null, dueDate: String(form.get("dueDate") || "") || null, documentId: String(form.get("documentId") || "") || null });
      if (subform === "RISK") await professionalMutation(`/api/enterprise/${organizationId}/projects/${overview.id}/risks`, { title: String(form.get("title") || ""), description: String(form.get("description") || ""), category: String(form.get("category") || "OTHER"), probability: String(form.get("probability") || "MEDIUM"), impact: String(form.get("impact") || "MEDIUM"), severity: String(form.get("severity") || "MEDIUM"), ownerUserId: String(form.get("ownerUserId") || "") || null, mitigationPlan: String(form.get("mitigationPlan") || "") || null, dueDate: String(form.get("dueDate") || "") || null });
      if (subform === "ISSUE") await professionalMutation(`/api/enterprise/${organizationId}/projects/${overview.id}/issues`, { title: String(form.get("title") || ""), description: String(form.get("description") || ""), issueType: String(form.get("issueType") || "OTHER"), priority: String(form.get("priority") || "NORMAL"), ownerUserId: String(form.get("ownerUserId") || "") || null, dueDate: String(form.get("dueDate") || "") || null });
      if (subform === "MEMBER") await professionalMutation(`/api/enterprise/${organizationId}/projects/${overview.id}/members`, { action: "ADD", employeeId: String(form.get("employeeId") || ""), role: String(form.get("role") || "MEMBER"), allocationPercent: Number(form.get("allocationPercent") || 100) });
      setSubform(null); await reloadOverview(); setMessage(t("projects.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("projects.elementCreateFailed"));
    } finally {
      setBusyAction("");
    }
  }

  function lifecycleActions(project: ProjectOverview): BusinessContextAction[] {
    if (!projects.canManage) return [];
    const byStatus: Record<string, ProjectAction[]> = {
      DRAFT: ["PLAN", "CANCEL"], PLANNED: ["START", "CANCEL"], ACTIVE: ["MARK_AT_RISK", "BLOCK", "COMPLETE", "CANCEL"], IN_PROGRESS: ["MARK_AT_RISK", "BLOCK", "COMPLETE", "CANCEL"], AT_RISK: ["RESUME", "BLOCK", "COMPLETE", "CANCEL"], BLOCKED: ["RESUME", "CANCEL"], COMPLETED: ["CLOSE"],
    };
    const iconByAction = { PLAN: Flag, START: PlayCircle, MARK_AT_RISK: AlertTriangle, BLOCK: PauseCircle, RESUME: PlayCircle, COMPLETE: CheckCircle2, CLOSE: CircleStop, CANCEL: XCircle } as const;
    return (byStatus[project.status] || []).map((action) => ({
      id: action.toLowerCase(),
      label: action === "PLAN" ? tr("Planifier", "Plan") : action === "START" ? tr("Démarrer", "Start") : action === "MARK_AT_RISK" ? tr("Marquer à risque", "Mark at risk") : action === "BLOCK" ? tr("Bloquer", "Block") : action === "RESUME" ? tr("Reprendre", "Resume") : action === "COMPLETE" ? tr("Terminer", "Complete") : action === "CLOSE" ? tr("Clôturer", "Close") : tr("Annuler", "Cancel"),
      icon: iconByAction[action], destructive: action === "CANCEL", disabled: Boolean(busyAction), onSelect: () => { setTransition({ action, project }); setTransitionComment(""); },
    }));
  }

  async function confirmTransition() {
    if (!transition || busyAction) return;
    const needsReason = ["MARK_AT_RISK", "BLOCK", "CANCEL"].includes(transition.action);
    if (needsReason && transitionComment.trim().length < 3) return;
    setBusyAction(`project-transition:${transition.project.id}`);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/projects/${transition.project.id}/transition`, { action: transition.action, revision: transition.project.revision, comment: transitionComment.trim() || null });
      setTransition(null); setTransitionComment(""); await reloadOverview(); setMessage(tr("Statut du projet mis à jour.", "Project status updated."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("Impossible de mettre à jour le projet.", "Unable to update project."));
    } finally {
      setBusyAction("");
    }
  }

  const transitionNeedsReason = Boolean(transition && ["MARK_AT_RISK", "BLOCK", "CANCEL"].includes(transition.action));

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={t("projects.eyebrow", { organization: organizationName })} title={t("projects.titleProjects")} description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${t("projects.descriptionSuffix")}`} count={t("projects.count", { count: projects.pagination.total, suffix: projects.pagination.total === 1 ? "" : "s" })} primaryAction={projects.canWrite ? <Button disabled={Boolean(busyAction)} onClick={() => setProjectOpen(true)}><Plus className="h-4 w-4" />{t("projects.newProject")}</Button> : undefined} />
    <ModuleMetrics label={t("projects.metrics")}><ModuleMetric label={t("projects.active")} value={projects.metrics.active || 0} /><ModuleMetric label={t("projects.overdue")} value={projects.metrics.overdue || 0} /><ModuleMetric label={t("projects.highRisks")} value={projects.metrics.highRisks || 0} /></ModuleMetrics>
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("projects.search")} />} controls={<NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={statusItems} />} summary={tr("Portefeuille, équipe, jalons, risques, incidents et livrables avec cycle de vie versionné.", "Portfolio, team, milestones, risks, issues and deliverables with a versioned lifecycle.")} />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold">{message}</div> : null}
      <ModuleSection title={t("projects.portfolio")} description={t("projects.portfolioDescription")}>
        {projects.error ? <ProfessionalError message={projects.error} /> : projects.loading ? <ProfessionalLoading /> : projects.items.length ? <>
          <BusinessList ariaLabel={t("projects.projectsAria")}>{projects.items.map((project) => <BusinessListItem key={project.id} title={`${project.reference} · ${project.name}`} leading={<Flag className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(project.status)}>{professionalErpEnumLabel(locale, "projectStatus", project.status)}</StatusBadge>} meta={`${professionalErpEnumLabel(locale, "projectType", project.projectType)} · ${professionalErpMoney(project.indicativeBudget, project.currency, locale)}`} description={`${t("projects.members", { count: project._count.members, suffix: project._count.members === 1 ? "" : "s" })} · ${t("projects.milestones", { count: project._count.milestones, suffix: project._count.milestones === 1 ? "" : "s" })} · ${t("projects.deliverables", { count: project._count.deliverables, suffix: project._count.deliverables === 1 ? "" : "s" })} · ${project.progressPercent}%`} onOpen={() => void openProject(project)} openLabel={t("projects.openProject", { reference: project.reference })} actions={<ContextActions label={t("projects.projectActions")} actions={[{ id: "open", label: t("projects.open"), icon: Eye, onSelect: () => void openProject(project) }]} />} />)}</BusinessList>
          <ProfessionalPager pagination={projects.pagination} onPageChange={setPage} locale={locale} />
        </> : <EmptyState compact title={t("projects.noProject")} description={t("projects.noProjectDescription")} />}
      </ModuleSection>
      <ProfessionalHelp moduleCode="PROJECTS_SERVICES" />
    </ModuleContent>

    <Dialog open={projectOpen} onClose={() => { if (!busyAction) setProjectOpen(false); }} title={t("projects.newProjectTitle")} presentation="editor" className="max-w-5xl">
      <form onSubmit={createProject} className="grid gap-5 p-4 sm:p-5">
        <ProfessionalFormSection title={t("projects.contextResponsibility")}><Field label={t("projects.name")}><Input name="name" required /></Field><Field label={t("projects.type")}><NativeSelect name="projectType" defaultValue="CLIENT" items={projectTypeItems} /></Field><Field label={t("projects.client")}><NativeSelect value={selectedPartyId} onChange={setSelectedPartyId} items={[{ id: "", label: t("projects.noClient") }, ...lookups.parties.map((party) => ({ id: party.id, label: `${party.code} · ${party.displayName || party.legalName}` }))]} /></Field><Field label={tr("Contrat", "Contract")}><NativeSelect name="contractId" items={[{ id: "", label: tr("Aucun contrat", "No contract") }, ...filteredContracts.map((contract) => ({ id: contract.id, label: `${contract.reference} · ${contract.title}` }))]} /></Field><Field label={t("projects.projectManager")}><NativeSelect name="ownerUserId" items={[{ id: "", label: t("projects.unassigned") }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label}${member.positionTitle ? ` · ${member.positionTitle}` : ""}` }))]} /></Field><Field label={t("projects.department")}><NativeSelect name="departmentId" items={[{ id: "", label: t("projects.none") }, ...lookups.departments.map((department) => ({ id: department.id, label: locale === "en" && department.labelEn ? department.labelEn : department.labelFr }))]} /></Field><Field label={t("projects.site")}><NativeSelect name="siteId" items={[{ id: "", label: t("projects.none") }, ...lookups.sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}` }))]} /></Field>{lookups.canReadBudgets ? <Field label={tr("Budget lié", "Linked budget")}><NativeSelect name="budgetId" items={[{ id: "", label: tr("Aucun budget", "No budget") }, ...lookups.budgets.map((budget) => ({ id: budget.id, label: `${budget.reference} · ${budget.title} · ${budget.currency}` }))]} /></Field> : null}<Field label={t("projects.description")}><textarea name="description" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field></ProfessionalFormSection>
        <ProfessionalFormSection title={t("projects.periodBudget")}><Field label={t("projects.start")}><Input name="startDate" type="date" /></Field><Field label={t("projects.targetEnd")}><Input name="targetEndDate" type="date" /></Field><Field label={t("projects.indicativeBudget")}><Input name="indicativeBudget" type="number" min="0" step="0.01" /></Field><Field label={t("projects.currency")}><Input name="currency" maxLength={3} defaultValue="USD" /></Field></ProfessionalFormSection>
        <ProfessionalFormSection title={t("projects.initialTeam")}><div className="md:col-span-2 grid gap-2">{lookups.employees.length ? lookups.employees.map((employee) => <label key={employee.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-dtsc-border px-3"><input type="checkbox" checked={selectedMembers.includes(employee.id)} onChange={(event) => setSelectedMembers((current) => event.target.checked ? [...current, employee.id] : current.filter((id) => id !== employee.id))} />{employee.employeeNumber} · {employee.displayName}</label>) : <p className="text-sm text-dtsc-muted">{tr("Aucun collaborateur actif disponible.", "No active employee available.")}</p>}</div></ProfessionalFormSection>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={() => setProjectOpen(false)}>{t("projects.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction)}>{busyAction === "create-project" ? tr("Création…", "Creating…") : t("projects.createProject")}</Button></div>
      </form>
    </Dialog>

    <Dialog open={Boolean(overview)} onClose={() => { if (!busyAction) { setOverview(null); setSubform(null); } }} title={overview ? `${overview.reference} · ${overview.name}` : t("projects.projectDetail")} presentation="editor" className="max-w-6xl">
      {overviewLoading ? <div className="p-5"><ProfessionalLoading /></div> : overview ? <div className="grid gap-6 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(overview.status)}>{professionalErpEnumLabel(locale, "projectStatus", overview.status)}</StatusBadge><StatusBadge>{overview.progressPercent}%</StatusBadge><StatusBadge>{professionalErpMoney(overview.indicativeBudget, overview.currency, locale)}</StatusBadge></div>
        <div data-responsive-actions className="flex flex-wrap gap-2">{projects.canWrite && isProjectEditableStatus(overview.status) ? <><Button variant="outline" disabled={Boolean(busyAction)} onClick={() => setSubform("MEMBER")}><UserPlus className="h-4 w-4" />{t("projects.addMember")}</Button><Button variant="outline" disabled={Boolean(busyAction)} onClick={() => setSubform("MILESTONE")}><Flag className="h-4 w-4" />{t("projects.addMilestone")}</Button><Button variant="outline" disabled={Boolean(busyAction)} onClick={() => setSubform("RISK")}><ShieldAlert className="h-4 w-4" />{t("projects.addRisk")}</Button><Button variant="outline" disabled={Boolean(busyAction)} onClick={() => setSubform("ISSUE")}><AlertTriangle className="h-4 w-4" />{tr("Ajouter un incident", "Add issue")}</Button><Button disabled={Boolean(busyAction)} onClick={() => setSubform("DELIVERABLE")}><Plus className="h-4 w-4" />{t("projects.addDeliverable")}</Button></> : null}{projects.canManage && lifecycleActions(overview).length ? <ContextActions label={tr("Cycle de vie du projet", "Project lifecycle")} actions={lifecycleActions(overview)} /> : null}</div>
        <ModuleSection title={t("projects.team")}><BusinessList ariaLabel={t("projects.teamAria")}>{overview.members.map((member) => <BusinessListItem key={member.id} title={`${member.employee.employeeNumber} · ${member.employee.displayName}`} status={<StatusBadge>{member.allocationPercent || 100}%</StatusBadge>} meta={member.role} description={member.employee.workEmail || t("projects.noWorkEmail")} />)}</BusinessList></ModuleSection>
        <EnterpriseProjectControlActions organizationId={organizationId} projectId={overview.id} locale={locale} milestones={overview.milestones} risks={overview.risks} issues={overview.issues} canWrite={projects.canWrite && isProjectEditableStatus(overview.status)} disabled={Boolean(busyAction)} onChanged={reloadOverview} onMessage={setMessage} />
        <ModuleSection title={t("projects.tabDeliverables")}><BusinessList ariaLabel={t("projects.deliverablesAria")}>{overview.deliverables.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.name}`} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "projectStatus", item.status)}</StatusBadge>} meta={item.dueDate ? professionalErpDate(item.dueDate, locale) : t("projects.noDueDate")} description={item.reviewComment || item.description || t("projects.noDescription")} />)}</BusinessList></ModuleSection>
      </div> : null}
    </Dialog>

    <Dialog open={Boolean(subform)} onClose={() => { if (!busyAction) setSubform(null); }} title={subform === "MILESTONE" ? t("projects.newMilestone") : subform === "DELIVERABLE" ? t("projects.newDeliverable") : subform === "RISK" ? t("projects.newRisk") : subform === "ISSUE" ? tr("Nouvel incident projet", "New project issue") : t("projects.addMember")} presentation="editor" className="max-w-4xl">
      {overview && subform ? <form onSubmit={createSubrecord} className="grid gap-5 p-4 sm:p-5"><ProfessionalFormSection title={t("projects.information")}>
        {subform === "MEMBER" ? <><Field label={t("projects.collaborator")}><NativeSelect name="employeeId" required items={[{ id: "", label: t("projects.select") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))]} /></Field><Field label={t("projects.projectRole")}><NativeSelect name="role" defaultValue="MEMBER" items={PROJECT_ROLES.map((role) => ({ id: role, label: role === "PROJECT_MANAGER" ? tr("Chef de projet", "Project manager") : role === "CONTRIBUTOR" ? tr("Contributeur", "Contributor") : role === "OBSERVER" ? tr("Observateur", "Observer") : tr("Membre", "Member") }))} /></Field><Field label={t("projects.capacityPercent")}><Input name="allocationPercent" type="number" min="1" max="100" defaultValue="100" required /></Field></> : <><Field label={subform === "RISK" || subform === "ISSUE" ? t("projects.title") : t("projects.name")}><Input name={subform === "RISK" || subform === "ISSUE" ? "title" : "name"} required /></Field><Field label={t("projects.description")}><textarea name="description" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" required={subform === "RISK" || subform === "ISSUE"} /></Field><Field label={t("projects.responsible")}><NativeSelect name="ownerUserId" items={[{ id: "", label: t("projects.unassigned") }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label}${member.positionTitle ? ` · ${member.positionTitle}` : ""}` }))]} /></Field><Field label={t("projects.dueDate")}><Input name="dueDate" type="date" /></Field></>}
        {subform === "MILESTONE" ? <Field label={t("projects.approval")}><label className="mt-3 flex min-h-11 items-center gap-2"><input name="approvalRequired" type="checkbox" />{t("projects.mandatoryApproval")}</label></Field> : null}
        {subform === "DELIVERABLE" ? <><Field label={t("projects.milestone")}><NativeSelect name="milestoneId" items={[{ id: "", label: t("projects.noMilestone") }, ...overview.milestones.map((milestone) => ({ id: milestone.id, label: `${milestone.reference} · ${milestone.name}` }))]} /></Field>{lookups.canReadDocuments ? <Field label={tr("Document lié", "Linked document")}><NativeSelect name="documentId" items={[{ id: "", label: tr("Aucun document", "No document") }, ...lookups.documents.map((document) => ({ id: document.id, label: `${document.documentType} · ${document.title}` }))]} /></Field> : null}</> : null}
        {subform === "RISK" ? <><Field label={t("projects.category")}><NativeSelect name="category" defaultValue="OTHER" items={RISK_CATEGORIES.map((value) => ({ id: value, label: value }))} /></Field><Field label={t("projects.probability")}><NativeSelect name="probability" defaultValue="MEDIUM" items={riskLevelItems} /></Field><Field label={t("projects.impact")}><NativeSelect name="impact" defaultValue="MEDIUM" items={riskLevelItems} /></Field><Field label={t("projects.severity")}><NativeSelect name="severity" defaultValue="MEDIUM" items={riskLevelItems} /></Field><Field label={t("projects.responsePlan")}><textarea name="mitigationPlan" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field></> : null}
        {subform === "ISSUE" ? <><Field label={tr("Type d’incident", "Issue type")}><NativeSelect name="issueType" defaultValue="OTHER" items={ISSUE_TYPES.map((value) => ({ id: value, label: value }))} /></Field><Field label={tr("Priorité", "Priority")}><NativeSelect name="priority" defaultValue="NORMAL" items={priorityItems} /></Field></> : null}
      </ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={() => setSubform(null)}>{t("projects.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction)}>{busyAction ? tr("Enregistrement…", "Saving…") : t("projects.save")}</Button></div></form> : null}
    </Dialog>

    <Dialog open={Boolean(transition)} onClose={() => { if (!busyAction) setTransition(null); }} title={tr("Revue du changement de statut", "Status change review")} presentation="editor" className="max-w-3xl">
      {transition ? <div className="grid gap-5 p-4 sm:p-5"><ProfessionalFormSection title={tr("Confirmer la transition", "Confirm transition")} description={tr("Cette action est versionnée, auditée et contrôlée côté serveur.", "This action is versioned, audited and controlled server-side.")}><div className="md:col-span-2 rounded-xl border border-dtsc-border bg-dtsc-page p-4"><p className="font-black">{transition.project.reference} · {transition.project.name}</p><p className="mt-1 text-sm text-dtsc-muted">{professionalErpEnumLabel(locale, "projectStatus", transition.project.status)} → {transition.action}</p></div>{transitionNeedsReason ? <Field label={tr("Motif", "Reason")}><textarea value={transitionComment} onChange={(event) => setTransitionComment(event.target.value)} rows={5} required className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field> : null}</ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={() => setTransition(null)}>{t("projects.cancel")}</Button><Button type="button" disabled={Boolean(busyAction) || (transitionNeedsReason && transitionComment.trim().length < 3)} onClick={() => void confirmTransition()}>{busyAction ? tr("Traitement…", "Processing…") : tr("Confirmer", "Confirm")}</Button></div></div> : null}
    </Dialog>
  </ModuleWorkspace>;
}
