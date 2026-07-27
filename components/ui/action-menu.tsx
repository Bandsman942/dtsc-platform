"use client";

import { MoreHorizontal, MoreVertical, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type ActionMenuItem = {
  key: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

export function ActionMenu({
  label = "Actions",
  items,
  align = "right",
  className,
  orientation = "vertical",
}: {
  label?: string;
  items: ActionMenuItem[];
  align?: "left" | "right";
  className?: string;
  orientation?: "vertical" | "horizontal";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const visibleItems = items.filter((item) => !item.disabled);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    function closeOnViewportChange(event: Event) {
      if (event.type === "scroll" && event.target instanceof Node && menuRef.current?.contains(event.target)) {
        return;
      }
      setOpen(false);
    }
    const visualViewport = window.visualViewport;
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    visualViewport?.addEventListener("resize", closeOnViewportChange);
    visualViewport?.addEventListener("scroll", closeOnViewportChange);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
      visualViewport?.removeEventListener("resize", closeOnViewportChange);
      visualViewport?.removeEventListener("scroll", closeOnViewportChange);
    };
  }, [open]);

  function toggleMenu() {
    if (open) {
      setOpen(false);
      return;
    }
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewportLeft = visualViewport?.offsetLeft ?? 0;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportWidth = visualViewport?.width ?? window.innerWidth;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const menuWidth = Math.min(224, Math.max(160, viewportWidth - 24));
    const menuHeight = Math.min(visibleItems.length * 44 + 8, Math.max(120, viewportHeight - 24));
    const viewportMargin = 12;
    const left = align === "right"
      ? Math.max(viewportLeft + viewportMargin, Math.min(rect.right - menuWidth, viewportRight - menuWidth - viewportMargin))
      : Math.max(viewportLeft + viewportMargin, Math.min(rect.left, viewportRight - menuWidth - viewportMargin));
    const preferredTop = rect.bottom + 8 + menuHeight <= viewportBottom - viewportMargin
      ? rect.bottom + 8
      : rect.top - menuHeight - 8;
    setMenuPosition({ left, top: Math.max(viewportTop + viewportMargin, preferredTop) });
    setOpen(true);
  }

  if (!visibleItems.length) {
    return null;
  }

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleMenu}
        className="inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl border border-dtsc-border bg-dtsc-surface text-dtsc-blue shadow-[0_4px_20px_rgba(0,43,91,0.05)] transition hover:border-cyan-300 hover:bg-dtsc-soft focus:outline-none focus:ring-2 focus:ring-cyan-300 sm:h-10 sm:w-10"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {orientation === "horizontal" ? <MoreHorizontal className="h-5 w-5" /> : <MoreVertical className="h-5 w-5" />}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ left: menuPosition.left, top: menuPosition.top }}
          className="fixed z-[1000] max-h-[min(24rem,calc(100dvh-1.5rem))] max-w-[calc(100vw-1.5rem)] min-w-40 touch-pan-y overflow-y-auto overscroll-contain rounded-2xl border border-dtsc-border bg-dtsc-surface/95 p-1 shadow-[0_18px_60px_rgba(0,23,54,0.28)] backdrop-blur-xl [-webkit-overflow-scrolling:touch] sm:min-w-56"
        >
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex min-h-11 w-full touch-manipulation items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base font-bold transition sm:text-sm",
                  item.destructive
                    ? "text-red-600 hover:bg-red-50"
                    : "text-dtsc-ink hover:bg-dtsc-soft"
                )}
              >
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
