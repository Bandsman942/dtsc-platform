export const SESSION_ALLOWED_IDLE_TIMEOUT_MINUTES = [15, 30, 60, 240, 480, 1440, 10080, 43200] as const;

export type SessionIdleTimeoutMinutes = (typeof SESSION_ALLOWED_IDLE_TIMEOUT_MINUTES)[number];

export const SESSION_DEFAULT_IDLE_TIMEOUT_MINUTES: SessionIdleTimeoutMinutes = 30;
export const SESSION_ABSOLUTE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_WARNING_MAX_SECONDS = 5 * 60;
export const SESSION_WARNING_MIN_SECONDS = 60;
export const SESSION_HEARTBEAT_THROTTLE_MS = 60 * 1000;
export const SESSION_ACTIVE_HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;

export const SESSION_IDLE_TIMEOUT_OPTIONS: ReadonlyArray<{ value: SessionIdleTimeoutMinutes; labelFr: string; labelEn: string }> = [
  { value: 15, labelFr: "15 minutes", labelEn: "15 minutes" },
  { value: 30, labelFr: "30 minutes", labelEn: "30 minutes" },
  { value: 60, labelFr: "1 heure", labelEn: "1 hour" },
  { value: 240, labelFr: "4 heures", labelEn: "4 hours" },
  { value: 480, labelFr: "8 heures", labelEn: "8 hours" },
  { value: 1440, labelFr: "24 heures", labelEn: "24 hours" },
  { value: 10080, labelFr: "7 jours", labelEn: "7 days" },
  { value: 43200, labelFr: "30 jours", labelEn: "30 days" },
];

export function isAllowedSessionIdleTimeoutMinutes(value: unknown): value is SessionIdleTimeoutMinutes {
  return typeof value === "number" && SESSION_ALLOWED_IDLE_TIMEOUT_MINUTES.some((allowed) => allowed === value);
}
