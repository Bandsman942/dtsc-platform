"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CalendarDays, CircleHelp, ClipboardPlus, Clock3, Eye, FilePenLine, List, Play, Plus, UserRoundX, XCircle } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";

import { useToastMessage } from "@/components/ui/use-toast-message";
type Patient = { id: string; legacyRecordId: string | null; patientNumber: string; fullName: string; phonePrimary: string; sex: string; birthDate: string | null };
type Member = { id: string; name: string; role: string };
type Department = { id: string; labelFr: string };
type Event = { id: string; eventType: string; summary: string; fromStatus: string | null; toStatus: string | null; createdAt: string; actor: { name: string } };
type Appointment = {
  id: string; legacyRecordId: string | null; appointmentNumber: string; patientId: string; professionalId: string | null; departmentId: string | null;
  appointmentDate: string; endAt: string | null; estimatedDurationMinutes: number | null; reason: string; description: string | null; appointmentType: string;
  priority: string; status: string; administrativeNotes: string | null; internalNotes: string | null; convertedConsultationId: string | null;
  confirmedAt: string | null; cancelledAt: string | null; cancellationReason: string | null; markedAbsentAt: string | null; createdAt: string; updatedAt: string;
  patient: Patient; professional: { id: string; name: string } | null; department: Department | null; createdBy: { name: string }; updatedBy: { name: string } | null; events?: Event[];
};
type Permissions = { canCreate: boolean; canUpdate: boolean; canTransition: boolean; canCancel: boolean; canConvert: boolean; canViewSensitive: boolean };
type Form = { patientId: string; professionalId: string; departmentId: string; appointmentDate: string; estimatedDurationMinutes: string; reason: string; description: string; appointmentType: string; priority: string; administrativeNotes: string; internalNotes: string };

const STATUS: Record<string, string> = { SCHEDULED: "Planifié", CONFIRMED: "Confirmé", WAITING: "En attente", IN_PROGRESS: "En cours", DONE: "Réalisé", CANCELLED: "Annulé", NO_SHOW: "Absent", CONVERTED: "Converti en consultation" };
const PRIORITY: Record<string, string> = { LOW: "Faible", NORMAL: "Normale", HIGH: "Élevée", URGENT: "Urgente" };
const TYPES: Record<string, string> = { GENERAL_CONSULTATION: "Consultation générale", SPECIALIST_CONSULTATION: "Consultation spécialisée", FOLLOW_UP: "Suivi", CHECKUP: "Contrôle", EMERGENCY: "Urgence", LABORATORY: "Laboratoire", NURSING_CARE: "Soins infirmiers", VACCINATION: "Vaccination", PRENATAL: "Consultation prénatale", OTHER: "Autre" };
const emptyForm = (): Form => ({ patientId: "", professionalId: "", departmentId: "", appointmentDate: "", estimatedDurationMinutes: "30", reason: "", description: "", appointmentType: "GENERAL_CONSULTATION", priority: "NORMAL", administrativeNotes: "", internalNotes: "" });

function formFromAppointment(item: Appointment): Form {
  return { patientId: item.patientId, professionalId: item.professionalId || "", departmentId: item.departmentId || "", appointmentDate: localDateTime(item.appointmentDate), estimatedDurationMinutes: String(item.estimatedDurationMinutes || 30), reason: item.reason, description: item.description || "", appointmentType: item.appointmentType, priority: item.priority, administrativeNotes: item.administrativeNotes || "", internalNotes: item.internalNotes || "" };
}

