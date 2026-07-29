"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Clock3, Copy, Pencil, Plus, Trash2, UserRoundCheck } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { useToastMessage } from "@/components/ui/use-toast-message";

export type DtscWeeklyAvailabilityItem = {
  id: string;
  collaboratorId: string;
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
  locationMode: string;
  notes?: string | null;
  recurrenceStart?: string | null;
  recurrenceUntil?: string | null;
};

export type DtscScheduleExceptionItem = {
  id: string;
  collaboratorId: string;
  type: string;
  availabilityStatus: string;
  startDateTime: string | null;
  endDateTime: string | null;
  locationMode: string;
  reason?: string | null;
  notes?: string | null;
};

type CollaboratorOption = { id: string; fullName: string; department: string; jobTitle: string };

type ScheduleTab = "weekly" | "exceptions" | "absences" | "team";

const absenceTypes = new Set(["ABSENCE", "LEAVE", "SICKNESS", "PERSONAL_ABSENCE", "ADMINISTRATIVE_ABSENCE", "UNAVAILABLE"]);
const weekdays = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const exceptionLabels: Record<string, string> = {
  ABSENCE: "Absence",
  LEAVE: "Congé",
  SICKNESS: "Maladie",
  PERSONAL_ABSENCE: "Absence personnelle",
  ADMINISTRATIVE_ABSENCE: "Absence administrative",
  MISSION: "Mission",
  TRAINING: "Formation",
  REMOTE_WORK: "Télétravail exceptionnel",
  EXTRA_AVAILABILITY: "Disponibilité exceptionnelle",
  UNAVAILABLE: "Indisponibilité",
  OTHER: "Autre",
};

