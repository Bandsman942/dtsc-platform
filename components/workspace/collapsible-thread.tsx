"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function CollapsibleThread({
  children,
  count,
  label = "commentaires",
  defaultOpen = false,
  forceOpen = false,
  className,
  contentClassName,
}: {
  children: ReactNode;
  count: number;
  label?: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  const regionId = useId();
  const [open, setOpen] = useState(defaultOpen || forceOpen);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
    }
  }, [forceOpen]);

  return (
    <section data-collapsible-thread className={cn("min-w-0", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-left text-sm font-black text-dtsc-blue transition hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <span className="flex min-w-0 items-center gap-2">
          <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">
            {open ? "Masquer" : "Afficher"} {count} {label}
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />}
      </button>
      {open ? (
        <div id={regionId} data-collapsible-thread-content className={cn("mt-3 min-w-0", contentClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
