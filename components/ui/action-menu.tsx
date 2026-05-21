"use client";

import { MoreVertical, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
}: {
  label?: string;
  items: ActionMenuItem[];
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const visibleItems = items.filter((item) => !item.disabled);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!visibleItems.length) {
    return null;
  }

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-dtsc-border bg-dtsc-surface text-dtsc-blue shadow-[0_4px_20px_rgba(0,43,91,0.05)] transition hover:border-cyan-300 hover:bg-dtsc-soft focus:outline-none focus:ring-2 focus:ring-cyan-300"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute top-12 z-50 min-w-56 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-surface/95 p-1 shadow-[0_18px_60px_rgba(0,23,54,0.18)] backdrop-blur-xl",
            align === "right" ? "right-0" : "left-0"
          )}
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
        </div>
      )}
    </div>
  );
}
