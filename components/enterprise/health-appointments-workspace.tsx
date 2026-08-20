"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CalendarDays, CircleHelp, ClipboardPlus, Clock3, Eye, FilePenLine, List, Play, Plus, UserRoundX, XCircle } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import {
  healthClinicalDateTime,
  healthClinicalPriorityLabel,
  healthClinicalStatusLabel,
  healthClinicalT,
  useHealthClinicalLocale,
  type HealthClinicalKey,
  type HealthClinicalLocale,
} from "@/components/enterprise/health-clinical-i18n";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { useToastMessage } from "@/components/ui/use-toast-message";

type Patient = { id: string; legacyRecordId: string | null; patientNumber: string; fullName: string; phonePrimary: string; sex: string; birthDate: string | null };
type Member = { id: string; name: string; role: string };
type Department = { id: string; labelFr: string };
type Event = { id: string; eventType: string; summary: string; fromStatus: string | null; toStatus: string | null; createdAt: string; actor: { name: string } };
type Appointment = {
  id: string;
  legacyRecordId: string | null;
  appointmentNumber: string;
  patientId: string;
  professionalId: string | null;
  departmentId: string | null;
  appointmentDate: string;
  endAt: string | null;
  estimatedDurationMinutes: number | null;
  reason: string;
  description: string | null;
  appointmentType: string;
  priority: string;
  status: string;
  administrativeNotes: string | null;
  internalNotes: string | null;
  convertedConsultationId: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  markedAbsentAt: string | null;
  createdAt: string;
  updatedAt: string;
  patient: Patient;
  professional: { id: string; name: string } | null;
  department: Department | null;
  createdBy: { name: string };
  updatedBy: { name: string } | null;
  events?: Event[];
};
type Permissions = { canCreate: boolean; canUpdate: boolean; canTransition: boolean; canCancel: boolean; canConvert: boolean; canViewSensitive: boolean };
type Form = { patientId: string; professionalId: string; departmentId: string; appointmentDate: string; estimatedDurationMinutes: string; reason: string; description: string; appointmentType: string; priority: string; administrativeNotes: string; internalNotes: string };
type Translator = (key: HealthClinicalKey, values?: Record<string, string | number>) => string;

const APPOINTMENT_TYPE_KEYS = {
  GENERAL_CONSULTATION: "appointment.type.GENERAL_CONSULTATION",
  SPECIALIST_CONSULTATION: "appointment.type.SPECIALIST_CONSULTATION",
  FOLLOW_UP: "appointment.type.FOLLOW_UP",
  CHECKUP: "appointment.type.CHECKUP",
  EMERGENCY: "appointment.type.EMERGENCY",
  LABORATORY: "appointment.type.LABORATORY",
  NURSING_CARE: "appointment.type.NURSING_CARE",
  VACCINATION: "appointment.type.VACCINATION",
  PRENATAL: "appointment.type.PRENATAL",
  OTHER: "appointment.type.OTHER",
} as const satisfies Record<string, HealthClinicalKey>;

const APPOINTMENT_STATUSES = ["SCHEDULED", "CONFIRMED", "WAITING", "IN_PROGRESS", "DONE", "CANCELLED", "NO_SHOW", "CONVERTED"] as const;
const APPOINTMENT_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

const emptyForm = (): Form => ({
  patientId: "",
  professionalId: "",
  departmentId: "",
  appointmentDate: "",
  estimatedDurationMinutes: "30",
  reason: "",
  description: "",
  appointmentType: "GENERAL_CONSULTATION",
  priority: "NORMAL",
  administrativeNotes: "",
  internalNotes: "",
});

function formFromAppointment(item: Appointment): Form {
  return {
    patientId: item.patientId,
    professionalId: item.professionalId || "",
    departmentId: item.departmentId || "",
    appointmentDate: localDateTime(item.appointmentDate),
    estimatedDurationMinutes: String(item.estimatedDurationMinutes || 30),
    reason: item.reason,
    description: item.description || "",
    appointmentType: item.appointmentType,
    priority: item.priority,
    administrativeNotes: item.administrativeNotes || "",
    internalNotes: item.internalNotes || "",
  };
}

function localizedOptions(keys: Record<string, HealthClinicalKey>, t: Translator) {
  return Object.fromEntries(Object.entries(keys).map(([id, key]) => [id, t(key)]));
}

