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
  const socialHandle = dtsc.socialHandle.replace(/^@/, "");

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
          <div className="mt-4">
            <p className="font-black text-dtsc-ink">Réseaux sociaux</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {["facebook", "instagram", "x", "youtube", "linkedin", "tiktok"].map((network) => (
                <span key={network} className="flex h-9 w-9 items-center justify-center rounded-xl border border-dtsc-border bg-dtsc-page text-dtsc-blue shadow-[0_10px_24px_rgba(0,43,91,0.08)] transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-dtsc-soft" aria-label={network}>
                  <SocialIcon network={network} />
                </span>
              ))}
              <span className="ml-1 rounded-xl bg-dtsc-soft px-3 py-2 text-sm font-black text-dtsc-blue">
                {socialHandle}
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-dtsc-muted">
              Tapez ce nom sur Facebook, Instagram, X, YouTube, LinkedIn et TikTok pour retrouver DTSC.
            </p>
          </div>
        </div>
      </div>
      <div className="border-t border-dtsc-border px-4 py-5 text-center text-xs text-dtsc-muted">{dtsc.copyright}</div>
    </footer>
  );
}

function SocialIcon({ network }: { network: string }) {
  if (network === "facebook") {
    return <span className="text-lg font-black leading-none">f</span>;
  }
  if (network === "instagram") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="16.5" cy="7.5" r="1" fill="currentColor" />
      </svg>
    );
  }
  if (network === "x") {
    return <span className="text-sm font-black leading-none">X</span>;
  }
  if (network === "youtube") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <rect x="3" y="6" width="18" height="12" rx="4" fill="currentColor" opacity="0.18" />
        <path d="M10 9.5v5l5-2.5-5-2.5Z" fill="currentColor" />
      </svg>
    );
  }
  if (network === "linkedin") {
    return <span className="text-xs font-black leading-none">in</span>;
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M13.5 4v10.1a4.4 4.4 0 1 1-3.4-4.3v2.8a1.7 1.7 0 1 0 1.1 1.6V4h2.3Zm0 0c.5 2.2 2 3.7 4.4 4.1v2.7c-1.7-.1-3.2-.7-4.4-1.8V4Z" fill="currentColor" />
    </svg>
  );
}
