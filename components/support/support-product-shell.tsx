import Link from "next/link";
import { HelpCircle, LayoutDashboard, LifeBuoy, PlusCircle, TicketCheck } from "lucide-react";
import type { ReactNode } from "react";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { ProductNavigation } from "@/components/layout/product-navigation";
import { ProductPreferencesControls } from "@/components/layout/product-preferences-controls";
import { getDashboardUrl, getPublicUrl, getSignInUrl } from "@/lib/domains";

type SupportProductShellProps = {
  children: ReactNode;
  authenticated?: boolean;
  isDtscInternal?: boolean;
  locale?: "fr" | "en";
};

const sections = [
  { href: "/support#new-ticket", label: "Nouvelle demande", icon: PlusCircle },
  { href: "/support#tickets", label: "Tickets", icon: TicketCheck },
  { href: "/support#support-guide", label: "Guide", icon: HelpCircle },
];

export function SupportProductShell({ children, authenticated = false, isDtscInternal = false, locale = "fr" }: SupportProductShellProps) {
  return (
    <div className="min-h-screen bg-dtsc-page text-dtsc-ink">
      <header className="sticky top-0 z-[85] border-b border-dtsc-border bg-dtsc-surface/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <div className="min-w-0"><DtscLogo href={getPublicUrl("/")} /></div>
            <span className="hidden h-8 w-px bg-dtsc-border sm:block" aria-hidden="true" />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-dtsc-ink">Support DTSC</p>
              <p className="text-xs text-dtsc-muted">Assistance et résolution</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {authenticated ? (
              <Link href={getDashboardUrl()} className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-dtsc-muted transition hover:bg-dtsc-soft hover:text-dtsc-blue md:inline-flex"><LayoutDashboard className="h-4 w-4" /> Espace SaaS</Link>
            ) : (
              <Link href={getSignInUrl("/support")} className="rounded-xl bg-dtsc-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--dtsc-brand-secondary-hover)]">Se connecter</Link>
            )}
            <ProductPreferencesControls />
          </div>
        </div>
        {authenticated ? (
          <div className="border-t border-dtsc-border/70">
            <nav className="mx-auto flex max-w-[92rem] gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8" aria-label="Sections Support">
              {sections.map((section) => {
                const Icon = section.icon;
                return <Link key={section.href} href={section.href} className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-dtsc-muted transition hover:bg-dtsc-soft hover:text-dtsc-blue"><Icon className="h-4 w-4" />{section.label}</Link>;
              })}
            </nav>
          </div>
        ) : null}
      </header>

      <div className="mx-auto max-w-[92rem] px-4 py-6 sm:px-6 lg:px-8">
        {children}
        {authenticated ? <ProductNavigation currentHostType="support" authenticated isDtscInternal={isDtscInternal} locale={locale} className="mt-8 border-t border-dtsc-border pt-6" /> : null}
      </div>

      <footer className="mt-10 border-t border-dtsc-border bg-dtsc-surface px-4 py-6 text-center text-xs text-dtsc-muted">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-4"><LifeBuoy className="h-4 w-4" /><span>Support DTSC</span><Link href={getPublicUrl("/ressources")} className="hover:text-dtsc-blue">Ressources publiques</Link><Link href={getPublicUrl("/contact")} className="hover:text-dtsc-blue">Contact général</Link><Link href={getPublicUrl("/politique-confidentialite")} className="hover:text-dtsc-blue">Confidentialité</Link></div>
      </footer>
    </div>
  );
}
