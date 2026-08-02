import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ModuleWorkspace({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-module-workspace
      data-responsive-scope
      className={cn(
        "w-full min-w-0 max-w-full space-y-6 overflow-x-clip pb-[calc(1rem+env(safe-area-inset-bottom))] sm:space-y-7",
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
      className={cn("w-full min-w-0 max-w-full overflow-x-clip border-b-2 border-dtsc-border pb-5 sm:pb-6", className)}
    >
      <div className="flex min-w-0 max-w-full flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-4xl">
          {eyebrow ? (
            <div className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-cyan-600 sm:text-xs">
              {eyebrow}
            </div>
          ) : null}
          <div className="mt-1.5 flex min-w-0 max-w-full flex-wrap items-baseline gap-2.5">
            <h1 className="min-w-0 break-words text-2xl font-black tracking-[-0.025em] text-dtsc-ink sm:text-3xl lg:text-[2rem]">
              {title}
            </h1>
            {count !== undefined ? (
              <span className="max-w-full rounded-full bg-dtsc-soft px-2.5 py-1 text-xs font-black text-dtsc-blue">
                {count}
              </span>
            ) : null}
          </div>
          {description ? (
            <div className="mt-2.5 max-w-3xl break-words text-sm leading-6 text-dtsc-muted sm:text-[0.95rem] sm:leading-7">
              {description}
            </div>
          ) : null}
        </div>
        {primaryAction || secondaryActions ? (
          <div data-responsive-actions className="lg:justify-end">
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
        "w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-page/70 p-3.5 sm:p-4",
        className,
      )}
      aria-label={ariaLabel}
    >
      <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,auto)] lg:items-end">
        {search ? <div className="min-w-0 max-w-full">{search}</div> : null}
        {controls ? <div data-workspace-toolbar-controls className="min-w-0 max-w-full">{controls}</div> : null}
      </div>
      {activeFilters || summary ? (
        <div className="mt-3 flex min-w-0 max-w-full flex-wrap items-center justify-between gap-2 border-t border-dtsc-border/80 pt-3 text-xs text-dtsc-muted">
          <div className="min-w-0 max-w-full">{activeFilters}</div>
          <div className="max-w-full break-words font-black text-dtsc-ink/80">{summary}</div>
        </div>
      ) : null}
    </section>
  );
}

export function ModuleContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-module-content
      className={cn("w-full min-w-0 max-w-full space-y-10 overflow-x-clip sm:space-y-12", className)}
    >
      {children}
    </div>
  );
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
        "w-full min-w-0 max-w-full scroll-mt-24 overflow-x-clip border-t border-dtsc-border pt-6 first:border-t-0 first:pt-0",
        className,
      )}
    >
      <div data-workspace-section-header className="mb-4 flex min-w-0 max-w-full flex-wrap items-start justify-between gap-3 sm:mb-5 sm:flex-nowrap">
        <div className="min-w-0 max-w-full border-l-[3px] border-cyan-500 pl-3.5 sm:pl-4">
          <div className="flex min-w-0 max-w-full flex-wrap items-baseline gap-2.5">
            <h2 className="min-w-0 break-words text-lg font-black tracking-[-0.015em] text-dtsc-ink sm:text-xl">
              {title}
            </h2>
            {count !== undefined ? (
              <span className="max-w-full rounded-full bg-dtsc-soft px-2 py-0.5 text-[0.68rem] font-black leading-5 text-dtsc-blue sm:text-xs">
                {count}
              </span>
            ) : null}
          </div>
          {description ? (
            <div className="mt-1.5 max-w-4xl break-words text-sm leading-6 text-dtsc-muted sm:text-[0.925rem]">
              {description}
            </div>
          ) : null}
        </div>
        {action ? <div className="min-w-0 max-w-full pt-0.5">{action}</div> : null}
      </div>
      <div data-workspace-section-body className="w-full min-w-0 max-w-full overflow-x-clip">
        {children}
      </div>
    </section>
  );
}
