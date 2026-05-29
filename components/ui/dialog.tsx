"use client";

import { useEffect, type ReactNode } from "react";
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

export function Dialog({ open, title, description, children, footer, onClose, className }: DialogProps) {
  const isTallDialog = typeof className === "string" && (className.includes("h-[92dvh]") || className.includes("h-[94dvh]"));

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex justify-center overflow-x-hidden bg-[#001736]/75 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-sm sm:px-4 sm:py-6",
        isTallDialog ? "items-stretch" : "items-end sm:items-center",
      )}
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={cn(
          "flex max-h-[96dvh] min-h-[66dvh] w-full min-w-0 max-w-2xl flex-col overflow-hidden rounded-[1.65rem] border border-dtsc-border bg-dtsc-surface shadow-[0_24px_80px_rgba(0,23,54,0.35)] sm:max-h-[calc(100dvh-2rem)] sm:min-h-[min(34rem,calc(100dvh-2rem))] sm:rounded-2xl",
          className,
          isTallDialog && "h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] sm:h-[calc(100dvh-3rem)] sm:max-h-[calc(100dvh-3rem)]",
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-dtsc-border bg-dtsc-page px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-black text-dtsc-ink">{title}</h2>
            {description && <p className="mt-1 text-sm leading-6 text-dtsc-muted">{description}</p>}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="rounded-xl text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-ink" aria-label="Fermer" title="Fermer le formulaire">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 scroll-pb-8 sm:px-5 sm:py-5">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-dtsc-border bg-dtsc-page px-4 py-3 sm:px-5 sm:py-4">{footer}</div>}
      </div>
    </div>
  );
}
