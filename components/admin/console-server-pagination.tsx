import Link from "next/link";
import type { ConsolePagination } from "@/lib/console/console-pagination";

export function ConsoleServerPagination({ pagination, pathname, searchParams }: { pagination: ConsolePagination; pathname: string; searchParams: Record<string, string | undefined> }) {
  const href = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) if (value) params.set(key, value);
    params.set("page", String(page));
    params.set("pageSize", String(pagination.pageSize));
    return `${pathname}?${params.toString()}`;
  };
  return (
    <nav className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3" aria-label="Pagination serveur">
      <p className="min-w-0 break-words text-xs font-semibold text-dtsc-muted">Page {pagination.page} sur {pagination.totalPages} · {pagination.total} élément(s)</p>
      <div className="flex flex-wrap gap-2" data-responsive-actions>
        <Link aria-disabled={!pagination.hasPreviousPage} tabIndex={pagination.hasPreviousPage ? 0 : -1} href={pagination.hasPreviousPage ? href(pagination.page - 1) : href(pagination.page)} className={`rounded-xl border px-4 py-2 text-sm font-black ${pagination.hasPreviousPage ? "border-dtsc-border text-dtsc-blue hover:bg-dtsc-soft" : "pointer-events-none border-dtsc-border/50 text-dtsc-muted/50"}`}>Précédent</Link>
        <Link aria-disabled={!pagination.hasNextPage} tabIndex={pagination.hasNextPage ? 0 : -1} href={pagination.hasNextPage ? href(pagination.page + 1) : href(pagination.page)} className={`rounded-xl border px-4 py-2 text-sm font-black ${pagination.hasNextPage ? "border-dtsc-border text-dtsc-blue hover:bg-dtsc-soft" : "pointer-events-none border-dtsc-border/50 text-dtsc-muted/50"}`}>Suivant</Link>
      </div>
    </nav>
  );
}
