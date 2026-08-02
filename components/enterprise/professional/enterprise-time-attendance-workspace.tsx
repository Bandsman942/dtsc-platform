"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, Clock3, Eye, Plus, XCircle } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
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
type Project = { id: string; reference: string; name: string; status: string };
type Lookups = { employees: Employee[]; members: Member[]; projects: Project[] };
type LeaveRequest = { id: string; reference: string; employeeId: string; leaveType: string; startDate: string; endDate: string; partialDay: boolean; status: string; reason: string | null; approverUserId: string | null; revision: number; employee: Employee };
type Timesheet = { id: string; reference: string; employeeId: string; periodStart: string; periodEnd: string; status: string; totalDeclaredMinutes: number; totalApprovedMinutes: number; approverUserId: string | null; revision: number; employee: Employee; entries: Array<{ id: string; workDate: string; declaredMinutes: number; approvedMinutes: number | null; projectId: string | null; serviceDescription: string | null; billable: boolean; notes: string | null }> };

const STATUS_LABELS: Record<string, string> = { DRAFT: "Brouillon", SUBMITTED: "Soumis", APPROVED: "Approuvé", REJECTED: "Refusé", CANCELLED: "Annulé", RETURNED: "Retourné pour correction", LOCKED: "Verrouillé" };
function statusTone(status: string) { if (["APPROVED", "LOCKED"].includes(status)) return "success" as const; if (["SUBMITTED", "RETURNED"].includes(status)) return "warning" as const; if (["REJECTED", "CANCELLED"].includes(status)) return "danger" as const; return "neutral" as const; }
function minutesLabel(minutes: number) { const hours = Math.floor(minutes / 60); const remaining = minutes % 60; return `${hours} h ${remaining.toString().padStart(2, "0")}`; }

export function EnterpriseTimeAttendanceWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const [tab, setTab] = useState("LEAVE");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ employees: [], members: [], projects: [] });
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [timesheetOpen, setTimesheetOpen] = useState(false);
  const [detail, setDetail] = useState<LeaveRequest | Timesheet | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/operational-lookups?module=TIME_ATTENDANCE`, { cache: "no-store" })
      .then(async (response) => { const body = await response.json().catch(() => null) as Lookups & { message?: string } | null; if (!response.ok || !body) throw new Error(body?.message || "Les sélecteurs de temps sont indisponibles."); if (active) setLookups({ employees: body.employees || [], members: body.members || [], projects: body.projects || [] }); })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Les sélecteurs de temps sont indisponibles."); });
    return () => { active = false; };
  }, [organizationId, refreshKey]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "25" }); if (status) value.set("status", status); return value; }, [page, status]);
  const leaves = useProfessionalCollection<LeaveRequest>({ endpoint: `/api/enterprise/${organizationId}/leave-requests`, params, refreshKey });
  const timesheets = useProfessionalCollection<Timesheet>({ endpoint: `/api/enterprise/${organizationId}/timesheets`, params, refreshKey });
  const activeCollection = tab === "LEAVE" ? leaves : timesheets;

  async function createLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const partialDay = form.get("partialDay") === "on";
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/leave-requests`, {
        employeeId: String(form.get("employeeId") || ""), leaveType: String(form.get("leaveType") || "ANNUAL"), startDate: String(form.get("startDate") || ""), endDate: String(form.get("endDate") || ""), partialDay,
        startMinute: partialDay ? Number(form.get("startMinute") || 0) : null, endMinute: partialDay ? Number(form.get("endMinute") || 1440) : null, reason: String(form.get("reason") || "") || null, approverUserId: String(form.get("approverUserId") || ""),
      });
      setLeaveOpen(false); setRefreshKey((value) => value + 1); setMessage("La demande de congé a été soumise. Les chevauchements sont vérifiés côté serveur.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "La demande de congé n’a pas pu être créée."); }
  }

  async function createTimesheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const workDate = String(form.get("workDate") || ""); const hours = Number(form.get("hours") || 0); const minutes = Number(form.get("minutes") || 0);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/timesheets`, {
        employeeId: String(form.get("employeeId") || ""), periodStart: String(form.get("periodStart") || ""), periodEnd: String(form.get("periodEnd") || ""), approverUserId: String(form.get("approverUserId") || ""),
        entries: [{ workDate, declaredMinutes: Math.round(hours * 60 + minutes), breakMinutes: Number(form.get("breakMinutes") || 0), projectId: String(form.get("projectId") || "") || null, serviceDescription: String(form.get("serviceDescription") || "") || null, billable: form.get("billable") === "on", notes: String(form.get("notes") || "") || null }],
      });
      setTimesheetOpen(false); setRefreshKey((value) => value + 1); setMessage("La feuille de temps a été soumise à validation.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "La feuille de temps n’a pas pu être créée."); }
  }

  async function decide(item: LeaveRequest | Timesheet, decision: "APPROVE" | "REJECT") {
    const endpoint = "leaveType" in item ? `leave-requests/${item.id}/decision` : `timesheets/${item.id}/decision`;
    try { await professionalMutation(`/api/enterprise/${organizationId}/${endpoint}`, { decision, revision: item.revision, comment: decision === "REJECT" ? "Retour motivé depuis le workspace professionnel" : undefined }); setDetail(null); setRefreshKey((value) => value + 1); setMessage(decision === "APPROVE" ? "L’élément a été approuvé." : "L’élément a été refusé avec traçabilité."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "La décision n’a pas pu être enregistrée."); }
  }

  const actionsFor = (item: LeaveRequest | Timesheet): BusinessContextAction[] => [{ id: "open", label: "Ouvrir", icon: Eye, onSelect: () => setDetail(item) }, ...(item.status === "SUBMITTED" ? [{ id: "approve", label: "Approuver", icon: CheckCircle2, onSelect: () => void decide(item, "APPROVE") }, { id: "reject", label: "Refuser", icon: XCircle, destructive: true, onSelect: () => void decide(item, "REJECT") }] : [])];

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={`Temps et absences · ${organizationName}`} title="Congés, présence et feuilles de temps" description={`${definition.descriptionFr} Disponibilité, absence, présence, temps déclaré, temps approuvé et paie restent des concepts distincts.`} count={`${leaves.pagination.total} congé${leaves.pagination.total > 1 ? "s" : ""} · ${timesheets.pagination.total} feuille${timesheets.pagination.total > 1 ? "s" : ""}`} primaryAction={<div data-responsive-actions><Button variant="outline" onClick={() => setLeaveOpen(true)}><CalendarDays className="h-4 w-4" />Demander un congé</Button><Button onClick={() => setTimesheetOpen(true)}><Clock3 className="h-4 w-4" />Déclarer du temps</Button></div>} />
    <ModuleMetrics label="Indicateurs temps et congés"><ModuleMetric label="Congés à traiter" value={leaves.metrics.pending || 0} /><ModuleMetric label="Congés approuvés" value={leaves.metrics.approved || 0} /><ModuleMetric label="Feuilles à traiter" value={timesheets.metrics.pending || 0} /><ModuleMetric label="Temps approuvé" value={minutesLabel(Number(timesheets.metrics.approvedMinutes || 0))} /></ModuleMetrics>
    <ModuleToolbar controls={<><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={[{ id: "LEAVE", label: "Congés", count: leaves.pagination.total }, { id: "TIMESHEETS", label: "Feuilles de temps", count: timesheets.pagination.total }]} /><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: "Tous les statuts" }, ...Object.entries(STATUS_LABELS).map(([id, label]) => ({ id, label }))]} /></>} summary="Les périodes approuvées peuvent être consommées par la paie, sans devenir la paie elle-même." />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold">{message}</div> : null}
      <ModuleSection title={tab === "LEAVE" ? "Demandes de congé" : "Feuilles de temps"} description={tab === "LEAVE" ? "Soumission, contrôle des chevauchements, approbation ou refus." : "Période, activité, projet, durée, soumission et validation indépendante."}>
        {activeCollection.error ? <ProfessionalError message={activeCollection.error} /> : activeCollection.loading ? <ProfessionalLoading /> : tab === "LEAVE" ? (leaves.items.length ? <BusinessList ariaLabel="Demandes de congé">{leaves.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.employee.displayName}`} leading={<CalendarDays className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{STATUS_LABELS[item.status] || item.status}</StatusBadge>} meta={`${item.leaveType} · du ${new Date(item.startDate).toLocaleDateString("fr-FR")} au ${new Date(item.endDate).toLocaleDateString("fr-FR")}`} description={item.reason || (item.partialDay ? "Demi-journée" : "Journée entière")} onOpen={() => setDetail(item)} actions={<ContextActions label="Actions du congé" actions={actionsFor(item)} />} />)}</BusinessList> : <EmptyState compact title="Aucune demande de congé" description="Les collaborateurs peuvent soumettre une demande sans mélanger absence et présence." />) : timesheets.items.length ? <BusinessList ariaLabel="Feuilles de temps">{timesheets.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.employee.displayName}`} leading={<Clock3 className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{STATUS_LABELS[item.status] || item.status}</StatusBadge>} meta={`${new Date(item.periodStart).toLocaleDateString("fr-FR")} – ${new Date(item.periodEnd).toLocaleDateString("fr-FR")}`} description={`${minutesLabel(item.totalDeclaredMinutes)} déclaré · ${minutesLabel(item.totalApprovedMinutes)} approuvé`} onOpen={() => setDetail(item)} actions={<ContextActions label="Actions de la feuille de temps" actions={actionsFor(item)} />} />)}</BusinessList> : <EmptyState compact title="Aucune feuille de temps" description="Déclarez une activité réelle, puis faites-la approuver avant toute utilisation en paie." />}
      </ModuleSection>
      <ProfessionalHelp moduleCode="TIME_ATTENDANCE" />
    </ModuleContent>

    <Dialog open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Nouvelle demande de congé" className="h-[94dvh] max-w-4xl"><form onSubmit={createLeave} className="grid gap-5"><ProfessionalFormSection title="Collaborateur et période"><Field label="Collaborateur"><NativeSelect name="employeeId" required items={[{ id: "", label: "Sélectionner" }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))]} /></Field><Field label="Type de congé"><NativeSelect name="leaveType" defaultValue="ANNUAL" items={[{ id: "ANNUAL", label: "Congé annuel" }, { id: "SICK", label: "Congé maladie" }, { id: "MATERNITY", label: "Congé maternité" }, { id: "PATERNITY", label: "Congé paternité" }, { id: "UNPAID", label: "Congé sans solde" }, { id: "OTHER", label: "Autre" }]} /></Field><Field label="Date de début"><Input name="startDate" type="date" required /></Field><Field label="Date de fin"><Input name="endDate" type="date" required /></Field><Field label="Approbateur"><NativeSelect name="approverUserId" required items={[{ id: "", label: "Sélectionner une autre personne" }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field><Field label="Demi-journée"><label className="mt-3 flex min-h-11 items-center gap-2"><input name="partialDay" type="checkbox" />La demande concerne une partie de la journée</label></Field><Field label="Début en minutes (facultatif)"><Input name="startMinute" type="number" min="0" max="1439" /></Field><Field label="Fin en minutes (facultatif)"><Input name="endMinute" type="number" min="1" max="1440" /></Field><Field label="Motif"><textarea name="reason" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setLeaveOpen(false)}>Annuler</Button><Button type="submit">Soumettre la demande</Button></div></form></Dialog>

    <Dialog open={timesheetOpen} onClose={() => setTimesheetOpen(false)} title="Nouvelle feuille de temps" className="h-[96dvh] max-w-4xl"><form onSubmit={createTimesheet} className="grid gap-5"><ProfessionalFormSection title="Période et validation"><Field label="Collaborateur"><NativeSelect name="employeeId" required items={[{ id: "", label: "Sélectionner" }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))]} /></Field><Field label="Début de période"><Input name="periodStart" type="date" required /></Field><Field label="Fin de période"><Input name="periodEnd" type="date" required /></Field><Field label="Approbateur"><NativeSelect name="approverUserId" required items={[{ id: "", label: "Sélectionner une autre personne" }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field></ProfessionalFormSection><ProfessionalFormSection title="Première activité"><Field label="Date travaillée"><Input name="workDate" type="date" required /></Field><Field label="Projet"><NativeSelect name="projectId" items={[{ id: "", label: "Activité hors projet" }, ...lookups.projects.map((project) => ({ id: project.id, label: `${project.reference} · ${project.name}` }))]} /></Field><Field label="Heures"><Input name="hours" type="number" min="0" max="24" step="1" defaultValue="1" required /></Field><Field label="Minutes"><Input name="minutes" type="number" min="0" max="59" step="1" defaultValue="0" /></Field><Field label="Pause en minutes"><Input name="breakMinutes" type="number" min="0" max="1440" defaultValue="0" /></Field><Field label="Description"><Input name="serviceDescription" required /></Field><Field label="Facturable"><label className="mt-3 flex min-h-11 items-center gap-2"><input name="billable" type="checkbox" />Temps facturable au client</label></Field><Field label="Notes"><Input name="notes" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setTimesheetOpen(false)}>Annuler</Button><Button type="submit">Soumettre la feuille</Button></div></form></Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.reference || "Détail"} className="h-[88dvh] max-w-4xl">{detail && "entries" in detail ? <div className="grid gap-4"><p className="text-sm text-dtsc-muted">{detail.employee.displayName} · {minutesLabel(detail.totalDeclaredMinutes)} déclaré</p><BusinessList ariaLabel="Entrées de temps">{detail.entries.map((entry) => <BusinessListItem key={entry.id} title={entry.serviceDescription || "Activité"} meta={new Date(entry.workDate).toLocaleDateString("fr-FR")} status={<StatusBadge>{minutesLabel(entry.declaredMinutes)}</StatusBadge>} description={`${entry.billable ? "Facturable" : "Non facturable"}${entry.notes ? ` · ${entry.notes}` : ""}`} />)}</BusinessList></div> : detail && "leaveType" in detail ? <div className="grid gap-3 text-sm leading-6"><p><strong>Collaborateur :</strong> {detail.employee.displayName}</p><p><strong>Période :</strong> du {new Date(detail.startDate).toLocaleDateString("fr-FR")} au {new Date(detail.endDate).toLocaleDateString("fr-FR")}</p><p><strong>Type :</strong> {detail.leaveType}</p><p><strong>Motif :</strong> {detail.reason || "Non renseigné"}</p></div> : null}</Dialog>
  </ModuleWorkspace>;
}
