"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProductPreferencesControls } from "@/components/layout/product-preferences-controls";
import { PublicSearchDialog } from "@/components/public/public-search-dialog";
import { publicLinks } from "@/components/public/public-links";
import { getSignInUrl } from "@/lib/domains";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) { return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`); }

export function PublicNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="hidden items-center gap-1 xl:flex">
        {publicLinks.filter((link) => link.href !== "/").map((link) => {
          const active = isActive(pathname, link.href);
          return <Link key={link.href} href={link.href} className={cn("rounded-xl px-3 py-2 text-sm font-semibold transition", active ? "bg-dtsc-soft text-dtsc-blue" : "text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-blue")} aria-current={active ? "page" : undefined}>{link.label}</Link>;
        })}
      </div>
      <div className="hidden items-center gap-2 xl:flex"><PublicSearchDialog compact /><ProductPreferencesControls /><Link href={getSignInUrl("/dashboard")} className="rounded-xl border border-dtsc-border px-3 py-2 text-sm font-semibold text-dtsc-blue transition hover:bg-dtsc-soft">Accès client</Link><Link href="/contact" className="rounded-xl bg-dtsc-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--dtsc-brand-secondary-hover)]">Consultation</Link></div>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-blue shadow-sm xl:hidden" aria-expanded={open} aria-controls="public-mobile-navigation"><Menu className="h-4 w-4" /> Menu</button>
      {open ? (
        <div id="public-mobile-navigation" className="fixed inset-0 z-[180] overflow-y-auto bg-dtsc-surface p-4" role="dialog" aria-modal="true" aria-label="Navigation publique DTSC">
          <div className="mx-auto flex min-h-full max-w-xl flex-col">
            <div className="flex items-center justify-between border-b border-dtsc-border pb-4"><p className="text-lg font-semibold text-dtsc-ink">Menu DTSC</p><button ref={closeRef} type="button" onClick={() => setOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-dtsc-border text-dtsc-muted" aria-label="Fermer le menu"><X className="h-5 w-5" /></button></div>
            <nav className="grid gap-2 py-6">{publicLinks.map((link) => { const active = isActive(pathname, link.href); return <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={cn("rounded-xl border px-4 py-3 text-base font-semibold transition", active ? "border-cyan-400 bg-dtsc-soft text-dtsc-blue" : "border-dtsc-border text-dtsc-ink hover:bg-dtsc-soft")}>{link.label}</Link>; })}</nav>
            <div className="mt-auto space-y-4 border-t border-dtsc-border py-5"><PublicSearchDialog /><ProductPreferencesControls /><div className="grid gap-3 sm:grid-cols-2"><Link href={getSignInUrl("/dashboard")} onClick={() => setOpen(false)} className="rounded-xl border border-dtsc-border px-4 py-3 text-center font-semibold text-dtsc-blue">Accès client</Link><Link href="/contact" onClick={() => setOpen(false)} className="rounded-xl bg-dtsc-blue px-4 py-3 text-center font-semibold text-white">Demander une consultation</Link></div></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
