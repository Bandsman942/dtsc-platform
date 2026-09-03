"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Ban, CalendarClock, CalendarDays, CheckCircle2, Clock3, Eye, UserCheck, XCircle } from "lucide-react";
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
  ProfessionalTabs,
  professionalMutation,
  useProfessionalCollection,
} from "@/components/enterprise/professional/professional-erp-ui";
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

type Employee = {
  id: string;
  employeeNumber: string;
  displayName: string;
  siteId?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
};
type Member = { userId: string; name: string; email: string; role: string; positionTitle: string | null };
type Project = { id: string; reference: string; name: string; status: string };
type Task = { id: string; title: string; status: string };
type Site = { id: string; code: string; name: string; siteType: string; timezone: string | null };
type Lookups = { employees: Employee[]; approvers: Member[]; projects: Project[]; tasks: Task[]; sites: Site[] };
type LeaveRequest = { id: string; reference: string; employeeId: string; leaveType: string; startDate: string; endDate: string; partialDay: boolean; status: string; reason: string | null; approverUserId: string | null; revision: number; canDecide: boolean; canCancel: boolean; employee: Employee };
type TimesheetEntry = { id: string; workDate: string; declaredMinutes: number; approvedMinutes: number | null; projectId: string | null; taskId?: string | null; serviceDescription: string | null; billable: boolean; notes: string | null };
type Timesheet = { id: string; reference: string; employeeId: string; periodStart: string; periodEnd: string; status: string; totalDeclaredMinutes: number; totalApprovedMinutes: number; approverUserId: string | null; revision: number; canDecide: boolean; employee: Employee; entries: TimesheetEntry[] };
type WorkSchedule = { id: string; employeeId: string; scheduleType: string; dayOfWeek: number | null; scheduleDate: string | null; startMinute: number; endMinute: number; breakMinutes: number; timezone: string; status: string; effectiveFrom: string; effectiveUntil: string | null; revision: number; employee: Employee };
type Attendance = { id: string; employeeId: string; attendanceDate: string; observedStartAt: string | null; observedEndAt: string | null; status: string; source: string; siteId: string | null; notes: string | null; revision: number; employee: Employee };
type DecisionTarget = { item: LeaveRequest | Timesheet; decision: "APPROVE" | "REJECT" };
type TimeTab = "SCHEDULES" | "ATTENDANCE" | "LEAVE" | "TIMESHEETS";

const TIME_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED", "RETURNED", "LOCKED"];
const LEAVE_TYPES = ["ANNUAL", "SICK", "MATERNITY", "PATERNITY", "UNPAID", "OTHER"];
const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "PARTIAL", "REMOTE"];
const DEFAULT_REJECTION_AUDIT_COMMENT = "Retour motivé depuis le workspace professionnel";

const copyByLocale = {
  fr: {
    schedules: "Horaires planifiés", attendance: "Présences", scheduleSection: "Horaires attendus", attendanceSection: "Présence observée",
    scheduleDescription: "Planifiez les heures attendues sans les transformer en présence ni en temps approuvé.",
    attendanceDescription: "Enregistrez ce qui a été observé. La présence reste distincte du temps déclaré et de la paie.",
    newSchedule: "Planifier un horaire", recordAttendance: "Enregistrer une présence", scheduleType: "Type de planning", weekly: "Hebdomadaire", date: "Date précise",
    day: "Jour de la semaine", days: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"], scheduleDate: "Date planifiée", start: "Heure de début", end: "Heure de fin",
    breakMinutes: "Pause (minutes)", timezone: "Fuseau horaire", effectiveFrom: "Applicable à partir du", effectiveUntil: "Applicable jusqu’au",
    attendanceDate: "Date de présence", attendanceStatus: "État observé", observedStart: "Arrivée observée", observedEnd: "Départ observé", site: "Site", notes: "Notes",
    saveSchedule: "Enregistrer l’horaire", saveAttendance: "Enregistrer la présence", noSchedule: "Aucun horaire planifié", noAttendance: "Aucune présence enregistrée",
    noScheduleDescription: "Les horaires attendus apparaîtront ici sans modifier les feuilles de temps.", noAttendanceDescription: "Les présences observées apparaîtront ici sans être converties automatiquement en temps travaillé.",
    activeSchedules: "Horaires actifs", observedPresence: "Présences observées", reviewDecision: "Revue de la décision", rejectionReason: "Motif du refus", decisionHelp: "Le refus doit être motivé et reste audité.",
    cancelLeave: "Annuler la demande", cancellationReason: "Motif d’annulation", cancellationHelp: "L’annulation conserve l’historique et ne supprime pas la demande.",
    endSchedule: "Clôturer l’horaire", endDate: "Dernier jour d’application", endReason: "Motif de clôture", endHelp: "La clôture conserve l’horaire dans l’historique. Créez ensuite son remplacement à partir du jour suivant.",
    scheduleSaved: "Horaire planifié.", attendanceSaved: "Présence enregistrée.", leaveCancelled: "Demande de congé annulée.", scheduleEnded: "Horaire clôturé. L’historique est conservé.",
    actionFailed: "L’opération n’a pas pu être terminée.", page: "Page", previous: "Précédent", next: "Suivant", task: "Tâche", outsideTask: "Sans tâche", employeePlanning: "Collaborateur et planification", observation: "Observation",
    noHours: "heures non renseignées", separation: "Planning ≠ présence ≠ temps déclaré ≠ temps approuvé ≠ paie.", noEmployee: "Aucun dossier collaborateur RH actif n’est disponible. Créez d’abord le dossier dans Ressources humaines.",
    noApprover: "Aucun validateur indépendant n’est disponible. Un autre membre actif doit recevoir le droit d’approuver Temps, présences et congés.", selectEmployee: "Choisir un collaborateur actif", selectApprover: "Choisir un validateur autorisé",
    siteTimezoneMissing: "Le site sélectionné n’a pas de fuseau horaire configuré. Configurez son fuseau avant d’enregistrer des heures locales.",
  },
  en: {
    schedules: "Planned schedules", attendance: "Attendance", scheduleSection: "Expected schedules", attendanceSection: "Observed attendance",
    scheduleDescription: "Plan expected hours without turning them into attendance or approved time.", attendanceDescription: "Record what was observed. Attendance remains separate from declared time and payroll.",
    newSchedule: "Plan a schedule", recordAttendance: "Record attendance", scheduleType: "Schedule type", weekly: "Weekly", date: "Specific date", day: "Day of week", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    scheduleDate: "Scheduled date", start: "Start time", end: "End time", breakMinutes: "Break (minutes)", timezone: "Timezone", effectiveFrom: "Effective from", effectiveUntil: "Effective until",
    attendanceDate: "Attendance date", attendanceStatus: "Observed status", observedStart: "Observed arrival", observedEnd: "Observed departure", site: "Site", notes: "Notes", saveSchedule: "Save schedule", saveAttendance: "Record attendance",
    noSchedule: "No planned schedule", noAttendance: "No attendance recorded", noScheduleDescription: "Expected schedules will appear here without modifying timesheets.", noAttendanceDescription: "Observed attendance will appear here without being automatically converted into worked time.",
    activeSchedules: "Active schedules", observedPresence: "Observed presence", reviewDecision: "Decision review", rejectionReason: "Rejection reason", decisionHelp: "A rejection must be justified and remains audited.", cancelLeave: "Cancel request", cancellationReason: "Cancellation reason", cancellationHelp: "Cancellation preserves history and does not delete the request.",
    endSchedule: "End schedule", endDate: "Last effective day", endReason: "Reason for ending", endHelp: "Ending keeps the schedule in history. Create its replacement from the next day.", scheduleSaved: "Schedule saved.", attendanceSaved: "Attendance recorded.", leaveCancelled: "Leave request cancelled.", scheduleEnded: "Schedule ended. History has been preserved.",
    actionFailed: "The operation could not be completed.", page: "Page", previous: "Previous", next: "Next", task: "Task", outsideTask: "No task", employeePlanning: "Employee and planning", observation: "Observation", noHours: "hours not provided", separation: "Schedule ≠ attendance ≠ declared time ≠ approved time ≠ payroll.",
    noEmployee: "No active HR employee record is available. Create the employee record in Human Resources first.", noApprover: "No independent approver is available. Another active member must receive approval rights for Time, attendance and leave.", selectEmployee: "Select an active employee", selectApprover: "Select an authorized approver", siteTimezoneMissing: "The selected site has no configured timezone. Configure it before recording local times.",
  },
} as const;

