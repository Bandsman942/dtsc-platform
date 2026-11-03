import { recordRefreshDiagnostic, type RefreshDiagnosticEvent } from "@/lib/client/refresh-diagnostics";

let navigationPending = false;

export function navigateToSessionExpired(
  router: { replace: (href: string) => void },
  reason: Extract<RefreshDiagnosticEvent, "resume-session-expired" | "heartbeat-session-expired" | "session-sync-logout">,
) {
  if (navigationPending || (typeof window !== "undefined" && window.location.pathname === "/session-expired")) {
    return false;
  }
  navigationPending = true;
  recordRefreshDiagnostic(reason);
  router.replace("/session-expired");
  return true;
}
