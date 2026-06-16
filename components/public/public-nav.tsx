"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { publicLinks } from "@/components/public/public-links";
import { getSignInUrl } from "@/lib/domains";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative z-[120] min-w-0 max-w-full lg:flex lg:items-center lg:gap-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm font-semibold text-dtsc-blue shadow-sm transition hover:border-cyan-300 lg:hidden"
        aria-expanded={open}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        Menu
      </button>

      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[115] bg-[#001736]/88 backdrop-blur-2xl lg:hidden"
          aria-label="Fermer le menu public"
        />
      )}

      <nav className={cn("fixed left-3 right-3 top-[8.25rem] z-[125] grid max-h-[min(72dvh,32rem)] w-auto max-w-[calc(100vw-1.5rem)] min-w-0 gap-1.5 overflow-x-hidden overflow-y-auto rounded-[1.35rem] border border-cyan-300/35 bg-[#071427] p-3 text-white shadow-[0_28px_90px_rgba(0,0,0,0.48)] ring-1 ring-white/10 overscroll-contain lg:static lg:left-auto lg:right-auto lg:top-auto lg:mt-0 lg:flex lg:max-h-none lg:w-auto lg:max-w-none lg:items-center lg:gap-1 lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:text-inherit lg:shadow-none lg:ring-0", !open && "hidden lg:flex")}>
        {publicLinks.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "min-w-0 rounded-xl px-3 py-2 text-sm transition",
                active
                  ? "bg-white/10 font-semibold text-white ring-1 ring-cyan-300/20 lg:bg-dtsc-soft lg:text-[#003b7a] lg:ring-0 dark:lg:bg-dtsc-soft dark:lg:text-white"
                  : "font-medium text-slate-200 hover:bg-white/10 hover:text-white lg:text-[#1f3654] lg:hover:bg-[#e8f3ff] lg:hover:text-[#002b5b] dark:lg:text-slate-200 dark:lg:hover:bg-white/10 dark:lg:hover:text-white"
              )}
              aria-current={active ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
        <Link
          href={getSignInUrl("/dashboard")}
          onClick={() => setOpen(false)}
          className="mt-1 inline-flex min-w-0 items-center justify-center rounded-xl bg-dtsc-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#004a9e] lg:ml-1 lg:mt-0"
        >
          Espace client
        </Link>
      </nav>
    </div>
  );
}
