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
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
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
    const menuWidth = 224;
    const menuHeight = Math.min(visibleItems.length * 44 + 8, 384);
    const viewportMargin = 12;
    const left = align === "right"
      ? Math.max(viewportMargin, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportMargin))
      : Math.max(viewportMargin, Math.min(rect.left, window.innerWidth - menuWidth - viewportMargin));
    const preferredTop = rect.bottom + 8 + menuHeight <= window.innerHeight - viewportMargin
      ? rect.bottom + 8
      : rect.top - menuHeight - 8;
    setMenuPosition({ left, top: Math.max(viewportMargin, preferredTop) });
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
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-dtsc-border bg-dtsc-surface text-dtsc-blue shadow-[0_4px_20px_rgba(0,43,91,0.05)] transition hover:border-cyan-300 hover:bg-dtsc-soft focus:outline-none focus:ring-2 focus:ring-cyan-300"
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
          className="fixed z-[1000] max-h-[min(24rem,calc(100dvh-2rem))] min-w-56 overflow-y-auto rounded-2xl border border-dtsc-border bg-dtsc-surface/95 p-1 shadow-[0_18px_60px_rgba(0,23,54,0.28)] backdrop-blur-xl"
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
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition",
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