export function HealthAppointmentsWorkspace({ organizationId, initialPatientLegacyRecordId, activeModuleCodes, onOpenPatients }: { organizationId: string; initialPatientLegacyRecordId?: string; activeModuleCodes: Set<string>; onOpenPatients?: () => void }) {
  const router = useRouter();
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
      setAppointments(body.appointments); setPatients(body.patients); setMembers(body.members); setDepartments(body.departments); setPermissions(body.permissions);
    } else setMessage(body?.message || "Chargement des rendez-vous impossible.");
    setLoading(false);
  }, [organizationId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!initialPatientLegacyRecordId || initialHandled.current === initialPatientLegacyRecordId || !patients.length) return;
    const patient = patients.find((item) => item.legacyRecordId === initialPatientLegacyRecordId);
    if (!patient) return;
    initialHandled.current = initialPatientLegacyRecordId;
    setEditing(null); setForm({ ...emptyForm(), patientId: patient.id }); setFormOpen(true);
  }, [initialPatientLegacyRecordId, patients]);

  const filtered = useMemo(() => appointments.filter((item) => {
    const text = `${item.patient.fullName} ${item.patient.phonePrimary} ${item.patient.patientNumber} ${item.appointmentNumber} ${item.reason}`.toLocaleLowerCase("fr");
    const day = item.appointmentDate.slice(0, 10);
    return (!query || text.includes(query.toLocaleLowerCase("fr"))) && (!status || item.status === status) && (!priority || item.priority === priority) && (!appointmentType || item.appointmentType === appointmentType) && (!professionalId || item.professionalId === professionalId) && (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
  }), [appointments, query, status, priority, appointmentType, professionalId, dateFrom, dateTo]);
  const list = useSmartList({ items: filtered, pageSize: 12, getSearchText: useCallback((item: Appointment) => `${item.patient.fullName} ${item.patient.phonePrimary} ${item.patient.patientNumber} ${item.appointmentNumber} ${item.reason}`, []) });
  const planning = useMemo(() => Object.entries(filtered.reduce<Record<string, Appointment[]>>((groups, item) => { const day = item.appointmentDate.slice(0, 10); (groups[day] ||= []).push(item); return groups; }, {})).sort(([a], [b]) => a.localeCompare(b)), [filtered]);
  const selectedPatient = patients.find((item) => item.id === form.patientId);

  function openCreate() { setEditing(null); setForm(emptyForm()); setFormOpen(true); }
  function openEdit(item: Appointment) { setEditing(item); setForm(formFromAppointment(item)); setFormOpen(true); }
  function change(key: keyof Form, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function persistSave() {
    setConfirmEdit(false);
    const payload = { ...form, appointmentDate: new Date(form.appointmentDate).toISOString(), estimatedDurationMinutes: Number(form.estimatedDurationMinutes) };
    const response = await fetch(editing ? `/api/enterprise/${organizationId}/healthcare/appointments/${editing.id}` : `/api/enterprise/${organizationId}/healthcare/appointments`, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? (editing ? "Rendez-vous modifié avec succès." : "Rendez-vous créé avec succès.") : body?.message || "Enregistrement impossible.");
    if (response.ok) { setFormOpen(false); setDetail(null); await load(); router.refresh(); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing) { setConfirmEdit(true); return; }
    await persistSave();
  }
  async function openDetail(item: Appointment) {
    const response = await fetch(`/api/enterprise/${organizationId}/healthcare/appointments/${item.id}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { appointment?: Appointment; message?: string } | null;
    if (response.ok && body?.appointment) setDetail(body.appointment); else setMessage(body?.message || "Détail du rendez-vous indisponible.");
  }
  async function runAction() {
    if (!pendingAction) return;
    const response = await fetch(`/api/enterprise/${organizationId}/healthcare/appointments/${pendingAction.appointment.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: pendingAction.action, reason: actionReason }) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Action rendez-vous enregistrée et historisée." : body?.message || "Action impossible.");
    setPendingAction(null); setActionReason(""); setDetail(null);
    if (response.ok) { await load(); router.refresh(); }
  }

  return <section className="min-w-0 space-y-4 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-5">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-xl font-black text-dtsc-ink">Rendez-vous</h3><p className="mt-1 max-w-3xl text-sm text-dtsc-muted">Planifiez les patients, assignez les professionnels et suivez chaque transition jusqu’à la consultation.</p></div><div className="grid w-full gap-2 sm:flex sm:w-auto"><Button variant="outline" onClick={() => setView(view === "list" ? "planning" : "list")}>{view === "list" ? <CalendarDays /> : <List />}{view === "list" ? "Vue planning" : "Vue liste"}</Button>{permissions.canCreate && <Button className="bg-[#002b5b] text-white" onClick={openCreate}><Plus />Nouveau rendez-vous</Button>}</div></div>
    <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4"><Filter label="Statut"><Choice value={status} set={setStatus} options={STATUS} all="Tous les statuts" /></Filter><Filter label="Priorité"><Choice value={priority} set={setPriority} options={PRIORITY} all="Toutes les priorités" /></Filter><Filter label="Type"><Choice value={appointmentType} set={setAppointmentType} options={TYPES} all="Tous les types" /></Filter><Filter label="Professionnel"><select value={professionalId} onChange={(event) => setProfessionalId(event.target.value)} className={selectClass}><option value="">Tous les professionnels</option>{members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Filter><Filter label="Du"><Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></Filter><Filter label="Au"><Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></Filter></div>
    <ListControls query={query} onQueryChange={setQuery} page={list.page} pageCount={list.pageCount} totalCount={appointments.length} filteredCount={filtered.length} onPageChange={list.setPage} placeholder="Patient, téléphone, identifiant ou motif..." />
    {loading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1,2,3].map((id) => <div key={id} className="h-44 animate-pulse rounded-2xl bg-dtsc-page" />)}</div> : view === "list" ? <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.paginatedItems.map((item) => <AppointmentCard key={item.id} item={item} permissions={permissions} activeModuleCodes={activeModuleCodes} detail={openDetail} edit={openEdit} action={(action) => setPendingAction({ appointment: item, action })} />)}</div> : <div className="grid min-w-0 gap-4">{planning.map(([day, items]) => <section key={day} className="min-w-0 rounded-2xl border border-dtsc-border p-3"><h4 className="font-black text-cyan-600">{dayLabel(day)}</h4><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <AppointmentCard key={item.id} item={item} permissions={permissions} activeModuleCodes={activeModuleCodes} detail={openDetail} edit={openEdit} action={(action) => setPendingAction({ appointment: item, action })} />)}</div></section>)}</div>}
    {!loading && !filtered.length && <div className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-6 text-center"><p className="font-black">Aucun rendez-vous enregistré pour cette entreprise.</p><p className="mt-1 text-sm text-dtsc-muted">Créez un rendez-vous à partir d’un patient actif.</p></div>}

    <Dialog open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Modifier ${editing.appointmentNumber}` : "Nouveau rendez-vous"} description="Formulaire plein écran lié à un patient et aux référentiels de l’entreprise." className="h-[94dvh] max-w-6xl"><form onSubmit={save} className="grid min-w-0 gap-4 overflow-x-hidden"><Section title="Patient concerné"><Grid><F label="Patient" help="Sélection obligatoire parmi les patients actifs de cette entreprise."><select required value={form.patientId} onChange={(event) => change("patientId", event.target.value)} className={selectClass}><option value="">Sélectionner un patient</option>{patients.map((item) => <option key={item.id} value={item.id}>{item.patientNumber} · {item.fullName}</option>)}</select></F>{selectedPatient && <Info title="Patient sélectionné" rows={[["Téléphone", selectedPatient.phonePrimary], ["Sexe", selectedPatient.sex], ["Âge", age(selectedPatient.birthDate)]]} />}</Grid></Section><Section title="Date et heure"><Grid><F label="Date et heure de début" help="Créneau prévu pour accueillir le patient."><Input required type="datetime-local" value={form.appointmentDate} onChange={(event) => change("appointmentDate", event.target.value)} /></F><F label="Durée estimée en minutes" help="Permet de calculer l’heure de fin indicative."><Input required type="number" min="5" max="1440" value={form.estimatedDurationMinutes} onChange={(event) => change("estimatedDurationMinutes", event.target.value)} /></F></Grid></Section><Section title="Motif"><Grid><F label="Motif principal" help="Raison principale communiquée pour le rendez-vous."><Input required value={form.reason} onChange={(event) => change("reason", event.target.value)} /></F><F label="Type de rendez-vous" help="Catégorie commerciale et clinique du rendez-vous."><Choice value={form.appointmentType} set={(value) => change("appointmentType", value)} options={TYPES} /></F><F label="Description courte" help="Informations administratives utiles à la préparation."><Area value={form.description} set={(value) => change("description", value)} /></F></Grid></Section><Section title="Professionnel et service"><Grid><F label="Professionnel assigné" help="Membre actif responsable du rendez-vous."><select value={form.professionalId} onChange={(event) => change("professionalId", event.target.value)} className={selectClass}><option value="">Non assigné</option>{members.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></F><F label="Service" help="Service actif qui prendra en charge le patient."><select value={form.departmentId} onChange={(event) => change("departmentId", event.target.value)} className={selectClass}><option value="">Non renseigné</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.labelFr}</option>)}</select></F><F label="Priorité" help="Niveau de priorité opérationnelle."><Choice value={form.priority} set={(value) => change("priority", value)} options={PRIORITY} /></F></Grid></Section><Section title="Notes"><Grid><F label="Commentaire administratif" help="Consignes visibles dans le suivi administratif."><Area value={form.administrativeNotes} set={(value) => change("administrativeNotes", value)} /></F>{permissions.canViewSensitive && <F label="Notes internes protégées" help="Notes réservées aux utilisateurs autorisés."><Area value={form.internalNotes} set={(value) => change("internalNotes", value)} /></F>}</Grid></Section><div className="grid gap-2 sm:flex"><Button className="w-full bg-[#002b5b] text-white sm:w-auto">Enregistrer</Button><Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setFormOpen(false)}>Annuler</Button></div></form></Dialog>
    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.appointmentNumber} · ${detail.patient.fullName}` : "Détail rendez-vous"} description="Résumé, patient lié, professionnel et historique." className="h-[94dvh] max-w-6xl">{detail && <AppointmentDetail item={detail} permissions={permissions} activeModuleCodes={activeModuleCodes} edit={openEdit} action={(action) => setPendingAction({ appointment: detail, action })} onOpenPatients={onOpenPatients} />}</Dialog>
    <Dialog open={Boolean(pendingAction)} onClose={() => setPendingAction(null)} title="Confirmer l’action" description={pendingAction?.action === "cancel" ? "L’annulation exige un motif professionnel." : "Cette transition sera persistée et historisée."} className="max-w-xl"><div className="grid gap-3">{pendingAction?.action === "cancel" && <F label="Motif d’annulation" help="Motif obligatoire conservé dans l’historique."><Area required value={actionReason} set={setActionReason} /></F>}<div className="grid gap-2 sm:flex"><Button onClick={() => void runAction()} disabled={pendingAction?.action === "cancel" && !actionReason.trim()}>Confirmer</Button><Button variant="outline" onClick={() => setPendingAction(null)}>Retour</Button></div></div></Dialog>
    <Dialog open={confirmEdit} onClose={() => setConfirmEdit(false)} title="Confirmer la modification" description="La date, le patient ou le professionnel peuvent modifier l’organisation des soins. Cette modification sera historisée." className="max-w-xl"><div className="grid gap-2 sm:flex"><Button onClick={() => void persistSave()}>Confirmer la modification</Button><Button variant="outline" onClick={() => setConfirmEdit(false)}>Retour au formulaire</Button></div></Dialog>
  </section>;
}

