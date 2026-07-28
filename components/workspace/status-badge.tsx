import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusBadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const toneClasses: Record<StatusBadgeTone, string> = {
  neutral: "bg-dtsc-soft text-dtsc-blue",
  info: "bg-cyan-400/10 text-cyan-700 dark:text-cyan-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "bg-red-500/10 text-red-700 dark:text-red-300",
};

export function StatusBadge({ children, tone = "neutral", className }: { children: ReactNode; tone?: StatusBadgeTone; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[0.7rem] font-black leading-none", toneClasses[tone], className)}>
      <span className="truncate">{children}</span>
    </span>
  );
}
