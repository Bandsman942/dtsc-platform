import { NextResponse } from "next/server";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";

const stationMessages: Record<string, { fr: string; en: string }> = {
  GAMING_STATION_NOT_FOUND: { fr: "Ce poste de jeu est introuvable ou a été archivé. Actualisez la liste puis réessayez.", en: "This gaming station could not be found or was archived. Refresh the list and try again." },
  GAMING_STATION_ASSET_NOT_FOUND: { fr: "L’actif lié à ce poste n’est plus disponible dans Actifs & maintenance. Choisissez un actif valide de cette entreprise.", en: "The asset linked to this station is no longer available in Assets & maintenance. Select a valid asset from this organization." },
  GAMING_STATION_ASSET_DISPOSED: { fr: "Un actif sorti du parc ne peut pas devenir un poste de jeu. Choisissez un autre actif.", en: "A disposed asset cannot become a gaming station. Select another asset." },
  GAMING_STATION_ASSET_UNAVAILABLE: { fr: "Ce poste ne peut pas être remis disponible car son actif est archivé ou sorti du parc.", en: "This station cannot be made available because its asset is archived or disposed." },
  GAMING_STATION_ASSET_ALREADY_LINKED: { fr: "Cet actif est déjà rattaché à un poste Gaming. Ouvrez le poste existant au lieu d’en créer un doublon.", en: "This asset is already linked to a gaming station. Open the existing station instead of creating a duplicate." },
  GAMING_STATION_CODE_DUPLICATE: { fr: "Ce numéro de poste est déjà utilisé. Choisissez un autre numéro.", en: "This station number is already in use. Choose another number." },
  GAMING_STATION_BLOCKED_BY_INCIDENT: { fr: "Ce poste reste indisponible car un incident majeur est encore ouvert sur son actif. Résolvez l’incident dans Actifs & maintenance avant de le remettre disponible.", en: "This station remains unavailable because a major asset incident is still open. Resolve the incident in Assets & maintenance before making it available." },
  GAMING_STATION_BLOCKED_BY_MAINTENANCE: { fr: "Ce poste reste indisponible car une maintenance est en cours. Terminez ou annulez la maintenance avant de le remettre disponible.", en: "This station remains unavailable because maintenance is in progress. Complete or cancel the maintenance before making it available." },
  GAMING_STATION_HAS_LIVE_SESSION: { fr: "Ce poste ne peut pas être archivé pendant une session de jeu en cours ou en attente.", en: "This station cannot be archived while a gaming session is active or waiting." },
  GAMING_STATION_HAS_ACTIVE_BOOKING: { fr: "Ce poste ne peut pas être archivé tant qu’une réservation confirmée est encore active.", en: "This station cannot be archived while a confirmed booking is still active." },
};

const sessionMessages: Record<string, { fr: string; en: string }> = {
  GAMING_SESSION_NOT_FOUND: { fr: "Cette session est introuvable ou n’est plus accessible.", en: "This gaming session could not be found or is no longer accessible." },
  GAMING_SESSION_STATION_NOT_FOUND: { fr: "Le poste sélectionné est introuvable dans cette entreprise.", en: "The selected station could not be found in this organization." },
  GAMING_SESSION_STATION_BLOCKED: { fr: "Ce poste est bloqué et ne peut pas démarrer une nouvelle session.", en: "This station is blocked and cannot start a new session." },
  GAMING_SESSION_STATION_ASSET_UNAVAILABLE: { fr: "L’actif de ce poste est archivé ou sorti du parc. La session ne peut pas démarrer.", en: "This station asset is archived or disposed. The session cannot start." },
  GAMING_SESSION_STATION_INCIDENT: { fr: "Un incident majeur est ouvert sur ce poste. Résolvez-le dans Actifs & maintenance avant de démarrer une session.", en: "A major incident is open on this station. Resolve it in Assets & maintenance before starting a session." },
  GAMING_SESSION_STATION_MAINTENANCE: { fr: "Une maintenance est en cours sur ce poste. La session ne peut pas démarrer.", en: "Maintenance is in progress on this station. The session cannot start." },
  GAMING_SESSION_STATION_BUSY: { fr: "Ce poste est déjà occupé par une autre session. Actualisez le tableau et choisissez un poste disponible.", en: "This station is already occupied by another session. Refresh the board and select an available station." },
  GAMING_SESSION_CUSTOMER_NOT_FOUND: { fr: "Le client sélectionné n’existe pas ou n’est pas actif dans cette entreprise.", en: "The selected customer does not exist or is not active in this organization." },
  GAMING_SESSION_CATALOG_ITEM_NOT_FOUND: { fr: "Le service du catalogue sélectionné n’existe pas ou n’est pas actif dans cette entreprise.", en: "The selected catalog service does not exist or is not active in this organization." },
  GAMING_SESSION_CATALOG_ITEM_NOT_SERVICE: { fr: "L’article sélectionné n’est pas un service du catalogue. Choisissez un service actif.", en: "The selected catalog item is not a service. Choose an active service." },
  GAMING_SESSION_PRICING_REQUIRED: { fr: "Aucun tarif Gaming actif ne correspond à ce service, ce poste et ce créneau. Configurez un tarif ou choisissez une autre offre.", en: "No active Gaming price matches this service, station, and time slot. Configure pricing or select another offer." },
  GAMING_SESSION_IDEMPOTENCY_CONFLICT: { fr: "Cette commande a déjà été utilisée pour une autre opération. Actualisez puis réessayez.", en: "This command key was already used for another operation. Refresh and try again." },
  GAMING_SESSION_TERMINAL: { fr: "Cette session est déjà terminée ou clôturée et ne peut plus être modifiée.", en: "This session is already ended or closed and can no longer be changed." },
  GAMING_SESSION_NOT_ACTIVE: { fr: "Seule une session en cours peut être mise en pause.", en: "Only an active session can be paused." },
  GAMING_SESSION_NOT_PAUSED: { fr: "Seule une session en pause peut être reprise.", en: "Only a paused session can be resumed." },
  GAMING_SESSION_NOT_LIVE: { fr: "Cette action exige une session en cours ou en pause.", en: "This action requires an active or paused session." },
  GAMING_SESSION_EXTENSION_INVALID: { fr: "La durée de prolongation est invalide.", en: "The extension duration is invalid." },
  GAMING_SESSION_TRANSFER_INVALID: { fr: "Choisissez un autre poste disponible pour transférer la session.", en: "Select another available station to transfer the session." },
};

