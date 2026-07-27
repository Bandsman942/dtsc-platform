"use client";

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DialogProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
};

type VisualViewportBounds = {
  height: number;
  offsetTop: number;
};

export function Dialog({ open, title, description, children, footer, onClose, className }: DialogProps) {
  const titleId = useId();
  const [visualViewportBounds, setVisualViewportBounds] = useState<VisualViewportBounds | null>(null);
  const isTallDialog =
    typeof className === "string" &&
    (className.includes("h-[90dvh]") ||
      className.includes("h-[92dvh]") ||
      className.includes("h-[94dvh]") ||
      className.includes("h-[96dvh]"));

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    function syncVisualViewport() {
      const viewport = window.visualViewport;
      if (!viewport) {
        setVisualViewportBounds(null);
        return;
      }
      setVisualViewportBounds({
        height: Math.max(1, Math.round(viewport.height)),
        offsetTop: Math.max(0, Math.round(viewport.offsetTop)),
      });
    }

    const viewport = window.visualViewport;
    syncVisualViewport();
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", syncVisualViewport);
    viewport?.addEventListener("resize", syncVisualViewport);
    viewport?.addEventListener("scroll", syncVisualViewport);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", syncVisualViewport);
      viewport?.removeEventListener("resize", syncVisualViewport);
      viewport?.removeEventListener("scroll", syncVisualViewport);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const viewportStyle: CSSProperties | undefined = visualViewportBounds
    ? {
        top: `${visualViewportBounds.offsetTop}px`,
        bottom: "auto",
        height: `${visualViewportBounds.height}px`,
      }
    : undefined;
  const panelStyle: CSSProperties | undefined = visualViewportBounds
    ? {
        maxHeight: `calc(${visualViewportBounds.height}px - 1rem)`,
      }
    : undefined;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[1000] flex justify-center overflow-x-hidden bg-[#001736]/75 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-sm sm:px-4 sm:py-6",
        isTallDialog ? "items-stretch" : "items-end sm:items-center",
      )}
      style={viewportStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={cn(
          "flex max-h-full w-full min-w-0 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[1.65rem] border border-dtsc-border bg-dtsc-surface shadow-[0_24px_80px_rgba(0,23,54,0.35)] sm:min-h-[min(34rem,calc(100dvh-2rem))] sm:max-w-2xl sm:rounded-2xl",
          className,
          isTallDialog &&
            "h-full max-h-full max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-3rem)]",
        )}
        style={panelStyle}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-dtsc-border bg-dtsc-page px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="break-words text-lg font-black text-dtsc-ink">{title}</h2>
            {description && <p className="mt-1 break-words text-sm leading-6 text-dtsc-muted">{description}</p>}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="shrink-0 rounded-xl text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-ink" aria-label="Fermer" title="Fermer le formulaire">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div
          data-dtsc-dialog-scroll
          className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 scroll-pb-24 sm:px-5 sm:py-5"
        >
          {children}
        </div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-dtsc-border bg-dtsc-page px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
