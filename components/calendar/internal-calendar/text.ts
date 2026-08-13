import { translateCalendarWorkspace, type CalendarWorkspaceKey } from "@/lib/i18n";
import { locationModeLabel } from "@/components/calendar/dtsc-work-schedule/model";
import type { CalendarWorkspaceText } from "./types";

export const persistedEventTypes = ["Tâche", "Réunion", "Mission", "Appel audio", "Appel vidéo", "Formation", "Blocage", "Deadline", "Autre"] as const;
export const persistedPriorities = ["Faible", "Normale", "Élevée", "Critique"] as const;
export const persistedVisibilities = ["Participants", "Département", "Public interne", "Privé"] as const;
export const persistedLocationModes = ["Non défini", "Site DTSC", "Télétravail", "Hybride", "Externe", "Mission"] as const;
export const persistedResourceTypes = ["ROOM", "VEHICLE", "EQUIPMENT", "WORKSPACE", "OTHER"] as const;

const maps: Record<string, Record<string, CalendarWorkspaceKey>> = {
  eventType: { "Tâche": "eventTypeTask", "Réunion": "eventTypeMeeting", Mission: "eventTypeMission", "Appel audio": "eventTypeAudioCall", "Appel vidéo": "eventTypeVideoCall", Formation: "eventTypeTraining", Blocage: "eventTypeBlock", Deadline: "eventTypeDeadline", Autre: "eventTypeOther" },
  priority: { Faible: "priorityLow", Normale: "priorityNormal", "Élevée": "priorityHigh", Critique: "priorityCritical" },
  visibility: { Participants: "visibilityParticipants", "Département": "visibilityDepartment", "Public interne": "visibilityInternalPublic", "Privé": "visibilityPrivate" },
  eventStatus: { "Planifié": "eventStatusScheduled", "Confirmé": "eventStatusConfirmed", "Annulé": "eventStatusCancelled", "Terminé": "eventStatusCompleted" },
  response: { "Accepté": "responseAccepted", "Refusé": "responseDeclined", "En attente": "responsePending" },
  role: { Organisateur: "roleOrganizer", Participant: "roleParticipant" },
  availability: { Disponible: "availabilityAvailable", Indisponible: "availabilityUnavailable", "Occupé": "availabilityBusy" },
  recurrence: { Hebdomadaire: "recurrenceWeekly", Aucune: "recurrenceNone" },
  resource: { ROOM: "resourceTypeRoom", VEHICLE: "resourceTypeVehicle", EQUIPMENT: "resourceTypeEquipment", WORKSPACE: "resourceTypeWorkspace", OTHER: "resourceTypeOther" },
};

export function calendarWorkspaceText(locale?: string | null): CalendarWorkspaceText {
  return new Proxy({} as CalendarWorkspaceText, { get: (_target, property) => typeof property === "string" ? translateCalendarWorkspace(locale, property as CalendarWorkspaceKey) : undefined });
}
function label(value: string, locale: string | null | undefined, family: keyof typeof maps) { const key = maps[family][value]; return key ? translateCalendarWorkspace(locale, key) : value; }
export const eventTypeLabel = (value: string, locale?: string | null) => label(value, locale, "eventType");
export const priorityLabel = (value: string, locale?: string | null) => label(value, locale, "priority");
export const visibilityLabel = (value: string, locale?: string | null) => label(value, locale, "visibility");
export const eventStatusLabel = (value: string, locale?: string | null) => label(value, locale, "eventStatus");
export const responseStatusLabel = (value: string, locale?: string | null) => label(value, locale, "response");
export const participantRoleLabel = (value: string, locale?: string | null) => label(value, locale, "role");
export const availabilityStatusLabel = (value: string, locale?: string | null) => label(value, locale, "availability");
export const recurrenceLabel = (value: string, locale?: string | null) => label(value, locale, "recurrence");
export const resourceTypeLabel = (value: string, locale?: string | null) => label(value, locale, "resource");
export const workModeLabel = (value: string, locale?: string | null) => locationModeLabel(value, locale === "en" ? "en" : "fr");
export const serverFallback = (locale: string | null | undefined, serverMessage: string | null | undefined, fallback: string) => locale === "en" ? fallback : serverMessage || fallback;