const bookingMessages: Record<string, { fr: string; en: string }> = {
  GAMING_BOOKING_NOT_FOUND: { fr: "Cette réservation est introuvable ou n’est plus accessible.", en: "This booking could not be found or is no longer accessible." },
  GAMING_BOOKING_STATION_NOT_FOUND: { fr: "Le poste sélectionné est introuvable dans cette entreprise.", en: "The selected station could not be found in this organization." },
  GAMING_BOOKING_STATION_UNAVAILABLE: { fr: "Ce poste ne peut pas recevoir cette réservation car son actif est archivé, sorti du parc ou le poste est hors service.", en: "This station cannot receive the booking because its asset is archived, disposed, or the station is out of service." },
  GAMING_BOOKING_PLAYER_CAPACITY: { fr: "Le nombre de joueurs dépasse la capacité du poste sélectionné. Choisissez un autre poste ou réduisez le nombre de joueurs.", en: "The player count exceeds the selected station capacity. Choose another station or reduce the player count." },
  GAMING_BOOKING_CUSTOMER_NOT_FOUND: { fr: "Le client sélectionné n’existe pas ou n’est pas actif dans cette entreprise.", en: "The selected customer does not exist or is not active in this organization." },
  GAMING_BOOKING_SCHEDULE_INVALID: { fr: "Le créneau de réservation est invalide ou dépasse 24 heures. Corrigez les heures de début et de fin.", en: "The booking time slot is invalid or longer than 24 hours. Correct the start and end times." },
  GAMING_BOOKING_CONFLICT: { fr: "Ce poste est déjà réservé sur tout ou partie de ce créneau. Choisissez un autre horaire ou un autre poste.", en: "This station already has a booking that overlaps this time slot. Choose another time or station." },
  GAMING_BOOKING_IDEMPOTENCY_CONFLICT: { fr: "Cette commande a déjà été utilisée pour une autre réservation. Actualisez puis réessayez.", en: "This command key was already used for another booking. Refresh and try again." },
  GAMING_BOOKING_TERMINAL: { fr: "Cette réservation est déjà annulée, marquée absente ou convertie et ne peut plus être modifiée.", en: "This booking is already cancelled, marked no-show, or converted and can no longer be changed." },
  GAMING_BOOKING_CONFIRM_INVALID: { fr: "Seul un brouillon peut être confirmé.", en: "Only a draft booking can be confirmed." },
  GAMING_BOOKING_CHECK_IN_INVALID: { fr: "Seule une réservation confirmée peut être enregistrée à l’arrivée.", en: "Only a confirmed booking can be checked in." },
  GAMING_BOOKING_NO_SHOW_INVALID: { fr: "Seule une réservation confirmée peut être marquée comme absence.", en: "Only a confirmed booking can be marked as a no-show." },
  GAMING_BOOKING_CANCEL_INVALID: { fr: "Cette réservation ne peut plus être annulée dans son état actuel.", en: "This booking can no longer be cancelled in its current state." },
  GAMING_BOOKING_CONVERT_INVALID: { fr: "Enregistrez d’abord l’arrivée du joueur avant de convertir la réservation en session.", en: "Check the player in before converting the booking into a session." },
  GAMING_BOOKING_SESSION_EXISTS: { fr: "Cette réservation a déjà été convertie en session. Ouvrez la session existante.", en: "This booking has already been converted into a session. Open the existing session." },
  GAMING_BOOKING_STATION_BUSY: { fr: "Le poste est actuellement occupé ou indisponible. Libérez-le ou choisissez un autre poste avant de démarrer la session réservée.", en: "The station is currently occupied or unavailable. Free it or choose another station before starting the booked session." },
  GAMING_BOOKING_STATION_INCIDENT: { fr: "Un incident majeur est ouvert sur ce poste. Résolvez-le avant de convertir la réservation en session.", en: "A major incident is open on this station. Resolve it before converting the booking into a session." },
  GAMING_BOOKING_STATION_MAINTENANCE: { fr: "Une maintenance est en cours sur ce poste. Terminez-la avant de convertir la réservation en session.", en: "Maintenance is in progress on this station. Complete it before converting the booking into a session." },
};

const pricingMessages: Record<string, { fr: string; en: string }> = {
  GAMING_PRICING_RULE_NOT_FOUND: { fr: "Cette règle tarifaire est introuvable ou a été archivée.", en: "This pricing rule could not be found or was archived." },
  GAMING_PRICING_CODE_DUPLICATE: { fr: "Ce code tarifaire existe déjà. Choisissez un autre code.", en: "This pricing code already exists. Choose another code." },
  GAMING_PRICING_SERVICE_NOT_FOUND: { fr: "Le service sélectionné n’existe pas ou n’est pas actif dans le catalogue de cette entreprise.", en: "The selected service does not exist or is not active in this organization catalog." },
  GAMING_PRICING_SERVICE_NOT_SERVICE: { fr: "L’article sélectionné n’est pas un service. Les offres Gaming doivent référencer un service du catalogue commun.", en: "The selected catalog item is not a service. Gaming offers must reference a service from the shared catalog." },
  GAMING_PRICING_STATION_NOT_FOUND: { fr: "Le poste sélectionné n’existe pas dans cette entreprise.", en: "The selected station does not exist in this organization." },
  GAMING_PRICING_CURRENCY_INVALID: { fr: "La devise sélectionnée n’est pas active dans le référentiel Finance de cette entreprise.", en: "The selected currency is not active in this organization Finance currency registry." },
  GAMING_PRICING_RULE_INVALID: { fr: "La règle tarifaire est incohérente. Vérifiez durée, créneau, joueurs et période de validité.", en: "The pricing rule is inconsistent. Check duration, time slot, players, and validity dates." },
  GAMING_PRICING_NO_MATCH: { fr: "Aucun tarif Gaming actif ne correspond à cette simulation.", en: "No active Gaming pricing rule matches this simulation." },
  GAMING_PRICING_OVERRIDE_REASON_REQUIRED: { fr: "Une dérogation tarifaire exige un motif explicite.", en: "A pricing override requires an explicit reason." },
  GAMING_PRICING_OVERRIDE_FORBIDDEN: { fr: "Vous n’avez pas le droit d’appliquer une dérogation tarifaire.", en: "You are not allowed to apply a pricing override." },
  GAMING_PRICING_TERMINAL: { fr: "Cette règle est archivée et ne peut plus être modifiée.", en: "This rule is archived and can no longer be changed." },
};

function localizedMessage(messages: Record<string, { fr: string; en: string }>, error: unknown, request: Request) {
  if (error instanceof EnterpriseDomainError && messages[error.code]) {
    const locale = request.headers.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "fr";
    return NextResponse.json({ error: error.code, message: messages[error.code][locale] }, { status: error.status });
  }
  return null;
}

export function gamingStationErrorResponse(error: unknown, request: Request) {
  return localizedMessage(stationMessages, error, request) || enterpriseDomainErrorResponse(error, "GAMING_STATION_SAVE_FAILED", request);
}

export function gamingSessionErrorResponse(error: unknown, request: Request) {
  return localizedMessage(sessionMessages, error, request) || localizedMessage(pricingMessages, error, request) || enterpriseDomainErrorResponse(error, "GAMING_SESSION_SAVE_FAILED", request);
}

export function gamingBookingErrorResponse(error: unknown, request: Request) {
  return localizedMessage(bookingMessages, error, request) || enterpriseDomainErrorResponse(error, "GAMING_BOOKING_SAVE_FAILED", request);
}

export function gamingPricingErrorResponse(error: unknown, request: Request) {
  return localizedMessage(pricingMessages, error, request) || enterpriseDomainErrorResponse(error, "GAMING_PRICING_SAVE_FAILED", request);
}
