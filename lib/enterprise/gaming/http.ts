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
  GAMING_SESSION_IDEMPOTENCY_CONFLICT: { fr: "Cette commande a déjà été utilisée pour une autre opération. Actualisez puis réessayez.", en: "This command key was already used for another operation. Refresh and try again." },
  GAMING_SESSION_TERMINAL: { fr: "Cette session est déjà terminée ou clôturée et ne peut plus être modifiée.", en: "This session is already ended or closed and can no longer be changed." },
  GAMING_SESSION_NOT_ACTIVE: { fr: "Seule une session en cours peut être mise en pause.", en: "Only an active session can be paused." },
  GAMING_SESSION_NOT_PAUSED: { fr: "Seule une session en pause peut être reprise.", en: "Only a paused session can be resumed." },
  GAMING_SESSION_NOT_LIVE: { fr: "Cette action exige une session en cours ou en pause.", en: "This action requires an active or paused session." },
  GAMING_SESSION_EXTENSION_INVALID: { fr: "La durée de prolongation est invalide.", en: "The extension duration is invalid." },
  GAMING_SESSION_TRANSFER_INVALID: { fr: "Choisissez un autre poste disponible pour transférer la session.", en: "Select another available station to transfer the session." },
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
  return localizedMessage(sessionMessages, error, request) || enterpriseDomainErrorResponse(error, "GAMING_SESSION_SAVE_FAILED", request);
}
