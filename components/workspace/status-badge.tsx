import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusBadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const toneClasses: Record<StatusBadgeTone, string> = {
  neutral: "border-dtsc-border bg-dtsc-soft text-dtsc-blue",
  info: "border-cyan-400/25 bg-cyan-400/10 text-cyan-700 dark:text-cyan-300",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
};

export function StatusBadge({ children, tone = "neutral", className }: { children: ReactNode; tone?: StatusBadgeTone; className?: string }) {
  return (
    <span
      data-workspace-status-badge
      className={cn(
        "inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[0.66rem] font-black uppercase tracking-[0.04em] leading-none sm:text-[0.7rem]",
        toneClasses[tone],
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
