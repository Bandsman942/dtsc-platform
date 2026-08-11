"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  DTSC_CONFIRMATION_EVENT,
  type SensitiveActionConfirmationRequest,
} from "@/lib/client-confirmation";

export function SensitiveActionConfirmationProvider() {
  const [request, setRequest] = useState<SensitiveActionConfirmationRequest | null>(null);
  const [reason, setReason] = useState("");

  const close = useCallback((confirmed: boolean) => {
    setRequest((current) => {
      current?.resolve({ confirmed, reason: confirmed ? reason.trim() || undefined : undefined });
      return null;
    });
    setReason("");
  }, [reason]);

  useEffect(() => {
    function handleRequest(event: Event) {
      const next = (event as CustomEvent<SensitiveActionConfirmationRequest>).detail;
      if (!next?.id || typeof next.resolve !== "function") return;
      setRequest((current) => {
        current?.resolve({ confirmed: false });
        return next;
      });
      setReason("");
    }

    window.addEventListener(DTSC_CONFIRMATION_EVENT, handleRequest);
    return () => window.removeEventListener(DTSC_CONFIRMATION_EVENT, handleRequest);
  }, []);

  useEffect(() => {
    const browserConfirm = window.confirm.bind(window);
    let approvedReplay: { message: string; origin: HTMLElement } | null = null;

    const appConfirm = (message?: string) => {
      const normalizedMessage = String(message || "Confirmer cette action ?").trim() || "Confirmer cette action ?";
      const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (approvedReplay && origin === approvedReplay.origin && normalizedMessage === approvedReplay.message) {
        approvedReplay = null;
        return true;
      }

      const legacyRequest: SensitiveActionConfirmationRequest = {
        id: crypto.randomUUID(),
        title: "Confirmer cette action",
        description: normalizedMessage,
        confirmLabel: "Confirmer",
        cancelLabel: "Annuler",
        tone: "warning",
        resolve: (result) => {
          if (!result.confirmed || !origin || !origin.isConnected) return;
          approvedReplay = { message: normalizedMessage, origin };
          queueMicrotask(() => origin.click());
        },
      };

      window.dispatchEvent(new CustomEvent<SensitiveActionConfirmationRequest>(DTSC_CONFIRMATION_EVENT, { detail: legacyRequest }));
      return false;
    };

    window.confirm = appConfirm;
    return () => {
      if (window.confirm === appConfirm) window.confirm = browserConfirm;
    };
  }, []);

  const minimumReasonLength = request?.reason?.minLength ?? 3;
  const reasonValid = !request?.reason || reason.trim().length >= minimumReasonLength;
  const danger = request?.tone === "danger";
  const warning = request?.tone === "warning";

  return (
    <Dialog
      open={Boolean(request)}
      title={request?.title || "Confirmer cette action"}
      description={request?.description}
      onClose={() => close(false)}
      className="max-w-lg"
      footer={request ? (
        <>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            {request.cancelLabel || "Annuler"}
          </Button>
          <Button
            type="button"
            disabled={!reasonValid}
            onClick={() => close(true)}
            className={danger ? "bg-red-700 text-white hover:bg-red-800" : warning ? "bg-amber-600 text-white hover:bg-amber-700" : "bg-dtsc-blue text-white hover:bg-[#001736]"}
          >
            {request.confirmLabel || "Confirmer"}
          </Button>
        </>
      ) : undefined}
    >
      {request ? (
        <div className="grid gap-4">
          <div className="flex items-start gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${danger ? "bg-red-500/10 text-red-700" : warning ? "bg-amber-500/10 text-amber-700" : "bg-cyan-500/10 text-cyan-700"}`}>
              {danger || warning ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            </span>
            <p className="text-sm leading-6 text-dtsc-muted">
              Vérifiez les informations avant de continuer. L’action ne sera exécutée qu’après votre confirmation.
            </p>
          </div>
          {request.reason ? (
            <label className="grid gap-2 text-sm font-black text-dtsc-ink">
              {request.reason.label}
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                autoFocus
                placeholder={request.reason.placeholder}
                className="min-h-24 resize-y rounded-2xl border border-dtsc-border bg-dtsc-page px-3 py-2.5 text-base font-medium leading-6 text-dtsc-ink outline-none focus:border-cyan-400 sm:text-sm"
              />
              <span className="text-xs font-semibold text-dtsc-muted">
                {reasonValid ? "Motif renseigné." : `Saisissez au moins ${minimumReasonLength} caractères.`}
              </span>
            </label>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
