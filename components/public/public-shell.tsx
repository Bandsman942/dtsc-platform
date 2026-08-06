import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, MessageCircleMore, Sparkles } from "lucide-react";
import { VisitTracker } from "@/components/analytics/visit-tracker";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { PublicNav } from "@/components/public/public-nav";
import { dtsc } from "@/lib/dtsc";

const columns = [
  { title: "Entreprise", links: [["À propos", "/a-propos"], ["Secteurs", "/secteurs"], ["Projets", "/projets"], ["Contact", "/contact"]] },
  { title: "Expertise", links: [["Services", "/services"], ["Solutions", "/solutions"], ["Data en Afrique", "/data-afrique"], ["BI & KPI", "/bi-kpi"], ["IA en entreprise", "/ia-entreprise"]] },
  { title: "Ressources", links: [["Publications", "/ressources"], ["Conditions", "/conditions-utilisation"], ["Confidentialité", "/politique-confidentialite"], ["Cookies", "/politique-cookies"]] },
] as const;

export function PublicHeader() {
  return (
    <header className="dtsc-public-header sticky top-0 z-[90] border-b border-dtsc-border/80 backdrop-blur-2xl">
      <VisitTracker />
      <div className="mx-auto flex min-h-[4.75rem] max-w-[92rem] items-center justify-between gap-3 px-4 py-3 sm:gap-5 sm:px-6 lg:px-8">
        <div className="min-w-0 max-w-[min(68vw,19rem)] sm:max-w-sm">
          <DtscLogo href="/" />
        </div>
        <PublicNav />
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-dtsc-border bg-dtsc-surface">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-cyan-400 via-violet-500 to-amber-400" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-28 top-16 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-28 bottom-8 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-[92rem] gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr] lg:px-8 lg:py-16">
        <div>
          <DtscLogo href="/" />
          <p className="mt-5 max-w-md text-sm leading-7 text-dtsc-muted">{dtsc.summary}</p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-dtsc-border bg-dtsc-page px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-dtsc-blue">
            <Sparkles className="h-4 w-4 text-cyan-500" />
            {dtsc.slogan}
          </div>
          <div className="mt-6 grid gap-3 text-sm text-dtsc-muted">
            <a href={`mailto:${dtsc.email}`} className="group flex items-center gap-3 transition hover:text-dtsc-blue">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-600"><Mail className="h-4 w-4" /></span>
              <span className="min-w-0 break-all font-semibold">{dtsc.email}</span>
            </a>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600"><MapPin className="h-4 w-4" /></span>
              <span className="font-semibold">{dtsc.location}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600"><MessageCircleMore className="h-4 w-4" /></span>
              <span className="font-semibold">{dtsc.whatsapp}</span>
            </div>
          </div>
        </div>

        {columns.map((column, columnIndex) => (
          <div key={column.title}>
            <p className="dtsc-label text-dtsc-ink">
              <span className={columnIndex === 0 ? "text-cyan-600" : columnIndex === 1 ? "text-violet-600" : "text-pink-600"}>0{columnIndex + 1}</span>
              <span className="ml-2">{column.title}</span>
            </p>
            <div className="mt-5 grid gap-3">
              {column.links.map(([label, href]) => (
                <Link key={href} href={href} className="group inline-flex items-center gap-2 text-sm font-semibold text-dtsc-muted transition hover:translate-x-1 hover:text-dtsc-blue">
                  {label}
                  <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="relative border-t border-dtsc-border px-4 py-5">
        <div className="mx-auto flex max-w-[92rem] flex-col justify-between gap-3 text-xs font-semibold text-dtsc-muted sm:flex-row">
          <span>{dtsc.copyright}</span>
          <span>Conçu pour rester lisible, accessible et performant en mode clair comme sombre.</span>
        </div>
      </div>
    </footer>
  );
}