function patientSexLabel(locale: HealthClinicalLocale, value: string) {
  const key = `patient.sex.${value}` as HealthClinicalKey;
  const localized = healthClinicalT(locale, key);
  return localized === key ? value : localized;
}

export function HealthAppointmentsWorkspace({
  organizationId,
  initialPatientLegacyRecordId,
  activeModuleCodes,
  onOpenPatients,
}: {
  organizationId: string;
  initialPatientLegacyRecordId?: string;
  activeModuleCodes: Set<string>;
  onOpenPatients?: () => void;
}) {
  const router = useRouter();
  const locale = useHealthClinicalLocale();
  const t = useCallback<Translator>((key, values) => healthClinicalT(locale, key, values), [locale]);
  const localeCode = locale === "en" ? "en-US" : "fr-FR";
  const typeOptions = useMemo(() => localizedOptions(APPOINTMENT_TYPE_KEYS, t), [t]);
  const statusOptions = useMemo(() => Object.fromEntries(APPOINTMENT_STATUSES.map((id) => [id, healthClinicalStatusLabel(locale, id)])), [locale]);
  const priorityOptions = useMemo(() => Object.fromEntries(APPOINTMENT_PRIORITIES.map((id) => [id, healthClinicalPriorityLabel(locale, id)])), [locale]);
  const initialHandled = useRef("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({ canCreate: false, canUpdate: false, canTransition: false, canCancel: false, canConvert: false, canViewSensitive: false });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const [view, setView] = useState<"list" | "planning">("list");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState<Form>(() => emptyForm());
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ appointment: Appointment; action: string } | null>(null);
  const [actionReason, setActionReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/enterprise/${organizationId}/healthcare/appointments`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { appointments?: Appointment[]; patients?: Patient[]; members?: Member[]; departments?: Department[]; permissions?: Permissions; message?: string } | null;
    if (response.ok && body?.appointments && body.patients && body.members && body.departments && body.permissions) {
      setAppointments(body.appointments);
      setPatients(body.patients);
      setMembers(body.members);
      setDepartments(body.departments);
      setPermissions(body.permissions);
    } else {
      setMessage(body?.message || t("appointment.loadFailed"));
    }
    setLoading(false);
  }, [organizationId, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!initialPatientLegacyRecordId || initialHandled.current === initialPatientLegacyRecordId || !patients.length) return;
    const patient = patients.find((item) => item.legacyRecordId === initialPatientLegacyRecordId);
    if (!patient) return;
    initialHandled.current = initialPatientLegacyRecordId;
    setEditing(null);
    setForm({ ...emptyForm(), patientId: patient.id });
    setFormOpen(true);
  }, [initialPatientLegacyRecordId, patients]);

  const filtered = useMemo(() => appointments.filter((item) => {
    const text = `${item.patient.fullName} ${item.patient.phonePrimary} ${item.patient.patientNumber} ${item.appointmentNumber} ${item.reason}`.toLocaleLowerCase(localeCode);
    const day = item.appointmentDate.slice(0, 10);
    return (
      (!query || text.includes(query.toLocaleLowerCase(localeCode)))
      && (!status || item.status === status)
      && (!priority || item.priority === priority)
      && (!appointmentType || item.appointmentType === appointmentType)
      && (!professionalId || item.professionalId === professionalId)
      && (!dateFrom || day >= dateFrom)
      && (!dateTo || day <= dateTo)
    );
  }), [appointments, query, status, priority, appointmentType, professionalId, dateFrom, dateTo, localeCode]);

  const list = useSmartList({
    items: filtered,
    pageSize: 12,
    getSearchText: useCallback((item: Appointment) => `${item.patient.fullName} ${item.patient.phonePrimary} ${item.patient.patientNumber} ${item.appointmentNumber} ${item.reason}`, []),
  });
  const planning = useMemo(
    () => Object.entries(filtered.reduce<Record<string, Appointment[]>>((groups, item) => {
      const day = item.appointmentDate.slice(0, 10);
      (groups[day] ||= []).push(item);
      return groups;
    }, {})).sort(([a], [b]) => a.localeCompare(b)),
    [filtered],
  );
  const selectedPatient = patients.find((item) => item.id === form.patientId);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(item: Appointment) {
    setEditing(item);
    setForm(formFromAppointment(item));
    setFormOpen(true);
  }

  function change(key: keyof Form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function persistSave() {
    setConfirmEdit(false);
    const payload = { ...form, appointmentDate: new Date(form.appointmentDate).toISOString(), estimatedDurationMinutes: Number(form.estimatedDurationMinutes) };
    const response = await fetch(
      editing ? `/api/enterprise/${organizationId}/healthcare/appointments/${editing.id}` : `/api/enterprise/${organizationId}/healthcare/appointments`,
      { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    );
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? (editing ? t("appointment.updated") : t("appointment.created")) : body?.message || t("appointment.saveFailed"));
    if (response.ok) {
      setFormOpen(false);
      setDetail(null);
      await load();
      router.refresh();
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing) {
      setConfirmEdit(true);
      return;
    }
    await persistSave();
  }

  async function openDetail(item: Appointment) {
    const response = await fetch(`/api/enterprise/${organizationId}/healthcare/appointments/${item.id}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { appointment?: Appointment; message?: string } | null;
    if (response.ok && body?.appointment) setDetail(body.appointment);
    else setMessage(body?.message || t("appointment.detailUnavailable"));
  }

  async function runAction() {
    if (!pendingAction) return;
    const response = await fetch(`/api/enterprise/${organizationId}/healthcare/appointments/${pendingAction.appointment.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: pendingAction.action, reason: actionReason }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? t("appointment.actionSaved") : body?.message || t("appointment.actionFailed"));
    setPendingAction(null);
    setActionReason("");
    setDetail(null);
    if (response.ok) {
      await load();
      router.refresh();
    }
  }

  return (
    <section className="min-w-0 space-y-4 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-black text-dtsc-ink">{t("appointment.title")}</h3>
          <p className="mt-1 max-w-3xl text-sm text-dtsc-muted">{t("appointment.description")}</p>
        </div>
        <div className="grid w-full gap-2 sm:flex sm:w-auto">
          <Button variant="outline" onClick={() => setView(view === "list" ? "planning" : "list")}>{view === "list" ? <CalendarDays /> : <List />}{view === "list" ? t("appointment.viewPlanning") : t("appointment.viewList")}</Button>
          {permissions.canCreate && <Button className="bg-[#002b5b] text-white" onClick={openCreate}><Plus />{t("appointment.new")}</Button>}
        </div>
      </div>

      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Filter label={t("appointment.filter.status")} help={t("appointment.filterHelp", { label: t("appointment.filter.status") })} ariaHelp={t("appointment.filterHelpAria", { label: t("appointment.filter.status") })}><Choice value={status} set={setStatus} options={statusOptions} all={t("common.allStatuses")} /></Filter>
        <Filter label={t("appointment.filter.priority")} help={t("appointment.filterHelp", { label: t("appointment.filter.priority") })} ariaHelp={t("appointment.filterHelpAria", { label: t("appointment.filter.priority") })}><Choice value={priority} set={setPriority} options={priorityOptions} all={t("common.allPriorities")} /></Filter>
        <Filter label={t("appointment.filter.type")} help={t("appointment.filterHelp", { label: t("appointment.filter.type") })} ariaHelp={t("appointment.filterHelpAria", { label: t("appointment.filter.type") })}><Choice value={appointmentType} set={setAppointmentType} options={typeOptions} all={t("appointment.allTypes")} /></Filter>
        <Filter label={t("appointment.filter.professional")} help={t("appointment.filterHelp", { label: t("appointment.filter.professional") })} ariaHelp={t("appointment.filterHelpAria", { label: t("appointment.filter.professional") })}>
          <select value={professionalId} onChange={(event) => setProfessionalId(event.target.value)} className={selectClass}>
            <option value="">{t("appointment.allProfessionals")}</option>
            {members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Filter>
        <Filter label={t("appointment.filter.from")} help={t("appointment.filterHelp", { label: t("appointment.filter.from") })} ariaHelp={t("appointment.filterHelpAria", { label: t("appointment.filter.from") })}><Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></Filter>
        <Filter label={t("appointment.filter.to")} help={t("appointment.filterHelp", { label: t("appointment.filter.to") })} ariaHelp={t("appointment.filterHelpAria", { label: t("appointment.filter.to") })}><Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></Filter>
      </div>

      <ListControls query={query} onQueryChange={setQuery} page={list.page} pageCount={list.pageCount} totalCount={appointments.length} filteredCount={filtered.length} onPageChange={list.setPage} placeholder={t("appointment.searchPlaceholder")} />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((id) => <div key={id} className="h-44 animate-pulse rounded-2xl bg-dtsc-page" />)}</div>
      ) : view === "list" ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.paginatedItems.map((item) => <AppointmentCard key={item.id} item={item} permissions={permissions} activeModuleCodes={activeModuleCodes} detail={openDetail} edit={openEdit} action={(action) => setPendingAction({ appointment: item, action })} t={t} locale={locale} typeOptions={typeOptions} />)}
        </div>
      ) : (
        <div className="grid min-w-0 gap-4">
          {planning.map(([day, items]) => (
            <section key={day} className="min-w-0 rounded-2xl border border-dtsc-border p-3">
              <h4 className="font-black text-cyan-600">{dayLabel(day, locale)}</h4>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => <AppointmentCard key={item.id} item={item} permissions={permissions} activeModuleCodes={activeModuleCodes} detail={openDetail} edit={openEdit} action={(action) => setPendingAction({ appointment: item, action })} t={t} locale={locale} typeOptions={typeOptions} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {!loading && !filtered.length && (
        <div className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-6 text-center">
          <p className="font-black">{t("appointment.emptyTitle")}</p>
          <p className="mt-1 text-sm text-dtsc-muted">{t("appointment.emptyDescription")}</p>
        </div>
      )}

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} title={editing ? t("appointment.form.editTitle", { number: editing.appointmentNumber }) : t("appointment.form.newTitle")} description={t("appointment.form.description")} className="h-[94dvh] max-w-6xl">
        <form onSubmit={save} className="grid min-w-0 gap-4 overflow-x-hidden">
          <Section title={t("appointment.section.patient")}>
            <Grid>
              <F label={t("appointment.field.patient")} help={t("appointment.help.patient")}>
                <select required value={form.patientId} onChange={(event) => change("patientId", event.target.value)} className={selectClass}>
                  <option value="">{t("appointment.selectPatient")}</option>
                  {patients.map((item) => <option key={item.id} value={item.id}>{item.patientNumber} · {item.fullName}</option>)}
                </select>
              </F>
              {selectedPatient && <Info title={t("appointment.selectedPatient")} rows={[[t("appointment.field.phone"), selectedPatient.phonePrimary], [t("appointment.field.sex"), patientSexLabel(locale, selectedPatient.sex)], [t("appointment.field.age"), age(selectedPatient.birthDate, t)]]} emptyValue={t("common.notProvided")} />}
            </Grid>
          </Section>

          <Section title={t("appointment.section.dateTime")}>
            <Grid>
              <F label={t("appointment.field.startAt")} help={t("appointment.help.startAt")}><Input required type="datetime-local" value={form.appointmentDate} onChange={(event) => change("appointmentDate", event.target.value)} /></F>
              <F label={t("appointment.field.duration")} help={t("appointment.help.duration")}><Input required type="number" min="5" max="1440" value={form.estimatedDurationMinutes} onChange={(event) => change("estimatedDurationMinutes", event.target.value)} /></F>
            </Grid>
          </Section>

          <Section title={t("appointment.section.reason")}>
            <Grid>
              <F label={t("appointment.field.reason")} help={t("appointment.help.reason")}><Input required value={form.reason} onChange={(event) => change("reason", event.target.value)} /></F>
              <F label={t("appointment.field.type")} help={t("appointment.help.type")}><Choice value={form.appointmentType} set={(value) => change("appointmentType", value)} options={typeOptions} /></F>
              <F label={t("appointment.field.description")} help={t("appointment.help.description")}><Area value={form.description} set={(value) => change("description", value)} /></F>
            </Grid>
          </Section>

          <Section title={t("appointment.section.assignment")}>
            <Grid>
              <F label={t("appointment.field.professional")} help={t("appointment.help.professional")}>
                <select value={form.professionalId} onChange={(event) => change("professionalId", event.target.value)} className={selectClass}>
                  <option value="">{t("appointment.unassigned")}</option>
                  {members.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}
                </select>
              </F>
              <F label={t("appointment.field.department")} help={t("appointment.help.department")}>
                <select value={form.departmentId} onChange={(event) => change("departmentId", event.target.value)} className={selectClass}>
                  <option value="">{t("common.notProvided")}</option>
                  {departments.map((item) => <option key={item.id} value={item.id}>{item.labelFr}</option>)}
                </select>
              </F>
              <F label={t("appointment.field.priority")} help={t("appointment.help.priority")}><Choice value={form.priority} set={(value) => change("priority", value)} options={priorityOptions} /></F>
            </Grid>
          </Section>

          <Section title={t("appointment.section.notes")}>
            <Grid>
              <F label={t("appointment.field.administrativeNotes")} help={t("appointment.help.administrativeNotes")}><Area value={form.administrativeNotes} set={(value) => change("administrativeNotes", value)} /></F>
              {permissions.canViewSensitive && <F label={t("appointment.field.internalNotes")} help={t("appointment.help.internalNotes")}><Area value={form.internalNotes} set={(value) => change("internalNotes", value)} /></F>}
            </Grid>
          </Section>

          <div className="grid gap-2 sm:flex">
            <Button className="w-full bg-[#002b5b] text-white sm:w-auto">{t("common.save")}</Button>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setFormOpen(false)}>{t("common.cancel")}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.appointmentNumber} · ${detail.patient.fullName}` : t("appointment.detailFallbackTitle")} description={t("appointment.detailDescription")} className="h-[94dvh] max-w-6xl">
        {detail && <AppointmentDetail item={detail} permissions={permissions} activeModuleCodes={activeModuleCodes} edit={openEdit} action={(action) => setPendingAction({ appointment: detail, action })} onOpenPatients={onOpenPatients} t={t} locale={locale} typeOptions={typeOptions} />}
      </Dialog>

      <Dialog open={Boolean(pendingAction)} onClose={() => setPendingAction(null)} title={t("appointment.action.confirmTitle")} description={pendingAction?.action === "cancel" ? t("appointment.action.cancelDescription") : t("appointment.action.transitionDescription")} className="max-w-xl">
        <div className="grid gap-3">
          {pendingAction?.action === "cancel" && <F label={t("appointment.field.cancellationReason")} help={t("appointment.help.cancellationReason")}><Area required value={actionReason} set={setActionReason} /></F>}
          <div className="grid gap-2 sm:flex">
            <Button onClick={() => void runAction()} disabled={pendingAction?.action === "cancel" && !actionReason.trim()}>{t("appointment.confirm")}</Button>
            <Button variant="outline" onClick={() => setPendingAction(null)}>{t("appointment.back")}</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={confirmEdit} onClose={() => setConfirmEdit(false)} title={t("appointment.editConfirmTitle")} description={t("appointment.editConfirmDescription")} className="max-w-xl">
        <div className="grid gap-2 sm:flex">
          <Button onClick={() => void persistSave()}>{t("appointment.confirmEdit")}</Button>
          <Button variant="outline" onClick={() => setConfirmEdit(false)}>{t("appointment.backToForm")}</Button>
        </div>
      </Dialog>
    </section>
  );
}

