// Opt-in, tab-local diagnostics for navigation loops. Never persist URLs,
// identities, request payloads, cookies or tokens.
const ENABLED_KEY = "dtsc-refresh-diagnostics-enabled";
const EVENTS_KEY = "dtsc-refresh-diagnostics-events";
const MAX_EVENTS = 40;
const ALLOWED_EVENTS = new Set([
  "resume-unread-count-changed",
  "resume-session-expired",
  "heartbeat-session-expired",
  "session-sync-logout",
]);

export type RefreshDiagnosticEvent =
  | "resume-unread-count-changed"
  | "resume-session-expired"
  | "heartbeat-session-expired"
  | "session-sync-logout";

export function recordRefreshDiagnostic(event: RefreshDiagnosticEvent) {
  if (typeof window === "undefined") return;
  try {
    const storage = window.sessionStorage;
    if (storage.getItem(ENABLED_KEY) !== "1") return;
    const previous: unknown = JSON.parse(storage.getItem(EVENTS_KEY) || "[]");
    const safeEvents = Array.isArray(previous)
      ? previous.filter((entry) => entry && typeof entry === "object" &&
          Number.isFinite(entry.at) && ALLOWED_EVENTS.has(entry.event)).slice(-(MAX_EVENTS - 1))
      : [];
    storage.setItem(EVENTS_KEY, JSON.stringify([...safeEvents, { at: Date.now(), event }]));
  } catch {
    // Diagnostics are strictly best-effort and must never affect navigation.
  }
}
