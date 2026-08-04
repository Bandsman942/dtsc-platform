"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarSearch, CloudOff, Link2, Plus, RefreshCcw, Shapes, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import type { ConditionalFeatureStatus } from "@/lib/technical-debt/feature-gates";

type ResourceReservation = { id: string; eventId: string; startsAt: string; endsAt: string; status: string };
type CalendarResourceItem = {
  id: string;
  name: string;
  resourceType: string;
  description: string | null;
  location: string | null;
  capacity: number | null;
  reservations: ResourceReservation[];
};
type CalendarEventChoice = { id: string; title: string; startDateTime: string; endDateTime: string };
type CollaboratorChoice = { id: string; fullName: string; department: string; jobTitle: string };
type SlotSuggestion = { startsAt: string; endsAt: string; warnings: Array<{ message: string; severity: string }> };

export function CalendarAdvancedToolsPanel({
  initialResources,
  events,
  collaborators,
  canManageResources,
  featureStatuses,
}: {
  initialResources: CalendarResourceItem[];
  events: CalendarEventChoice[];
  collaborators: CollaboratorChoice[];
  canManageResources: boolean;
  featureStatuses: {
    externalCalendar: ConditionalFeatureStatus;
    slotSuggestions: ConditionalFeatureStatus;
    resourceBooking: ConditionalFeatureStatus;
  };
}) {
  const [resources, setResources] = useState(initialResources);
  const [resourceDialog, setResourceDialog] = useState(false);
  const [suggestionDialog, setSuggestionDialog] = useState(false);
  const [suggestions, setSuggestions] = useState<SlotSuggestion[]>([]);
  const [integrationMessage, setIntegrationMessage] = useState(featureStatuses.externalCalendar.message);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useToastMessage(message);

  const futureEvents = useMemo(() => events.filter((event) => new Date(event.endDateTime) >= new Date()), [events]);

  async function refreshResources() {
    const response = await fetch("/api/calendar/resources", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { resources?: CalendarResourceItem[]; message?: string } | null;
    if (response.ok && body?.resources) setResources(body.resources);
    else setMessage(body?.message || "Actualisation des ressources impossible.");
  }

  async function createResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/calendar/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") || ""),
        resourceType: String(form.get("resourceType") || "ROOM"),
        description: String(form.get("description") || ""),
        location: String(form.get("location") || ""),
        capacity: form.get("capacity") ? Number(form.get("capacity")) : undefined,
      }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Ressource créée." : body?.message || "Création impossible.");
    if (response.ok) {
      setResourceDialog(false);
      await refreshResources();
    }
    setSaving(false);
  }

  async function archiveResource(resourceId: string) {
    if (!window.confirm("Archiver cette ressource et annuler ses réservations actives ?")) return;
    const response = await fetch("/api/calendar/resources", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: resourceId }) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Ressource archivée." : body?.message || "Archivage impossible.");
    if (response.ok) await refreshResources();
  }

  async function reserveResource(resourceId: string, eventId: string) {
    if (!eventId) return;
    const response = await fetch("/api/calendar/resources/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId, eventId }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Ressource réservée pour l'événement." : body?.message || "Réservation impossible.");
    if (response.ok) await refreshResources();
  }

  async function requestSuggestions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const rangeStart = new Date(`${String(form.get("rangeStart"))}T00:00:00`).toISOString();
    const rangeEnd = new Date(`${String(form.get("rangeEnd"))}T23:59:59.999`).toISOString();
    const response = await fetch("/api/calendar/slot-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantIds: form.getAll("participantIds").map(String),
        rangeStart,
        rangeEnd,
        durationMinutes: Number(form.get("durationMinutes") || 60),
        workingDayStartHour: Number(form.get("workingDayStartHour") || 8),
        workingDayEndHour: Number(form.get("workingDayEndHour") || 18),
        stepMinutes: 30,
      }),
    });
    const body = (await response.json().catch(() => null)) as { suggestions?: SlotSuggestion[]; message?: string } | null;
    if (response.ok) {
      setSuggestions(body?.suggestions || []);
      setMessage(body?.suggestions?.length ? "Créneaux compatibles proposés." : "Aucun créneau compatible trouvé dans cette période.");
    } else setMessage(body?.message || "Recherche de créneaux impossible.");
    setSaving(false);
  }

  async function requestExternalConnection(provider: "GOOGLE" | "MICROSOFT") {
    const response = await fetch("/api/calendar/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, action: "REQUEST_CONNECTION" }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string; state?: { status: string } } | null;
    setIntegrationMessage(body?.message || (response.ok ? `État : ${body?.state?.status || "préparé"}` : featureStatuses.externalCalendar.message));
  }

  return (
    <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">Outils avancés du calendrier</p>
          <h2 className="mt-1 text-2xl font-black text-dtsc-ink">Créneaux, ressources et synchronisation externe</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">Les fonctions locales restent disponibles. Les intégrations externes sont bloquées proprement lorsqu'aucun fournisseur n'est configuré.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setSuggestionDialog(true)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><CalendarSearch className="h-4 w-4" /> Proposer un créneau</Button>
          {canManageResources ? <Button type="button" onClick={() => setResourceDialog(true)} className="rounded-xl bg-dtsc-blue text-white"><Plus className="h-4 w-4" /> Nouvelle ressource</Button> : null}
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <section className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-dtsc-ink">Ressources réservables</h3><p className="mt-1 text-xs text-dtsc-muted">Salles, véhicules, équipements et espaces de travail.</p></div><Button type="button" variant="ghost" size="icon" onClick={() => void refreshResources()} aria-label="Actualiser les ressources"><RefreshCcw className="h-4 w-4" /></Button></div>
          <div className="mt-4 max-h-[60dvh] space-y-3 overflow-y-auto pr-1">
            {resources.map((resource) => (
              <article key={resource.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
                <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-cyan-400/15 px-2 py-1 text-xs font-black text-cyan-700">{resource.resourceType}</span>{resource.capacity ? <span className="rounded-full bg-dtsc-page px-2 py-1 text-xs font-black text-dtsc-muted">Capacité {resource.capacity}</span> : null}</div><h4 className="mt-2 break-words font-black text-dtsc-ink">{resource.name}</h4><p className="mt-1 text-xs text-dtsc-muted">{resource.location || "Localisation non définie"} · {resource.reservations.length} réservation(s) à venir</p></div>{canManageResources ? <Button type="button" variant="ghost" size="icon" onClick={() => void archiveResource(resource.id)} className="text-red-600" aria-label={`Archiver ${resource.name}`}><Trash2 className="h-4 w-4" /></Button> : null}</div>
                {futureEvents.length ? <label className="mt-3 grid gap-1 text-xs font-black text-dtsc-muted">Réserver pour un événement<select defaultValue="" onChange={(event) => { const eventId = event.target.value; if (eventId) void reserveResource(resource.id, eventId); event.target.value = ""; }} className="h-10 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink"><option value="">Choisir un événement dont je suis responsable</option>{futureEvents.map((calendarEvent) => <option key={calendarEvent.id} value={calendarEvent.id}>{calendarEvent.title} · {new Date(calendarEvent.startDateTime).toLocaleString("fr-FR")}</option>)}</select></label> : null}
              </article>
            ))}
            {!resources.length ? <p className="rounded-xl border border-dashed border-dtsc-border p-5 text-center text-sm text-dtsc-muted">Aucune ressource active.</p> : null}
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <div className="flex items-center gap-2"><Link2 className="h-5 w-5 text-cyan-600" /><h3 className="font-black text-dtsc-ink">Calendriers externes</h3></div>
          <div className={`mt-3 rounded-xl border p-3 text-sm leading-6 ${featureStatuses.externalCalendar.available ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800" : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>
            <div className="flex items-start gap-2">{featureStatuses.externalCalendar.available ? <ShieldCheck className="mt-1 h-4 w-4 shrink-0" /> : <CloudOff className="mt-1 h-4 w-4 shrink-0" />}<p>{integrationMessage}</p></div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2"><Button type="button" variant="outline" onClick={() => void requestExternalConnection("GOOGLE")} disabled={!featureStatuses.externalCalendar.available} className="rounded-xl border-dtsc-border">Google Calendar</Button><Button type="button" variant="outline" onClick={() => void requestExternalConnection("MICROSOFT")} disabled={!featureStatuses.externalCalendar.available} className="rounded-xl border-dtsc-border">Microsoft 365</Button></div>
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-dtsc-muted"><Shapes className="mt-0.5 h-4 w-4 shrink-0" />La synchronisation ne contourne jamais l'acceptation des participants ni les contrôles d'accès du calendrier interne.</p>
        </section>
      </div>

      <Dialog open={resourceDialog} title="Nouvelle ressource calendrier" description="Créez une ressource interne réservée à l'organisation active." onClose={() => setResourceDialog(false)} className="max-w-2xl">
        <form onSubmit={createResource} className="grid gap-3"><div className="grid gap-3 sm:grid-cols-2"><FormField label="Nom" hint="Nom lisible de la ressource."><Input name="name" required minLength={2} maxLength={160} className="h-12 rounded-xl bg-dtsc-page" /></FormField><FormField label="Type" hint="Catégorie de réservation."><select name="resourceType" className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">{["ROOM", "VEHICLE", "EQUIPMENT", "WORKSPACE", "OTHER"].map((value) => <option key={value}>{value}</option>)}</select></FormField><FormField label="Localisation" hint="Bâtiment, site ou emplacement."><Input name="location" maxLength={300} className="h-12 rounded-xl bg-dtsc-page" /></FormField><FormField label="Capacité" hint="Nombre de personnes ou unités."><Input name="capacity" type="number" min={1} max={10000} className="h-12 rounded-xl bg-dtsc-page" /></FormField></div><FormField label="Description" hint="Contraintes et informations utiles."><textarea name="description" maxLength={1000} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" /></FormField><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setResourceDialog(false)} className="rounded-xl">Annuler</Button><Button type="submit" disabled={saving} className="rounded-xl bg-dtsc-blue text-white">Créer</Button></div></form>
      </Dialog>

      <Dialog open={suggestionDialog} title="Proposer automatiquement des créneaux" description="Le moteur local analyse les conflits et disponibilités des participants sur une période de 14 jours maximum." onClose={() => setSuggestionDialog(false)} className="h-[94dvh] max-w-4xl">
        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <form onSubmit={requestSuggestions} className="grid gap-3"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><FormField label="Début de recherche" hint="Premier jour analysé."><Input name="rangeStart" type="date" required defaultValue={todayKey()} className="h-12 rounded-xl bg-dtsc-page" /></FormField><FormField label="Fin de recherche" hint="14 jours maximum."><Input name="rangeEnd" type="date" required defaultValue={addDaysKey(7)} className="h-12 rounded-xl bg-dtsc-page" /></FormField><FormField label="Durée" hint="Durée de l'événement."><Input name="durationMinutes" type="number" min={15} max={480} defaultValue={60} className="h-12 rounded-xl bg-dtsc-page" /></FormField><div className="grid grid-cols-2 gap-2"><FormField label="Dès" hint="Heure ouvrée."><Input name="workingDayStartHour" type="number" min={0} max={23} defaultValue={8} className="h-12 rounded-xl bg-dtsc-page" /></FormField><FormField label="Jusqu'à" hint="Heure ouvrée."><Input name="workingDayEndHour" type="number" min={1} max={24} defaultValue={18} className="h-12 rounded-xl bg-dtsc-page" /></FormField></div></div><section className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><h3 className="font-black text-dtsc-ink">Participants</h3><div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">{collaborators.map((collaborator) => <label key={collaborator.id} className="flex items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm"><input type="checkbox" name="participantIds" value={collaborator.id} className="mt-1 h-4 w-4 accent-cyan-500" /><span><span className="block font-black text-dtsc-ink">{collaborator.fullName}</span><span className="mt-1 block text-xs text-dtsc-muted">{collaborator.jobTitle} · {collaborator.department}</span></span></label>)}</div></section><Button type="submit" disabled={saving} className="rounded-xl bg-dtsc-blue text-white"><CalendarSearch className="h-4 w-4" /> Rechercher les créneaux</Button></form>
          <div className="grid gap-3 sm:grid-cols-2">{suggestions.map((suggestion) => <article key={suggestion.startsAt} className="rounded-xl border border-dtsc-border bg-dtsc-page p-4"><p className="font-black text-dtsc-ink">{new Date(suggestion.startsAt).toLocaleString("fr-FR")} — {new Date(suggestion.endsAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>{suggestion.warnings.length ? <div className="mt-2 text-xs leading-5 text-amber-700">{suggestion.warnings.map((warning) => <p key={warning.message}>• {warning.message}</p>)}</div> : <p className="mt-2 text-xs font-bold text-emerald-700">Aucun conflit actif.</p>}</article>)}</div>
        </div>
      </Dialog>
    </section>
  );
}

function todayKey() { return new Date().toISOString().slice(0, 10); }
function addDaysKey(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }
