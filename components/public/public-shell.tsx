import Link from "next/link";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { VisitTracker } from "@/components/analytics/visit-tracker";
import { dtsc } from "@/lib/dtsc";

const links = [
  { href: "/", label: "Accueil" },
  { href: "/data-afrique", label: "Data en Afrique" },
  { href: "/bi-kpi", label: "BI & KPI" },
  { href: "/ia-entreprise", label: "IA en entreprise" },
  { href: "/secteurs", label: "Secteurs" },
];

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-dtsc-border bg-dtsc-surface backdrop-blur-xl">
      <VisitTracker />
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <DtscLogo />
        <nav className="flex flex-wrap gap-2">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-xl px-3 py-2 text-sm font-bold text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-ink">
              {link.label}
            </Link>
          ))}
          <Link href="/auth/sign-in" className="rounded-xl bg-[#002b5b] px-3 py-2 text-sm font-bold text-white">
            Espace client
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-dtsc-border bg-dtsc-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="md:col-span-2">
          <DtscLogo />
          <p className="mt-4 max-w-md leading-6 text-dtsc-muted">{dtsc.summary}</p>
        </div>
        <div>
          <p className="font-black text-dtsc-ink">Ressources</p>
          <div className="mt-3 grid gap-2">
            {links.slice(1).map((link) => (
              <Link key={link.href} href={link.href} className="text-dtsc-muted hover:text-dtsc-blue">{link.label}</Link>
            ))}
          </div>
        </div>
        <div>
          <p className="font-black text-dtsc-ink">Contact</p>
          <p className="mt-3 text-dtsc-muted">WhatsApp: {dtsc.whatsapp}</p>
          <p className="text-dtsc-muted">Réseaux: {dtsc.socialHandle}</p>
        </div>
      </div>
      <div className="border-t border-dtsc-border px-4 py-5 text-center text-xs text-dtsc-muted">{dtsc.copyright}</div>
    </footer>
  );
}
