import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export function SupportPagination({ page, pageCount, query }: { page: number; pageCount: number; query: Record<string, string | undefined> }) {
  if (pageCount <= 1) return null;
  function href(nextPage: number) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value); });
    params.set("page", String(nextPage));
    return `/support?${params.toString()}#tickets`;
  }
  return (
    <nav className="mt-5 flex items-center justify-between gap-3 border-t border-dtsc-border pt-4" aria-label="Pagination des tickets">
      {page > 1 ? <Link href={href(page - 1)} className="inline-flex items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-4 py-2 text-sm font-semibold text-dtsc-blue hover:bg-dtsc-soft"><ArrowLeft className="h-4 w-4" /> Précédent</Link> : <span />}
      <span className="text-sm text-dtsc-muted">Page {page} sur {pageCount}</span>
      {page < pageCount ? <Link href={href(page + 1)} className="inline-flex items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-4 py-2 text-sm font-semibold text-dtsc-blue hover:bg-dtsc-soft">Suivant <ArrowRight className="h-4 w-4" /></Link> : <span />}
    </nav>
  );
}
