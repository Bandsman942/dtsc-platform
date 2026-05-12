"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { publicLinks } from "@/components/public/public-links";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative z-[120] lg:flex lg:items-center lg:gap-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm font-black text-dtsc-blue shadow-sm lg:hidden"
        aria-expanded={open}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        Menu
      </button>

      <nav className={cn("fixed left-4 right-4 top-[8.25rem] z-[120] grid max-h-[min(72dvh,32rem)] min-w-0 gap-2 overflow-y-auto rounded-[1.35rem] border border-dtsc-border bg-dtsc-surface/95 p-3 shadow-[0_28px_80px_rgba(0,23,54,0.28)] backdrop-blur-xl lg:static lg:left-auto lg:right-auto lg:top-auto lg:mt-0 lg:flex lg:max-h-none lg:w-auto lg:items-center lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-0", !open && "hidden lg:flex")}>
        {publicLinks.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-black underline-offset-4 transition",
                active
                  ? "bg-dtsc-soft text-dtsc-blue shadow-inner"
                  : "text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-blue hover:underline"
              )}
              aria-current={active ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
        <Link
          href="/contact"
          onClick={() => setOpen(false)}
          className="rounded-xl bg-[#002b5b] px-3 py-2 text-sm font-black text-white shadow-[0_10px_24px_rgba(0,43,91,0.22)] hover:bg-[#001736]"
        >
          Demander un avis
        </Link>
        <Link
          href="/auth/sign-in"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm font-black text-dtsc-blue hover:bg-dtsc-soft"
        >
          Espace client
        </Link>
      </nav>
    </div>
  );
}
