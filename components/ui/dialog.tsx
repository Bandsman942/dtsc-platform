"use client";

import { isValidElement, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minimize2, X } from "lucide-react";
import { requestPersistentCallHandoff, PERSISTENT_CALL_RESTORE_EVENT } from "@/components/calls/persistent-call-events";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DialogProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  onMinimize?: () => void;
  minimizeLabel?: string;
  className?: string;
  presentation?: "default" | "editor";
};

const EDITABLE_DIALOG_CONTROL_SELECTOR = [
  "input:not([type='button']):not([type='submit']):not([type='reset']):not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']):not([type='hidden'])",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
].join(",");

function isEditableDialogControl(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && target.matches(EDITABLE_DIALOG_CONTROL_SELECTOR);
}

function isPersistentCallContent(children: ReactNode) {
  if (!isValidElement(children)) return false;
  const props = children.props as Record<string, unknown>;
  return typeof props["data-call-experience"] === "string";
}

export function Dialog({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  onMinimize,
  minimizeLabel,
  className,
  presentation = "default",
}: DialogProps) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [minimized, setMinimized] = useState(false);
  const persistentCallDialog = isPersistentCallContent(children);
  const isEditorPresentation = presentation === "editor";
  const isTallDialog =
    isEditorPresentation ||
    (typeof className === "string" &&
      (className.includes("h-[90dvh]") ||
        className.includes("h-[92dvh]") ||
        className.includes("h-[94dvh]") ||
        className.includes("h-[96dvh]")));

  useEffect(() => {
    if (!open) setMinimized(false);
  }, [open]);

  useEffect(() => {
    if (!persistentCallDialog) return;
    const restore = () => setMinimized(false);
    window.addEventListener(PERSISTENT_CALL_RESTORE_EVENT, restore);
    return () => window.removeEventListener(PERSISTENT_CALL_RESTORE_EVENT, restore);
  }, [persistentCallDialog]);

  async function minimizePersistentCall() {
    if (onMinimize) {
      onMinimize();
      return;
    }
    await requestPersistentCallHandoff();
    setMinimized(true);
  }

  function handleClose() {
    if (persistentCallDialog) {
      void minimizePersistentCall().catch(() => undefined);
      return;
    }
    onClose();
  }

  useEffect(() => {
    if (!open || minimized) {
      return;
    }

    let viewportFrame = 0;
    let focusTimer = 0;
    let secondFocusTimer = 0;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handleClose();
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
      const visibleTop = scrollerRect.top + 20;
      const visibleBottom = scrollerRect.bottom - 24;

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
        // Only the visible height is useful here. WebKit can expose a stale
        // offsetTop while its browser chrome or software keyboard animates.
        overlay.style.setProperty("--dtsc-dialog-visual-height", `${viewportHeight}px`);
        ensureFocusedControlVisible();
      });
    }

    function handleFocusIn(event: FocusEvent) {
      const target = event.target;
      if (!isEditableDialogControl(target) || !scrollRef.current?.contains(target)) {
        return;
      }
      window.clearTimeout(focusTimer);
      window.clearTimeout(secondFocusTimer);
      // Never synthesize focus: the original tap must remain the user gesture
      // responsible for opening the native iOS keyboard or picker.
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
  }, [minimized, onClose, open, persistentCallDialog]);

  if (!open || minimized || typeof document === "undefined") {
    return null;
  }

  const panelStyle: CSSProperties = {
    maxHeight: "calc(var(--dtsc-dialog-visual-height, 100dvh) - 1rem)",
    ...(isEditorPresentation ? { height: "calc(var(--dtsc-dialog-visual-height, 100dvh) - 1rem)" } : {}),
  };
  const effectiveMinimizeLabel = minimizeLabel || title;

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
          handleClose();
        }
      }}
    >
      <div
        data-dtsc-dialog-panel
        data-dtsc-dialog-presentation={presentation}
        className={cn(
          "flex max-h-full w-full min-w-0 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[1.65rem] border border-dtsc-border bg-dtsc-surface shadow-[0_24px_80px_rgba(0,23,54,0.35)] sm:min-h-[min(34rem,calc(100dvh-2rem))] sm:max-w-2xl sm:rounded-2xl",
          className,
          isTallDialog && "max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-3rem)]",
        )}
        style={panelStyle}
      >
        <div
          className={cn(
            "sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b-2 border-dtsc-border bg-dtsc-page px-4 py-3.5 sm:px-5 sm:py-4",
            isEditorPresentation && "px-3 py-2.5 sm:px-5 sm:py-3.5",
          )}
        >
          <div className="min-w-0 border-l-[3px] border-cyan-500 pl-3.5">
            <h2
              id={titleId}
              className={cn(
                "break-words font-black tracking-[-0.02em] text-dtsc-ink",
                isEditorPresentation ? "text-lg sm:text-2xl" : "text-xl sm:text-2xl",
              )}
            >
              {title}
            </h2>
            {description && (
              <p
                className={cn(
                  "mt-1.5 break-words text-sm leading-6 text-dtsc-muted",
                  isEditorPresentation && "hidden sm:block",
                )}
              >
                {description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {persistentCallDialog || onMinimize ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void minimizePersistentCall().catch(() => undefined)}
                className="shrink-0 rounded-xl text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-ink"
                aria-label={effectiveMinimizeLabel}
                title={effectiveMinimizeLabel}
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            ) : null}
            {!persistentCallDialog ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="shrink-0 rounded-xl text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-ink"
                aria-label="Fermer"
                title="Fermer le formulaire"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
        <div
          ref={scrollRef}
          data-dtsc-dialog-scroll
          className={cn(
            "min-h-0 min-w-0 flex-1 touch-pan-y overscroll-contain bg-dtsc-surface",
            isEditorPresentation
              ? "flex flex-col overflow-hidden p-0 scroll-pb-0"
              : "overflow-x-hidden overflow-y-auto px-3 py-4 scroll-pb-24 sm:px-5 sm:py-5",
          )}
        >
          {children}
        </div>
        {footer && (
          <div
            className={cn(
              "shrink-0 border-t border-dtsc-border bg-dtsc-page pb-[max(0.75rem,env(safe-area-inset-bottom))]",
              isEditorPresentation
                ? "grid grid-cols-2 gap-2 px-2 py-2 sm:flex sm:flex-wrap sm:justify-end sm:gap-3 sm:px-5 sm:py-3"
                : "flex flex-wrap justify-end gap-3 px-4 py-3 sm:px-5 sm:py-4",
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
