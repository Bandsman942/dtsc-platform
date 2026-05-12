import Link from "next/link";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { VisitTracker } from "@/components/analytics/visit-tracker";
import { PublicNav } from "@/components/public/public-nav";
import { PublicSiteSearch } from "@/components/public/public-site-search";
import { dtsc } from "@/lib/dtsc";

const socialNetworks = [
  { network: "facebook", href: "https://www.facebook.com/dtsc-platform", label: "Facebook DTSC Platform" },
  { network: "instagram", href: "https://www.instagram.com/dtsc.platform", label: "Instagram DTSC Platform" },
  { network: "x", href: "https://x.com/dtscplatform", label: "X DTSC Platform" },
  { network: "youtube", href: null, label: "YouTube DTSC Platform à venir" },
  { network: "linkedin", href: null, label: "LinkedIn DTSC Platform à venir" },
  { network: "tiktok", href: null, label: "TikTok DTSC Platform à venir" },
];

const resourceLinks = [
  { href: "/services", label: "Services" },
  { href: "/solutions", label: "Solutions" },
  { href: "/projets", label: "Projets" },
  { href: "/ressources", label: "Ressources" },
  { href: "/data-afrique", label: "Data en Afrique" },
  { href: "/bi-kpi", label: "BI & KPI" },
  { href: "/ia-entreprise", label: "IA en entreprise" },
  { href: "/secteurs", label: "Secteurs accompagnés" },
];

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 overflow-x-hidden border-b border-dtsc-border bg-dtsc-surface backdrop-blur-xl">
      <VisitTracker />
      <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:flex lg:justify-between">
          <div className="min-w-0 max-w-[calc(100vw-8.5rem)] overflow-hidden lg:max-w-none">
            <DtscLogo />
          </div>
          <PublicNav />
        </div>
        <div className="rounded-[1.35rem] border border-dtsc-border bg-[linear-gradient(120deg,var(--dtsc-page),var(--dtsc-surface),var(--dtsc-soft))] p-2 shadow-[0_16px_42px_rgba(0,43,91,0.08)]">
          <PublicSiteSearch />
        </div>
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
            {resourceLinks.map((link) => (
              <Link key={link.href} href={link.href} className="font-bold text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">{link.label}</Link>
            ))}
          </div>
        </div>
        <div>
          <p className="font-black text-dtsc-ink">Conditions et politiques</p>
          <div className="mt-3 grid gap-2">
            <Link href="/conditions-utilisation" className="font-bold text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">Conditions d&apos;utilisation</Link>
            <Link href="/politique-confidentialite" className="font-bold text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">Politique de confidentialité</Link>
            <Link href="/politique-cookies" className="font-bold text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">Politique des cookies</Link>
          </div>
        </div>
        <div>
          <p className="font-black text-dtsc-ink">Contact</p>
          <p className="mt-3 text-dtsc-muted">WhatsApp: {dtsc.whatsapp}</p>
          <a href={`mailto:${dtsc.email}`} className="mt-2 inline-flex font-bold text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">
            {dtsc.email}
          </a>
          <div className="mt-4">
            <p className="font-black text-dtsc-ink">Réseaux sociaux</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {socialNetworks.map((item) =>
                item.href ? (
                  <a
                    key={item.network}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-dtsc-border bg-dtsc-page text-dtsc-blue shadow-[0_10px_24px_rgba(0,43,91,0.08)] transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-dtsc-soft"
                    aria-label={item.label}
                  >
                    <SocialIcon network={item.network} />
                  </a>
                ) : (
                  <span
                    key={item.network}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-dtsc-border bg-dtsc-page text-dtsc-muted shadow-[0_10px_24px_rgba(0,43,91,0.08)]"
                    aria-label={item.label}
                    title="Compte à venir"
                  >
                    <SocialIcon network={item.network} />
                  </span>
                )
              )}
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