function AppointmentCard({ item, permissions, activeModuleCodes, detail, edit, action }: { item: Appointment; permissions: Permissions; activeModuleCodes: Set<string>; detail: (item: Appointment) => Promise<void>; edit: (item: Appointment) => void; action: (action: string) => void }) {
  const actions = appointmentActions(item, permissions, activeModuleCodes, () => void detail(item), () => edit(item), action);
  return <article className="relative min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 pr-14"><div className="absolute right-3 top-3"><ActionMenu items={actions} /></div><div className="flex flex-wrap gap-2"><Badge text={STATUS[item.status] || item.status} /><Badge text={PRIORITY[item.priority] || item.priority} /></div><button type="button" onClick={() => void detail(item)} className="mt-3 block min-w-0 text-left"><p className="text-xs font-black uppercase text-cyan-600">{item.appointmentNumber}</p><h4 className="mt-1 break-words font-black">{item.patient.fullName}</h4><p className="mt-1 text-sm text-dtsc-muted">{dateTime(item.appointmentDate)} · {item.professional?.name || "Non assigné"}</p><p className="mt-2 text-sm font-bold">{item.reason}</p><p className="mt-1 text-xs text-dtsc-muted">{TYPES[item.appointmentType] || item.appointmentType} · {item.patient.phonePrimary}</p></button></article>;
}

