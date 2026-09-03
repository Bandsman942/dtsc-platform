"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Ban, CalendarClock, CalendarDays, CheckCircle2, Clock3, Eye, MapPin, Plus, UserCheck, XCircle } from "lucide-react";
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

type Employee = { id: string; employeeNumber: string; displayName: string; siteId?: string | null };
type Member = { userId: string; name: string; email: string; role: string; positionTitle: string | null };
type Project = { id: string; reference: string; name: string; status: string };
type Task = { id: string; title: string; status: string };
type Site = { id: string; code: string; name: string; siteType: string };
type Lookups = { employees: Employee[]; approvers: Member[]; projects: Project[]; tasks: Task[]; sites: Site[] };
type LeaveRequest = { id: string; reference: string; employeeId: string; leaveType: string; startDate: string; endDate: string; partialDay: boolean; status: string; reason: string | null; approverUserId: string | null; revision: number; employee: Employee };
type TimesheetEntry = { id: string; workDate: string; declaredMinutes: number; approvedMinutes: number | null; projectId: string | null; taskId?: string | null; serviceDescription: string | null; billable: boolean; notes: string | null };
type Timesheet = { id: string; reference: string; employeeId: string; periodStart: string; periodEnd: string; status: string; totalDeclaredMinutes: number; totalApprovedMinutes: number; approverUserId: string | null; revision: number; employee: Employee; entries: TimesheetEntry[] };
type WorkSchedule = { id: string; employeeId: string; scheduleType: string; dayOfWeek: number | null; scheduleDate: string | null; startMinute: number; endMinute: number; breakMinutes: number; timezone: string; status: string; effectiveFrom: string; effectiveUntil: string | null; revision: number; employee: Employee };
type Attendance = { id: string; employeeId: string; attendanceDate: string; observedStartAt: string | null; observedEndAt: string | null; status: string; source: string; siteId: string | null; notes: string | null; revision: number; employee: Employee };
type DecisionTarget = { item: LeaveRequest | Timesheet; decision: "APPROVE" | "REJECT" };
type TimeTab = "SCHEDULES" | "ATTENDANCE" | "LEAVE" | "TIMESHEETS";

const TIME_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED", "RETURNED", "LOCKED"];
const LEAVE_TYPES = ["ANNUAL", "SICK", "MATERNITY", "PATERNITY", "UNPAID", "OTHER"];
const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "PARTIAL", "REMOTE"];
const DEFAULT_REJECTION_AUDIT_COMMENT = "Retour motivé depuis le workspace professionnel";

