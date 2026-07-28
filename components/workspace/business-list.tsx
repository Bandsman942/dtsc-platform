import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BusinessList({ children, className, ariaLabel }: { children: ReactNode; className?: string; ariaLabel?: string }) {
  return (
    <div role="list" aria-label={ariaLabel} className={cn("min-w-0 divide-y divide-dtsc-border border-y border-dtsc-border", className)}>
      {children}
    </div>
  );
}

export function BusinessListItem({
  title,
  status,
  meta,
  description,
  leading,
  actions,
  onOpen,
  openLabel,
  className,
}: {
  title: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  onOpen?: () => void;
  openLabel?: string;
  className?: string;
}) {
  const content = (
    <>
      {leading ? <div className="mt-0.5 shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
          <div className="min-w-0 flex-1 break-words font-black text-dtsc-ink">{title}</div>
          {status ? <div className="shrink-0">{status}</div> : null}
        </div>
        {meta ? <div className="mt-1 min-w-0 text-xs font-semibold leading-5 text-dtsc-muted sm:text-sm">{meta}</div> : null}
        {description ? <div className="mt-1 line-clamp-2 min-w-0 text-sm leading-5 text-dtsc-muted">{description}</div> : null}
      </div>
    </>
  );

  return (
    <article role="listitem" className={cn("group min-w-0 py-3 sm:py-3.5", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            aria-label={openLabel}
            className="flex min-w-0 flex-1 items-start gap-3 rounded-xl text-left outline-none transition hover:bg-dtsc-soft/50 focus-visible:ring-2 focus-visible:ring-cyan-300 -m-1 p-1"
          >
            {content}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-3">{content}</div>
        )}
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </article>
  );
}