function AppointmentDetail({ item, permissions, activeModuleCodes, edit, action, onOpenPatients }: { item: Appointment; permissions: Permissions; activeModuleCodes: Set<string>; edit: (item: Appointment) => void; action: (action: string) => void; onOpenPatients?: () => void }) {
  return <div className="grid min-w-0 gap-4"><div className="flex flex-wrap gap-2">{onOpenPatients && <Button variant="outline" onClick={onOpenPatients}>Voir le module Patients</Button>}{permissions.canUpdate && !["DONE","CANCELLED","CONVERTED"].includes(item.status) && <Button onClick={() => edit(item)}><FilePenLine />Modifier</Button>}{appointmentActions(item, permissions, activeModuleCodes, () => undefined, () => undefined, action).filter((entry) => !["detail","edit"].includes(entry.key)).map((entry) => <Button key={entry.key} variant="outline" onClick={entry.onSelect}>{entry.label}</Button>)}</div><div className="grid gap-4 lg:grid-cols-2"><Info title="Résumé du rendez-vous" rows={[["Identifiant",item.appointmentNumber],["Date et heure",dateTime(item.appointmentDate)],["Durée",`${item.estimatedDurationMinutes || 0} minutes`],["Type",TYPES[item.appointmentType]||item.appointmentType],["Motif",item.reason],["Statut",STATUS[item.status]||item.status],["Priorité",PRIORITY[item.priority]||item.priority]]}/><Info title="Patient lié" rows={[["Identifiant",item.patient.patientNumber],["Nom",item.patient.fullName],["Téléphone",item.patient.phonePrimary],["Sexe",item.patient.sex],["Âge",age(item.patient.birthDate)]]}/><Info title="Professionnel assigné" rows={[["Nom",item.professional?.name],["Service",item.department?.labelFr],["Créneau de fin",item.endAt?dateTime(item.endAt):null]]}/><Info title="Suivi administratif" rows={[["Créé par",item.createdBy.name],["Créé le",dateTime(item.createdAt)],["Modifié par",item.updatedBy?.name],["Dernière modification",dateTime(item.updatedAt)],["Motif annulation",item.cancellationReason]]}/></div><section className="rounded-2xl border border-dtsc-border p-4"><h4 className="font-black">Historique</h4><div className="mt-3 grid gap-2">{item.events?.map((event) => <article key={event.id} className="rounded-xl bg-dtsc-page p-3"><p className="text-xs font-black uppercase text-cyan-600">{event.eventType} · {event.actor.name}</p><p className="mt-1 text-sm">{event.summary}</p><p className="mt-1 text-xs text-dtsc-muted">{dateTime(event.createdAt)}</p></article>)}</div></section></div>;
}

