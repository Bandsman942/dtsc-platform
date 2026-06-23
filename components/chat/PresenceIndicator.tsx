"use client";

import { cn } from "@/lib/utils";

export function PresenceIndicator({ online, label }: { online?: boolean; label?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-dtsc-muted">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", online ? "bg-emerald-500" : "bg-slate-300")} />
      <span className="truncate">{label || (online ? "En ligne" : "Hors ligne")}</span>
    </span>
  );
}
