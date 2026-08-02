import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BusinessList({ children, className, ariaLabel }: { children: ReactNode; className?: string; ariaLabel?: string }) {
  return (
    <div
      role="list"
      data-business-list
      aria-label={ariaLabel}
      className={cn(
        "w-full min-w-0 max-w-full divide-y divide-dtsc-border/90 overflow-x-clip border-y border-dtsc-border bg-dtsc-surface/40",
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
      <div className="w-full min-w-0 flex-1">
        <div className="grid w-full min-w-0 gap-1.5 sm:flex sm:items-start sm:gap-x-2.5">
          <div
            data-business-list-title
            className="w-full min-w-0 break-words text-[0.95rem] font-extrabold leading-6 tracking-[-0.01em] text-dtsc-ink sm:flex-1 sm:text-base"
          >
            {title}
          </div>
          {status ? <div className="w-fit min-w-0 max-w-full sm:shrink-0 sm:pt-0.5">{status}</div> : null}
        </div>
        {meta ? (
          <div
            data-business-list-meta
            data-responsive-long-token
            className="mt-1 w-full min-w-0 break-words [overflow-wrap:anywhere] text-[0.72rem] font-bold leading-5 text-dtsc-muted sm:text-xs"
          >
            {meta}
          </div>
        ) : null}
        {description ? (
          <div
            data-business-list-description
            className="mt-1.5 line-clamp-2 w-full min-w-0 break-words text-[0.82rem] leading-5 text-dtsc-muted sm:text-sm sm:leading-6"
          >
            {description}
          </div>
        ) : null}
      </div>
    </>
  );

  const main = onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      aria-label={openLabel}
      className="-m-1 flex w-[calc(100%+0.5rem)] min-w-0 items-start gap-3 rounded-xl p-1.5 text-left outline-none transition-colors hover:bg-dtsc-page/75 focus-visible:ring-2 focus-visible:ring-cyan-300"
    >
      {content}
    </button>
  ) : (
    <div className="flex w-full min-w-0 items-start gap-3">{content}</div>
  );

  return (
    <article
      role="listitem"
      data-business-list-item
      className={cn("group w-full min-w-0 max-w-full overflow-x-clip py-3.5 sm:py-4", className)}
    >
      <div className="grid w-full min-w-0 gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
        <div className="w-full min-w-0">{main}</div>
        {actions ? (
          <div data-business-list-actions className="flex w-full min-w-0 justify-end gap-2 sm:w-auto sm:max-w-[16rem] sm:shrink-0 sm:pt-0.5">
            {actions}
          </div>
        ) : null}
      </div>
    </article>
  );
}