function appointmentActions(item: Appointment, permissions: Permissions, activeModuleCodes: Set<string>, detail: () => void, edit: () => void, action: (action: string) => void): ActionMenuItem[] {
  const items: ActionMenuItem[] = [{ key: "detail", label: "Voir le détail", icon: Eye, onSelect: detail }];
  if (permissions.canUpdate && !["DONE","CANCELLED","CONVERTED"].includes(item.status)) items.push({ key: "edit", label: "Modifier", icon: FilePenLine, onSelect: edit });
  if (permissions.canTransition && item.status === "SCHEDULED") items.push({ key: "confirm", label: "Confirmer", icon: BadgeCheck, onSelect: () => action("confirm") });
  if (permissions.canTransition && item.status === "CONFIRMED") items.push({ key: "wait", label: "Marquer en attente", icon: Clock3, onSelect: () => action("wait") });
  if (permissions.canTransition && ["CONFIRMED","WAITING"].includes(item.status)) items.push({ key: "start", label: "Démarrer", icon: Play, onSelect: () => action("start") });
  if (permissions.canTransition && item.status === "IN_PROGRESS") items.push({ key: "complete", label: "Marquer réalisé", icon: BadgeCheck, onSelect: () => action("complete") });
  if (permissions.canTransition && ["SCHEDULED","CONFIRMED","WAITING"].includes(item.status)) items.push({ key: "mark_absent", label: "Marquer absent", icon: UserRoundX, onSelect: () => action("mark_absent") });
  if (permissions.canConvert && activeModuleCodes.has("CONSULTATIONS") && ["SCHEDULED","CONFIRMED","IN_PROGRESS","DONE"].includes(item.status)) items.push({ key: "convert_consultation", label: "Convertir en consultation", icon: ClipboardPlus, onSelect: () => action("convert_consultation") });
  if (permissions.canCancel && ["SCHEDULED","CONFIRMED","WAITING","IN_PROGRESS"].includes(item.status)) items.push({ key: "cancel", label: "Annuler", icon: XCircle, destructive: true, onSelect: () => action("cancel") });
  return items;
}