function statusTone(status: string) {
  if (["APPROVED", "LOCKED", "ACTIVE", "PRESENT", "REMOTE"].includes(status)) return "success" as const;
  if (["SUBMITTED", "RETURNED", "LATE", "PARTIAL"].includes(status)) return "warning" as const;
  if (["REJECTED", "CANCELLED", "ABSENT", "INACTIVE", "ENDED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

function timeToMinute(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function minuteToTime(value: number) {
  const bounded = Math.max(0, Math.min(1439, value));
  const hours = Math.floor(bounded / 60) % 24;
  const minutes = bounded % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function dateTimeIso(date: string, time: string) {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatObservedTime(value: string, locale: string, timezone?: string | null) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: timezone || "UTC" }).format(new Date(value));
}

function PaginationControls({ page, pageCount, onChange, copy }: { page: number; pageCount: number; onChange: (page: number) => void; copy: (typeof copyByLocale)["fr"] | (typeof copyByLocale)["en"] }) {
  if (pageCount <= 1) return null;
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dtsc-border pt-4"><span className="text-sm font-semibold text-dtsc-muted">{copy.page} {page}/{pageCount}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>{copy.previous}</Button><Button type="button" variant="outline" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>{copy.next}</Button></div></div>;
}

export function EnterpriseTimeAttendanceWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const copy = copyByLocale[locale === "en" ? "en" : "fr"];
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const memberLabel = (member: Member) => `${member.name || member.email} · ${member.positionTitle || professionalErpEnumLabel(locale, "role", member.role)}`;
  const employeeLabel = (employee: Employee) => `${employee.displayName} · ${employee.employeeNumber}`;
  const minutesLabel = (minutes: number) => t("time.minutesValue", { hours: Math.floor(minutes / 60), minutes: (minutes % 60).toString().padStart(2, "0") });

  const [tab, setTab] = useState<TimeTab>("SCHEDULES");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ employees: [], approvers: [], projects: [], tasks: [], sites: [] });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [timesheetOpen, setTimesheetOpen] = useState(false);
  const [detail, setDetail] = useState<LeaveRequest | Timesheet | WorkSchedule | Attendance | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<DecisionTarget | null>(null);
  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null);
  const [scheduleEndTarget, setScheduleEndTarget] = useState<WorkSchedule | null>(null);
  const [scheduleType, setScheduleType] = useState("WEEKLY");
  const [scheduleEmployeeId, setScheduleEmployeeId] = useState("");
  const [scheduleTimezone, setScheduleTimezone] = useState("");
  const [attendanceEmployeeId, setAttendanceEmployeeId] = useState("");
  const [attendanceSiteId, setAttendanceSiteId] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useToastMessage(notice, "success");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/hr-payroll-lookups?module=TIME_ATTENDANCE`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Partial<Lookups> & { message?: string; error?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || body?.error || t("time.selectorsUnavailable"));
        if (active) setLookups({ employees: body.employees || [], approvers: body.approvers || [], projects: body.projects || [], tasks: body.tasks || [], sites: body.sites || [] });
      })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : t("time.selectorsUnavailable")); });
    return () => { active = false; };
  }, [organizationId, refreshKey, locale]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (status && tab !== "SCHEDULES") value.set("status", status);
    return value;
  }, [page, status, tab]);
  const schedules = useProfessionalCollection<WorkSchedule>({ endpoint: `/api/enterprise/${organizationId}/work-schedules`, params, refreshKey });
  const attendance = useProfessionalCollection<Attendance>({ endpoint: `/api/enterprise/${organizationId}/attendance`, params, refreshKey });
  const leaves = useProfessionalCollection<LeaveRequest>({ endpoint: `/api/enterprise/${organizationId}/leave-requests`, params, refreshKey });
  const timesheets = useProfessionalCollection<Timesheet>({ endpoint: `/api/enterprise/${organizationId}/timesheets`, params, refreshKey });
  const activeCollection = tab === "SCHEDULES" ? schedules : tab === "ATTENDANCE" ? attendance : tab === "LEAVE" ? leaves : timesheets;

  const attendanceStatusItems = ATTENDANCE_STATUSES.map((id) => ({
    id,
    label: id === "PRESENT" ? (locale === "en" ? "Present" : "Présent") : id === "ABSENT" ? (locale === "en" ? "Absent" : "Absent") : id === "LATE" ? (locale === "en" ? "Late" : "En retard") : id === "PARTIAL" ? (locale === "en" ? "Partial" : "Partiel") : (locale === "en" ? "Remote" : "À distance"),
  }));
  const currentStatusItems = tab === "ATTENDANCE"
    ? [{ id: "", label: t("people.allStatuses") }, ...attendanceStatusItems]
    : [{ id: "", label: t("people.allStatuses") }, ...TIME_STATUSES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "timeStatus", id) }))];
  const leaveTypeItems = LEAVE_TYPES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "leaveType", id) }));

  function selectScheduleEmployee(employeeId: string) {
    setScheduleEmployeeId(employeeId);
    const employee = lookups.employees.find((item) => item.id === employeeId);
    const site = lookups.sites.find((item) => item.id === employee?.siteId);
    setScheduleTimezone(site?.timezone || "");
  }

  function selectAttendanceEmployee(employeeId: string) {
    setAttendanceEmployeeId(employeeId);
    const employee = lookups.employees.find((item) => item.id === employeeId);
    setAttendanceSiteId(employee?.siteId || "");
  }

  async function runMutation(action: string, endpoint: string, payload: unknown, success: string) {
    if (busyAction) return false;
    setBusyAction(action);
    setError("");
    setNotice("");
    try {
      await professionalMutation(endpoint, payload);
      setRefreshKey((value) => value + 1);
      setNotice(success);
      return true;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : copy.actionFailed);
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startTime = String(form.get("startTime") || "");
    const endTime = String(form.get("endTime") || "");
    const effectiveFrom = String(form.get("effectiveFrom") || "");
    if (!scheduleEmployeeId) return setError(copy.noEmployee);
    if (!scheduleTimezone) return setError(copy.siteTimezoneMissing);
    if (!effectiveFrom) return setError(locale === "en" ? "Enter the schedule effective date." : "Renseignez la date de début d’application de l’horaire.");
    if (!startTime || !endTime || timeToMinute(endTime) <= timeToMinute(startTime)) return setError(locale === "en" ? "End time must be after start time." : "L’heure de fin doit être postérieure à l’heure de début.");
    const ok = await runMutation("schedule-create", `/api/enterprise/${organizationId}/work-schedules`, {
      employeeId: scheduleEmployeeId,
      scheduleType,
      dayOfWeek: scheduleType === "WEEKLY" ? Number(form.get("dayOfWeek") || 1) : null,
      scheduleDate: scheduleType === "DATE" ? String(form.get("scheduleDate") || "") : null,
      startMinute: timeToMinute(startTime),
      endMinute: timeToMinute(endTime),
      breakMinutes: Number(form.get("breakMinutes") || 0),
      timezone: scheduleTimezone,
      effectiveFrom,
      effectiveUntil: String(form.get("effectiveUntil") || "") || null,
    }, copy.scheduleSaved);
    if (ok) { setScheduleOpen(false); setScheduleEmployeeId(""); setScheduleTimezone(""); }
  }

  async function createAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const attendanceDate = String(form.get("attendanceDate") || "");
    const observedStart = String(form.get("observedStart") || "");
    const observedEnd = String(form.get("observedEnd") || "");
    const selectedSite = lookups.sites.find((item) => item.id === attendanceSiteId);
    if (!attendanceEmployeeId) return setError(copy.noEmployee);
    if (!attendanceDate) return setError(locale === "en" ? "Enter the attendance date." : "Renseignez la date de présence.");
    if ((observedStart || observedEnd) && (!observedStart || !observedEnd)) return setError(locale === "en" ? "Enter both observed arrival and departure times." : "Renseignez ensemble l’heure d’arrivée et l’heure de départ observées.");
    if (observedStart && observedEnd && timeToMinute(observedEnd) <= timeToMinute(observedStart)) return setError(locale === "en" ? "Observed departure must be after arrival." : "Le départ observé doit être postérieur à l’arrivée.");
    if ((observedStart || observedEnd) && !selectedSite?.timezone) return setError(copy.siteTimezoneMissing);
    const ok = await runMutation("attendance-create", `/api/enterprise/${organizationId}/attendance`, {
      employeeId: attendanceEmployeeId,
      attendanceDate,
      observedStartMinute: observedStart ? timeToMinute(observedStart) : null,
      observedEndMinute: observedEnd ? timeToMinute(observedEnd) : null,
      status: String(form.get("status") || "PRESENT"),
      source: "MANUAL",
      siteId: attendanceSiteId || null,
      notes: String(form.get("notes") || "") || null,
    }, copy.attendanceSaved);
    if (ok) { setAttendanceOpen(false); setAttendanceEmployeeId(""); setAttendanceSiteId(""); }
  }

  async function createLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const employeeId = String(form.get("employeeId") || "");
    const approverUserId = String(form.get("approverUserId") || "");
    const startDate = String(form.get("startDate") || "");
    const endDate = String(form.get("endDate") || "");
    const partialDay = form.get("partialDay") === "on";
    if (!employeeId) return setError(copy.noEmployee);
    if (!approverUserId) return setError(copy.noApprover);
    if (!startDate || !endDate) return setError(locale === "en" ? "Enter both leave dates." : "Renseignez les deux dates du congé.");
    if (endDate < startDate) return setError(locale === "en" ? "Leave end date cannot be before its start date." : "La date de fin du congé ne peut pas précéder sa date de début.");
    if (partialDay) {
      const partialStart = String(form.get("partialStart") || "");
      const partialEnd = String(form.get("partialEnd") || "");
      if (!partialStart || !partialEnd || timeToMinute(partialEnd) <= timeToMinute(partialStart)) return setError(locale === "en" ? "For partial leave, enter a valid start and end time." : "Pour un congé partiel, renseignez des heures de début et de fin valides.");
    }
    const ok = await runMutation("leave-create", `/api/enterprise/${organizationId}/leave-requests`, {
      employeeId,
      leaveType: String(form.get("leaveType") || "ANNUAL"),
      startDate,
      endDate,
      partialDay,
      startMinute: partialDay ? timeToMinute(String(form.get("partialStart") || "")) : null,
      endMinute: partialDay ? timeToMinute(String(form.get("partialEnd") || "")) : null,
      reason: String(form.get("reason") || "") || null,
      approverUserId,
    }, t("time.leaveSubmitted"));
    if (ok) setLeaveOpen(false);
  }

  async function createTimesheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const employeeId = String(form.get("employeeId") || "");
    const approverUserId = String(form.get("approverUserId") || "");
    const periodStart = String(form.get("periodStart") || "");
    const periodEnd = String(form.get("periodEnd") || "");
    const workDate = String(form.get("workDate") || "");
    const startTime = String(form.get("startTime") || "");
    const endTime = String(form.get("endTime") || "");
    const breakMinutes = Number(form.get("breakMinutes") || 0);
    if (!employeeId) return setError(copy.noEmployee);
    if (!approverUserId) return setError(copy.noApprover);
    if (!periodStart || !periodEnd || periodEnd < periodStart) return setError(locale === "en" ? "Enter a valid timesheet period." : "Renseignez une période de feuille de temps valide.");
    if (!workDate || workDate < periodStart || workDate > periodEnd) return setError(locale === "en" ? "The activity date must fall within the timesheet period." : "La date travaillée doit appartenir à la période de la feuille de temps.");
    const rawMinutes = timeToMinute(endTime) - timeToMinute(startTime) - breakMinutes;
    if (!startTime || !endTime || rawMinutes <= 0) return setError(locale === "en" ? "Enter valid work start, end and break times." : "Renseignez des heures de début, de fin et de pause cohérentes.");
    if (!String(form.get("serviceDescription") || "").trim()) return setError(locale === "en" ? "Describe the activity that was actually performed." : "Décrivez l’activité réellement effectuée.");
    const ok = await runMutation("timesheet-create", `/api/enterprise/${organizationId}/timesheets`, {
      employeeId,
      periodStart,
      periodEnd,
      approverUserId,
      entries: [{
        workDate,
        startAt: dateTimeIso(workDate, startTime),
        endAt: dateTimeIso(workDate, endTime),
        declaredMinutes: rawMinutes,
        breakMinutes,
        projectId: String(form.get("projectId") || "") || null,
        taskId: String(form.get("taskId") || "") || null,
        serviceDescription: String(form.get("serviceDescription") || "").trim(),
        billable: form.get("billable") === "on",
        notes: String(form.get("notes") || "") || null,
      }],
    }, t("time.timesheetSubmitted"));
    if (ok) setTimesheetOpen(false);
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decisionTarget) return;
    const form = new FormData(event.currentTarget);
    const comment = String(form.get("comment") || "").trim();
    if (decisionTarget.decision === "REJECT" && !comment) return setError(copy.decisionHelp);
    const item = decisionTarget.item;
    const endpoint = "leaveType" in item ? `leave-requests/${item.id}/decision` : `timesheets/${item.id}/decision`;
    const ok = await runMutation(`decision-${item.id}`, `/api/enterprise/${organizationId}/${endpoint}`, {
      decision: decisionTarget.decision,
      revision: item.revision,
      comment: comment || (decisionTarget.decision === "REJECT" ? DEFAULT_REJECTION_AUDIT_COMMENT : null),
    }, decisionTarget.decision === "APPROVE" ? t("time.itemApproved") : t("time.itemRejected"));
    if (ok) { setDecisionTarget(null); setDetail(null); }
  }

  async function cancelLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancelTarget) return;
    const reason = String(new FormData(event.currentTarget).get("reason") || "").trim();
    if (!reason) return setError(locale === "en" ? "Enter a cancellation reason." : "Renseignez le motif d’annulation.");
    const ok = await runMutation(`leave-cancel-${cancelTarget.id}`, `/api/enterprise/${organizationId}/leave-requests/${cancelTarget.id}/cancel`, { revision: cancelTarget.revision, reason }, copy.leaveCancelled);
    if (ok) { setCancelTarget(null); setDetail(null); }
  }

  async function endSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scheduleEndTarget) return;
    const data = new FormData(event.currentTarget);
    const reason = String(data.get("reason") || "").trim();
    const effectiveUntil = String(data.get("effectiveUntil") || "");
    if (!reason || !effectiveUntil) return setError(locale === "en" ? "Enter the last effective date and the reason for ending this schedule." : "Renseignez le dernier jour d’application et le motif de clôture de l’horaire.");
    const ok = await runMutation(`schedule-end-${scheduleEndTarget.id}`, `/api/enterprise/${organizationId}/work-schedules/${scheduleEndTarget.id}/end`, { revision: scheduleEndTarget.revision, effectiveUntil, reason }, copy.scheduleEnded);
    if (ok) { setScheduleEndTarget(null); setDetail(null); }
  }

  const actionsFor = (item: LeaveRequest | Timesheet): BusinessContextAction[] => [
    { id: "open", label: t("people.open"), icon: Eye, onSelect: () => setDetail(item) },
    ...(item.canDecide ? [
      { id: "approve", label: t("people.approve"), icon: CheckCircle2, onSelect: () => setDecisionTarget({ item, decision: "APPROVE" as const }) },
      { id: "reject", label: t("people.refuse"), icon: XCircle, destructive: true, onSelect: () => setDecisionTarget({ item, decision: "REJECT" as const }) },
    ] : []),
    ...("leaveType" in item && item.canCancel ? [{ id: "cancel", label: copy.cancelLeave, icon: Ban, destructive: true, onSelect: () => setCancelTarget(item) }] : []),
  ];

  const tabs = [
    { id: "SCHEDULES" as const, label: copy.schedules, count: schedules.pagination.total },
    { id: "ATTENDANCE" as const, label: copy.attendance, count: attendance.pagination.total },
    { id: "LEAVE" as const, label: t("time.leavesTab"), count: leaves.pagination.total },
    { id: "TIMESHEETS" as const, label: t("time.timesheetsTab"), count: timesheets.pagination.total },
  ];

  const employeeItems = [{ id: "", label: lookups.employees.length ? copy.selectEmployee : copy.noEmployee }, ...lookups.employees.map((employee) => ({ id: employee.id, label: employeeLabel(employee) }))];
  const approverItems = [{ id: "", label: lookups.approvers.length ? copy.selectApprover : copy.noApprover }, ...lookups.approvers.map((member) => ({ id: member.userId, label: memberLabel(member) }))];

  return <ModuleWorkspace>
    <ModuleHeader
      eyebrow={t("time.eyebrow", { organization: organizationName })}
      title={t("time.title")}
      description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${copy.separation}`}
      count={`${schedules.pagination.total + attendance.pagination.total + leaves.pagination.total + timesheets.pagination.total}`}
      primaryAction={<div data-responsive-actions>
        {tab === "SCHEDULES" ? <Button onClick={() => { setError(""); setScheduleOpen(true); }}><CalendarClock className="h-4 w-4" />{copy.newSchedule}</Button> : null}
        {tab === "ATTENDANCE" ? <Button onClick={() => { setError(""); setAttendanceOpen(true); }}><UserCheck className="h-4 w-4" />{copy.recordAttendance}</Button> : null}
        {tab === "LEAVE" ? <Button onClick={() => { setError(""); setLeaveOpen(true); }}><CalendarDays className="h-4 w-4" />{t("time.requestLeave")}</Button> : null}
        {tab === "TIMESHEETS" ? <Button onClick={() => { setError(""); setTimesheetOpen(true); }}><Clock3 className="h-4 w-4" />{t("time.declareTime")}</Button> : null}
      </div>}
    />
    <ModuleMetrics label={t("time.metrics")}>
      <ModuleMetric label={copy.activeSchedules} value={schedules.metrics.active || 0} />
      <ModuleMetric label={copy.observedPresence} value={attendance.metrics.present || 0} />
      <ModuleMetric label={t("time.leavePending")} value={leaves.metrics.pending || 0} />
      <ModuleMetric label={t("time.approvedTime")} value={minutesLabel(Number(timesheets.metrics.approvedMinutes || 0))} />
    </ModuleMetrics>
    <ModuleToolbar controls={<><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={tabs} />{tab !== "SCHEDULES" ? <NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={currentStatusItems} /> : null}</>} summary={copy.separation} />
    <ModuleContent>
      {error && !scheduleOpen && !attendanceOpen && !leaveOpen && !timesheetOpen && !decisionTarget && !cancelTarget && !scheduleEndTarget ? <ProfessionalError message={error} /> : null}
      <ModuleSection title={tab === "SCHEDULES" ? copy.scheduleSection : tab === "ATTENDANCE" ? copy.attendanceSection : tab === "LEAVE" ? t("time.leaveSection") : t("time.timesheetSection")} description={tab === "SCHEDULES" ? copy.scheduleDescription : tab === "ATTENDANCE" ? copy.attendanceDescription : tab === "LEAVE" ? t("time.leaveSectionDescription") : t("time.timesheetSectionDescription")}>
        {activeCollection.error ? <ProfessionalError message={activeCollection.error} /> : activeCollection.loading ? <ProfessionalLoading /> : tab === "SCHEDULES" ? (
          schedules.items.length ? <BusinessList ariaLabel={copy.scheduleSection}>{schedules.items.map((item) => {
            const day = item.scheduleType === "WEEKLY" ? copy.days[Math.max(0, (item.dayOfWeek || 1) - 1)] : (item.scheduleDate ? professionalErpDate(item.scheduleDate, locale) : copy.date);
            return <BusinessListItem key={item.id} title={employeeLabel(item.employee)} leading={<CalendarClock className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{item.status === "ACTIVE" ? (locale === "en" ? "Active" : "Actif") : item.status === "ENDED" ? (locale === "en" ? "Ended" : "Clôturé") : item.status}</StatusBadge>} meta={`${day} · ${minuteToTime(item.startMinute)}–${minuteToTime(item.endMinute)} · ${item.breakMinutes} min`} description={`${professionalErpDate(item.effectiveFrom, locale)}${item.effectiveUntil ? ` – ${professionalErpDate(item.effectiveUntil, locale)}` : ""} · ${item.timezone}`} onOpen={() => setDetail(item)} actions={<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setDetail(item)}><Eye className="h-4 w-4" />{t("people.details")}</Button>{schedules.canManage && item.status === "ACTIVE" ? <Button size="sm" variant="outline" onClick={() => { setError(""); setScheduleEndTarget(item); }}><Ban className="h-4 w-4" />{copy.endSchedule}</Button> : null}</div>} />;
          })}</BusinessList> : <EmptyState compact title={copy.noSchedule} description={copy.noScheduleDescription} />
        ) : tab === "ATTENDANCE" ? (
          attendance.items.length ? <BusinessList ariaLabel={copy.attendanceSection}>{attendance.items.map((item) => {
            const site = lookups.sites.find((entry) => entry.id === item.siteId) || lookups.sites.find((entry) => entry.id === item.employee.siteId);
            const observed = item.observedStartAt && item.observedEndAt ? `${professionalErpDate(item.attendanceDate, locale)} · ${formatObservedTime(item.observedStartAt, locale, site?.timezone)}–${formatObservedTime(item.observedEndAt, locale, site?.timezone)}` : `${professionalErpDate(item.attendanceDate, locale)} · ${copy.noHours}`;
            return <BusinessListItem key={item.id} title={employeeLabel(item.employee)} leading={<UserCheck className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{attendanceStatusItems.find((entry) => entry.id === item.status)?.label || item.status}</StatusBadge>} meta={observed} description={item.notes || `Source: ${item.source}`} onOpen={() => setDetail(item)} actions={<Button size="sm" variant="outline" onClick={() => setDetail(item)}><Eye className="h-4 w-4" />{t("people.details")}</Button>} />;
          })}</BusinessList> : <EmptyState compact title={copy.noAttendance} description={copy.noAttendanceDescription} />
        ) : tab === "LEAVE" ? (
          leaves.items.length ? <BusinessList ariaLabel={t("time.leaveSection")}>{leaves.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.employee.displayName}`} leading={<CalendarDays className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "timeStatus", item.status)}</StatusBadge>} meta={t("time.leaveRange", { type: professionalErpEnumLabel(locale, "leaveType", item.leaveType), start: professionalErpDate(item.startDate, locale), end: professionalErpDate(item.endDate, locale) })} description={item.reason || (item.partialDay ? t("time.halfDay") : t("time.fullDay"))} onOpen={() => setDetail(item)} actions={<ContextActions label={t("time.leaveActions")} actions={actionsFor(item)} />} />)}</BusinessList> : <EmptyState compact title={t("time.noLeave")} description={t("time.noLeaveDescription")} />
        ) : timesheets.items.length ? <BusinessList ariaLabel={t("time.timesheetSection")}>{timesheets.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.employee.displayName}`} leading={<Clock3 className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "timeStatus", item.status)}</StatusBadge>} meta={`${professionalErpDate(item.periodStart, locale)} – ${professionalErpDate(item.periodEnd, locale)}`} description={t("time.declaredApproved", { declared: minutesLabel(item.totalDeclaredMinutes), approved: minutesLabel(item.totalApprovedMinutes) })} onOpen={() => setDetail(item)} actions={<ContextActions label={t("time.timesheetActions")} actions={actionsFor(item)} />} />)}</BusinessList> : <EmptyState compact title={t("time.noTimesheet")} description={t("time.noTimesheetDescription")} />}
        <PaginationControls page={activeCollection.pagination.page} pageCount={activeCollection.pagination.pageCount} onChange={setPage} copy={copy} />
      </ModuleSection>
      <ProfessionalHelp moduleCode="TIME_ATTENDANCE" />
    </ModuleContent>

    <Dialog open={scheduleOpen} onClose={() => { if (!busyAction) setScheduleOpen(false); }} title={copy.newSchedule} description={copy.scheduleDescription} presentation="editor" className="h-[96dvh] max-w-4xl">
      <form onSubmit={createSchedule} className="grid gap-5">
        {error ? <ProfessionalError message={error} /> : null}
        {lookups.employees.length === 0 ? <ProfessionalError message={copy.noEmployee} /> : null}
        <ProfessionalFormSection title={copy.employeePlanning} description={locale === "en" ? "The selected employee's site timezone is used automatically." : "Le fuseau du site du collaborateur sélectionné est repris automatiquement."}>
          <Field label={t("time.employee")}><NativeSelect name="employeeId" value={scheduleEmployeeId} onChange={selectScheduleEmployee} required disabled={lookups.employees.length === 0} items={employeeItems} /></Field>
          <Field label={copy.scheduleType}><NativeSelect value={scheduleType} onChange={setScheduleType} required items={[{ id: "WEEKLY", label: copy.weekly }, { id: "DATE", label: copy.date }]} /></Field>
          {scheduleType === "WEEKLY" ? <Field label={copy.day}><NativeSelect name="dayOfWeek" defaultValue="1" required items={copy.days.map((label, index) => ({ id: String(index + 1), label }))} /></Field> : <Field label={copy.scheduleDate}><Input name="scheduleDate" type="date" required /></Field>}
          <Field label={copy.start}><Input name="startTime" type="time" defaultValue="08:00" required /></Field>
          <Field label={copy.end}><Input name="endTime" type="time" defaultValue="17:00" required /></Field>
          <Field label={copy.breakMinutes}><Input name="breakMinutes" type="number" min="0" max="1439" defaultValue="60" /></Field>
          <Field label={copy.timezone} required help={scheduleTimezone ? (locale === "en" ? "Prefilled from the selected employee's site." : "Prérempli depuis le site du collaborateur sélectionné.") : copy.siteTimezoneMissing}><Input name="timezone" value={scheduleTimezone} readOnly required /></Field>
          <Field label={copy.effectiveFrom}><Input name="effectiveFrom" type="date" required /></Field>
          <Field label={copy.effectiveUntil}><Input name="effectiveUntil" type="date" /></Field>
        </ProfessionalFormSection>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Button type="button" variant="outline" onClick={() => setScheduleOpen(false)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction) || !lookups.employees.length || !scheduleTimezone} aria-busy={Boolean(busyAction)}>{copy.saveSchedule}</Button></div>
      </form>
    </Dialog>

    <Dialog open={attendanceOpen} onClose={() => { if (!busyAction) setAttendanceOpen(false); }} title={copy.recordAttendance} description={copy.attendanceDescription} presentation="editor" className="h-[94dvh] max-w-4xl">
      <form onSubmit={createAttendance} className="grid gap-5">
        {error ? <ProfessionalError message={error} /> : null}
        {lookups.employees.length === 0 ? <ProfessionalError message={copy.noEmployee} /> : null}
        <ProfessionalFormSection title={copy.observation} description={locale === "en" ? "Selecting an employee prefills their current HR site. Attendance remains separate from timesheets." : "La sélection du collaborateur préremplit son site RH actuel. La présence reste distincte de la feuille de temps."}>
          <Field label={t("time.employee")}><NativeSelect name="employeeId" value={attendanceEmployeeId} onChange={selectAttendanceEmployee} required disabled={!lookups.employees.length} items={employeeItems} /></Field>
          <Field label={copy.attendanceDate}><Input name="attendanceDate" type="date" required /></Field>
          <Field label={copy.attendanceStatus}><NativeSelect name="status" defaultValue="PRESENT" required items={attendanceStatusItems} /></Field>
          <Field label={copy.site}><NativeSelect name="siteId" value={attendanceSiteId} onChange={setAttendanceSiteId} items={[{ id: "", label: locale === "en" ? "No site" : "Aucun site" }, ...lookups.sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}${site.timezone ? ` · ${site.timezone}` : ""}` }))]} /></Field>
          <Field label={copy.observedStart}><Input name="observedStart" type="time" /></Field>
          <Field label={copy.observedEnd}><Input name="observedEnd" type="time" /></Field>
          <Field label={copy.notes}><textarea name="notes" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field>
        </ProfessionalFormSection>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Button type="button" variant="outline" onClick={() => setAttendanceOpen(false)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction) || !lookups.employees.length} aria-busy={Boolean(busyAction)}>{copy.saveAttendance}</Button></div>
      </form>
    </Dialog>

    <Dialog open={leaveOpen} onClose={() => { if (!busyAction) setLeaveOpen(false); }} title={t("time.newLeave")} description={locale === "en" ? "Leave requires an active HR record and a separate authorized approver." : "Le congé exige un dossier RH actif et un validateur autorisé distinct."} presentation="editor" className="h-[96dvh] max-w-4xl">
      <form onSubmit={createLeave} className="grid gap-5">
        {error ? <ProfessionalError message={error} /> : null}
        {!lookups.employees.length ? <ProfessionalError message={copy.noEmployee} /> : null}
        {!lookups.approvers.length ? <ProfessionalError message={copy.noApprover} /> : null}
        <ProfessionalFormSection title={t("time.employeeAndPeriod")}>
          <Field label={t("time.employee")}><NativeSelect name="employeeId" required disabled={!lookups.employees.length} items={employeeItems} /></Field>
          <Field label={t("time.leaveType")}><NativeSelect name="leaveType" defaultValue="ANNUAL" required items={leaveTypeItems} /></Field>
          <Field label={t("time.startDate")}><Input name="startDate" type="date" required /></Field>
          <Field label={t("time.endDate")}><Input name="endDate" type="date" required /></Field>
          <Field label={t("time.approver")}><NativeSelect name="approverUserId" required disabled={!lookups.approvers.length} items={approverItems} /></Field>
          <Field label={t("time.partialDay")}><label className="mt-3 flex min-h-11 items-center gap-2"><input name="partialDay" type="checkbox" />{t("time.partialDayHelp")}</label></Field>
          <Field label={t("time.startMinute")}><Input name="partialStart" type="time" defaultValue="08:00" /></Field>
          <Field label={t("time.endMinute")}><Input name="partialEnd" type="time" defaultValue="12:00" /></Field>
          <Field label={t("time.reason")} help={locale === "en" ? "State the business reason clearly enough for the approver to decide." : "Précisez le motif métier suffisamment clairement pour permettre au validateur de décider."}><textarea name="reason" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field>
        </ProfessionalFormSection>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Button type="button" variant="outline" onClick={() => setLeaveOpen(false)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction) || !lookups.employees.length || !lookups.approvers.length} aria-busy={Boolean(busyAction)}>{t("time.submitLeave")}</Button></div>
      </form>
    </Dialog>

    <Dialog open={timesheetOpen} onClose={() => { if (!busyAction) setTimesheetOpen(false); }} title={t("time.newTimesheet")} description={locale === "en" ? "Declare actual work. The server revalidates references and duration before independent approval." : "Déclarez le travail réellement effectué. Le serveur revalide les références et la durée avant validation indépendante."} presentation="editor" className="h-[96dvh] max-w-5xl">
      <form onSubmit={createTimesheet} className="grid gap-5">
        {error ? <ProfessionalError message={error} /> : null}
        {!lookups.employees.length ? <ProfessionalError message={copy.noEmployee} /> : null}
        {!lookups.approvers.length ? <ProfessionalError message={copy.noApprover} /> : null}
        <ProfessionalFormSection title={t("time.periodAndApproval")}>
          <Field label={t("time.employee")}><NativeSelect name="employeeId" required disabled={!lookups.employees.length} items={employeeItems} /></Field>
          <Field label={t("time.periodStart")}><Input name="periodStart" type="date" required /></Field>
          <Field label={t("time.periodEnd")}><Input name="periodEnd" type="date" required /></Field>
          <Field label={t("time.approver")}><NativeSelect name="approverUserId" required disabled={!lookups.approvers.length} items={approverItems} /></Field>
        </ProfessionalFormSection>
        <ProfessionalFormSection title={t("time.firstActivity")}>
          <Field label={t("time.workDate")}><Input name="workDate" type="date" required /></Field>
          <Field label={t("time.project")}><NativeSelect name="projectId" items={[{ id: "", label: t("time.outsideProject") }, ...lookups.projects.map((project) => ({ id: project.id, label: `${project.reference} · ${project.name}` }))]} /></Field>
          <Field label={copy.task}><NativeSelect name="taskId" items={[{ id: "", label: copy.outsideTask }, ...lookups.tasks.map((task) => ({ id: task.id, label: task.title }))]} /></Field>
          <Field label={copy.start}><Input name="startTime" type="time" defaultValue="08:00" required /></Field>
          <Field label={copy.end}><Input name="endTime" type="time" defaultValue="17:00" required /></Field>
          <Field label={t("time.breakMinutes")}><Input name="breakMinutes" type="number" min="0" max="1439" defaultValue="60" /></Field>
          <Field label={t("time.description")}><Input name="serviceDescription" required /></Field>
          <Field label={t("time.billable")}><label className="mt-3 flex min-h-11 items-center gap-2"><input name="billable" type="checkbox" />{t("time.billableHelp")}</label></Field>
          <Field label={t("time.notes")}><Input name="notes" /></Field>
        </ProfessionalFormSection>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Button type="button" variant="outline" onClick={() => setTimesheetOpen(false)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction) || !lookups.employees.length || !lookups.approvers.length} aria-busy={Boolean(busyAction)}>{t("time.submitTimesheet")}</Button></div>
      </form>
    </Dialog>

    <Dialog open={Boolean(decisionTarget)} onClose={() => { if (!busyAction) setDecisionTarget(null); }} title={copy.reviewDecision} presentation="editor" className="h-[70dvh] max-w-2xl">
      {decisionTarget ? <form onSubmit={submitDecision} className="grid gap-5">{error ? <ProfessionalError message={error} /> : null}<div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm"><strong>{decisionTarget.item.reference}</strong> · {decisionTarget.item.employee.displayName}</div><Field label={decisionTarget.decision === "REJECT" ? copy.rejectionReason : copy.notes} required={decisionTarget.decision === "REJECT"} help={decisionTarget.decision === "REJECT" ? copy.decisionHelp : undefined}><textarea name="comment" rows={decisionTarget.decision === "REJECT" ? 6 : 4} required={decisionTarget.decision === "REJECT"} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setDecisionTarget(null)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction)}>{decisionTarget.decision === "APPROVE" ? t("people.approve") : t("people.reject")}</Button></div></form> : null}
    </Dialog>

    <Dialog open={Boolean(cancelTarget)} onClose={() => { if (!busyAction) setCancelTarget(null); }} title={copy.cancelLeave} presentation="editor" className="h-[68dvh] max-w-2xl">
      {cancelTarget ? <form onSubmit={cancelLeave} className="grid gap-5">{error ? <ProfessionalError message={error} /> : null}<div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm"><strong>{cancelTarget.reference}</strong> · {cancelTarget.employee.displayName}</div><Field label={copy.cancellationReason} help={copy.cancellationHelp}><textarea name="reason" rows={6} required className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCancelTarget(null)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction)}>{copy.cancelLeave}</Button></div></form> : null}
    </Dialog>

    <Dialog open={Boolean(scheduleEndTarget)} onClose={() => { if (!busyAction) setScheduleEndTarget(null); }} title={copy.endSchedule} presentation="editor" className="h-[68dvh] max-w-2xl">
      {scheduleEndTarget ? <form onSubmit={endSchedule} className="grid gap-5">{error ? <ProfessionalError message={error} /> : null}<div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm"><strong>{scheduleEndTarget.employee.displayName}</strong> · {minuteToTime(scheduleEndTarget.startMinute)}–{minuteToTime(scheduleEndTarget.endMinute)}</div><Field label={copy.endDate}><Input name="effectiveUntil" type="date" min={scheduleEndTarget.effectiveFrom.slice(0, 10)} required /></Field><Field label={copy.endReason} help={copy.endHelp}><textarea name="reason" rows={5} required className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setScheduleEndTarget(null)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction)}>{copy.endSchedule}</Button></div></form> : null}
    </Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={(detail && "reference" in detail ? detail.reference : detail?.employee.displayName) || t("time.detail")} presentation="editor" className="h-[88dvh] max-w-4xl">
      {detail && "entries" in detail ? <div className="grid gap-4"><p className="text-sm text-dtsc-muted">{detail.employee.displayName} · {t("time.declared", { duration: minutesLabel(detail.totalDeclaredMinutes) })}</p><BusinessList ariaLabel={t("time.entries")}>{detail.entries.map((entry) => <BusinessListItem key={entry.id} title={entry.serviceDescription || t("time.activity")} meta={professionalErpDate(entry.workDate, locale)} status={<StatusBadge>{minutesLabel(entry.approvedMinutes ?? entry.declaredMinutes)}</StatusBadge>} description={`${entry.billable ? t("time.billableYes") : t("time.billableNo")}${entry.notes ? ` · ${entry.notes}` : ""}`} />)}</BusinessList><div data-responsive-actions>{actionsFor(detail).filter((action) => action.id !== "open").map((action) => <Button key={action.id} type="button" variant={action.destructive ? "outline" : "default"} onClick={() => action.onSelect?.()}>{action.label}</Button>)}</div></div> : null}
      {detail && "leaveType" in detail ? <div className="grid gap-4"><p><strong>{t("time.employeeLabel")}</strong> {detail.employee.displayName}</p><p><strong>{t("time.periodLabel")}</strong> {t("time.periodRange", { start: professionalErpDate(detail.startDate, locale), end: professionalErpDate(detail.endDate, locale) })}</p><p><strong>{t("time.typeLabel")}</strong> {professionalErpEnumLabel(locale, "leaveType", detail.leaveType)}</p><p><strong>{t("time.reasonLabel")}</strong> {detail.reason || t("people.notProvided")}</p><div data-responsive-actions>{actionsFor(detail).filter((action) => action.id !== "open").map((action) => <Button key={action.id} type="button" variant={action.destructive ? "outline" : "default"} onClick={() => action.onSelect?.()}>{action.label}</Button>)}</div></div> : null}
      {detail && "scheduleType" in detail ? <div className="grid gap-3 text-sm"><p><strong>{t("time.employeeLabel")}</strong> {detail.employee.displayName}</p><p><strong>{copy.scheduleType}:</strong> {detail.scheduleType === "WEEKLY" ? copy.weekly : copy.date}</p><p><strong>{copy.start}:</strong> {minuteToTime(detail.startMinute)} – {minuteToTime(detail.endMinute)}</p><p><strong>{copy.timezone}:</strong> {detail.timezone}</p>{schedules.canManage && detail.status === "ACTIVE" ? <Button type="button" variant="outline" onClick={() => { setError(""); setScheduleEndTarget(detail); }}><Ban className="h-4 w-4" />{copy.endSchedule}</Button> : null}</div> : null}
      {detail && "attendanceDate" in detail ? <div className="grid gap-3 text-sm"><p><strong>{t("time.employeeLabel")}</strong> {detail.employee.displayName}</p><p><strong>{copy.attendanceDate}:</strong> {professionalErpDate(detail.attendanceDate, locale)}</p><p><strong>{copy.attendanceStatus}:</strong> {attendanceStatusItems.find((entry) => entry.id === detail.status)?.label || detail.status}</p><p><strong>{copy.notes}:</strong> {detail.notes || t("people.notProvided")}</p></div> : null}
    </Dialog>
  </ModuleWorkspace>;
}