"use client";

import type { CSSProperties } from "react";
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

const mobileLinkAccents = [
  "dtsc-menu-accent-blue",
  "dtsc-menu-accent-cyan",
  "dtsc-menu-accent-violet",
  "dtsc-menu-accent-emerald",
  "dtsc-menu-accent-orange",
  "dtsc-menu-accent-pink",
  "dtsc-menu-accent-indigo",
  "dtsc-menu-accent-lime",
] as const;

const desktopGroups = [
  { label: "Solutions", links: [
    { label: "Services et expertises", href: "/services" },
    { label: "Solutions numériques", href: "/solutions" },
    { label: "Data et indicateurs", href: "/bi-kpi" },
    { label: "Intelligence artificielle", href: "/ia-entreprise" },
  ] },
  { label: "Plateforme", links: [
    { label: "Accéder à DTSC Platform", href: getSignInUrl("/dashboard") },
    { label: "Offres et tarifs", href: "/tarifs" },
  ] },
  { label: "Secteurs", links: [
    { label: "Secteurs d'activité", href: "/secteurs" },
    { label: "Projets et démonstrations", href: "/projets" },
  ] },
  { label: "Ressources", links: [
    { label: "Publications et guides", href: "/ressources" },
    { label: "Data en Afrique", href: "/data-afrique" },
  ] },
  { label: "Entreprise", links: [
    { label: "À propos", href: "/a-propos" },
    { label: "Nous contacter", href: "/contact" },
  ] },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicNav() {
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
          className="dtsc-mobile-menu fixed inset-0 z-[999] isolate flex h-[100dvh] min-h-[100dvh] w-screen flex-col overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation publique DTSC"
        >
          <div className="dtsc-mobile-menu-orb dtsc-mobile-menu-orb-one" aria-hidden="true" />
          <div className="dtsc-mobile-menu-orb dtsc-mobile-menu-orb-two" aria-hidden="true" />
          <div className="dtsc-mobile-menu-grid" aria-hidden="true" />

          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <div className="dtsc-safe-top flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 pb-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Navigation</p>
                <p className="mt-1 text-xl font-black tracking-[-0.03em] text-white">Explorer l’écosystème DTSC</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-lg backdrop-blur-xl transition hover:rotate-3 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                aria-label="Fermer le menu"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 sm:px-6">
              <div className="mx-auto w-full max-w-3xl">
                <div className="mb-5 rounded-[1.5rem] border border-white/10 bg-white/8 p-4 text-white shadow-2xl backdrop-blur-xl">
                  <p className="text-sm font-bold text-cyan-200">Conseil · Data · IA · Solutions digitales</p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                    Trouvez rapidement le service, la solution ou la ressource qui correspond à votre objectif.
                  </p>
                </div>

                <nav className="grid gap-3 sm:grid-cols-2" aria-label="Pages du site public">
                  {publicLinks.map((link, index) => {
                    const active = isActive(pathname, link.href);
                    const Icon = mobileLinkIcons[link.href as keyof typeof mobileLinkIcons] || ArrowRight;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "dtsc-menu-item group flex min-h-20 items-center gap-4 rounded-[1.35rem] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                          mobileLinkAccents[index % mobileLinkAccents.length],
                          active ? "border-white/35 bg-white/18" : "border-white/10 bg-white/8 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/14",
                        )}
                        style={{ "--dtsc-menu-delay": `${index * 45}ms` } as CSSProperties}
                        aria-current={active ? "page" : undefined}
                      >
                        <span className="dtsc-menu-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white shadow-lg">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-black tracking-[-0.02em] text-white">{link.label}</span>
                          <span className="mt-1 block text-xs font-semibold text-slate-300">Découvrir cette rubrique</span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-white" />
                      </Link>
                    );
                  })}
                </nav>

                <div className="mt-5 grid gap-4 rounded-[1.5rem] border border-white/10 bg-[#071427]/70 p-4 shadow-2xl backdrop-blur-xl">
                  <PublicSearchDialog />
                  <ProductPreferencesControls />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Link
                      href={getSignInUrl("/dashboard")}
                      onClick={() => setOpen(false)}
                      className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-center font-black text-white transition hover:bg-white/20"
                    >
                      Accès client
                    </Link>
                    <Link
                      href="/contact"
                      onClick={() => setOpen(false)}
                      className="dtsc-animated-gradient rounded-2xl px-4 py-3 text-center font-black text-[#001736] shadow-[0_18px_50px_rgba(0,194,255,0.25)] transition hover:-translate-y-0.5"
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
      <div ref={desktopNavRef} className="hidden min-w-0 items-center gap-0.5 xl:flex" aria-label="Navigation principale">
        {desktopGroups.map((group, index) => {
          const expanded = openDesktopGroup === group.label;
          const active = group.links.some((link) => isActive(pathname, link.href));
          const popupId = "public-navigation-group-" + index;
          return (
            <div key={group.label} className="relative">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={popupId}
                onClick={() => setOpenDesktopGroup(expanded ? null : group.label)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dtsc-blue",
                  active || expanded ? "bg-dtsc-soft text-dtsc-blue" : "text-dtsc-ink hover:bg-dtsc-soft hover:text-dtsc-blue",
                )}
              >
                {group.label}
                <span aria-hidden="true" className={cn("text-xs transition-transform", expanded && "rotate-180")}>⌄</span>
              </button>
              {expanded ? (
                <nav
                  id={popupId}
                  aria-label={"Explorer " + group.label}
                  className={cn(
                    "absolute top-[calc(100%+0.75rem)] z-[110] w-72 rounded-2xl border border-dtsc-border bg-dtsc-surface p-2 shadow-[var(--dtsc-shadow-lg)]",
                    index >= 3 ? "right-0" : "left-0",
                  )}
                >
                  {group.links.map((link) => (
                    <Link
                      key={group.label + link.href}
                      href={link.href}
                      onClick={() => setOpenDesktopGroup(null)}
                      aria-current={isActive(pathname, link.href) ? "page" : undefined}
                      className="block rounded-xl px-3 py-3 text-sm font-medium text-dtsc-ink transition-colors hover:bg-dtsc-soft hover:text-dtsc-blue focus-visible:outline-2 focus-visible:outline-dtsc-blue"
                    >
                      {link.label}
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
