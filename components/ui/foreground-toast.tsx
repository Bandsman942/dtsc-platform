"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ForegroundToastProps = {
  open: boolean;
  tone: "error" | "success";
  title: string;
  message: string;
  closeLabel: string;
  onClose: () => void;
  autoCloseMs?: number;
};

export function ForegroundToast({
  open,
  tone,
  title,
  message,
  closeLabel,
  onClose,
  autoCloseMs = tone === "success" ? 4500 : 0,
}: ForegroundToastProps) {
  useEffect(() => {
    if (!open || autoCloseMs <= 0) return;
    const timer = window.setTimeout(onClose, autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [autoCloseMs, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[1400] flex justify-center px-3 sm:justify-end sm:px-6"
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <div
        role={tone === "error" ? "alert" : "status"}
        className={cn(
          "pointer-events-auto flex w-full min-w-0 max-w-lg items-start gap-3 rounded-2xl border bg-dtsc-surface p-4 text-dtsc-ink shadow-[0_22px_70px_rgba(0,23,54,0.28)]",
          tone === "error" ? "border-red-500/40" : "border-emerald-500/40",
        )}
      >
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", tone === "error" ? "text-red-600" : "text-emerald-600")} />
        <div className="min-w-0 flex-1">
          <p className="font-black">{title}</p>
          <p className="mt-1 break-words text-sm leading-6 text-dtsc-muted">{message}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-xl" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>,
    document.body,
  );
}
