import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ModuleWorkspace({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 space-y-5 overflow-x-hidden pb-[calc(1rem+env(safe-area-inset-bottom))]", className)}>
      {children}
    </div>
  );
}

export function ModuleHeader({
  eyebrow,
  title,
  description,
  count,
  primaryAction,
  secondaryActions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  count?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("min-w-0 border-b border-dtsc-border pb-4 sm:pb-5", className)}>
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-4xl">
          {eyebrow ? <div className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{eyebrow}</div> : null}
          <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-2">
            <h1 className="min-w-0 break-words text-2xl font-black tracking-tight text-dtsc-ink sm:text-3xl">{title}</h1>
            {count !== undefined ? <span className="text-sm font-bold text-dtsc-muted">{count}</span> : null}
          </div>
          {description ? <div className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted sm:text-[0.95rem]">{description}</div> : null}
        </div>
        {(primaryAction || secondaryActions) ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            {secondaryActions}
            {primaryAction}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function ModuleToolbar({
  search,
  controls,
  activeFilters,
  summary,
  className,
}: {
  search?: ReactNode;
  controls?: ReactNode;
  activeFilters?: ReactNode;
  summary?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 border-b border-dtsc-border pb-4", className)} aria-label="Contrôles du module">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">{search}</div>
        {controls ? <div className="flex min-w-0 flex-wrap items-end gap-2 lg:justify-end">{controls}</div> : null}
      </div>
      {(activeFilters || summary) ? (
        <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-dtsc-muted">
          <div className="min-w-0">{activeFilters}</div>
          <div className="shrink-0 font-bold">{summary}</div>
        </div>
      ) : null}
    </section>
  );
}

export function ModuleContent({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("min-w-0 space-y-6", className)}>{children}</main>;
}

export function ModuleSection({
  id,
  title,
  description,
  count,
  action,
  children,
  className,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("min-w-0 scroll-mt-24", className)}>
      <div className="mb-2 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-2">
            <h2 className="break-words text-base font-black text-dtsc-ink sm:text-lg">{title}</h2>
            {count !== undefined ? <span className="text-xs font-bold text-dtsc-muted">{count}</span> : null}
          </div>
          {description ? <div className="mt-1 max-w-4xl text-sm leading-5 text-dtsc-muted">{description}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