function AppointmentCard({
  item,
  permissions,
  activeModuleCodes,
  detail,
  edit,
  action,
  t,
  locale,
  typeOptions,
}: {
  item: Appointment;
  permissions: Permissions;
  activeModuleCodes: Set<string>;
  detail: (item: Appointment) => Promise<void>;
  edit: (item: Appointment) => void;
  action: (action: string) => void;
  t: Translator;
  locale: HealthClinicalLocale;
  typeOptions: Record<string, string>;
}) {
  const actions = appointmentActions(item, permissions, activeModuleCodes, () => void detail(item), () => edit(item), action, t);
  return (
    <article className="relative min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 pr-14">
      <div className="absolute right-3 top-3"><ActionMenu items={actions} /></div>
      <div className="flex flex-wrap gap-2"><Badge text={healthClinicalStatusLabel(locale, item.status)} /><Badge text={healthClinicalPriorityLabel(locale, item.priority)} /></div>
      <button type="button" onClick={() => void detail(item)} className="mt-3 block min-w-0 text-left">
        <p className="text-xs font-black uppercase text-cyan-600">{item.appointmentNumber}</p>
        <h4 className="mt-1 break-words font-black">{item.patient.fullName}</h4>
        <p className="mt-1 text-sm text-dtsc-muted">{healthClinicalDateTime(item.appointmentDate, locale)} · {item.professional?.name || t("appointment.unassigned")}</p>
        <p className="mt-2 text-sm font-bold">{item.reason}</p>
        <p className="mt-1 text-xs text-dtsc-muted">{typeOptions[item.appointmentType] || item.appointmentType} · {item.patient.phonePrimary}</p>
      </button>
    </article>
  );
}

