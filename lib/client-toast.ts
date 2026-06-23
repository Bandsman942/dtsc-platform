export type ToastTone = "success" | "error" | "warning" | "info";

export type ToastPayload = {
  title?: string;
  description: string;
  tone?: ToastTone;
  durationMs?: number;
};

export const DTSC_TOAST_EVENT = "dtsc:toast";

export function notifyToast(payload: ToastPayload) {
  if (typeof window === "undefined") {
    return;
  }
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
