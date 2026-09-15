import { NextResponse } from "next/server";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { EnterpriseGamingTournamentError } from "@/lib/enterprise/gaming/tournaments";

const messages: Record<string, { fr: string; en: string }> = {
  GAMING_TOURNAMENT_NOT_FOUND: { fr: "Ce tournoi est introuvable.", en: "This tournament could not be found." },
  GAMING_TOURNAMENT_DATES_INVALID: { fr: "Les dates du tournoi sont invalides.", en: "The tournament dates are invalid." },
  GAMING_TOURNAMENT_REGISTRATION_CLOSE_INVALID: { fr: "Les inscriptions doivent fermer avant le début du tournoi.", en: "Registration must close before the tournament starts." },
  GAMING_TOURNAMENT_REGISTRATION_WINDOW_INVALID: { fr: "La fenêtre d’inscription est invalide.", en: "The registration window is invalid." },
  GAMING_TOURNAMENT_SITE_INVALID: { fr: "Le site sélectionné n’est pas actif dans cette entreprise.", en: "The selected site is not active in this organization." },
  GAMING_TOURNAMENT_ENTRY_ITEM_INVALID: { fr: "Le droit d’entrée sélectionné n’est pas un service actif du Catalogue.", en: "The selected entry fee is not an active Catalog service." },
  GAMING_TOURNAMENT_ENTRY_PRICE_MISSING: { fr: "Aucun prix de vente actif n’est configuré pour le droit d’entrée.", en: "No active sale price is configured for the entry fee." },
  GAMING_TOURNAMENT_ENTRY_CURRENCY_AMBIGUOUS: { fr: "Le droit d’entrée possède plusieurs devises sans devise principale du Catalogue.", en: "The entry fee has multiple currencies without a primary Catalog currency." },
  GAMING_TOURNAMENT_TAX_CONFIGURATION_REQUIRED: { fr: "La taxation du droit d’entrée est incomplète dans le référentiel Finance.", en: "The entry fee tax setup is incomplete in Finance." },
  GAMING_TOURNAMENT_REVISION_CONFLICT: { fr: "Le tournoi a changé entre-temps. Rechargez-le avant de recommencer.", en: "The tournament changed in the meantime. Reload it before retrying." },
  GAMING_TOURNAMENT_NOT_EDITABLE: { fr: "Ce tournoi ne peut plus être modifié dans son état actuel.", en: "This tournament can no longer be edited in its current state." },
  GAMING_TOURNAMENT_TRANSITION_INVALID: { fr: "Cette transition de tournoi n’est pas autorisée dans l’état actuel.", en: "This tournament transition is not allowed in the current state." },
  GAMING_TOURNAMENT_CANCEL_REASON_REQUIRED: { fr: "Le motif d’annulation est obligatoire.", en: "A cancellation reason is required." },
  GAMING_TOURNAMENT_ARCHIVE_FORBIDDEN: { fr: "Seul un tournoi terminé ou annulé peut être archivé.", en: "Only a completed or cancelled tournament can be archived." },
  GAMING_TOURNAMENT_REGISTRATION_CLOSED: { fr: "Les inscriptions à ce tournoi sont fermées.", en: "Registration for this tournament is closed." },
  GAMING_TOURNAMENT_REGISTRATION_NOT_OPEN_YET: { fr: "Les inscriptions à ce tournoi ne sont pas encore ouvertes.", en: "Registration for this tournament is not open yet." },
  GAMING_TOURNAMENT_PARTICIPANT_INVALID: { fr: "Le participant doit être un client CRM actif de cette entreprise.", en: "The participant must be an active CRM customer in this organization." },
  GAMING_TOURNAMENT_FULL: { fr: "Le nombre maximal de participants est atteint.", en: "The maximum number of participants has been reached." },
  GAMING_TOURNAMENT_INVOICE_APPROVER_REQUIRED: { fr: "Un approbateur Finance est requis pour un tournoi payant.", en: "A Finance approver is required for a paid tournament." },
  GAMING_TOURNAMENT_REGISTRATION_NOT_FOUND: { fr: "Cette inscription est introuvable.", en: "This registration could not be found." },
  GAMING_TOURNAMENT_REGISTRATION_REVISION_CONFLICT: { fr: "Cette inscription a changé entre-temps.", en: "This registration changed in the meantime." },
  GAMING_TOURNAMENT_ENTRY_FEE_UNPAID: { fr: "Le droit d’entrée doit être entièrement payé dans Finance avant le check-in.", en: "The entry fee must be fully paid in Finance before check-in." },
  GAMING_TOURNAMENT_STATION_INVALID: { fr: "Le poste sélectionné n’existe pas dans cette entreprise.", en: "The selected station does not exist in this organization." },
  GAMING_TOURNAMENT_STATION_UNAVAILABLE: { fr: "Ce poste est indisponible à cause de son état, d’un incident ou d’une maintenance.", en: "This station is unavailable because of its state, an incident, or maintenance." },
  GAMING_TOURNAMENT_STATION_CONFLICT: { fr: "Ce poste est déjà occupé par une réservation, une session ou un autre tournoi sur ce créneau.", en: "This station is already occupied by a booking, session, or another tournament in this slot." },
  GAMING_TOURNAMENT_STATION_ALREADY_ASSIGNED: { fr: "Ce poste est déjà affecté à ce tournoi avec un autre créneau.", en: "This station is already assigned to this tournament with another slot." },
  GAMING_TOURNAMENT_STATION_SLOT_OUTSIDE_EVENT: { fr: "Le créneau du poste doit rester dans la période du tournoi.", en: "The station slot must stay within the tournament period." },
  GAMING_TOURNAMENT_STATION_ASSIGNMENT_NOT_FOUND: { fr: "Cette affectation de poste est introuvable.", en: "This station assignment could not be found." },
};

function locale(request: Request): "fr" | "en" { return request.headers.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "fr"; }

export function gamingTournamentErrorResponse(error: unknown, request: Request, fallback = "GAMING_TOURNAMENT_OPERATION_FAILED") {
  if (error instanceof EnterpriseGamingTournamentError) {
    const language = locale(request);
    return NextResponse.json({ error: error.code, message: messages[error.code]?.[language] || (language === "en" ? "The Gaming tournament operation could not be completed." : "L’opération tournoi Gaming n’a pas pu être terminée."), details: error.details }, { status: error.status });
  }
  if (error instanceof EnterpriseAccountingError) return financeErrorResponse(error, fallback);
  console.error(fallback, error);
  return NextResponse.json({ error: fallback, message: locale(request) === "en" ? "An internal error prevented the tournament operation." : "Une erreur interne a empêché l’opération tournoi." }, { status: 500 });
}
