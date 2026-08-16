"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Eye, Flag, Plus, Send, ShieldAlert, UserPlus, XCircle } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
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
  ProfessionalTabs,
  professionalMutation,
  useProfessionalCollection,
} from "@/components/enterprise/professional/professional-erp-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Employee = { id: string; employeeNumber: string; displayName: string };
type Member = { id: string; label: string; role: string; positionTitle: string | null };
type Party = { id: string; code: string; legalName: string; displayName: string | null; roles: Array<{ roleCode: string }> };
type Department = { id: string; departmentCode: string; labelFr: string };
type Site = { id: string; code: string; name: string };
type Lookups = { employees: Employee[]; members: Member[]; parties: Party[]; departments: Department[]; sites: Site[] };
type ProjectListItem = { id: string; reference: string; name: string; description: string | null; projectType: string; status: string; currency: string | null; indicativeBudget: string | number | null; startDate: string | null; targetEndDate: string | null; progressPercent: number; revision: number; _count: { members: number; milestones: number; deliverables: number; risks: number; issues: number } };
type ProjectOverview = ProjectListItem & {
  contract: { id: string; reference: string; title: string; status: string } | null;
  members: Array<{ id: string; role: string; allocationPercent: number | null; employee: Employee & { workEmail: string | null } }>;
  milestones: Array<{ id: string; reference: string; name: string; description: string | null; dueDate: string | null; status: string; approvalRequired: boolean; revision: number }>;
  deliverables: Array<{ id: string; reference: string; name: string; description: string | null; milestoneId: string | null; status: string; dueDate: string | null; ownerUserId: string | null; reviewComment: string | null; revision: number }>;
  risks: Array<{ id: string; reference: string; title: string; description: string; probability: string; impact: string; severity: string; status: string; mitigationPlan: string | null; dueDate: string | null }>;
  issues: Array<{ id: string; reference: string; title: string; description: string; priority: string; status: string; dueDate: string | null; resolution: string | null }>;
};

