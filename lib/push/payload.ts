export type DtscPushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  type: string;
};

const NEUTRAL_BODY = "Ouvrez DTSC Platform pour consulter les détails.";

function safeTitle(type: string) {
  const normalized = type.toUpperCase();
  if (normalized.includes("CALL")) return "Appel DTSC";
  if (normalized.includes("MESSAGE") || normalized.includes("COLLAB")) return "Nouveau message reçu";
  if (normalized.includes("SUPPORT") || normalized.includes("TICKET")) return "Mise à jour support";
  if (normalized.includes("INVIT")) return "Invitation DTSC";
  if (normalized.includes("ANNOUNCEMENT") || normalized.includes("BROADCAST")) return "Nouvelle annonce DTSC";
  if (normalized.includes("ACTIV") || normalized.includes("ASSIGN") || normalized.includes("TASK")) return "Nouvelle activité DTSC";
  if (normalized.includes("APPROV") || normalized.includes("VALID")) return "Validation DTSC à consulter";
  return "Nouvelle notification DTSC";
}

export function normalizePushTargetUrl(value: string | null | undefined) {
  const fallback = "/notifications";
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://dtsc-platform.invalid");
    if (parsed.origin !== "https://dtsc-platform.invalid") {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function createDtscPushPayload({
  notificationId,
  type,
  targetUrl,
}: {
  notificationId: string;
  type: string;
  targetUrl?: string | null;
}): DtscPushPayload {
  return {
    title: safeTitle(type),
    body: NEUTRAL_BODY,
    url: normalizePushTargetUrl(targetUrl),
    tag: `dtsc-${type.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}-${notificationId}`.slice(0, 120),
    type,
  };
}