export function DtscWorkScheduleModule({
  initialWeekly,
  initialExceptions,
  collaborators,
  employeeId,
  canViewTeam,
  timezone,
}: {
  initialWeekly: DtscWeeklyAvailabilityItem[];
  initialExceptions: DtscScheduleExceptionItem[];
  collaborators: CollaboratorOption[];
  employeeId: string;
  canViewTeam: boolean;
  timezone: string;
}) {
  const [weekly, setWeekly] = useState(initialWeekly);
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [activeTab, setActiveTab] = useState<ScheduleTab>("weekly");
  const [weeklyForm, setWeeklyForm] = useState<DtscWeeklyAvailabilityItem | "new" | null>(null);
  const [exceptionForm, setExceptionForm] = useState<DtscScheduleExceptionItem | "new" | null>(null);
  const [copySource, setCopySource] = useState<DtscWeeklyAvailabilityItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "weekly" | "exception"; id: string } | null>(null);
  const [teamCollaboratorId, setTeamCollaboratorId] = useState("");
  const [teamWeekly, setTeamWeekly] = useState<DtscWeeklyAvailabilityItem[]>([]);
  const [teamExceptions, setTeamExceptions] = useState<DtscScheduleExceptionItem[]>([]);
  const [message, setMessage] = useState("");
  useToastMessage(message);

  const activeWeekly = useMemo(() => weekly.filter((item) => !isEnded(item.recurrenceUntil)), [weekly]);
  const weeklyHours = useMemo(() => activeWeekly.reduce((sum, item) => sum + durationHours(item.startTime, item.endTime), 0), [activeWeekly]);
  const availableDays = useMemo(() => new Set(activeWeekly.map((item) => item.dayOfWeek).filter((day): day is number => typeof day === "number")).size, [activeWeekly]);
  const absences = exceptions.filter((item) => absenceTypes.has(item.type));
  const otherExceptions = exceptions.filter((item) => !absenceTypes.has(item.type));

  async function refreshOwnSchedule() {
    const [weeklyResponse, exceptionResponse] = await Promise.all([
      fetch("/api/calendar/availabilities", { cache: "no-store" }),
      fetch("/api/calendar/exceptions", { cache: "no-store" }),
    ]);
    const weeklyBody = await weeklyResponse.json().catch(() => null) as { availabilities?: DtscWeeklyAvailabilityItem[]; message?: string } | null;
    const exceptionBody = await exceptionResponse.json().catch(() => null) as { exceptions?: DtscScheduleExceptionItem[]; message?: string } | null;
    if (!weeklyResponse.ok || !exceptionResponse.ok) {
      setMessage(weeklyBody?.message || exceptionBody?.message || "Actualisation du planning impossible.");
      return;
    }
    setWeekly(weeklyBody?.availabilities || []);
    setExceptions(exceptionBody?.exceptions || []);
  }

  async function loadTeamSchedule(collaboratorId: string) {
    setTeamCollaboratorId(collaboratorId);
    if (!collaboratorId) {
      setTeamWeekly([]);
      setTeamExceptions([]);
      return;
    }
    const [weeklyResponse, exceptionResponse] = await Promise.all([
      fetch(`/api/calendar/availabilities?collaboratorId=${encodeURIComponent(collaboratorId)}`, { cache: "no-store" }),
      fetch(`/api/calendar/exceptions?collaboratorId=${encodeURIComponent(collaboratorId)}`, { cache: "no-store" }),
    ]);
    const weeklyBody = await weeklyResponse.json().catch(() => null) as { availabilities?: DtscWeeklyAvailabilityItem[]; message?: string } | null;
    const exceptionBody = await exceptionResponse.json().catch(() => null) as { exceptions?: DtscScheduleExceptionItem[]; message?: string } | null;
    if (!weeklyResponse.ok || !exceptionResponse.ok) {
      setMessage(weeklyBody?.message || exceptionBody?.message || "Lecture du planning collaborateur impossible.");
      return;
    }
    setTeamWeekly(weeklyBody?.availabilities || []);
    setTeamExceptions(exceptionBody?.exceptions || []);
  }

  async function removeTarget() {
    if (!deleteTarget) return;
    const endpoint = deleteTarget.kind === "weekly" ? `/api/calendar/availabilities/${deleteTarget.id}` : `/api/calendar/exceptions/${deleteTarget.id}`;
    const response = await fetch(endpoint, { method: "DELETE" });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    if (!response.ok) {
      setMessage(body?.message || "Suppression impossible.");
      return;
    }
    setDeleteTarget(null);
    await refreshOwnSchedule();
    setMessage("Planning mis à jour.");
  }

  return (
    <ModuleWorkspace className="border-b border-dtsc-border pb-8">
      <ModuleHeader
        eyebrow="DTSC · Planification du travail"
        title="Mon planning"
        description={`Déclarez quand vous pouvez travailler, puis vos absences et exceptions. Fuseau de référence : ${timezone}. Disponibilité ≠ temps réellement travaillé.`}
        primaryAction={<Button type="button" onClick={() => setWeeklyForm("new")} className="rounded-xl bg-dtsc-navy text-white"><Plus className="h-4 w-4" />Ajouter une plage</Button>}
        secondaryActions={<Button type="button" variant="outline" onClick={() => setExceptionForm("new")} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><CalendarDays className="h-4 w-4" />Déclarer une exception</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric label="Heures disponibles / semaine" value={`${weeklyHours.toFixed(1)} h`} />
        <SummaryMetric label="Jours disponibles" value={String(availableDays)} />
        <SummaryMetric label="Plages configurées" value={String(activeWeekly.length)} />
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-dtsc-border pb-2">
        {([
          ["weekly", "Disponibilités habituelles"],
          ["exceptions", "Exceptions"],
          ["absences", "Absences"],
          ...(canViewTeam ? [["team", "Disponibilités de l'équipe"]] : []),
        ] as Array<[ScheduleTab, string]>).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setActiveTab(key)} className={`shrink-0 rounded-xl px-3 py-2 text-sm font-black ${activeTab === key ? "bg-dtsc-navy text-white" : "bg-dtsc-page text-dtsc-muted"}`}>{label}</button>
        ))}
      </div>

      <ModuleContent>
        {activeTab === "weekly" && (
          <ModuleSection title="Disponibilités habituelles" description="Votre rythme hebdomadaire normal. Les modifications en cours de période sont versionnées pour préserver l'historique." count={activeWeekly.length}>
            <ScheduleList weekly={weekly} editable onEdit={setWeeklyForm} onCopy={setCopySource} onDelete={(id) => setDeleteTarget({ kind: "weekly", id })} />
          </ModuleSection>
        )}
        {activeTab === "exceptions" && (
          <ModuleSection title="Exceptions" description="Mission, formation, télétravail exceptionnel ou disponibilité supplémentaire à une date précise." count={otherExceptions.length} action={<Button type="button" size="sm" onClick={() => setExceptionForm("new")}><Plus className="h-4 w-4" />Ajouter</Button>}>
            <ExceptionList items={otherExceptions} editable onEdit={setExceptionForm} onDelete={(id) => setDeleteTarget({ kind: "exception", id })} />
          </ModuleSection>
        )}
        {activeTab === "absences" && (
          <ModuleSection title="Absences" description="Congé, maladie, absence personnelle ou administrative, y compris les absences partielles et multi-jours." count={absences.length} action={<Button type="button" size="sm" onClick={() => setExceptionForm("new")}><Plus className="h-4 w-4" />Déclarer</Button>}>
            <ExceptionList items={absences} editable onEdit={setExceptionForm} onDelete={(id) => setDeleteTarget({ kind: "exception", id })} />
          </ModuleSection>
        )}
        {activeTab === "team" && canViewTeam && (
          <ModuleSection title="Disponibilités de l'équipe" description="Vue opérationnelle en lecture seule. Les responsables voient le planning sans devenir propriétaires du CRUD personnel.">
            <div className="mb-4 max-w-xl">
              <FormField label="Collaborateur" hint="Choisissez un collaborateur pour consulter son planning.">
                <select value={teamCollaboratorId} onChange={(event) => void loadTeamSchedule(event.target.value)} className="h-12 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink">
                  <option value="">Sélectionner…</option>
                  {collaborators.filter((item) => item.id !== employeeId).map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.jobTitle}</option>)}
                </select>
              </FormField>
            </div>
            {teamCollaboratorId ? (
              <div className="space-y-8">
                <div><h3 className="mb-3 text-base font-black text-dtsc-ink">Planning habituel</h3><ScheduleList weekly={teamWeekly} /></div>
                <div><h3 className="mb-3 text-base font-black text-dtsc-ink">Absences et exceptions</h3><ExceptionList items={teamExceptions} /></div>
              </div>
            ) : <EmptyState text="Sélectionnez un collaborateur pour consulter son planning." />}
          </ModuleSection>
        )}
      </ModuleContent>

      {weeklyForm && <WeeklyFormDialog value={weeklyForm === "new" ? null : weeklyForm} onClose={() => setWeeklyForm(null)} onSaved={async () => { setWeeklyForm(null); await refreshOwnSchedule(); setMessage("Disponibilité enregistrée."); }} />}
      {exceptionForm && <ExceptionFormDialog value={exceptionForm === "new" ? null : exceptionForm} onClose={() => setExceptionForm(null)} onSaved={async () => { setExceptionForm(null); await refreshOwnSchedule(); setMessage("Exception enregistrée."); }} />}
      {copySource && <CopyAvailabilityDialog source={copySource} onClose={() => setCopySource(null)} onSaved={async () => { setCopySource(null); await refreshOwnSchedule(); setMessage("Horaires copiés."); }} />}
      {deleteTarget && <Dialog open title="Confirmer la suppression" description="Cette action ne permet pas de réécrire silencieusement l'historique passé." onClose={() => setDeleteTarget(null)} className="max-w-lg"><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button><Button type="button" onClick={() => void removeTarget()} className="bg-red-600 text-white hover:bg-red-700">Supprimer</Button></div></Dialog>}
    </ModuleWorkspace>
  );
}

