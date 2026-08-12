"use client";

import { ArrowLeft, ChevronRight, MoreHorizontal, Sparkles } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { ModuleRefreshButton } from "@/components/workspace/module-refresh-button";
import { getExperienceCopy } from "@/lib/experience-i18n";
import { translate } from "@/lib/i18n";
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
  const locale = useAppLocale();
  const copy = getExperienceCopy(locale).workspace;

  return (
    <header
      data-workspace-module-header
      data-dtsc-module-entry
      className={cn(
        "relative w-full min-w-0 max-w-full overflow-hidden rounded-[1.75rem] border border-dtsc-border bg-[linear-gradient(135deg,rgba(0,43,91,0.10),rgba(34,211,238,0.07)_46%,rgba(255,255,255,0.02))] p-5 shadow-[0_20px_70px_rgba(0,23,54,0.08)] sm:p-6",
        className,
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full border border-cyan-400/20 bg-cyan-400/5 blur-[1px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 right-16 h-36 w-36 rounded-full border border-dtsc-blue/10 bg-dtsc-blue/5" />
      <div className="relative flex min-w-0 max-w-full flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-4xl">
          <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[0.64rem] font-black uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-200">
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="break-words">{copy.signature}</span>
          </div>
          {eyebrow ? (
            <div className="mt-3 text-[0.68rem] font-black uppercase tracking-[0.18em] text-cyan-600 sm:text-xs">
              {eyebrow}
            </div>
          ) : null}
          <div className="mt-1.5 flex min-w-0 max-w-full flex-wrap items-baseline gap-2.5">
            <h1 className="min-w-0 break-words text-2xl font-black tracking-[-0.025em] text-dtsc-ink sm:text-3xl lg:text-[2rem]">
              {title}
            </h1>
            {count !== undefined ? (
              <span className="max-w-full break-words rounded-full bg-dtsc-soft px-2.5 py-1 text-xs font-black text-dtsc-blue">
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
        <div data-responsive-actions className="relative items-center lg:justify-end">
          {secondaryActions ? (
            <>
              <div className="hidden min-w-0 sm:contents">{secondaryActions}</div>
              <details className="group min-w-0 sm:hidden open:col-span-2">
                <summary
                  aria-label={copy.moreActions}
                  title={copy.moreActions}
                  className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-dtsc-border bg-dtsc-surface text-dtsc-blue transition hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 [&::-webkit-details-marker]:hidden"
                >
                  <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                </summary>
                <div className="mt-2 min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-2 shadow-[0_14px_40px_rgba(0,23,54,0.14)]">
                  <div className="grid min-w-0 gap-2 [&>*]:w-full">{secondaryActions}</div>
                </div>
              </details>
            </>
          ) : null}
          <ModuleRefreshButton compact />
          {primaryAction ? <div className="min-w-0">{primaryAction}</div> : null}
        </div>
      </div>
    </header>
  );
}

export function ModuleToolbar({
  search,
  controls,
  activeFilters,
  summary,
  ariaLabel,
  className,
}: {
  search?: ReactNode;
  controls?: ReactNode;
  activeFilters?: ReactNode;
  summary?: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  const locale = useAppLocale();
  const resolvedAriaLabel = ariaLabel || translate(locale, "common.actions");

  return (
    <section
      data-workspace-toolbar
      className={cn(
        "w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-page/70 p-3.5 sm:p-4",
        className,
      )}
      aria-label={resolvedAriaLabel}
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
  defaultOpen = false,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const locale = useAppLocale();
  const copy = getExperienceCopy(locale).workspace;
  const titleId = useId();
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!id) return;
    const syncFromHash = () => {
      const target = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (target === id) setOpen(true);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [id]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function openWorkspace() {
    setOpen(true);
    if (id) window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${encodeURIComponent(id)}`);
  }

  function closeWorkspace() {
    setOpen(false);
    if (id && decodeURIComponent(window.location.hash.replace(/^#/, "")) === id) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    }
  }

  if (open) {
    return (
      <section
        id={id}
        data-workspace-section
        data-workspace-section-open="true"
        aria-labelledby={titleId}
        className={cn("fixed inset-0 z-[80] min-w-0 max-w-full overflow-y-auto bg-dtsc-page", className)}
      >
        <div className="sticky top-0 z-20 border-b border-dtsc-border bg-dtsc-surface/95 px-4 py-3 shadow-sm backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
            <button type="button" onClick={closeWorkspace} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-black text-dtsc-blue transition hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 active:translate-y-px">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {copy.backToModule}
            </button>
            {action ? <div data-responsive-actions>{action}</div> : null}
          </div>
        </div>
        <div className="mx-auto w-full min-w-0 max-w-[1600px] px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <div data-workspace-section-header className="mb-6 min-w-0 border-l-[3px] border-cyan-500 pl-4">
            <div className="flex min-w-0 flex-wrap items-baseline gap-2.5 sm:flex-nowrap">
              <h2 id={titleId} className="min-w-0 break-words text-2xl font-black tracking-[-0.02em] text-dtsc-ink sm:text-3xl">{title}</h2>
              {count !== undefined ? <span className="shrink-0 rounded-full bg-dtsc-soft px-2.5 py-1 text-xs font-black text-dtsc-blue">{count}</span> : null}
            </div>
            {description ? <div className="mt-2 max-w-4xl break-words text-sm leading-6 text-dtsc-muted sm:text-[0.95rem] sm:leading-7">{description}</div> : null}
          </div>
          <div data-workspace-section-body className="w-full min-w-0 max-w-full overflow-x-clip">{children}</div>
        </div>
      </section>
    );
  }

  return (
    <section
      id={id}
      data-workspace-section
      data-workspace-section-open="false"
      aria-labelledby={titleId}
      className={cn("w-full min-w-0 max-w-full scroll-mt-24 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-surface/72", className)}
    >
      <button
        type="button"
        onClick={openWorkspace}
        aria-expanded="false"
        data-workspace-section-header
        className="group flex w-full min-w-0 max-w-full flex-wrap items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-dtsc-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 sm:flex-nowrap sm:px-5 sm:py-5"
      >
        <span className="min-w-0 flex-1 border-l-[3px] border-cyan-500 pl-3.5 sm:pl-4">
          <span className="flex min-w-0 max-w-full flex-wrap items-baseline gap-2.5 sm:flex-nowrap">
            <span id={titleId} className="min-w-0 break-words text-lg font-black tracking-[-0.015em] text-dtsc-ink sm:text-xl">{title}</span>
            {count !== undefined ? <span className="shrink-0 rounded-full bg-dtsc-soft px-2 py-0.5 text-[0.68rem] font-black leading-5 text-dtsc-blue sm:text-xs">{count}</span> : null}
          </span>
          {description ? <span className="mt-1.5 block max-w-4xl break-words text-sm leading-6 text-dtsc-muted">{description}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs font-black text-dtsc-blue">
          <span className="hidden sm:inline">{copy.openSection}</span>
          <ChevronRight className="h-5 w-5 transition group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </button>
    </section>
  );
}
