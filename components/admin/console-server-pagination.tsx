import Link from "next/link";
import type { ConsolePagination } from "@/lib/console/console-pagination";

/** URL-first server pagination with stable filters and deep subsection routes. */
export function ConsoleServerPagination({
  pagination, pathname, searchParams, focus, locale = "fr",
}: {
  pagination: ConsolePagination; pathname: string;
  searchParams: Record<string, string | undefined>;
  focus?: string | null; locale?: "fr" | "en";
}) {
  const en = locale === "en";
  const href = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) if (value) params.set(key, value);
    if (focus) params.set("focus", focus);
    params.set("page", String(page));
    params.set("pageSize", String(pagination.pageSize));
    return `${pathname}?${params.toString()}`;
  };
  const minPage = Math.max(1, pagination.page - 2);
  const maxPage = Math.min(pagination.totalPages, minPage + 4);
  const startPage = Math.max(1, maxPage - 4);
  const pages = Array.from({ length: maxPage - startPage + 1 }, (_, i) => startPage + i);
  const navLink = (target: number, label: string, enabled: boolean, current = false) => (
    <Link key={label} href={href(target)} aria-disabled={!enabled} tabIndex={enabled ? 0 : -1}
      aria-current={current ? "page" : undefined}
      className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border px-2.5 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${current ? "border-cyan-500 bg-cyan-500/10 text-dtsc-blue" : enabled ? "border-dtsc-border text-dtsc-blue hover:border-cyan-400 hover:bg-dtsc-soft" : "pointer-events-none border-dtsc-border/50 text-dtsc-muted/50"}`}>
      {label}
    </Link>
  );
  return (
    <nav data-console-server-pagination
      className="mt-4 flex min-w-0 max-w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3"
      aria-label={en ? "Server pagination" : "Pagination serveur"}>
      <p className="min-w-0 break-words text-xs font-semibold text-dtsc-muted">
        {en ? "Page" : "Page"} {pagination.page} {en ? "of" : "sur"} {pagination.totalPages} · {pagination.total} {en ? "items" : "éléments"}
      </p>
      <div className="flex min-w-0 flex-wrap gap-1.5" data-responsive-actions>
        {navLink(1, en ? "First" : "Début", pagination.hasPreviousPage)}
        {navLink(Math.max(1,pagination.page-1), en ? "Previous" : "Précédent", pagination.hasPreviousPage)}
        {pages.map(page => navLink(page, String(page), true, page === pagination.page))}
        {navLink(Math.min(pagination.totalPages,pagination.page+1), en ? "Next" : "Suivant", pagination.hasNextPage)}
        {navLink(pagination.totalPages, en ? "Last" : "Fin", pagination.hasNextPage)}
      </div>
    </nav>
  );
}
