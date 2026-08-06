import Link from "next/link";
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
    <header className="sticky top-0 z-[90] border-b border-dtsc-border bg-dtsc-surface/92 backdrop-blur-xl">
      <VisitTracker />
      <div className="mx-auto flex min-h-16 max-w-[92rem] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0"><DtscLogo href="/" /></div>
        <PublicNav />
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-dtsc-border bg-dtsc-surface">
      <div className="mx-auto grid max-w-[92rem] gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.25fr_1fr_1fr_1fr] lg:px-8">
        <div><DtscLogo href="/" /><p className="mt-4 max-w-md text-sm leading-7 text-dtsc-muted">{dtsc.summary}</p><p className="mt-5 text-sm font-semibold text-dtsc-blue">{dtsc.slogan}</p></div>
        {columns.map((column) => <div key={column.title}><p className="dtsc-label text-dtsc-ink">{column.title}</p><div className="mt-4 grid gap-3">{column.links.map(([label, href]) => <Link key={href} href={href} className="text-sm text-dtsc-muted transition hover:text-dtsc-blue">{label}</Link>)}</div></div>)}
      </div>
      <div className="border-t border-dtsc-border px-4 py-5"><div className="mx-auto flex max-w-[92rem] flex-col justify-between gap-3 text-xs text-dtsc-muted sm:flex-row"><span>{dtsc.copyright}</span><span>{dtsc.location} · {dtsc.email} · {dtsc.whatsapp}</span></div></div>
    </footer>
  );
}
