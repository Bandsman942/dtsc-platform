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
    <div className="lg:flex lg:items-center lg:gap-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm font-black text-dtsc-blue shadow-sm lg:hidden"
        aria-expanded={open}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        Menu
      </button>

      <nav className={cn("mt-3 grid gap-2 rounded-2xl border border-dtsc-border bg-dtsc-surface p-2 shadow-[0_12px_32px_rgba(0,43,91,0.08)] lg:mt-0 lg:flex lg:items-center lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none", !open && "hidden lg:flex")}>
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
          Demander un avais
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