const selectClass = "h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink";
function Filter({ label, children }: { label: string; children: ReactNode }) { return <label className="grid min-w-0 gap-1 text-xs font-black uppercase text-dtsc-muted"><span className="flex items-center gap-1">{label}<span title={`Filtrer les rendez-vous par ${label.toLocaleLowerCase("fr")}.`} aria-label={`Aide filtre ${label}`}><CircleHelp className="h-3.5 w-3.5" /></span></span>{children}</label>; }
function F({ label, help, children }: { label: string; help: string; children: ReactNode }) { return <label className="grid min-w-0 gap-1"><span className="flex items-center gap-1 text-xs font-black uppercase text-dtsc-muted">{label}<span title={help} aria-label={`${label} : ${help}`}><CircleHelp className="h-3.5 w-3.5" /></span></span>{children}</label>; }
function Choice({ value, set, options, all }: { value: string; set: (value: string) => void; options: Record<string,string>; all?: string }) { return <select value={value} onChange={(event) => set(event.target.value)} className={selectClass}>{all && <option value="">{all}</option>}{Object.entries(options).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select>; }
function Area({ value, set, required }: { value: string; set: (value: string) => void; required?: boolean }) { return <textarea required={required} value={value} onChange={(event) => set(event.target.value)} className="min-h-24 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" />; }
function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="min-w-0 space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4"><h4 className="font-black text-cyan-600">{title}</h4>{children}</section>; }
function Grid({ children }: { children: ReactNode }) { return <div className="grid min-w-0 gap-3 md:grid-cols-2">{children}</div>; }
function Info({ title, rows }: { title: string; rows: Array<[string,string|null|undefined]> }) { return <section className="min-w-0 rounded-2xl border border-dtsc-border p-4"><h4 className="font-black">{title}</h4><dl className="mt-3 grid gap-2">{rows.map(([label,value]) => <div key={label} className="grid gap-1 rounded-xl bg-dtsc-page p-3"><dt className="text-xs font-black uppercase text-dtsc-muted">{label}</dt><dd className="break-words text-sm font-bold">{value || "Non renseigné"}</dd></div>)}</dl></section>; }
function Badge({ text }: { text: string }) { return <span className="rounded-full bg-cyan-400/15 px-2 py-1 text-xs font-black text-cyan-700">{text}</span>; }
function dateTime(value: string) { return new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)); }
function dayLabel(value: string) { return new Intl.DateTimeFormat("fr-FR",{dateStyle:"full"}).format(new Date(`${value}T12:00:00`)); }
function localDateTime(value: string) { const date = new Date(value); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0,16); }
function age(value: string|null) { if (!value) return "Âge non renseigné"; const birth = new Date(value), today = new Date(); let years = today.getFullYear() - birth.getFullYear(); if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) years--; return `${years} ans`; }
