import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BusinessDetail({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-business-detail className={cn("min-w-0 space-y-6", className)}>
      {children}
    </div>
  );
}

export function BusinessDetailHeader({
  eyebrow,
  title,
  summary,
  status,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-business-detail-header
      className={cn(
        "min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page/70 px-4 py-4 sm:px-5 sm:py-5",
        className,
      )}
    >
      <div className="border-l-[3px] border-dtsc-blue pl-3.5 sm:pl-4">
        {eyebrow ? (
          <div className="text-[0.66rem] font-black uppercase tracking-[0.17em] text-cyan-600 sm:text-[0.7rem]">
            {eyebrow}
          </div>
        ) : null}
        <div className="mt-1.5 flex min-w-0 flex-wrap items-start gap-2.5">
          <h3 className="min-w-0 flex-1 break-words text-xl font-black leading-7 tracking-[-0.02em] text-dtsc-ink sm:text-2xl">
            {title}
          </h3>
          {status ? <div className="shrink-0 pt-0.5">{status}</div> : null}
        </div>
        {summary ? <div className="mt-2 text-sm leading-6 text-dtsc-muted">{summary}</div> : null}
      </div>
      {actions ? <div className="mt-4 flex flex-wrap gap-2 border-t border-dtsc-border/80 pt-4">{actions}</div> : null}
    </header>
  );
}

export function BusinessDetailSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-business-detail-section
      className={cn("min-w-0 border-t border-dtsc-border pt-5", className)}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-[0.72rem] font-black uppercase tracking-[0.14em] text-dtsc-blue sm:text-xs">
            {title}
          </h4>
          {description ? <div className="mt-1.5 text-xs leading-5 text-dtsc-muted sm:text-sm">{description}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-3.5 min-w-0">{children}</div>
    </section>
  );
}

export function BusinessDetailGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl
      data-business-detail-grid
      className={cn("grid min-w-0 gap-x-6 gap-y-4 sm:grid-cols-2", className)}
    >
      {children}
    </dl>
  );
}

export function BusinessDetailField({
  label,
  value,
  wide = false,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div
      data-business-detail-field
      className={cn("min-w-0 border-b border-dtsc-border/75 pb-3", wide && "sm:col-span-2", className)}
    >
      <dt className="text-[0.66rem] font-black uppercase tracking-[0.13em] text-dtsc-muted sm:text-[0.7rem]">
        {label}
      </dt>
      <dd className="mt-1.5 min-w-0 break-words text-sm font-semibold leading-6 text-dtsc-ink">
        {value}
      </dd>
    </div>
  );
}
