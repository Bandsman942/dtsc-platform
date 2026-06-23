"use client";

import { cn } from "@/lib/utils";

export function UnreadBadge({ count, label, tone = "cyan" }: { count?: number; label?: string; tone?: "cyan" | "green"; }) {
  if (!count && !label) {
    return null;
  }
  return (
    <span className={cn(
      "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[0.68rem] font-black leading-none",
      tone === "green" ? "bg-emerald-400 text-[#001736]" : "bg-cyan-300 text-[#001736]"
    )}>
      {label || (count && count > 99 ? "99+" : count)}
    </span>
  );
}