function ScheduleList({ weekly, editable = false, onEdit, onCopy, onDelete }: { weekly: DtscWeeklyAvailabilityItem[]; editable?: boolean; onEdit?: (item: DtscWeeklyAvailabilityItem) => void; onCopy?: (item: DtscWeeklyAvailabilityItem) => void; onDelete?: (id: string) => void }) {
  const sorted = [...weekly].sort((a, b) => (a.dayOfWeek ?? 8) - (b.dayOfWeek ?? 8) || a.startTime.localeCompare(b.startTime));
  if (!sorted.length) return <EmptyState text="Aucune disponibilité hebdomadaire configurée." />;
  return <BusinessList ariaLabel="Disponibilités hebdomadaires">{sorted.map((item) => <BusinessListItem key={item.id} title={`${weekdays[item.dayOfWeek ?? 0]} · ${item.startTime} – ${item.endTime}`} status={<ScheduleBadge text={isEnded(item.recurrenceUntil) ? "Historique" : item.locationMode} />} meta={effectiveLabel(item)} description={item.notes || "Période pendant laquelle le collaborateur déclare pouvoir travailler."} leading={<Clock3 className="h-5 w-5 text-cyan-500" />} actions={editable && !isEnded(item.recurrenceUntil) ? <ActionMenu label="Actions disponibilité" items={[{ key: "edit", label: "Modifier", icon: Pencil, onSelect: () => onEdit?.(item) }, { key: "copy", label: "Copier vers…", icon: Copy, onSelect: () => onCopy?.(item) }, { key: "delete", label: "Supprimer", icon: Trash2, destructive: true, onSelect: () => onDelete?.(item.id) }]} /> : undefined} />)}</BusinessList>;
}

