import { NextResponse } from "next/server";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";

const messages: Record<string, { fr: string; en: string }> = {
  GAMING_STATION_NOT_FOUND: {
    fr: "Ce poste de jeu est introuvable ou a été archivé. Actualisez la liste puis réessayez.",
    en: "This gaming station could not be found or was archived. Refresh the list and try again.",
  },
  GAMING_STATION_ASSET_NOT_FOUND: {
    fr: "L’actif lié à ce poste n’est plus disponible dans Actifs & maintenance. Choisissez un actif valide de cette entreprise.",
    en: "The asset linked to this station is no longer available in Assets & maintenance. Select a valid asset from this organization.",
  },
  GAMING_STATION_ASSET_DISPOSED: {
    fr: "Un actif sorti du parc ne peut pas devenir un poste de jeu. Choisissez un autre actif.",
    en: "A disposed asset cannot become a gaming station. Select another asset.",
  },
  GAMING_STATION_ASSET_UNAVAILABLE: {
    fr: "Ce poste ne peut pas être remis disponible car son actif est archivé ou sorti du parc.",
    en: "This station cannot be made available because its asset is archived or disposed.",
  },
  GAMING_STATION_ASSET_ALREADY_LINKED: {
    fr: "Cet actif est déjà rattaché à un poste Gaming. Ouvrez le poste existant au lieu d’en créer un doublon.",
    en: "This asset is already linked to a gaming station. Open the existing station instead of creating a duplicate.",
  },
  GAMING_STATION_CODE_DUPLICATE: {
    fr: "Ce numéro de poste est déjà utilisé. Choisissez un autre numéro.",
    en: "This station number is already in use. Choose another number.",
  },
  GAMING_STATION_BLOCKED_BY_INCIDENT: {
    fr: "Ce poste reste indisponible car un incident majeur est encore ouvert sur son actif. Résolvez l’incident dans Actifs & maintenance avant de le remettre disponible.",
    en: "This station remains unavailable because a major asset incident is still open. Resolve the incident in Assets & maintenance before making it available.",
  },
  GAMING_STATION_BLOCKED_BY_MAINTENANCE: {
    fr: "Ce poste reste indisponible car une maintenance est en cours. Terminez ou annulez la maintenance avant de le remettre disponible.",
    en: "This station remains unavailable because maintenance is in progress. Complete or cancel the maintenance before making it available.",
  },
  GAMING_STATION_HAS_LIVE_SESSION: {
    fr: "Ce poste ne peut pas être archivé pendant une session de jeu en cours ou en attente.",
    en: "This station cannot be archived while a gaming session is active or waiting.",
  },
  GAMING_STATION_HAS_ACTIVE_BOOKING: {
    fr: "Ce poste ne peut pas être archivé tant qu’une réservation confirmée est encore active.",
    en: "This station cannot be archived while a confirmed booking is still active.",
  },
};

export function gamingStationErrorResponse(error: unknown, request: Request) {
  if (error instanceof EnterpriseDomainError && messages[error.code]) {
    const locale = request.headers.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "fr";
    return NextResponse.json({ error: error.code, message: messages[error.code][locale] }, { status: error.status });
  }
  return enterpriseDomainErrorResponse(error, "GAMING_STATION_SAVE_FAILED", request);
}
