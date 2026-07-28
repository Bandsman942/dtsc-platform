import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ModuleWorkspace({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-module-workspace
      className={cn(
        "min-w-0 space-y-6 overflow-x-hidden pb-[calc(1rem+env(safe-area-inset-bottom))] sm:space-y-7",
        className,
      )}
    >
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
    <header
      data-workspace-module-header
      className={cn("min-w-0 border-b-2 border-dtsc-border pb-5 sm:pb-6", className)}
    >
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-4xl">
          {eyebrow ? (
            <div className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-cyan-600 sm:text-xs">
              {eyebrow}
            </div>
          ) : null}
          <div className="mt-1.5 flex min-w-0 flex-wrap items-baseline gap-2.5">
            <h1 className="min-w-0 break-words text-2xl font-black tracking-[-0.025em] text-dtsc-ink sm:text-3xl lg:text-[2rem]">
              {title}
            </h1>
            {count !== undefined ? (
              <span className="rounded-full bg-dtsc-soft px-2.5 py-1 text-xs font-black text-dtsc-blue">
                {count}
              </span>
            ) : null}
          </div>
          {description ? (
            <div className="mt-2.5 max-w-3xl text-sm leading-6 text-dtsc-muted sm:text-[0.95rem] sm:leading-7">
              {description}
            </div>
          ) : null}
        </div>
        {primaryAction || secondaryActions ? (
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
  ariaLabel = "Contrôles du module",
  className,
}: {
  search?: ReactNode;
  controls?: ReactNode;
  activeFilters?: ReactNode;
  summary?: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <section
      data-workspace-toolbar
      className={cn(
        "min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page/70 p-3.5 sm:p-4",
        className,
      )}
      aria-label={ariaLabel}
    >
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">{search}</div>
        {controls ? <div className="flex min-w-0 flex-wrap items-end gap-2 lg:justify-end">{controls}</div> : null}
      </div>
      {activeFilters || summary ? (
        <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-dtsc-border/80 pt-3 text-xs text-dtsc-muted">
          <div className="min-w-0">{activeFilters}</div>
          <div className="shrink-0 font-black text-dtsc-ink/80">{summary}</div>
        </div>
      ) : null}
    </section>
  );
}

export function ModuleContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div data-module-content className={cn("min-w-0 space-y-10 sm:space-y-12", className)}>{children}</div>;
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
    <section
      id={id}
      data-workspace-section
      className={cn(
        "min-w-0 scroll-mt-24 border-t border-dtsc-border pt-6 first:border-t-0 first:pt-0",
        className,
      )}
    >
      <div data-workspace-section-header className="mb-4 flex min-w-0 items-start justify-between gap-3 sm:mb-5">
        <div className="min-w-0 border-l-[3px] border-cyan-500 pl-3.5 sm:pl-4">
          <div className="flex min-w-0 flex-wrap items-baseline gap-2.5">
            <h2 className="break-words text-lg font-black tracking-[-0.015em] text-dtsc-ink sm:text-xl">
              {title}
            </h2>
            {count !== undefined ? (
              <span className="rounded-full bg-dtsc-soft px-2 py-0.5 text-[0.68rem] font-black leading-5 text-dtsc-blue sm:text-xs">
                {count}
              </span>
            ) : null}
          </div>
          {description ? (
            <div className="mt-1.5 max-w-4xl text-sm leading-6 text-dtsc-muted sm:text-[0.925rem]">
              {description}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
      </div>
      <div data-workspace-section-body className="min-w-0">
        {children}
      </div>
    </section>
  );
}
