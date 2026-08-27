export type ToastTone = "success" | "error" | "warning" | "info";

export type ToastPayload = {
  title?: string;
  description: string;
  tone?: ToastTone;
  durationMs?: number;
};

export const DTSC_TOAST_EVENT = "dtsc:toast";

/**
 * Dispatch a DTSC foreground toast.
 *
 * The object form remains the canonical API for callers that need a custom
 * title or duration. The string + tone form is intentionally supported for
 * form/mutation helpers that already own a localized, actionable message and
 * only need to declare its semantic result.
 */
export function notifyToast(payload: ToastPayload): void;
export function notifyToast(description: string, tone?: ToastTone): void;
export function notifyToast(payloadOrDescription: ToastPayload | string, tone?: ToastTone) {
  if (typeof window === "undefined") {
    return;
  }
  const payload: ToastPayload = typeof payloadOrDescription === "string"
    ? {
        description: payloadOrDescription,
        tone: tone || "info",
        durationMs: tone === "error" ? 7000 : undefined,
      }
    : payloadOrDescription;
  window.dispatchEvent(new CustomEvent<ToastPayload>(DTSC_TOAST_EVENT, { detail: payload }));
}

export function toastSuccess(description: string, title = "Succès") {
  notifyToast({ title, description, tone: "success" });
}

export function toastError(description: string, title = "Action impossible") {
  notifyToast({ title, description, tone: "error", durationMs: 7000 });
}

export function toastInfo(description: string, title = "Information") {
  notifyToast({ title, description, tone: "info" });
}
