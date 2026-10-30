"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  Home,
  Layers3,
  Menu,
  MessageCircleMore,
  Rocket,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProductPreferencesControls } from "@/components/layout/product-preferences-controls";
import { PublicSearchDialog } from "@/components/public/public-search-dialog";
import { publicLinks } from "@/components/public/public-links";
import { getSignInUrl } from "@/lib/domains";
import { cn } from "@/lib/utils";
import { publicNavigationCopy } from "@/lib/public-navigation-i18n";

const mobileLinkIcons = {
  "/": Home,
  "/services": BriefcaseBusiness,
  "/solutions": Layers3,
  "/secteurs": Building2,
  "/projets": Rocket,
  "/ressources": BookOpenText,
  "/a-propos": Users,
  "/contact": MessageCircleMore,
} as const;

const desktopGroups = [
  { key: "solutions", links: [
    { key: "services", href: "/services" }, { key: "digital", href: "/solutions" },
    { key: "data", href: "/bi-kpi" }, { key: "ai", href: "/ia-entreprise" },
  ] },
  { key: "platform", links: [
    { key: "access", href: getSignInUrl("/dashboard") }, { key: "pricing", href: "/tarifs" },
  ] },
  { key: "industries", links: [
    { key: "industry", href: "/secteurs" }, { key: "projects", href: "/projets" },
  ] },
  { key: "resources", links: [
    { key: "publications", href: "/ressources" }, { key: "africa", href: "/data-afrique" },
  ] },
  { key: "company", links: [
    { key: "about", href: "/a-propos" }, { key: "contact", href: "/contact" },
  ] },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicNav({ locale }: { locale: "fr" | "en" }) {
  const copy = publicNavigationCopy[locale];
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const desktopNavRef = useRef<HTMLDivElement>(null);
  const [openDesktopGroup, setOpenDesktopGroup] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => setOpenDesktopGroup(null), [pathname]);
  useEffect(() => {
    if (!openDesktopGroup) return;
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !desktopNavRef.current?.contains(event.target)) {
        setOpenDesktopGroup(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenDesktopGroup(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openDesktopGroup]);


  useEffect(() => {
    if (!open) return;

    const triggerElement = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      document.removeEventListener("keydown", onKeyDown);
      triggerElement?.focus();
    };
  }, [open]);

  const mobileNavigation = open && mounted
    ? createPortal(
        <div
          id="public-mobile-navigation"
          ref={dialogRef}
          className="fixed inset-0 z-[999] isolate flex h-[100dvh] min-h-[100dvh] w-screen flex-col overflow-hidden bg-[#001736] text-white"
          role="dialog"
          aria-modal="true"
          aria-label={copy.mobileNavigation}
        >

          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <div className="dtsc-safe-top flex shrink-0 items-center justify-between gap-4 border-b border-white/15 px-4 pb-3 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300">{copy.navigation}</p>
                <p className="mt-1 text-lg font-semibold tracking-tight text-white">{copy.exploreEcosystem}</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-300"
                aria-label={copy.closeMenu}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
              <div className="mx-auto w-full max-w-3xl">
                <nav className="grid min-w-0 grid-cols-[minmax(0,1fr)] sm:grid-cols-2 sm:gap-x-8" aria-label={copy.sitePages}>
                  {publicLinks.map((link) => {
                    const active = isActive(pathname, link.href);
                    const Icon = mobileLinkIcons[link.href as keyof typeof mobileLinkIcons] || ArrowRight;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "group flex min-h-16 items-center gap-3 border-b border-white/15 px-2 py-3 text-left transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-cyan-300",
                          active ? "text-cyan-200" : "text-white",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-medium tracking-tight text-white">{copy.sections[link.href as keyof typeof copy.sections] || link.label}</span>
                          <span className="mt-0.5 block text-xs text-slate-300">{copy.discoverSection}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-white" />
                      </Link>
                    );
                  })}
                </nav>

                <div className="mt-6 grid gap-4 border-t border-white/15 pt-5">
                  <PublicSearchDialog />
                  <ProductPreferencesControls />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Link
                      href={getSignInUrl("/dashboard")}
                      onClick={() => setOpen(false)}
                      className="rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-white/10"
                    >
                      Accès client
                    </Link>
                    <Link
                      href="/contact"
                      onClick={() => setOpen(false)}
                      className="rounded-lg bg-cyan-300 px-4 py-3 text-center font-semibold text-[#001736] transition-colors hover:bg-cyan-200"
                    >
                      Demander une consultation
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div ref={desktopNavRef} className="hidden min-w-0 items-center gap-0.5 xl:flex" aria-label={copy.mainNavigation}>
        {desktopGroups.map((group, index) => {
          const expanded = openDesktopGroup === group.key;
          const active = group.links.some((link) => isActive(pathname, link.href));
          const popupId = "public-navigation-group-" + index;
          return (
            <div key={group.key} className="relative">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={popupId}
                onClick={() => setOpenDesktopGroup(expanded ? null : group.key)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dtsc-blue",
                  active || expanded ? "bg-dtsc-soft text-dtsc-blue" : "text-dtsc-ink hover:bg-dtsc-soft hover:text-dtsc-blue",
                )}
              >
                {copy.groups[group.key]}
                <span aria-hidden="true" className={cn("text-xs transition-transform", expanded && "rotate-180")}>⌄</span>
              </button>
              {expanded ? (
                <nav
                  id={popupId}
                  aria-label={copy.explore + " " + copy.groups[group.key]}
                  className={cn(
                    "absolute top-[calc(100%+0.75rem)] z-[110] w-72 rounded-2xl border border-dtsc-border bg-dtsc-surface p-2 shadow-[var(--dtsc-shadow-lg)]",
                    index >= 3 ? "right-0" : "left-0",
                  )}
                >
                  {group.links.map((link) => (
                    <Link
                      key={group.key + link.href}
                      href={link.href}
                      onClick={() => setOpenDesktopGroup(null)}
                      aria-current={isActive(pathname, link.href) ? "page" : undefined}
                      className="block rounded-xl px-3 py-3 text-sm font-medium text-dtsc-ink transition-colors hover:bg-dtsc-soft hover:text-dtsc-blue focus-visible:outline-2 focus-visible:outline-dtsc-blue"
                    >
                      {copy.links[link.key]}
                    </Link>
                  ))}
                </nav>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="hidden items-center gap-2 xl:flex">
        <PublicSearchDialog compact />
        <ProductPreferencesControls />
        <Link href={getSignInUrl("/dashboard")} className="rounded-lg border border-dtsc-border px-3 py-2 text-sm font-medium text-dtsc-blue transition-colors hover:bg-dtsc-soft">
          Accès client
        </Link>
        <Link href="/contact" className="rounded-lg bg-dtsc-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--dtsc-brand-secondary-hover)]">
          Consultation
        </Link>
      </div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3.5 text-sm font-semibold text-dtsc-blue transition-colors hover:bg-dtsc-soft focus-visible:outline-2 focus-visible:outline-dtsc-blue xl:hidden"
        aria-expanded={open}
        aria-controls="public-mobile-navigation"
      >
        <Menu className="h-4 w-4" />
        Menu
      </button>
      {mobileNavigation}
    </div>
  );
}
