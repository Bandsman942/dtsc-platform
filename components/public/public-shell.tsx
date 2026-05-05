import Link from "next/link";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { VisitTracker } from "@/components/analytics/visit-tracker";
import { publicLinks } from "@/components/public/public-links";
import { PublicNav } from "@/components/public/public-nav";
import { dtsc } from "@/lib/dtsc";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-dtsc-border bg-dtsc-surface backdrop-blur-xl">
      <VisitTracker />
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <DtscLogo />
        <PublicNav />
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-dtsc-border bg-dtsc-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-4 lg:px-8">
        <div>
          <DtscLogo />
          <p className="mt-4 max-w-md leading-6 text-dtsc-muted">{dtsc.summary}</p>
        </div>
        <div>
          <p className="font-black text-dtsc-ink">Ressources</p>
          <div className="mt-3 grid gap-2">
            {publicLinks.slice(1).map((link) => (
              <Link key={link.href} href={link.href} className="font-bold text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">{link.label}</Link>
            ))}
          </div>
        </div>
        <div>
          <p className="font-black text-dtsc-ink">Conditions et politiques</p>
          <div className="mt-3 grid gap-2">
            <Link href="/conditions-utilisation" className="font-bold text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">Conditions d&apos;utilisation</Link>
            <Link href="/politique-confidentialite" className="font-bold text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">Politique de confidentialité</Link>
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
