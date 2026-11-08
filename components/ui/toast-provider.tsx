"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { DTSC_TOAST_EVENT, type ToastPayload, type ToastTone } from "@/lib/client-toast";
import { cn } from "@/lib/utils";

type ToastItem = Required<Pick<ToastPayload, "description" | "tone">> & {
  id: string;
  title?: string;
  durationMs: number;
  createdAt: number;
  expiresAt: number;
};

const toneConfig: Record<ToastTone, { icon: LucideIcon; className: string; iconClassName: string; titleClassName: string }> = {
  success: {
    icon: CheckCircle2,
    className: "border-emerald-400 bg-emerald-50/95 dark:border-emerald-600 dark:bg-emerald-950/95",
    iconClassName: "bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100",
    titleClassName: "text-emerald-900 dark:text-emerald-100",
  },
  error: {
    icon: XCircle,
    className: "border-red-400 bg-red-50/95 dark:border-red-600 dark:bg-red-950/95",
    iconClassName: "bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-100",
    titleClassName: "text-red-900 dark:text-red-100",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-amber-400 bg-amber-50/95 dark:border-amber-600 dark:bg-amber-950/95",
    iconClassName: "bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100",
    titleClassName: "text-amber-900 dark:text-amber-100",
  },
  info: {
    icon: Info,
    className: "border-cyan-400 bg-cyan-50/95 dark:border-cyan-600 dark:bg-cyan-950/95",
    iconClassName: "bg-cyan-200 text-cyan-800 dark:bg-cyan-800 dark:text-cyan-100",
    titleClassName: "text-cyan-900 dark:text-cyan-100",
  },
};

const toastCopy = {
  fr: {
    success: "Succès",
    error: "Erreur",
    warning: "Attention",
    info: "Information",
    close: "Fermer la notification",
  },
  en: {
    success: "Success",
    error: "Error",
    warning: "Attention",
    info: "Information",
    close: "Dismiss notification",
  },
} as const;

function toastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ToastProvider() {
  const locale = useAppLocale() === "en" ? "en" : "fr";
  const copy = toastCopy[locale];
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
        createdAt: Date.now(),
        expiresAt: Date.now() + durationMs,
      };
      // Some legacy screens emit both an imperative toast and a state-driven
      // toast for the same mutation. Collapse that pair, but never suppress a
      // later submission merely because its text matches an older one.
      setToasts((current) => current.some((existing) =>
        existing.tone === item.tone &&
        existing.title === item.title &&
        existing.description === item.description &&
        Math.abs(item.createdAt - existing.createdAt) < 120
      ) ? current : [item, ...current].slice(0, 4));
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
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[1200] flex flex-col items-center gap-3 px-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[min(24rem,calc(100vw-2rem))] sm:items-stretch"
    >
      {renderedToasts.map((toast) => {
        const config = toneConfig[toast.tone];
        const Icon = config.icon;
        return (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto w-full max-w-[min(100%,24rem)] animate-dtsc-toast-in rounded-2xl border px-4 py-3 shadow-[0_22px_70px_rgba(0,23,54,0.28)] backdrop-blur-2xl",
              config.className,
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl", config.iconClassName)} aria-hidden="true">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("break-words text-sm font-black", config.titleClassName)}>{toast.title || copy[toast.tone]}</p>
                <p className="mt-1 break-words text-sm font-semibold leading-6 text-slate-800 dark:text-slate-100">{toast.description}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-xl p-1 text-dtsc-muted transition hover:bg-dtsc-soft hover:text-dtsc-ink focus:outline-none focus:ring-2 focus:ring-cyan-300"
                aria-label={copy.close}
                title={copy.close}
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