const localCopy = {
  fr: {
    schedulesTab: "Horaires planifiés",
    attendanceTab: "Présences",
    scheduleSection: "Horaires attendus",
    scheduleDescription: "Planifiez les heures attendues sans les transformer en présence ni en temps approuvé.",
    attendanceSection: "Présence observée",
    attendanceDescription: "Enregistrez ce qui a été observé. La présence reste distincte du temps déclaré et de la paie.",
    newSchedule: "Planifier un horaire",
    recordAttendance: "Enregistrer une présence",
    scheduleType: "Type de planning",
    weekly: "Hebdomadaire",
    dateSpecific: "Date précise",
    dayOfWeek: "Jour de la semaine",
    monday: "Lundi",
    tuesday: "Mardi",
    wednesday: "Mercredi",
    thursday: "Jeudi",
    friday: "Vendredi",
    saturday: "Samedi",
    sunday: "Dimanche",
    scheduleDate: "Date planifiée",
    startTime: "Heure de début",
    endTime: "Heure de fin",
    breakMinutes: "Pause (minutes)",
    timezone: "Fuseau horaire",
    effectiveFrom: "Applicable à partir du",
    effectiveUntil: "Applicable jusqu’au",
    attendanceDate: "Date de présence",
    attendanceStatus: "État observé",
    observedStart: "Arrivée observée",
    observedEnd: "Départ observé",
    site: "Site",
    notes: "Notes",
    saveSchedule: "Enregistrer l’horaire",
    saveAttendance: "Enregistrer la présence",
    noSchedule: "Aucun horaire planifié",
    noScheduleDescription: "Les horaires attendus apparaîtront ici sans modifier les feuilles de temps.",
    noAttendance: "Aucune présence enregistrée",
    noAttendanceDescription: "Les présences observées apparaîtront ici sans être converties automatiquement en temps travaillé.",
    activeSchedules: "Horaires actifs",
    observedPresence: "Présences observées",
    absences: "Absences observées",
    reviewDecision: "Revue de la décision",
    rejectionReason: "Motif du refus",
    decisionReasonHelp: "Le refus doit être motivé et reste audité.",
    approve: "Approuver",
    reject: "Refuser",
    cancelLeave: "Annuler la demande",
    cancellationReason: "Motif d’annulation",
    cancellationHelp: "L’annulation conserve l’historique et ne supprime pas la demande.",
    scheduleSaved: "Horaire planifié.",
    attendanceSaved: "Présence enregistrée.",
    leaveCancelled: "Demande de congé annulée.",
    actionFailed: "L’opération n’a pas pu être terminée.",
    page: "Page",
    previous: "Précédent",
    next: "Suivant",
    task: "Tâche",
    outsideTask: "Sans tâche",
    employeeAndPlanning: "Collaborateur et planification",
    observation: "Observation",
    scheduleMeta: "{day} · {start}–{end} · pause {breakMinutes} min",
    observedMeta: "{date} · {start}–{end}",
    noObservedHours: "heures non renseignées",
    explicitSeparation: "Planning ≠ présence ≠ temps déclaré ≠ temps approuvé ≠ paie.",
  },
  en: {
    schedulesTab: "Planned schedules",
    attendanceTab: "Attendance",
    scheduleSection: "Expected schedules",
    scheduleDescription: "Plan expected hours without turning them into attendance or approved time.",
    attendanceSection: "Observed attendance",
    attendanceDescription: "Record what was observed. Attendance remains separate from declared time and payroll.",
    newSchedule: "Plan a schedule",
    recordAttendance: "Record attendance",
    scheduleType: "Schedule type",
    weekly: "Weekly",
    dateSpecific: "Specific date",
    dayOfWeek: "Day of week",
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
    scheduleDate: "Scheduled date",
    startTime: "Start time",
    endTime: "End time",
    breakMinutes: "Break (minutes)",
    timezone: "Timezone",
    effectiveFrom: "Effective from",
    effectiveUntil: "Effective until",
    attendanceDate: "Attendance date",
    attendanceStatus: "Observed status",
    observedStart: "Observed arrival",
    observedEnd: "Observed departure",
    site: "Site",
    notes: "Notes",
    saveSchedule: "Save schedule",
    saveAttendance: "Record attendance",
    noSchedule: "No planned schedule",
    noScheduleDescription: "Expected schedules will appear here without modifying timesheets.",
    noAttendance: "No attendance recorded",
    noAttendanceDescription: "Observed attendance will appear here without being automatically converted into worked time.",
    activeSchedules: "Active schedules",
    observedPresence: "Observed presence",
    absences: "Observed absences",
    reviewDecision: "Decision review",
    rejectionReason: "Rejection reason",
    decisionReasonHelp: "A rejection must be justified and remains audited.",
    approve: "Approve",
    reject: "Reject",
    cancelLeave: "Cancel request",
    cancellationReason: "Cancellation reason",
    cancellationHelp: "Cancellation preserves history and does not delete the request.",
    scheduleSaved: "Schedule saved.",
    attendanceSaved: "Attendance recorded.",
    leaveCancelled: "Leave request cancelled.",
    actionFailed: "The operation could not be completed.",
    page: "Page",
    previous: "Previous",
    next: "Next",
    task: "Task",
    outsideTask: "No task",
    employeeAndPlanning: "Employee and planning",
    observation: "Observation",
    scheduleMeta: "{day} · {start}–{end} · {breakMinutes} min break",
    observedMeta: "{date} · {start}–{end}",
    noObservedHours: "hours not provided",
    explicitSeparation: "Schedule ≠ attendance ≠ declared time ≠ approved time ≠ payroll.",
  },
} as const;

