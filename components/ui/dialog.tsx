"use client";

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
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

const EDITABLE_DIALOG_CONTROL_SELECTOR = [
  "input:not([type='button']):not([type='submit']):not([type='reset']):not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']):not([type='hidden'])",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
].join(",");

function isEditableDialogControl(target: EventTarget | Element | null): target is HTMLElement {
  return target instanceof HTMLElement && target.matches(EDITABLE_DIALOG_CONTROL_SELECTOR);
}

export function Dialog({ open, title, description, children, footer, onClose, className }: DialogProps) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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

    let viewportFrame = 0;
    let focusTimer = 0;
    let secondFocusTimer = 0;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    function ensureFocusedControlVisible() {
      const scroller = scrollRef.current;
      const activeElement = document.activeElement;
      if (!scroller || !isEditableDialogControl(activeElement) || !scroller.contains(activeElement)) {
        return;
      }

      const scrollerRect = scroller.getBoundingClientRect();
      const controlRect = activeElement.getBoundingClientRect();
      const topPadding = 20;
      const bottomPadding = 24;
      const visibleTop = scrollerRect.top + topPadding;
      const visibleBottom = scrollerRect.bottom - bottomPadding;

      if (controlRect.top < visibleTop) {
        scroller.scrollTop -= visibleTop - controlRect.top;
      } else if (controlRect.bottom > visibleBottom) {
        scroller.scrollTop += controlRect.bottom - visibleBottom;
      }
    }

    function syncVisualViewport() {
      window.cancelAnimationFrame(viewportFrame);
      viewportFrame = window.requestAnimationFrame(() => {
        const overlay = overlayRef.current;
        if (!overlay) {
          return;
        }
        const viewport = window.visualViewport;
        const viewportHeight = Math.max(240, Math.round(viewport?.height || window.innerHeight));
        // Do not reposition the fixed overlay with visualViewport.offsetTop.
        // Recent WebKit versions can report stale offsets while the keyboard or
        // browser chrome animates. Updating a CSS variable avoids rerendering the
        // focused input during that fragile interaction.
        overlay.style.setProperty("--dtsc-dialog-visual-height", `${viewportHeight}px`);
        ensureFocusedControlVisible();
      });
    }

    function handleFocusIn(event: FocusEvent) {
      if (!isEditableDialogControl(event.target) || !scrollRef.current?.contains(event.target)) {
        return;
      }
      window.clearTimeout(focusTimer);
      window.clearTimeout(secondFocusTimer);
      // Keep focus entirely native. We only adjust the dialog's internal scroll
      // after the user gesture, so iOS remains free to present its keyboard.
      focusTimer = window.setTimeout(ensureFocusedControlVisible, 80);
      secondFocusTimer = window.setTimeout(ensureFocusedControlVisible, 320);
    }

    const viewport = window.visualViewport;
    syncVisualViewport();
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    window.addEventListener("resize", syncVisualViewport);
    viewport?.addEventListener("resize", syncVisualViewport);
    viewport?.addEventListener("scroll", syncVisualViewport);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("resize", syncVisualViewport);
      viewport?.removeEventListener("resize", syncVisualViewport);
      viewport?.removeEventListener("scroll", syncVisualViewport);
      window.cancelAnimationFrame(viewportFrame);
      window.clearTimeout(focusTimer);
      window.clearTimeout(secondFocusTimer);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const panelStyle: CSSProperties = isTallDialog
    ? {
        height: "calc(var(--dtsc-dialog-visual-height, 100dvh) - 1rem)",
        maxHeight: "calc(var(--dtsc-dialog-visual-height, 100dvh) - 1rem)",
      }
    : {
        maxHeight: "calc(var(--dtsc-dialog-visual-height, 100dvh) - 1rem)",
      };

  return createPortal(
    <div
      ref={overlayRef}
      className={cn(
        "fixed inset-0 z-[1000] flex justify-center overflow-x-hidden bg-[#001736]/75 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 sm:py-6 sm:backdrop-blur-sm",
        isTallDialog ? "items-start sm:items-center" : "items-end sm:items-center",
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={cn(
          "flex w-full min-w-0 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[1.65rem] border border-dtsc-border bg-dtsc-surface shadow-[0_24px_80px_rgba(0,23,54,0.35)] sm:min-h-[min(34rem,calc(100dvh-2rem))] sm:max-w-2xl sm:rounded-2xl",
          className,
          isTallDialog && "max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-3rem)]",
        )}
        style={panelStyle}
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
          ref={scrollRef}
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
