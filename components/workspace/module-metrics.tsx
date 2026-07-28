import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ModuleMetrics({ children, className, label = "Indicateurs" }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section data-workspace-metrics aria-label={label} className={cn("min-w-0", className)}>
      <div className="-mx-1 flex max-w-full snap-x snap-proximity gap-2 overflow-x-auto border-y border-dtsc-border/80 px-1 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

export function ModuleMetric({ label, value, hint, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div
      data-workspace-metric
      className={cn(
        "min-w-[9.5rem] snap-start border-l-2 border-dtsc-border px-3 py-1 first:border-l-0 first:pl-1 sm:min-w-0 sm:first:border-l-2 sm:first:pl-3",
        className,
      )}
    >
      <div className="text-[0.66rem] font-black uppercase tracking-[0.13em] text-dtsc-muted sm:text-[0.7rem]">{label}</div>
      <div className="mt-1.5 text-2xl font-black leading-none tracking-[-0.025em] text-dtsc-ink">{value}</div>
      {hint ? <div className="mt-1.5 text-xs font-semibold leading-4 text-dtsc-muted">{hint}</div> : null}
    </div>
  );
}