function ExceptionList({ items, editable = false, onEdit, onDelete }: { items: DtscScheduleExceptionItem[]; editable?: boolean; onEdit?: (item: DtscScheduleExceptionItem) => void; onDelete?: (id: string) => void }) {
  if (!items.length) return <EmptyState text="Aucune donnée pour cette section." />;
  return <BusinessList ariaLabel="Exceptions et absences">{items.map((item) => <BusinessListItem key={item.id} title={exceptionLabels[item.type] || item.availabilityStatus} status={<ScheduleBadge text={item.locationMode} />} meta={formatRange(item.startDateTime, item.endDateTime)} description={item.reason || "Motif non affiché ou non renseigné."} leading={<UserRoundCheck className="h-5 w-5 text-cyan-500" />} actions={editable && !isPastException(item) ? <ActionMenu label="Actions exception" items={[{ key: "edit", label: "Modifier", icon: Pencil, onSelect: () => onEdit?.(item) }, { key: "delete", label: "Supprimer", icon: Trash2, destructive: true, onSelect: () => onDelete?.(item.id) }]} /> : undefined} />)}</BusinessList>;
}

function WeeklyFormDialog({ value, onClose, onSaved }: { value: DtscWeeklyAvailabilityItem | null; onClose: () => void; onSaved: () => void }) {
  const [message, setMessage] = useState("");
  useToastMessage(message);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { dayOfWeek: Number(form.get("dayOfWeek")), startTime: String(form.get("startTime") || ""), endTime: String(form.get("endTime") || ""), locationMode: String(form.get("locationMode") || "Non défini"), notes: String(form.get("notes") || ""), effectiveFrom: String(form.get("effectiveFrom") || "") || null, effectiveUntil: String(form.get("effectiveUntil") || "") || null };
    const response = await fetch(value ? `/api/calendar/availabilities/${value.id}` : "/api/calendar/availabilities", { method: value ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    if (!response.ok) { setMessage(body?.message || "Enregistrement impossible."); return; }
    onSaved();
  }
  return <Dialog open title={value ? "Modifier ma disponibilité" : "Ajouter une disponibilité"} description="Cette plage décrit votre planning habituel, pas du temps travaillé." onClose={onClose} className="h-[92dvh] max-w-3xl"><form onSubmit={submit} className="grid gap-4 overflow-y-auto pr-1"><div className="grid gap-3 sm:grid-cols-2"><FormField label="Jour" hint="Jour habituel de disponibilité."><select name="dayOfWeek" defaultValue={value?.dayOfWeek ?? 1} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 font-bold text-dtsc-ink">{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></FormField><FormField label="Mode de travail" hint="Où/comment vous êtes disponible."><select name="locationMode" defaultValue={value?.locationMode || "Non défini"} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 font-bold text-dtsc-ink">{["Non défini", "Site DTSC", "Télétravail", "Hybride"].map((mode) => <option key={mode}>{mode}</option>)}</select></FormField></div><div className="grid gap-3 sm:grid-cols-2"><FormField label="Début" hint="Heure locale de début."><Input name="startTime" type="time" required defaultValue={value?.startTime || "08:00"} /></FormField><FormField label="Fin" hint="Heure locale de fin."><Input name="endTime" type="time" required defaultValue={value?.endTime || "17:00"} /></FormField></div><div className="grid gap-3 sm:grid-cols-2"><FormField label="Valable à partir du" hint="Optionnel. Permet de préserver l'historique."><Input name="effectiveFrom" type="date" defaultValue={dateInput(value?.recurrenceStart)} /></FormField><FormField label="Valable jusqu'au" hint="Optionnel."><Input name="effectiveUntil" type="date" defaultValue={dateInput(value?.recurrenceUntil)} /></FormField></div><FormField label="Notes" hint="Précision facultative."><textarea name="notes" defaultValue={value?.notes || ""} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" /></FormField><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit" className="bg-dtsc-navy text-white">Enregistrer</Button></div></form></Dialog>;
}

function ExceptionFormDialog({ value, onClose, onSaved }: { value: DtscScheduleExceptionItem | null; onClose: () => void; onSaved: () => void }) {
  const [message, setMessage] = useState("");
  useToastMessage(message);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = String(form.get("startDateTime") || "");
    const end = String(form.get("endDateTime") || "");
    const payload = { type: String(form.get("type") || "OTHER"), startDateTime: new Date(start).toISOString(), endDateTime: new Date(end).toISOString(), locationMode: String(form.get("locationMode") || "Non défini"), reason: String(form.get("reason") || "") };
    const response = await fetch(value ? `/api/calendar/exceptions/${value.id}` : "/api/calendar/exceptions", { method: value ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    if (!response.ok) { setMessage(body?.message || "Enregistrement impossible."); return; }
    onSaved();
  }
  return <Dialog open title={value ? "Modifier l'exception" : "Déclarer une absence ou exception"} description="Les motifs détaillés restent limités aux personnes autorisées et ne sont pas exposés dans les notifications push." onClose={onClose} className="h-[92dvh] max-w-3xl"><form onSubmit={submit} className="grid gap-4 overflow-y-auto pr-1"><div className="grid gap-3 sm:grid-cols-2"><FormField label="Type" hint="Choisissez la nature de l'exception."><select name="type" defaultValue={value?.type || "ABSENCE"} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 font-bold text-dtsc-ink">{Object.entries(exceptionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></FormField><FormField label="Mode / lieu" hint="Optionnel selon le type."><select name="locationMode" defaultValue={value?.locationMode || "Non défini"} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 font-bold text-dtsc-ink">{["Non défini", "Site DTSC", "Télétravail", "Hybride", "Externe", "Mission"].map((mode) => <option key={mode}>{mode}</option>)}</select></FormField></div><div className="grid gap-3 sm:grid-cols-2"><FormField label="Début" hint="Une absence peut commencer en cours de journée."><Input name="startDateTime" type="datetime-local" required defaultValue={dateTimeInput(value?.startDateTime)} /></FormField><FormField label="Fin" hint="La période peut couvrir plusieurs jours."><Input name="endDateTime" type="datetime-local" required defaultValue={dateTimeInput(value?.endDateTime)} /></FormField></div><FormField label="Motif facultatif" hint="Évitez les détails médicaux sensibles inutiles."><textarea name="reason" defaultValue={value?.reason || ""} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" /></FormField><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit" className="bg-dtsc-navy text-white">Enregistrer</Button></div></form></Dialog>;
}

function CopyAvailabilityDialog({ source, onClose, onSaved }: { source: DtscWeeklyAvailabilityItem; onClose: () => void; onSaved: () => void }) {
  const [message, setMessage] = useState("");
  useToastMessage(message);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const days = new FormData(event.currentTarget).getAll("days").map(Number).filter((day) => day !== source.dayOfWeek);
    if (!days.length) { setMessage("Choisissez au moins un autre jour."); return; }
    for (const dayOfWeek of days) {
      const response = await fetch("/api/calendar/availabilities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dayOfWeek, startTime: source.startTime, endTime: source.endTime, locationMode: source.locationMode, notes: source.notes || "", effectiveFrom: source.recurrenceStart || null, effectiveUntil: source.recurrenceUntil || null }) });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) { setMessage(body?.message || "Copie impossible."); return; }
    }
    onSaved();
  }
  return <Dialog open title="Copier les horaires" description={`${weekdays[source.dayOfWeek ?? 0]} ${source.startTime}–${source.endTime}`} onClose={onClose} className="max-w-lg"><form onSubmit={submit} className="space-y-4"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{weekdays.map((day, index) => <label key={day} className="flex items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-bold text-dtsc-ink"><input type="checkbox" name="days" value={index} disabled={index === source.dayOfWeek} />{day}</label>)}</div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit">Copier</Button></div></form></Dialog>;
}

function SummaryMetric({ label, value }: { label: string; value: string }) { return <div className="border-b border-dtsc-border py-3"><p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{label}</p><p className="mt-1 text-2xl font-black text-dtsc-ink">{value}</p></div>; }
function ScheduleBadge({ text }: { text: string }) { return <span className="rounded-full bg-dtsc-soft px-2.5 py-1 text-[0.68rem] font-black text-dtsc-blue">{text}</span>; }
function EmptyState({ text }: { text: string }) { return <p className="border-y border-dtsc-border bg-dtsc-page/60 px-3 py-6 text-sm text-dtsc-muted">{text}</p>; }
function durationHours(start: string, end: string) { const [sh, sm] = start.split(":").map(Number); const [eh, em] = end.split(":").map(Number); return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60); }
function isEnded(value?: string | null) { return Boolean(value && new Date(value).getTime() < Date.now()); }
function isPastException(value: DtscScheduleExceptionItem) { return Boolean(value.endDateTime && new Date(value.endDateTime).getTime() <= Date.now()); }
function effectiveLabel(value: DtscWeeklyAvailabilityItem) { const from = value.recurrenceStart ? new Date(value.recurrenceStart).toLocaleDateString("fr-FR") : "maintenant"; const until = value.recurrenceUntil ? new Date(value.recurrenceUntil).toLocaleDateString("fr-FR") : "sans date de fin"; return `Valable de ${from} à ${until}`; }
function formatRange(start?: string | null, end?: string | null) { if (!start || !end) return "Période non définie"; const formatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }); return `${formatter.format(new Date(start))} → ${formatter.format(new Date(end))}`; }
function dateInput(value?: string | null) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }
function dateTimeInput(value?: string | null) { if (!value) return ""; const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
