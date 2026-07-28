import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BusinessList({ children, className, ariaLabel }: { children: ReactNode; className?: string; ariaLabel?: string }) {
  return (
    <div
      role="list"
      data-business-list
      aria-label={ariaLabel}
      className={cn(
        "min-w-0 divide-y divide-dtsc-border/90 border-y border-dtsc-border bg-dtsc-surface/40",
        className,
      )}
    >
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
        <div className="flex min-w-0 flex-wrap items-start gap-x-2.5 gap-y-1.5">
          <div
            data-business-list-title
            className="min-w-0 flex-1 break-words text-[0.95rem] font-extrabold leading-6 tracking-[-0.01em] text-dtsc-ink sm:text-base"
          >
            {title}
          </div>
          {status ? <div className="shrink-0 pt-0.5">{status}</div> : null}
        </div>
        {meta ? (
          <div
            data-business-list-meta
            className="mt-1 min-w-0 text-[0.72rem] font-bold leading-5 text-dtsc-muted sm:text-xs"
          >
            {meta}
          </div>
        ) : null}
        {description ? (
          <div
            data-business-list-description
            className="mt-1.5 line-clamp-2 min-w-0 text-[0.82rem] leading-5 text-dtsc-muted sm:text-sm sm:leading-6"
          >
            {description}
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <article
      role="listitem"
      data-business-list-item
      className={cn("group min-w-0 py-3.5 sm:py-4", className)}
    >
      <div className="flex min-w-0 items-start gap-3">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            aria-label={openLabel}
            className="-m-1 flex min-w-0 flex-1 items-start gap-3 rounded-xl p-1.5 text-left outline-none transition-colors hover:bg-dtsc-page/75 focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {content}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-3">{content}</div>
        )}
        {actions ? <div className="shrink-0 pt-0.5">{actions}</div> : null}
      </div>
    </article>
  );
}
