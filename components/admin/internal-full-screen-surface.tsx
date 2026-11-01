"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import { containModalTab, isTopmostModal } from "@/lib/client-focus-management";
import { useAppLocale } from "@/components/i18n/locale-provider";

/** A nested, keyboard-accessible full-viewport workspace; dialogs still sit above it. */
export function InternalFullScreenSurface({
  open,
  title,
  subtitle,
  onClose,
  children,
  actions,
  level = 1,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  level?: 1 | 2 | 3;
}) {
  const titleId = useId();
  const en = useAppLocale() === "en";
  const surfaceRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));

    function onKeyDown(event: KeyboardEvent) {
      if (!isTopmostModal(surfaceRef.current)) return;
      if (document.activeElement?.closest('[role="menu"]')) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      } else if (event.key === "Tab" && surfaceRef.current) {
        containModalTab(event, surfaceRef.current);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => {
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      });
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={surfaceRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-dtsc-internal-fullscreen
      data-dtsc-fullscreen-level={level}
      className={`fixed inset-0 flex min-w-0 flex-col overflow-hidden bg-dtsc-page text-dtsc-ink ${level === 3 ? "z-[990]" : level === 2 ? "z-[980]" : "z-[970]"}`}
    >
      <header className="z-10 flex min-h-14 shrink-0 items-center gap-2 border-b border-dtsc-border bg-dtsc-surface px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6">
        <button type="button" onClick={onClose} aria-label={en ? "Back to list" : "Retour à la liste"} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-bold text-dtsc-blue hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
          <ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">{en ? "Back" : "Retour"}</span>
        </button>
        <div className="min-w-0 flex-1 border-l-2 border-cyan-500 pl-3">
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="truncate text-base font-black text-dtsc-ink outline-none sm:text-lg">{title}</h2>
          {subtitle ? <p className="truncate text-[0.7rem] text-dtsc-muted sm:text-xs">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        <button type="button" onClick={onClose} aria-label={en ? "Close full-screen view" : "Fermer la vue plein écran"} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-dtsc-muted hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"><X className="h-4 w-4" /></button>
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pt-5 [scrollbar-gutter:stable]">
        <div className="mx-auto min-w-0 w-full max-w-[100rem]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