function AppointmentDetail({
  item,
  permissions,
  activeModuleCodes,
  edit,
  action,
  onOpenPatients,
  t,
  locale,
  typeOptions,
}: {
  item: Appointment;
  permissions: Permissions;
  activeModuleCodes: Set<string>;
  edit: (item: Appointment) => void;
  action: (action: string) => void;
  onOpenPatients?: () => void;
  t: Translator;
  locale: HealthClinicalLocale;
  typeOptions: Record<string, string>;
}) {
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap gap-2">
        {onOpenPatients && <Button variant="outline" onClick={onOpenPatients}>{t("appointment.openPatients")}</Button>}
        {permissions.canUpdate && !["DONE", "CANCELLED", "CONVERTED"].includes(item.status) && <Button onClick={() => edit(item)}><FilePenLine />{t("appointment.action.edit")}</Button>}
        {appointmentActions(item, permissions, activeModuleCodes, () => undefined, () => undefined, action, t).filter((entry) => !["detail", "edit"].includes(entry.key)).map((entry) => <Button key={entry.key} variant="outline" onClick={entry.onSelect}>{entry.label}</Button>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Info title={t("appointment.info.summary")} rows={[[t("appointment.field.identifier"), item.appointmentNumber], [t("appointment.field.dateTime"), healthClinicalDateTime(item.appointmentDate, locale)], [t("appointment.field.durationShort"), t("appointment.minutes", { count: item.estimatedDurationMinutes || 0 })], [t("appointment.field.typeShort"), typeOptions[item.appointmentType] || item.appointmentType], [t("appointment.field.reasonShort"), item.reason], [t("appointment.field.status"), healthClinicalStatusLabel(locale, item.status)], [t("appointment.field.priorityShort"), healthClinicalPriorityLabel(locale, item.priority)]]} emptyValue={t("common.notProvided")} />
        <Info title={t("appointment.info.patient")} rows={[[t("appointment.field.identifier"), item.patient.patientNumber], [t("appointment.field.name"), item.patient.fullName], [t("appointment.field.phone"), item.patient.phonePrimary], [t("appointment.field.sex"), patientSexLabel(locale, item.patient.sex)], [t("appointment.field.age"), age(item.patient.birthDate, t)]]} emptyValue={t("common.notProvided")} />
        <Info title={t("appointment.info.professional")} rows={[[t("appointment.field.name"), item.professional?.name], [t("appointment.field.department"), item.department?.labelFr], [t("appointment.field.endAt"), item.endAt ? healthClinicalDateTime(item.endAt, locale) : null]]} emptyValue={t("common.notProvided")} />
        <Info title={t("appointment.info.administrative")} rows={[[t("appointment.field.createdBy"), item.createdBy.name], [t("appointment.field.createdAt"), healthClinicalDateTime(item.createdAt, locale)], [t("appointment.field.updatedBy"), item.updatedBy?.name], [t("appointment.field.updatedAt"), healthClinicalDateTime(item.updatedAt, locale)], [t("appointment.field.cancellationReasonShort"), item.cancellationReason]]} emptyValue={t("common.notProvided")} />
      </div>

      <section className="rounded-2xl border border-dtsc-border p-4">
        <h4 className="font-black">{t("appointment.info.history")}</h4>
        <div className="mt-3 grid gap-2">
          {item.events?.map((event) => (
            <article key={event.id} className="rounded-xl bg-dtsc-page p-3">
              <p className="text-xs font-black uppercase text-cyan-600">{event.eventType} · {event.actor.name}</p>
              <p className="mt-1 text-sm">{event.summary}</p>
              <p className="mt-1 text-xs text-dtsc-muted">{healthClinicalDateTime(event.createdAt, locale)}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function appointmentActions(
  item: Appointment,
  permissions: Permissions,
  activeModuleCodes: Set<string>,
  detail: () => void,
  edit: () => void,
  action: (action: string) => void,
  t: Translator,
): ActionMenuItem[] {
  const items: ActionMenuItem[] = [{ key: "detail", label: t("appointment.action.viewDetail"), icon: Eye, onSelect: detail }];
  if (permissions.canUpdate && !["DONE", "CANCELLED", "CONVERTED"].includes(item.status)) items.push({ key: "edit", label: t("appointment.action.edit"), icon: FilePenLine, onSelect: edit });
  if (permissions.canTransition && item.status === "SCHEDULED") items.push({ key: "confirm", label: t("appointment.action.confirm"), icon: BadgeCheck, onSelect: () => action("confirm") });
  if (permissions.canTransition && item.status === "CONFIRMED") items.push({ key: "wait", label: t("appointment.action.wait"), icon: Clock3, onSelect: () => action("wait") });
  if (permissions.canTransition && ["CONFIRMED", "WAITING"].includes(item.status)) items.push({ key: "start", label: t("appointment.action.start"), icon: Play, onSelect: () => action("start") });
  if (permissions.canTransition && item.status === "IN_PROGRESS") items.push({ key: "complete", label: t("appointment.action.complete"), icon: BadgeCheck, onSelect: () => action("complete") });
  if (permissions.canTransition && ["SCHEDULED", "CONFIRMED", "WAITING"].includes(item.status)) items.push({ key: "mark_absent", label: t("appointment.action.absent"), icon: UserRoundX, onSelect: () => action("mark_absent") });
  if (permissions.canConvert && activeModuleCodes.has("CONSULTATIONS") && ["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "DONE"].includes(item.status)) items.push({ key: "convert_consultation", label: t("appointment.action.convert"), icon: ClipboardPlus, onSelect: () => action("convert_consultation") });
  if (permissions.canCancel && ["SCHEDULED", "CONFIRMED", "WAITING", "IN_PROGRESS"].includes(item.status)) items.push({ key: "cancel", label: t("appointment.action.cancel"), icon: XCircle, destructive: true, onSelect: () => action("cancel") });
  return items;
}

const selectClass = "h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink";

function Filter({ label, help, ariaHelp, children }: { label: string; help: string; ariaHelp: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1 text-xs font-black uppercase text-dtsc-muted"><span className="flex items-center gap-1">{label}<span title={help} aria-label={ariaHelp}><CircleHelp className="h-3.5 w-3.5" /></span></span>{children}</label>;
}

function F({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1"><span className="flex items-center gap-1 text-xs font-black uppercase text-dtsc-muted">{label}<span title={help} aria-label={`${label} : ${help}`}><CircleHelp className="h-3.5 w-3.5" /></span></span>{children}</label>;
}

function Choice({ value, set, options, all }: { value: string; set: (value: string) => void; options: Record<string, string>; all?: string }) {
  return <select value={value} onChange={(event) => set(event.target.value)} className={selectClass}>{all && <option value="">{all}</option>}{Object.entries(options).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>;
}

function Area({ value, set, required }: { value: string; set: (value: string) => void; required?: boolean }) {
  return <textarea required={required} value={value} onChange={(event) => set(event.target.value)} className="min-h-24 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4"><h4 className="font-black text-cyan-600">{title}</h4>{children}</section>;
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 gap-3 md:grid-cols-2">{children}</div>;
}

function Info({ title, rows, emptyValue }: { title: string; rows: Array<[string, string | null | undefined]>; emptyValue: string }) {
  return <section className="min-w-0 rounded-2xl border border-dtsc-border p-4"><h4 className="font-black">{title}</h4><dl className="mt-3 grid gap-2">{rows.map(([label, value]) => <div key={label} className="grid gap-1 rounded-xl bg-dtsc-page p-3"><dt className="text-xs font-black uppercase text-dtsc-muted">{label}</dt><dd className="break-words text-sm font-bold">{value || emptyValue}</dd></div>)}</dl></section>;
}

function Badge({ text }: { text: string }) {
  return <span className="rounded-full bg-cyan-400/15 px-2 py-1 text-xs font-black text-cyan-700">{text}</span>;
}

function dayLabel(value: string, locale: HealthClinicalLocale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { dateStyle: "full" }).format(new Date(`${value}T12:00:00`));
}

function localDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function age(value: string | null, t: Translator) {
  if (!value) return t("appointment.ageUnknown");
  const birth = new Date(value);
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) years--;
  return t("appointment.years", { count: years });
}
