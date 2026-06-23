"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from "lucide-react";
import { DTSC_TOAST_EVENT, type ToastPayload, type ToastTone } from "@/lib/client-toast";
import { cn } from "@/lib/utils";

type ToastItem = Required<Pick<ToastPayload, "description" | "tone">> & {
  id: string;
  title?: string;
  durationMs: number;
  expiresAt: number;
};

const toneConfig: Record<ToastTone, { icon: LucideIcon; className: string; label: string }> = {
  success: {
    icon: CheckCircle2,
    className: "border-emerald-300/60 bg-emerald-500/14 text-emerald-900 dark:text-emerald-50",
    label: "Succès",
  },
  error: {
    icon: XCircle,
    className: "border-red-300/70 bg-red-500/14 text-red-950 dark:text-red-50",
    label: "Erreur",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-amber-300/70 bg-amber-400/16 text-amber-950 dark:text-amber-50",
    label: "Attention",
  },
  info: {
    icon: Info,
    className: "border-cyan-300/60 bg-cyan-400/14 text-cyan-950 dark:text-cyan-50",
    label: "Information",
  },
};

function toastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    function handleToast(event: Event) {
      const customEvent = event as CustomEvent<ToastPayload>;
      const detail = customEvent.detail;
      const description = typeof detail?.description === "string" ? detail.description.trim() : "";
      if (!description) {
        return;
      }
      const tone = detail.tone || "info";
      const durationMs = detail.durationMs || (tone === "error" ? 7000 : 4600);
      const item: ToastItem = {
        id: toastId(),
        title: detail.title,
        description,
        tone,
        durationMs,
        expiresAt: Date.now() + durationMs,
      };
      setToasts((current) => [item, ...current].slice(0, 4));
    }

    window.addEventListener(DTSC_TOAST_EVENT, handleToast);
    return () => window.removeEventListener(DTSC_TOAST_EVENT, handleToast);
  }, []);

  useEffect(() => {
    if (!toasts.length) {
      return;
    }
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismiss(toast.id), Math.max(0, toast.expiresAt - Date.now())),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [dismiss, toasts]);

  const renderedToasts = useMemo(() => toasts, [toasts]);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 top-3 z-[250] flex flex-col items-center gap-3 px-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[min(24rem,calc(100vw-2rem))] sm:items-stretch"
    >
      {renderedToasts.map((toast) => {
        const config = toneConfig[toast.tone];
        const Icon = config.icon;
        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "pointer-events-auto w-full max-w-[min(100%,24rem)] animate-dtsc-toast-in rounded-2xl border px-4 py-3 shadow-[0_22px_70px_rgba(0,23,54,0.28)] backdrop-blur-2xl",
              "bg-dtsc-surface/92",
              config.className,
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/50 text-current dark:bg-white/10" aria-hidden="true">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-black text-dtsc-ink dark:text-white">{toast.title || config.label}</p>
                <p className="mt-1 break-words text-sm font-semibold leading-6 text-dtsc-muted dark:text-slate-200">{toast.description}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-xl p-1 text-dtsc-muted transition hover:bg-dtsc-soft hover:text-dtsc-ink focus:outline-none focus:ring-2 focus:ring-cyan-300"
                aria-label="Fermer la notification"
                title="Fermer la notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
