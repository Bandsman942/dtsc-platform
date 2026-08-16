"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, Clock3, Eye, XCircle } from "lucide-react";
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

const TIME_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED", "RETURNED", "LOCKED"];
const LEAVE_TYPES = ["ANNUAL", "SICK", "MATERNITY", "PATERNITY", "UNPAID", "OTHER"];
function statusTone(status: string) { if (["APPROVED", "LOCKED"].includes(status)) return "success" as const; if (["SUBMITTED", "RETURNED"].includes(status)) return "warning" as const; if (["REJECTED", "CANCELLED"].includes(status)) return "danger" as const; return "neutral" as const; }

export function EnterpriseTimeAttendanceWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const suffix = (count: number) => count === 1 ? "" : "s";
  const minutesLabel = (minutes: number) => t("time.minutesValue", { hours: Math.floor(minutes / 60), minutes: (minutes % 60).toString().padStart(2, "0") });
  const memberLabel = (member: Member) => `${member.label} · ${member.positionTitle || professionalErpEnumLabel(locale, "role", member.role)}`;
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
      .then(async (response) => { const body = await response.json().catch(() => null) as Lookups & { message?: string } | null; if (!response.ok || !body) throw new Error(body?.message || professionalErpT(locale, "time.selectorsUnavailable")); if (active) setLookups({ employees: body.employees || [], members: body.members || [], projects: body.projects || [] }); })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : professionalErpT(locale, "time.selectorsUnavailable")); });
    return () => { active = false; };
  }, [organizationId, refreshKey, locale]);

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
      setLeaveOpen(false); setRefreshKey((value) => value + 1); setMessage(t("time.leaveSubmitted"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("time.leaveCreateFailed")); }
  }

  async function createTimesheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const workDate = String(form.get("workDate") || ""); const hours = Number(form.get("hours") || 0); const minutes = Number(form.get("minutes") || 0);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/timesheets`, {
        employeeId: String(form.get("employeeId") || ""), periodStart: String(form.get("periodStart") || ""), periodEnd: String(form.get("periodEnd") || ""), approverUserId: String(form.get("approverUserId") || ""),
        entries: [{ workDate, declaredMinutes: Math.round(hours * 60 + minutes), breakMinutes: Number(form.get("breakMinutes") || 0), projectId: String(form.get("projectId") || "") || null, serviceDescription: String(form.get("serviceDescription") || "") || null, billable: form.get("billable") === "on", notes: String(form.get("notes") || "") || null }],
      });
      setTimesheetOpen(false); setRefreshKey((value) => value + 1); setMessage(t("time.timesheetSubmitted"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("time.timesheetCreateFailed")); }
  }

  async function decide(item: LeaveRequest | Timesheet, decision: "APPROVE" | "REJECT") {
    const endpoint = "leaveType" in item ? `leave-requests/${item.id}/decision` : `timesheets/${item.id}/decision`;
    try { await professionalMutation(`/api/enterprise/${organizationId}/${endpoint}`, { decision, revision: item.revision, comment: decision === "REJECT" ? "Retour motivé depuis le workspace professionnel" : undefined }); setDetail(null); setRefreshKey((value) => value + 1); setMessage(decision === "APPROVE" ? t("time.itemApproved") : t("time.itemRejected")); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("time.decisionFailed")); }
  }

  const actionsFor = (item: LeaveRequest | Timesheet): BusinessContextAction[] => [{ id: "open", label: t("people.open"), icon: Eye, onSelect: () => setDetail(item) }, ...(item.status === "SUBMITTED" ? [{ id: "approve", label: t("people.approve"), icon: CheckCircle2, onSelect: () => void decide(item, "APPROVE") }, { id: "reject", label: t("people.refuse"), icon: XCircle, destructive: true, onSelect: () => void decide(item, "REJECT") }] : [])];
  const statusItems = [{ id: "", label: t("people.allStatuses") }, ...TIME_STATUSES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "timeStatus", id) }))];
  const leaveTypeItems = LEAVE_TYPES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "leaveType", id) }));

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={t("time.eyebrow", { organization: organizationName })} title={t("time.title")} description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${t("time.descriptionSuffix")}`} count={t("time.count", { leaves: leaves.pagination.total, leaveSuffix: suffix(leaves.pagination.total), timesheets: timesheets.pagination.total, sheetSuffix: suffix(timesheets.pagination.total) })} primaryAction={<div data-responsive-actions><Button variant="outline" onClick={() => setLeaveOpen(true)}><CalendarDays className="h-4 w-4" />{t("time.requestLeave")}</Button><Button onClick={() => setTimesheetOpen(true)}><Clock3 className="h-4 w-4" />{t("time.declareTime")}</Button></div>} />
    <ModuleMetrics label={t("time.metrics")}><ModuleMetric label={t("time.leavePending")} value={leaves.metrics.pending || 0} /><ModuleMetric label={t("time.leaveApproved")} value={leaves.metrics.approved || 0} /><ModuleMetric label={t("time.timesheetsPending")} value={timesheets.metrics.pending || 0} /><ModuleMetric label={t("time.approvedTime")} value={minutesLabel(Number(timesheets.metrics.approvedMinutes || 0))} /></ModuleMetrics>
    <ModuleToolbar controls={<><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={[{ id: "LEAVE", label: t("time.leavesTab"), count: leaves.pagination.total }, { id: "TIMESHEETS", label: t("time.timesheetsTab"), count: timesheets.pagination.total }]} /><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={statusItems} /></>} summary={t("time.toolbarSummary")} />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold">{message}</div> : null}
      <ModuleSection title={tab === "LEAVE" ? t("time.leaveSection") : t("time.timesheetSection")} description={tab === "LEAVE" ? t("time.leaveSectionDescription") : t("time.timesheetSectionDescription")}>
        {activeCollection.error ? <ProfessionalError message={activeCollection.error} /> : activeCollection.loading ? <ProfessionalLoading /> : tab === "LEAVE" ? (leaves.items.length ? <BusinessList ariaLabel={t("time.leaveSection")}>{leaves.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.employee.displayName}`} leading={<CalendarDays className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "timeStatus", item.status)}</StatusBadge>} meta={t("time.leaveRange", { type: professionalErpEnumLabel(locale, "leaveType", item.leaveType), start: professionalErpDate(item.startDate, locale), end: professionalErpDate(item.endDate, locale) })} description={item.reason || (item.partialDay ? t("time.halfDay") : t("time.fullDay"))} onOpen={() => setDetail(item)} actions={<ContextActions label={t("time.leaveActions")} actions={actionsFor(item)} />} />)}</BusinessList> : <EmptyState compact title={t("time.noLeave")} description={t("time.noLeaveDescription")} />) : timesheets.items.length ? <BusinessList ariaLabel={t("time.timesheetSection")}>{timesheets.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.employee.displayName}`} leading={<Clock3 className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "timeStatus", item.status)}</StatusBadge>} meta={`${professionalErpDate(item.periodStart, locale)} – ${professionalErpDate(item.periodEnd, locale)}`} description={t("time.declaredApproved", { declared: minutesLabel(item.totalDeclaredMinutes), approved: minutesLabel(item.totalApprovedMinutes) })} onOpen={() => setDetail(item)} actions={<ContextActions label={t("time.timesheetActions")} actions={actionsFor(item)} />} />)}</BusinessList> : <EmptyState compact title={t("time.noTimesheet")} description={t("time.noTimesheetDescription")} />}
      </ModuleSection>
      <ProfessionalHelp moduleCode="TIME_ATTENDANCE" />
    </ModuleContent>

    <Dialog open={leaveOpen} onClose={() => setLeaveOpen(false)} title={t("time.newLeave")} className="h-[94dvh] max-w-4xl"><form onSubmit={createLeave} className="grid gap-5"><ProfessionalFormSection title={t("time.employeeAndPeriod")}><Field label={t("time.employee")}><NativeSelect name="employeeId" required items={[{ id: "", label: t("people.select") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))]} /></Field><Field label={t("time.leaveType")}><NativeSelect name="leaveType" defaultValue="ANNUAL" items={leaveTypeItems} /></Field><Field label={t("time.startDate")}><Input name="startDate" type="date" required /></Field><Field label={t("time.endDate")}><Input name="endDate" type="date" required /></Field><Field label={t("time.approver")}><NativeSelect name="approverUserId" required items={[{ id: "", label: t("people.selectAnother") }, ...lookups.members.map((member) => ({ id: member.id, label: memberLabel(member) }))]} /></Field><Field label={t("time.partialDay")}><label className="mt-3 flex min-h-11 items-center gap-2"><input name="partialDay" type="checkbox" />{t("time.partialDayHelp")}</label></Field><Field label={t("time.startMinute")}><Input name="startMinute" type="number" min="0" max="1439" /></Field><Field label={t("time.endMinute")}><Input name="endMinute" type="number" min="1" max="1440" /></Field><Field label={t("time.reason")}><textarea name="reason" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setLeaveOpen(false)}>{t("people.cancel")}</Button><Button type="submit">{t("time.submitLeave")}</Button></div></form></Dialog>

    <Dialog open={timesheetOpen} onClose={() => setTimesheetOpen(false)} title={t("time.newTimesheet")} className="h-[96dvh] max-w-4xl"><form onSubmit={createTimesheet} className="grid gap-5"><ProfessionalFormSection title={t("time.periodAndApproval")}><Field label={t("time.employee")}><NativeSelect name="employeeId" required items={[{ id: "", label: t("people.select") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))]} /></Field><Field label={t("time.periodStart")}><Input name="periodStart" type="date" required /></Field><Field label={t("time.periodEnd")}><Input name="periodEnd" type="date" required /></Field><Field label={t("time.approver")}><NativeSelect name="approverUserId" required items={[{ id: "", label: t("people.selectAnother") }, ...lookups.members.map((member) => ({ id: member.id, label: memberLabel(member) }))]} /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("time.firstActivity")}><Field label={t("time.workDate")}><Input name="workDate" type="date" required /></Field><Field label={t("time.project")}><NativeSelect name="projectId" items={[{ id: "", label: t("time.outsideProject") }, ...lookups.projects.map((project) => ({ id: project.id, label: `${project.reference} · ${project.name}` }))]} /></Field><Field label={t("time.hours")}><Input name="hours" type="number" min="0" max="24" step="1" defaultValue="1" required /></Field><Field label={t("time.minutes")}><Input name="minutes" type="number" min="0" max="59" step="1" defaultValue="0" /></Field><Field label={t("time.breakMinutes")}><Input name="breakMinutes" type="number" min="0" max="1440" defaultValue="0" /></Field><Field label={t("time.description")}><Input name="serviceDescription" required /></Field><Field label={t("time.billable")}><label className="mt-3 flex min-h-11 items-center gap-2"><input name="billable" type="checkbox" />{t("time.billableHelp")}</label></Field><Field label={t("time.notes")}><Input name="notes" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setTimesheetOpen(false)}>{t("people.cancel")}</Button><Button type="submit">{t("time.submitTimesheet")}</Button></div></form></Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.reference || t("time.detail")} className="h-[88dvh] max-w-4xl">{detail && "entries" in detail ? <div className="grid gap-4"><p className="text-sm text-dtsc-muted">{detail.employee.displayName} · {t("time.declared", { duration: minutesLabel(detail.totalDeclaredMinutes) })}</p><BusinessList ariaLabel={t("time.entries")}>{detail.entries.map((entry) => <BusinessListItem key={entry.id} title={entry.serviceDescription || t("time.activity")} meta={professionalErpDate(entry.workDate, locale)} status={<StatusBadge>{minutesLabel(entry.declaredMinutes)}</StatusBadge>} description={`${entry.billable ? t("time.billableYes") : t("time.billableNo")}${entry.notes ? ` · ${entry.notes}` : ""}`} />)}</BusinessList></div> : detail && "leaveType" in detail ? <div className="grid gap-3 text-sm leading-6"><p><strong>{t("time.employeeLabel")}</strong> {detail.employee.displayName}</p><p><strong>{t("time.periodLabel")}</strong> {t("time.periodRange", { start: professionalErpDate(detail.startDate, locale), end: professionalErpDate(detail.endDate, locale) })}</p><p><strong>{t("time.typeLabel")}</strong> {professionalErpEnumLabel(locale, "leaveType", detail.leaveType)}</p><p><strong>{t("time.reasonLabel")}</strong> {detail.reason || t("people.notProvided")}</p></div> : null}</Dialog>
  </ModuleWorkspace>;
}