const PROJECT_STATUSES = ["DRAFT", "PLANNED", "ACTIVE", "IN_PROGRESS", "AT_RISK", "BLOCKED", "SUBMITTED", "CHANGES_REQUESTED", "ACCEPTED", "REJECTED", "COMPLETED", "CLOSED", "CANCELLED", "OPEN"];
const PROJECT_TYPES = ["CLIENT", "INTERNAL", "SERVICE", "IMPLEMENTATION"];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
function statusTone(status: string) {
  if (["ACTIVE", "ACCEPTED", "COMPLETED", "CLOSED"].includes(status)) return "success" as const;
  if (["PLANNED", "IN_PROGRESS", "SUBMITTED", "CHANGES_REQUESTED", "AT_RISK"].includes(status)) return "warning" as const;
  if (["BLOCKED", "REJECTED", "CANCELLED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

export function EnterpriseProjectsDeliverablesWorkspace({ organizationId, organizationName, definition, initialFocus = "PROJECTS" }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition; initialFocus?: "PROJECTS" | "DELIVERABLES" }) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const suffix = (count: number) => (count === 1 ? "" : "s");
  const memberLabel = (member: Member) => `${member.label} · ${member.positionTitle || professionalErpEnumLabel(locale, "role", member.role)}`;
  const projectRoleLabel = (role: string) => role === "MEMBER" ? professionalErpEnumLabel(locale, "projectRole", role) : role;
  const [tab, setTab] = useState(initialFocus);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ employees: [], members: [], parties: [], departments: [], sites: [] });
  const [projectOpen, setProjectOpen] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [subform, setSubform] = useState<"MILESTONE" | "DELIVERABLE" | "RISK" | "MEMBER" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/operational-lookups?module=${initialFocus === "DELIVERABLES" ? "TIME_DELIVERABLES" : "PROJECTS_SERVICES"}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Lookups & { message?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || t("projects.selectorsUnavailable"));
        if (active) setLookups({ employees: body.employees || [], members: body.members || [], parties: body.parties || [], departments: body.departments || [], sites: body.sites || [] });
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : t("projects.selectorsUnavailable")); });
    return () => { active = false; };
  }, [organizationId, initialFocus, refreshKey, locale]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "25" }); if (search.trim()) value.set("search", search.trim()); if (status) value.set("status", status); return value; }, [page, search, status]);
  const projects = useProfessionalCollection<ProjectListItem>({ endpoint: `/api/enterprise/${organizationId}/projects`, params, refreshKey });
  const allDeliverables = overview?.deliverables || [];
  const statusItems = [{ id: "", label: t("projects.allStatuses") }, ...PROJECT_STATUSES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "projectStatus", id) }))];
  const projectTypeItems = PROJECT_TYPES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "projectType", id) }));
  const riskLevelItems = RISK_LEVELS.map((id) => ({ id, label: professionalErpEnumLabel(locale, "riskLevel", id) }));

  async function openProject(project: ProjectListItem) {
    setOverviewLoading(true); setMessage("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/projects/${project.id}/overview`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { project?: ProjectOverview; message?: string } | null;
      if (!response.ok || !body?.project) throw new Error(body?.message || t("projects.openFailed"));
      setOverview(body.project);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("projects.openFailed")); }
    finally { setOverviewLoading(false); }
  }

  async function reloadOverview() {
    if (!overview) return;
    const response = await fetch(`/api/enterprise/${organizationId}/projects/${overview.id}/overview`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as { project?: ProjectOverview } | null;
    if (response.ok && body?.project) setOverview(body.project);
    setRefreshKey((value) => value + 1);
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/projects`, { name: String(form.get("name") || ""), description: String(form.get("description") || "") || null, projectType: String(form.get("projectType") || "CLIENT"), businessPartyId: String(form.get("businessPartyId") || "") || null, ownerUserId: String(form.get("ownerUserId") || "") || null, departmentId: String(form.get("departmentId") || "") || null, siteId: String(form.get("siteId") || "") || null, currency: String(form.get("currency") || "") || null, indicativeBudget: String(form.get("indicativeBudget") || "") ? Number(form.get("indicativeBudget")) : null, startDate: String(form.get("startDate") || "") || null, targetEndDate: String(form.get("targetEndDate") || "") || null, members: selectedMembers.map((employeeId) => ({ employeeId, role: "MEMBER", allocationPercent: 100 })) });
      setProjectOpen(false); setSelectedMembers([]); setRefreshKey((value) => value + 1); setMessage(t("projects.created"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("projects.createFailed")); }
  }

  async function createSubrecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!overview || !subform) return; const form = new FormData(event.currentTarget);
    try {
      if (subform === "MILESTONE") await professionalMutation(`/api/enterprise/${organizationId}/projects/${overview.id}/milestones`, { name: String(form.get("name") || ""), description: String(form.get("description") || "") || null, dueDate: String(form.get("dueDate") || "") || null, ownerUserId: String(form.get("ownerUserId") || "") || null, approvalRequired: form.get("approvalRequired") === "on" });
      if (subform === "DELIVERABLE") await professionalMutation(`/api/enterprise/${organizationId}/projects/${overview.id}/deliverables`, { milestoneId: String(form.get("milestoneId") || "") || null, name: String(form.get("name") || ""), description: String(form.get("description") || "") || null, ownerUserId: String(form.get("ownerUserId") || "") || null, dueDate: String(form.get("dueDate") || "") || null });
      if (subform === "RISK") await professionalMutation(`/api/enterprise/${organizationId}/projects/${overview.id}/risks`, { title: String(form.get("title") || ""), description: String(form.get("description") || ""), category: String(form.get("category") || "") || null, probability: String(form.get("probability") || "MEDIUM"), impact: String(form.get("impact") || "MEDIUM"), severity: String(form.get("severity") || "MEDIUM"), ownerUserId: String(form.get("ownerUserId") || "") || null, mitigationPlan: String(form.get("mitigationPlan") || "") || null, dueDate: String(form.get("dueDate") || "") || null });
      if (subform === "MEMBER") await professionalMutation(`/api/enterprise/${organizationId}/projects/${overview.id}/members`, { action: "ADD", employeeId: String(form.get("employeeId") || ""), role: String(form.get("role") || "MEMBER"), allocationPercent: Number(form.get("allocationPercent") || 100) });
      setSubform(null); await reloadOverview(); setMessage(t("projects.updated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("projects.elementCreateFailed")); }
  }

  async function transitionDeliverable(deliverable: ProjectOverview["deliverables"][number], action: "SUBMIT" | "ACCEPT" | "REQUEST_CHANGES" | "REJECT") {
    const comment = ["REQUEST_CHANGES", "REJECT"].includes(action) ? window.prompt(t("projects.reviewComment")) || t("projects.commentRequired") : t("projects.transitionValidated");
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/deliverables/${deliverable.id}/transition`, { action, revision: deliverable.revision, comment });
      await reloadOverview(); setMessage(action === "ACCEPT" ? t("projects.deliverableAccepted") : t("projects.deliverableUpdated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("projects.deliverableUpdateFailed")); }
  }

  function deliverableActions(item: ProjectOverview["deliverables"][number]): BusinessContextAction[] {
    return [
      { id: "submit", label: t("projects.submit"), icon: Send, disabled: item.status !== "DRAFT" && item.status !== "CHANGES_REQUESTED", onSelect: () => void transitionDeliverable(item, "SUBMIT") },
      { id: "accept", label: t("projects.accept"), icon: CheckCircle2, disabled: item.status !== "SUBMITTED", onSelect: () => void transitionDeliverable(item, "ACCEPT") },
      { id: "changes", label: t("projects.requestChanges"), icon: ShieldAlert, disabled: item.status !== "SUBMITTED", onSelect: () => void transitionDeliverable(item, "REQUEST_CHANGES") },
      { id: "reject", label: t("projects.reject"), icon: XCircle, destructive: true, disabled: item.status !== "SUBMITTED", onSelect: () => void transitionDeliverable(item, "REJECT") },
    ];
  }

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={t("projects.eyebrow", { organization: organizationName })} title={initialFocus === "DELIVERABLES" ? t("projects.titleDeliverables") : t("projects.titleProjects")} description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${t("projects.descriptionSuffix")}`} count={t("projects.count", { count: projects.pagination.total, suffix: suffix(projects.pagination.total) })} primaryAction={<Button onClick={() => setProjectOpen(true)}><Plus className="h-4 w-4" />{t("projects.newProject")}</Button>} />
    <ModuleMetrics label={t("projects.metrics")}><ModuleMetric label={t("projects.active")} value={projects.metrics.active || 0} /><ModuleMetric label={t("projects.overdue")} value={projects.metrics.overdue || 0} /><ModuleMetric label={t("projects.highRisks")} value={projects.metrics.highRisks || 0} /><ModuleMetric label={t("projects.openProjectDeliverables")} value={allDeliverables.length} /></ModuleMetrics>
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("projects.search")} />} controls={<><ProfessionalTabs value={tab} onChange={setTab} items={[{ id: "PROJECTS", label: t("projects.tabProjects"), count: projects.pagination.total }, { id: "DELIVERABLES", label: t("projects.tabDeliverables"), count: allDeliverables.length }]} /><NativeSelect value={status} onChange={setStatus} items={statusItems} /></>} summary={t("projects.summary")} />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold">{message}</div> : null}
      <ModuleSection title={tab === "PROJECTS" ? t("projects.portfolio") : t("projects.openDeliverables")} description={tab === "PROJECTS" ? t("projects.portfolioDescription") : t("projects.deliverablesDescription")}>
        {tab === "PROJECTS" ? (projects.error ? <ProfessionalError message={projects.error} /> : projects.loading ? <ProfessionalLoading /> : projects.items.length ? <BusinessList ariaLabel={t("projects.projectsAria")}>{projects.items.map((project) => <BusinessListItem key={project.id} title={`${project.reference} · ${project.name}`} leading={<Flag className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(project.status)}>{professionalErpEnumLabel(locale, "projectStatus", project.status)}</StatusBadge>} meta={`${professionalErpEnumLabel(locale, "projectType", project.projectType)} · ${professionalErpMoney(project.indicativeBudget, project.currency, locale)}`} description={`${t("projects.members", { count: project._count.members, suffix: suffix(project._count.members) })} · ${t("projects.milestones", { count: project._count.milestones, suffix: suffix(project._count.milestones) })} · ${t("projects.deliverables", { count: project._count.deliverables, suffix: suffix(project._count.deliverables) })} · ${project.progressPercent}%`} onOpen={() => void openProject(project)} openLabel={t("projects.openProject", { reference: project.reference })} actions={<ContextActions label={t("projects.projectActions")} actions={[{ id: "open", label: t("projects.open"), icon: Eye, onSelect: () => void openProject(project) }]} />} />)}</BusinessList> : <EmptyState compact title={t("projects.noProject")} description={t("projects.noProjectDescription")} />) : !overview ? <EmptyState compact title={t("projects.openAProject")} description={t("projects.openAProjectDescription")} /> : overview.deliverables.length ? <BusinessList ariaLabel={t("projects.deliverablesAria")}>{overview.deliverables.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.name}`} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "projectStatus", item.status)}</StatusBadge>} meta={item.dueDate ? t("projects.plannedOn", { date: professionalErpDate(item.dueDate, locale) }) : t("projects.noPlannedDate")} description={item.reviewComment || item.description || t("projects.noDescription")} actions={<ContextActions label={t("projects.deliverableActions")} actions={deliverableActions(item)} />} />)}</BusinessList> : <EmptyState compact title={t("projects.noDeliverable")} description={t("projects.noDeliverableDescription")} />}
      </ModuleSection>
      <ProfessionalHelp moduleCode={initialFocus === "DELIVERABLES" ? "TIME_DELIVERABLES" : "PROJECTS_SERVICES"} />
    </ModuleContent>

    <Dialog open={projectOpen} onClose={() => setProjectOpen(false)} title={t("projects.newProjectTitle")} className="h-[96dvh] max-w-5xl"><form onSubmit={createProject} className="grid gap-5"><ProfessionalFormSection title={t("projects.contextResponsibility")}><Field label={t("projects.name")}><Input name="name" required /></Field><Field label={t("projects.type")}><NativeSelect name="projectType" defaultValue="CLIENT" items={projectTypeItems} /></Field><Field label={t("projects.client")}><NativeSelect name="businessPartyId" items={[{ id: "", label: t("projects.noClient") }, ...lookups.parties.filter((party) => party.roles.some((role) => ["CUSTOMER", "PROSPECT"].includes(role.roleCode))).map((party) => ({ id: party.id, label: `${party.code} · ${party.displayName || party.legalName}` }))]} /></Field><Field label={t("projects.projectManager")}><NativeSelect name="ownerUserId" items={[{ id: "", label: t("projects.unassigned") }, ...lookups.members.map((member) => ({ id: member.id, label: memberLabel(member) }))]} /></Field><Field label={t("projects.department")}><NativeSelect name="departmentId" items={[{ id: "", label: t("projects.none") }, ...lookups.departments.map((department) => ({ id: department.id, label: department.labelFr }))]} /></Field><Field label={t("projects.site")}><NativeSelect name="siteId" items={[{ id: "", label: t("projects.none") }, ...lookups.sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}` }))]} /></Field><Field label={t("projects.description")}><textarea name="description" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("projects.periodBudget")}><Field label={t("projects.start")}><Input name="startDate" type="date" /></Field><Field label={t("projects.targetEnd")}><Input name="targetEndDate" type="date" /></Field><Field label={t("projects.indicativeBudget")}><Input name="indicativeBudget" type="number" min="0" step="0.01" /></Field><Field label={t("projects.currency")}><Input name="currency" maxLength={3} defaultValue="USD" /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("projects.initialTeam")}><div className="md:col-span-2 grid gap-2">{lookups.employees.map((employee) => <label key={employee.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-dtsc-border px-3"><input type="checkbox" checked={selectedMembers.includes(employee.id)} onChange={(event) => setSelectedMembers((current) => event.target.checked ? [...current, employee.id] : current.filter((id) => id !== employee.id))} />{employee.employeeNumber} · {employee.displayName}</label>)}</div></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setProjectOpen(false)}>{t("projects.cancel")}</Button><Button type="submit">{t("projects.createProject")}</Button></div></form></Dialog>

    <Dialog open={Boolean(overview)} onClose={() => { setOverview(null); setSubform(null); }} title={overview ? `${overview.reference} · ${overview.name}` : t("projects.projectDetail")} className="h-[96dvh] max-w-6xl">{overviewLoading ? <ProfessionalLoading /> : overview ? <div className="grid gap-6"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(overview.status)}>{professionalErpEnumLabel(locale, "projectStatus", overview.status)}</StatusBadge><StatusBadge>{overview.progressPercent}%</StatusBadge><StatusBadge>{professionalErpMoney(overview.indicativeBudget, overview.currency, locale)}</StatusBadge></div><div data-responsive-actions><Button variant="outline" onClick={() => setSubform("MEMBER")}><UserPlus className="h-4 w-4" />{t("projects.addMember")}</Button><Button variant="outline" onClick={() => setSubform("MILESTONE")}><Flag className="h-4 w-4" />{t("projects.addMilestone")}</Button><Button variant="outline" onClick={() => setSubform("RISK")}><ShieldAlert className="h-4 w-4" />{t("projects.addRisk")}</Button><Button onClick={() => setSubform("DELIVERABLE")}><Plus className="h-4 w-4" />{t("projects.addDeliverable")}</Button></div><ModuleSection title={t("projects.team")}><BusinessList ariaLabel={t("projects.teamAria")}>{overview.members.map((member) => <BusinessListItem key={member.id} title={`${member.employee.employeeNumber} · ${member.employee.displayName}`} status={<StatusBadge>{member.allocationPercent || 100}%</StatusBadge>} meta={projectRoleLabel(member.role)} description={member.employee.workEmail || t("projects.noWorkEmail")} />)}</BusinessList></ModuleSection><ModuleSection title={t("projects.milestonesTitle")}><BusinessList ariaLabel={t("projects.milestonesAria")}>{overview.milestones.map((milestone) => <BusinessListItem key={milestone.id} title={`${milestone.reference} · ${milestone.name}`} status={<StatusBadge tone={statusTone(milestone.status)}>{professionalErpEnumLabel(locale, "projectStatus", milestone.status)}</StatusBadge>} meta={milestone.dueDate ? professionalErpDate(milestone.dueDate, locale) : t("projects.noDueDate")} description={milestone.description || (milestone.approvalRequired ? t("projects.approvalRequired") : t("projects.approvalNotRequired"))} />)}</BusinessList></ModuleSection><ModuleSection title={t("projects.risks")}><BusinessList ariaLabel={t("projects.risksAria")}>{overview.risks.map((risk) => <BusinessListItem key={risk.id} title={`${risk.reference} · ${risk.title}`} status={<StatusBadge tone={risk.severity === "CRITICAL" || risk.severity === "HIGH" ? "danger" : "warning"}>{professionalErpEnumLabel(locale, "riskLevel", risk.severity)}</StatusBadge>} meta={t("projects.probabilityImpact", { probability: professionalErpEnumLabel(locale, "riskLevel", risk.probability), impact: professionalErpEnumLabel(locale, "riskLevel", risk.impact) })} description={risk.mitigationPlan || risk.description} />)}</BusinessList></ModuleSection><ModuleSection title={t("projects.tabDeliverables")}><BusinessList ariaLabel={t("projects.deliverablesAria")}>{overview.deliverables.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.name}`} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "projectStatus", item.status)}</StatusBadge>} meta={item.dueDate ? professionalErpDate(item.dueDate, locale) : t("projects.noDueDate")} description={item.reviewComment || item.description || t("projects.noDescription")} actions={<ContextActions label={t("projects.deliverableActions")} actions={deliverableActions(item)} />} />)}</BusinessList></ModuleSection></div> : null}</Dialog>

    <Dialog open={Boolean(subform)} onClose={() => setSubform(null)} title={subform === "MILESTONE" ? t("projects.newMilestone") : subform === "DELIVERABLE" ? t("projects.newDeliverable") : subform === "RISK" ? t("projects.newRisk") : t("projects.addMember")} className="h-[90dvh] max-w-4xl">{overview && subform ? <form onSubmit={createSubrecord} className="grid gap-5"><ProfessionalFormSection title={t("projects.information")}><Field label={subform === "RISK" ? t("projects.title") : subform === "MEMBER" ? t("projects.collaborator") : t("projects.name")}>{subform === "MEMBER" ? <NativeSelect name="employeeId" required items={[{ id: "", label: t("projects.select") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))]} /> : <Input name={subform === "RISK" ? "title" : "name"} required />}</Field>{subform === "MEMBER" ? <><Field label={t("projects.projectRole")}><Input name="role" /></Field><Field label={t("projects.capacityPercent")}><Input name="allocationPercent" type="number" min="1" max="100" defaultValue="100" required /></Field></> : <Field label={t("projects.description")}><textarea name="description" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" required={subform === "RISK"} /></Field>}{subform === "DELIVERABLE" ? <Field label={t("projects.milestone")}><NativeSelect name="milestoneId" items={[{ id: "", label: t("projects.noMilestone") }, ...overview.milestones.map((milestone) => ({ id: milestone.id, label: `${milestone.reference} · ${milestone.name}` }))]} /></Field> : null}{subform !== "MEMBER" ? <Field label={t("projects.responsible")}><NativeSelect name="ownerUserId" items={[{ id: "", label: t("projects.unassigned") }, ...lookups.members.map((member) => ({ id: member.id, label: memberLabel(member) }))]} /></Field> : null}{subform !== "MEMBER" ? <Field label={t("projects.dueDate")}><Input name="dueDate" type="date" /></Field> : null}{subform === "MILESTONE" ? <Field label={t("projects.approval")}><label className="mt-3 flex min-h-11 items-center gap-2"><input name="approvalRequired" type="checkbox" />{t("projects.mandatoryApproval")}</label></Field> : null}{subform === "RISK" ? <><Field label={t("projects.category")}><Input name="category" /></Field><Field label={t("projects.probability")}><NativeSelect name="probability" defaultValue="MEDIUM" items={riskLevelItems} /></Field><Field label={t("projects.impact")}><NativeSelect name="impact" defaultValue="MEDIUM" items={riskLevelItems} /></Field><Field label={t("projects.severity")}><NativeSelect name="severity" defaultValue="MEDIUM" items={riskLevelItems} /></Field><Field label={t("projects.responsePlan")}><textarea name="mitigationPlan" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field></> : null}</ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setSubform(null)}>{t("projects.cancel")}</Button><Button type="submit">{t("projects.save")}</Button></div></form> : null}</Dialog>
  </ModuleWorkspace>;
}
