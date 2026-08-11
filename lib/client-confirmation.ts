export type SensitiveActionTone = "default" | "warning" | "danger";

export type SensitiveActionConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: SensitiveActionTone;
  reason?: {
    label: string;
    placeholder?: string;
    minLength?: number;
  };
};

export type SensitiveActionConfirmationResult = {
  confirmed: boolean;
  reason?: string;
};

export type SensitiveActionConfirmationRequest = SensitiveActionConfirmationOptions & {
  id: string;
  resolve: (result: SensitiveActionConfirmationResult) => void;
};

export const DTSC_CONFIRMATION_EVENT = "dtsc:sensitive-action-confirmation";

export function confirmSensitiveAction(options: SensitiveActionConfirmationOptions): Promise<SensitiveActionConfirmationResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({ confirmed: false });
  }

  return new Promise((resolve) => {
    const request: SensitiveActionConfirmationRequest = {
      ...options,
      id: crypto.randomUUID(),
      resolve,
    };
    window.dispatchEvent(new CustomEvent<SensitiveActionConfirmationRequest>(DTSC_CONFIRMATION_EVENT, { detail: request }));
  });
}
