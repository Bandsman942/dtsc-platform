"use client";
import Link from "next/link";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Layers3 } from "lucide-react";

type JumpLink = { id: string; label: string };

export function ConsoleSubsectionCards({ items, label }: { items: JumpLink[]; label: string }) {
  const en = useAppLocale() === "en";
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("focus");
  const link = (id: string) => {
    const query = new URLSearchParams(searchParams.toString());
    query.set("focus", id);
    query.delete("page");
    const qs = query.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  };
  const clear = () => {
    const query = new URLSearchParams(searchParams.toString());
    query.delete("focus");
    const qs = query.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  };
  if (!items.length) return null;
  return (
    <nav data-console-jump-links data-console-subsection-cards aria-label={label}
      className="min-w-0 max-w-full space-y-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <strong className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-dtsc-muted">
          <Layers3 size={15} aria-hidden="true"/>{label}
        </strong>
        {active ? <Link href={clear()} className="rounded-lg px-2 py-1 text-xs font-bold text-dtsc-blue underline hover:bg-dtsc-soft focus-visible:ring-2">{en ? "All workspaces" : "Tous les espaces"}</Link> : null}
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(item => <Link key={item.id} href={link(item.id)} aria-current={active === item.id ? "page" : undefined}
          data-console-subsection-card={item.id}
          className={`group flex min-h-14 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${active === item.id ? "border-cyan-400 bg-cyan-500/10 text-dtsc-blue" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:border-cyan-400 hover:bg-dtsc-soft"}`}>
          <span className="min-w-0 break-words">{item.label}</span>
          <ChevronRight size={16} className="shrink-0 text-cyan-600 transition group-hover:translate-x-0.5" aria-hidden="true"/>
        </Link>)}
      </div>
    </nav>
  );
}