function statusTone(status: string) {
  if (["APPROVED", "LOCKED", "ACTIVE", "PRESENT", "REMOTE"].includes(status)) return "success" as const;
  if (["SUBMITTED", "RETURNED", "LATE", "PARTIAL"].includes(status)) return "warning" as const;
  if (["REJECTED", "CANCELLED", "ABSENT", "INACTIVE"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

function timeToMinute(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function minuteToTime(value: number) {
  const bounded = Math.max(0, Math.min(1440, value));
  const hours = Math.floor(bounded / 60) % 24;
  const minutes = bounded % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function dateTimeIso(date: string, time: string) {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, String(value)), template);
}

function PaginationControls({ page, pageCount, onChange, copy }: { page: number; pageCount: number; onChange: (page: number) => void; copy: (typeof localCopy)["fr"] | (typeof localCopy)["en"] }) {
  if (pageCount <= 1) return null;
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dtsc-border pt-4">
    <span className="text-sm font-semibold text-dtsc-muted">{copy.page} {page}/{pageCount}</span>
    <div className="flex gap-2">
      <Button type="button" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>{copy.previous}</Button>
      <Button type="button" variant="outline" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>{copy.next}</Button>
    </div>
  </div>;
}

export function EnterpriseTimeAttendanceWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const copy = localCopy[locale === "en" ? "en" : "fr"];
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const minutesLabel = (minutes: number) => t("time.minutesValue", { hours: Math.floor(minutes / 60), minutes: (minutes % 60).toString().padStart(2, "0") });
  const memberLabel = (member: Member) => `${member.name || member.email} · ${member.positionTitle || professionalErpEnumLabel(locale, "role", member.role)}`;
  const employeeLabel = (employee: Employee) => `${employee.employeeNumber} · ${employee.displayName}`;
  const dayLabels = [copy.monday, copy.tuesday, copy.wednesday, copy.thursday, copy.friday, copy.saturday, copy.sunday];

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
  const [scheduleType, setScheduleType] = useState("WEEKLY");
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  useToastMessage(message);

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/hr-payroll-lookups?module=TIME_ATTENDANCE`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Partial<Lookups> & { message?: string; error?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || body?.error || professionalErpT(locale, "time.selectorsUnavailable"));
        if (active) setLookups({ employees: body.employees || [], approvers: body.approvers || [], projects: body.projects || [], tasks: body.tasks || [], sites: body.sites || [] });
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : professionalErpT(locale, "time.selectorsUnavailable")); });
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
  const currentStatusItems = tab === "ATTENDANCE"
    ? [{ id: "", label: t("people.allStatuses") }, ...ATTENDANCE_STATUSES.map((id) => ({ id, label: id === "PRESENT" ? (locale === "en" ? "Present" : "Présent") : id === "ABSENT" ? (locale === "en" ? "Absent" : "Absent") : id === "LATE" ? (locale === "en" ? "Late" : "En retard") : id === "PARTIAL" ? (locale === "en" ? "Partial" : "Partiel") : (locale === "en" ? "Remote" : "À distance") }))]
    : [{ id: "", label: t("people.allStatuses") }, ...TIME_STATUSES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "timeStatus", id) }))];
  const leaveTypeItems = LEAVE_TYPES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "leaveType", id) }));

  async function runMutation(action: string, endpoint: string, payload: unknown, success: string) {
    if (busyAction) return false;
    setBusyAction(action);
    setMessage("");
    try {
      await professionalMutation(endpoint, payload);
      setRefreshKey((value) => value + 1);
      setMessage(success);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.actionFailed);
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await runMutation("schedule-create", `/api/enterprise/${organizationId}/work-schedules`, {
      employeeId: String(form.get("employeeId") || ""),
      scheduleType,
      dayOfWeek: scheduleType === "WEEKLY" ? Number(form.get("dayOfWeek") || 0) : null,
      scheduleDate: scheduleType === "DATE" ? String(form.get("scheduleDate") || "") : null,
      startMinute: timeToMinute(String(form.get("startTime") || "08:00")),
      endMinute: timeToMinute(String(form.get("endTime") || "17:00")),
      breakMinutes: Number(form.get("breakMinutes") || 0),
      timezone: String(form.get("timezone") || "Africa/Kinshasa"),
      effectiveFrom: String(form.get("effectiveFrom") || ""),
      effectiveUntil: String(form.get("effectiveUntil") || "") || null,
    }, copy.scheduleSaved);
    if (ok) setScheduleOpen(false);
  }

  async function createAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get("attendanceDate") || "");
    const observedStart = String(form.get("observedStart") || "");
    const observedEnd = String(form.get("observedEnd") || "");
    const ok = await runMutation("attendance-create", `/api/enterprise/${organizationId}/attendance`, {
      employeeId: String(form.get("employeeId") || ""),
      attendanceDate: date,
      observedStartAt: observedStart ? dateTimeIso(date, observedStart) : null,
      observedEndAt: observedEnd ? dateTimeIso(date, observedEnd) : null,
      status: String(form.get("status") || "PRESENT"),
      source: "MANUAL",
      siteId: String(form.get("siteId") || "") || null,
      notes: String(form.get("notes") || "") || null,
    }, copy.attendanceSaved);
    if (ok) setAttendanceOpen(false);
  }

  async function createLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const partialDay = form.get("partialDay") === "on";
    const ok = await runMutation("leave-create", `/api/enterprise/${organizationId}/leave-requests`, {
      employeeId: String(form.get("employeeId") || ""),
      leaveType: String(form.get("leaveType") || "ANNUAL"),
      startDate: String(form.get("startDate") || ""),
      endDate: String(form.get("endDate") || ""),
      partialDay,
      startMinute: partialDay ? timeToMinute(String(form.get("partialStart") || "08:00")) : null,
      endMinute: partialDay ? timeToMinute(String(form.get("partialEnd") || "12:00")) : null,
      reason: String(form.get("reason") || "") || null,
      approverUserId: String(form.get("approverUserId") || ""),
    }, t("time.leaveSubmitted"));
    if (ok) setLeaveOpen(false);
  }

  async function createTimesheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const workDate = String(form.get("workDate") || "");
    const startTime = String(form.get("startTime") || "");
    const endTime = String(form.get("endTime") || "");
    const breakMinutes = Number(form.get("breakMinutes") || 0);
    const declaredMinutes = Math.max(1, timeToMinute(endTime) - timeToMinute(startTime) - breakMinutes);
    const ok = await runMutation("timesheet-create", `/api/enterprise/${organizationId}/timesheets`, {
      employeeId: String(form.get("employeeId") || ""),
      periodStart: String(form.get("periodStart") || ""),
      periodEnd: String(form.get("periodEnd") || ""),
      approverUserId: String(form.get("approverUserId") || ""),
      entries: [{
        workDate,
        startAt: dateTimeIso(workDate, startTime),
        endAt: dateTimeIso(workDate, endTime),
        declaredMinutes,
        breakMinutes,
        projectId: String(form.get("projectId") || "") || null,
        taskId: String(form.get("taskId") || "") || null,
        serviceDescription: String(form.get("serviceDescription") || "") || null,
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
    if (decisionTarget.decision === "REJECT" && !comment) {
      setMessage(copy.decisionReasonHelp);
      return;
    }
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
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") || "").trim();
    if (!reason) return;
    const ok = await runMutation(`leave-cancel-${cancelTarget.id}`, `/api/enterprise/${organizationId}/leave-requests/${cancelTarget.id}/cancel`, { revision: cancelTarget.revision, reason }, copy.leaveCancelled);
    if (ok) { setCancelTarget(null); setDetail(null); }
  }

  const actionsFor = (item: LeaveRequest | Timesheet): BusinessContextAction[] => [
    { id: "open", label: t("people.open"), icon: Eye, onSelect: () => setDetail(item) },
    ...(item.status === "SUBMITTED" ? [
      { id: "approve", label: t("people.approve"), icon: CheckCircle2, onSelect: () => setDecisionTarget({ item, decision: "APPROVE" as const }) },
      { id: "reject", label: t("people.refuse"), icon: XCircle, destructive: true, onSelect: () => setDecisionTarget({ item, decision: "REJECT" as const }) },
    ] : []),
    ...("leaveType" in item && ["SUBMITTED", "APPROVED"].includes(item.status) ? [
      { id: "cancel", label: copy.cancelLeave, icon: Ban, destructive: true, onSelect: () => setCancelTarget(item) },
    ] : []),
  ];

  const tabs = [
    { id: "SCHEDULES" as const, label: copy.schedulesTab, count: schedules.pagination.total },
    { id: "ATTENDANCE" as const, label: copy.attendanceTab, count: attendance.pagination.total },
    { id: "LEAVE" as const, label: t("time.leavesTab"), count: leaves.pagination.total },
    { id: "TIMESHEETS" as const, label: t("time.timesheetsTab"), count: timesheets.pagination.total },
  ];

  return <ModuleWorkspace>
    <ModuleHeader
      eyebrow={t("time.eyebrow", { organization: organizationName })}
      title={t("time.title")}
      description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${copy.explicitSeparation}`}
      count={`${schedules.pagination.total + attendance.pagination.total + leaves.pagination.total + timesheets.pagination.total}`}
      primaryAction={<div data-responsive-actions>
        {tab === "SCHEDULES" ? <Button onClick={() => setScheduleOpen(true)}><CalendarClock className="h-4 w-4" />{copy.newSchedule}</Button> : null}
        {tab === "ATTENDANCE" ? <Button onClick={() => setAttendanceOpen(true)}><UserCheck className="h-4 w-4" />{copy.recordAttendance}</Button> : null}
        {tab === "LEAVE" ? <Button onClick={() => setLeaveOpen(true)}><CalendarDays className="h-4 w-4" />{t("time.requestLeave")}</Button> : null}
        {tab === "TIMESHEETS" ? <Button onClick={() => setTimesheetOpen(true)}><Clock3 className="h-4 w-4" />{t("time.declareTime")}</Button> : null}
      </div>}
    />
    <ModuleMetrics label={t("time.metrics")}>
      <ModuleMetric label={copy.activeSchedules} value={schedules.metrics.active || 0} />
      <ModuleMetric label={copy.observedPresence} value={attendance.metrics.present || 0} />
      <ModuleMetric label={t("time.leavePending")} value={leaves.metrics.pending || 0} />
      <ModuleMetric label={t("time.approvedTime")} value={minutesLabel(Number(timesheets.metrics.approvedMinutes || 0))} />
    </ModuleMetrics>
    <ModuleToolbar
      controls={<>
        <ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={tabs} />
        {tab !== "SCHEDULES" ? <NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={currentStatusItems} /> : null}
      </>}
      summary={copy.explicitSeparation}
    />
    <ModuleContent>
      <ModuleSection
        title={tab === "SCHEDULES" ? copy.scheduleSection : tab === "ATTENDANCE" ? copy.attendanceSection : tab === "LEAVE" ? t("time.leaveSection") : t("time.timesheetSection")}
        description={tab === "SCHEDULES" ? copy.scheduleDescription : tab === "ATTENDANCE" ? copy.attendanceDescription : tab === "LEAVE" ? t("time.leaveSectionDescription") : t("time.timesheetSectionDescription")}
      >
        {activeCollection.error ? <ProfessionalError message={activeCollection.error} /> : activeCollection.loading ? <ProfessionalLoading /> : tab === "SCHEDULES" ? (
          schedules.items.length ? <BusinessList ariaLabel={copy.scheduleSection}>{schedules.items.map((item) => {
            const day = item.scheduleType === "WEEKLY" ? dayLabels[Math.max(0, (item.dayOfWeek || 1) - 1)] : (item.scheduleDate ? professionalErpDate(item.scheduleDate, locale) : copy.dateSpecific);
            return <BusinessListItem key={item.id} title={employeeLabel(item.employee)} leading={<CalendarClock className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{item.status === "ACTIVE" ? (locale === "en" ? "Active" : "Actif") : item.status}</StatusBadge>} meta={interpolate(copy.scheduleMeta, { day, start: minuteToTime(item.startMinute), end: minuteToTime(item.endMinute), breakMinutes: item.breakMinutes })} description={`${professionalErpDate(item.effectiveFrom, locale)}${item.effectiveUntil ? ` – ${professionalErpDate(item.effectiveUntil, locale)}` : ""} · ${item.timezone}`} onOpen={() => setDetail(item)} actions={<Button size="sm" variant="outline" onClick={() => setDetail(item)}><Eye className="h-4 w-4" />{t("people.details")}</Button>} />;
          })}</BusinessList> : <EmptyState compact title={copy.noSchedule} description={copy.noScheduleDescription} />
        ) : tab === "ATTENDANCE" ? (
          attendance.items.length ? <BusinessList ariaLabel={copy.attendanceSection}>{attendance.items.map((item) => {
            const observed = item.observedStartAt && item.observedEndAt ? interpolate(copy.observedMeta, { date: professionalErpDate(item.attendanceDate, locale), start: new Date(item.observedStartAt).toLocaleTimeString(locale === "en" ? "en-US" : "fr-FR", { hour: "2-digit", minute: "2-digit" }), end: new Date(item.observedEndAt).toLocaleTimeString(locale === "en" ? "en-US" : "fr-FR", { hour: "2-digit", minute: "2-digit" }) }) : `${professionalErpDate(item.attendanceDate, locale)} · ${copy.noObservedHours}`;
            return <BusinessListItem key={item.id} title={employeeLabel(item.employee)} leading={<UserCheck className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{currentStatusItems.find((entry) => entry.id === item.status)?.label || item.status}</StatusBadge>} meta={observed} description={item.notes || `${locale === "en" ? "Source" : "Source"}: ${item.source}`} onOpen={() => setDetail(item)} actions={<Button size="sm" variant="outline" onClick={() => setDetail(item)}><Eye className="h-4 w-4" />{t("people.details")}</Button>} />;
          })}</BusinessList> : <EmptyState compact title={copy.noAttendance} description={copy.noAttendanceDescription} />
        ) : tab === "LEAVE" ? (
          leaves.items.length ? <BusinessList ariaLabel={t("time.leaveSection")}>{leaves.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.employee.displayName}`} leading={<CalendarDays className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "timeStatus", item.status)}</StatusBadge>} meta={t("time.leaveRange", { type: professionalErpEnumLabel(locale, "leaveType", item.leaveType), start: professionalErpDate(item.startDate, locale), end: professionalErpDate(item.endDate, locale) })} description={item.reason || (item.partialDay ? t("time.halfDay") : t("time.fullDay"))} onOpen={() => setDetail(item)} actions={<ContextActions label={t("time.leaveActions")} actions={actionsFor(item)} />} />)}</BusinessList> : <EmptyState compact title={t("time.noLeave")} description={t("time.noLeaveDescription")} />
        ) : (
          timesheets.items.length ? <BusinessList ariaLabel={t("time.timesheetSection")}>{timesheets.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.employee.displayName}`} leading={<Clock3 className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "timeStatus", item.status)}</StatusBadge>} meta={`${professionalErpDate(item.periodStart, locale)} – ${professionalErpDate(item.periodEnd, locale)}`} description={t("time.declaredApproved", { declared: minutesLabel(item.totalDeclaredMinutes), approved: minutesLabel(item.totalApprovedMinutes) })} onOpen={() => setDetail(item)} actions={<ContextActions label={t("time.timesheetActions")} actions={actionsFor(item)} />} />)}</BusinessList> : <EmptyState compact title={t("time.noTimesheet")} description={t("time.noTimesheetDescription")} />
        )}
        <PaginationControls page={activeCollection.pagination.page} pageCount={activeCollection.pagination.pageCount} onChange={setPage} copy={copy} />
      </ModuleSection>
      <ProfessionalHelp moduleCode="TIME_ATTENDANCE" />
    </ModuleContent>

    <Dialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} title={copy.newSchedule} presentation="editor" className="h-[96dvh] max-w-4xl">
      <form onSubmit={createSchedule} className="grid gap-5">
        <ProfessionalFormSection title={copy.employeeAndPlanning}>
          <Field label={t("time.employee")}><NativeSelect name="employeeId" required items={[{ id: "", label: t("people.select") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: employeeLabel(employee) }))]} /></Field>
          <Field label={copy.scheduleType}><NativeSelect value={scheduleType} onChange={setScheduleType} items={[{ id: "WEEKLY", label: copy.weekly }, { id: "DATE", label: copy.dateSpecific }]} /></Field>
          {scheduleType === "WEEKLY" ? <Field label={copy.dayOfWeek}><NativeSelect name="dayOfWeek" defaultValue="1" items={dayLabels.map((label, index) => ({ id: String(index + 1), label }))} /></Field> : <Field label={copy.scheduleDate}><Input name="scheduleDate" type="date" required /></Field>}
          <Field label={copy.startTime}><Input name="startTime" type="time" defaultValue="08:00" required /></Field>
          <Field label={copy.endTime}><Input name="endTime" type="time" defaultValue="17:00" required /></Field>
          <Field label={copy.breakMinutes}><Input name="breakMinutes" type="number" min="0" max="1439" defaultValue="60" /></Field>
          <Field label={copy.timezone}><Input name="timezone" defaultValue="Africa/Kinshasa" required /></Field>
          <Field label={copy.effectiveFrom}><Input name="effectiveFrom" type="date" required /></Field>
          <Field label={copy.effectiveUntil}><Input name="effectiveUntil" type="date" /></Field>
        </ProfessionalFormSection>
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setScheduleOpen(false)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction)}>{copy.saveSchedule}</Button></div>
      </form>
    </Dialog>

    <Dialog open={attendanceOpen} onClose={() => setAttendanceOpen(false)} title={copy.recordAttendance} presentation="editor" className="h-[94dvh] max-w-4xl">
      <form onSubmit={createAttendance} className="grid gap-5">
        <ProfessionalFormSection title={copy.observation}>
          <Field label={t("time.employee")}><NativeSelect name="employeeId" required items={[{ id: "", label: t("people.select") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: employeeLabel(employee) }))]} /></Field>
          <Field label={copy.attendanceDate}><Input name="attendanceDate" type="date" required /></Field>
          <Field label={copy.attendanceStatus}><NativeSelect name="status" defaultValue="PRESENT" items={currentStatusItems.filter((item) => item.id)} /></Field>
          <Field label={copy.site}><NativeSelect name="siteId" items={[{ id: "", label: t("people.notProvided") }, ...lookups.sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}` }))]} /></Field>
          <Field label={copy.observedStart}><Input name="observedStart" type="time" /></Field>
          <Field label={copy.observedEnd}><Input name="observedEnd" type="time" /></Field>
          <Field label={copy.notes}><textarea name="notes" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field>
        </ProfessionalFormSection>
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setAttendanceOpen(false)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction)}>{copy.saveAttendance}</Button></div>
      </form>
    </Dialog>

    <Dialog open={leaveOpen} onClose={() => setLeaveOpen(false)} title={t("time.newLeave")} presentation="editor" className="h-[96dvh] max-w-4xl">
      <form onSubmit={createLeave} className="grid gap-5">
        <ProfessionalFormSection title={t("time.employeeAndPeriod")}>
          <Field label={t("time.employee")}><NativeSelect name="employeeId" required items={[{ id: "", label: t("people.select") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: employeeLabel(employee) }))]} /></Field>
          <Field label={t("time.leaveType")}><NativeSelect name="leaveType" defaultValue="ANNUAL" items={leaveTypeItems} /></Field>
          <Field label={t("time.startDate")}><Input name="startDate" type="date" required /></Field>
          <Field label={t("time.endDate")}><Input name="endDate" type="date" required /></Field>
          <Field label={t("time.approver")}><NativeSelect name="approverUserId" required items={[{ id: "", label: t("people.selectAnother") }, ...lookups.approvers.map((member) => ({ id: member.userId, label: memberLabel(member) }))]} /></Field>
          <Field label={t("time.partialDay")}><label className="mt-3 flex min-h-11 items-center gap-2"><input name="partialDay" type="checkbox" />{t("time.partialDayHelp")}</label></Field>
          <Field label={t("time.startMinute")}><Input name="partialStart" type="time" defaultValue="08:00" /></Field>
          <Field label={t("time.endMinute")}><Input name="partialEnd" type="time" defaultValue="12:00" /></Field>
          <Field label={t("time.reason")}><textarea name="reason" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field>
        </ProfessionalFormSection>
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setLeaveOpen(false)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction) || lookups.approvers.length === 0}>{t("time.submitLeave")}</Button></div>
      </form>
    </Dialog>

    <Dialog open={timesheetOpen} onClose={() => setTimesheetOpen(false)} title={t("time.newTimesheet")} presentation="editor" className="h-[96dvh] max-w-5xl">
      <form onSubmit={createTimesheet} className="grid gap-5">
        <ProfessionalFormSection title={t("time.periodAndApproval")}>
          <Field label={t("time.employee")}><NativeSelect name="employeeId" required items={[{ id: "", label: t("people.select") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: employeeLabel(employee) }))]} /></Field>
          <Field label={t("time.periodStart")}><Input name="periodStart" type="date" required /></Field>
          <Field label={t("time.periodEnd")}><Input name="periodEnd" type="date" required /></Field>
          <Field label={t("time.approver")}><NativeSelect name="approverUserId" required items={[{ id: "", label: t("people.selectAnother") }, ...lookups.approvers.map((member) => ({ id: member.userId, label: memberLabel(member) }))]} /></Field>
        </ProfessionalFormSection>
        <ProfessionalFormSection title={t("time.firstActivity")}>
          <Field label={t("time.workDate")}><Input name="workDate" type="date" required /></Field>
          <Field label={t("time.project")}><NativeSelect name="projectId" items={[{ id: "", label: t("time.outsideProject") }, ...lookups.projects.map((project) => ({ id: project.id, label: `${project.reference} · ${project.name}` }))]} /></Field>
          <Field label={copy.task}><NativeSelect name="taskId" items={[{ id: "", label: copy.outsideTask }, ...lookups.tasks.map((task) => ({ id: task.id, label: task.title }))]} /></Field>
          <Field label={copy.startTime}><Input name="startTime" type="time" defaultValue="08:00" required /></Field>
          <Field label={copy.endTime}><Input name="endTime" type="time" defaultValue="17:00" required /></Field>
          <Field label={t("time.breakMinutes")}><Input name="breakMinutes" type="number" min="0" max="1439" defaultValue="60" /></Field>
          <Field label={t("time.description")}><Input name="serviceDescription" required /></Field>
          <Field label={t("time.billable")}><label className="mt-3 flex min-h-11 items-center gap-2"><input name="billable" type="checkbox" />{t("time.billableHelp")}</label></Field>
          <Field label={t("time.notes")}><Input name="notes" /></Field>
        </ProfessionalFormSection>
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setTimesheetOpen(false)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction) || lookups.approvers.length === 0}>{t("time.submitTimesheet")}</Button></div>
      </form>
    </Dialog>

    <Dialog open={Boolean(decisionTarget)} onClose={() => setDecisionTarget(null)} title={copy.reviewDecision} presentation="editor" className="h-[70dvh] max-w-2xl">
      {decisionTarget ? <form onSubmit={submitDecision} className="grid gap-5">
        <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm"><strong>{decisionTarget.item.reference}</strong> · {decisionTarget.item.employee.displayName}</div>
        {decisionTarget.decision === "REJECT" ? <Field label={copy.rejectionReason}><textarea name="comment" rows={6} required className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /><p className="mt-2 text-sm text-dtsc-muted">{copy.decisionReasonHelp}</p></Field> : <Field label={copy.notes}><textarea name="comment" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field>}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setDecisionTarget(null)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction)}>{decisionTarget.decision === "APPROVE" ? copy.approve : copy.reject}</Button></div>
      </form> : null}
    </Dialog>

    <Dialog open={Boolean(cancelTarget)} onClose={() => setCancelTarget(null)} title={copy.cancelLeave} presentation="editor" className="h-[68dvh] max-w-2xl">
      {cancelTarget ? <form onSubmit={cancelLeave} className="grid gap-5"><div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm"><strong>{cancelTarget.reference}</strong> · {cancelTarget.employee.displayName}</div><Field label={copy.cancellationReason}><textarea name="reason" rows={6} required className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /><p className="mt-2 text-sm text-dtsc-muted">{copy.cancellationHelp}</p></Field><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCancelTarget(null)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction)}>{copy.cancelLeave}</Button></div></form> : null}
    </Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={(detail && "reference" in detail ? detail.reference : detail?.employee.displayName) || t("time.detail")} className="h-[88dvh] max-w-4xl">
      {detail && "entries" in detail ? <div className="grid gap-4"><p className="text-sm text-dtsc-muted">{detail.employee.displayName} · {t("time.declared", { duration: minutesLabel(detail.totalDeclaredMinutes) })}</p><BusinessList ariaLabel={t("time.entries")}>{detail.entries.map((entry) => <BusinessListItem key={entry.id} title={entry.serviceDescription || t("time.activity")} meta={professionalErpDate(entry.workDate, locale)} status={<StatusBadge>{minutesLabel(entry.approvedMinutes ?? entry.declaredMinutes)}</StatusBadge>} description={`${entry.billable ? t("time.billableYes") : t("time.billableNo")}${entry.notes ? ` · ${entry.notes}` : ""}`} />)}</BusinessList><div data-responsive-actions>{actionsFor(detail).filter((action) => action.id !== "open").map((action) => <Button key={action.id} type="button" variant={action.destructive ? "outline" : "default"} onClick={() => action.onSelect?.()}>{action.label}</Button>)}</div></div> : null}
      {detail && "leaveType" in detail ? <div className="grid gap-4"><div className="grid gap-3 text-sm leading-6"><p><strong>{t("time.employeeLabel")}</strong> {detail.employee.displayName}</p><p><strong>{t("time.periodLabel")}</strong> {t("time.periodRange", { start: professionalErpDate(detail.startDate, locale), end: professionalErpDate(detail.endDate, locale) })}</p><p><strong>{t("time.typeLabel")}</strong> {professionalErpEnumLabel(locale, "leaveType", detail.leaveType)}</p><p><strong>{t("time.reasonLabel")}</strong> {detail.reason || t("people.notProvided")}</p></div><div data-responsive-actions>{actionsFor(detail).filter((action) => action.id !== "open").map((action) => <Button key={action.id} type="button" variant={action.destructive ? "outline" : "default"} onClick={() => action.onSelect?.()}>{action.label}</Button>)}</div></div> : null}
      {detail && "scheduleType" in detail ? <div className="grid gap-3 text-sm leading-6"><p><strong>{t("time.employeeLabel")}</strong> {detail.employee.displayName}</p><p><strong>{copy.scheduleType}:</strong> {detail.scheduleType === "WEEKLY" ? copy.weekly : copy.dateSpecific}</p><p><strong>{copy.startTime}:</strong> {minuteToTime(detail.startMinute)} – {minuteToTime(detail.endMinute)}</p><p><strong>{copy.timezone}:</strong> {detail.timezone}</p></div> : null}
      {detail && "attendanceDate" in detail ? <div className="grid gap-3 text-sm leading-6"><p><strong>{t("time.employeeLabel")}</strong> {detail.employee.displayName}</p><p><strong>{copy.attendanceDate}:</strong> {professionalErpDate(detail.attendanceDate, locale)}</p><p><strong>{copy.attendanceStatus}:</strong> {detail.status}</p><p><strong>{copy.notes}:</strong> {detail.notes || t("people.notProvided")}</p></div> : null}
    </Dialog>
  </ModuleWorkspace>;
}
