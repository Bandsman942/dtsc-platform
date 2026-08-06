import Link from "next/link";
import { CheckCircle2, HelpCircle, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { ProductNavigation } from "@/components/layout/product-navigation";
import { ProductPreferencesControls } from "@/components/layout/product-preferences-controls";
import { getPublicUrl, getSupportUrl, type HostType } from "@/lib/domains";

type AccountProductShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  currentHostType?: HostType;
  session?: { activeContext?: string | null } | null;
  isDtscInternal?: boolean;
};

const trustItems = [
  "Session sécurisée sur l’écosystème DTSC",
  "Accès séparé par produit et organisation",
  "Actions sensibles protégées et auditées",
];

export function AccountProductShell({
  eyebrow,
  title,
  description,
  children,
  currentHostType = "account",
  session = null,
  isDtscInternal = false,
}: AccountProductShellProps) {
  return (
    <main className="min-h-screen bg-dtsc-page text-dtsc-ink">
      <header className="border-b border-dtsc-border bg-dtsc-surface/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="min-w-0"><DtscLogo href={getPublicUrl("/")} /></div>
          <div className="flex items-center gap-2">
            <Link href={getSupportUrl("/support")} className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-dtsc-muted transition hover:bg-dtsc-soft hover:text-dtsc-blue sm:inline-flex">
              <HelpCircle className="h-4 w-4" /> Aide
            </Link>
            <ProductPreferencesControls />
          </div>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-13rem)] max-w-7xl items-stretch lg:grid-cols-[minmax(0,0.88fr)_minmax(25rem,0.72fr)]">
        <section className="relative hidden overflow-hidden border-r border-dtsc-border bg-[var(--dtsc-brand-primary)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute inset-0 opacity-35" aria-hidden="true">
            <div className="absolute -left-28 top-16 h-72 w-72 rounded-full border border-cyan-300/30" />
            <div className="absolute left-24 top-44 h-px w-[36rem] rotate-[-16deg] bg-cyan-300/25" />
            <div className="absolute bottom-[-8rem] right-[-5rem] h-96 w-96 rounded-full border border-blue-300/20" />
          </div>
          <div className="relative">
            <p className="dtsc-label text-cyan-200">Compte DTSC</p>
            <h2 className="mt-5 max-w-xl text-4xl font-semibold leading-tight tracking-[-0.04em]">Votre identité numérique, protégée sans compliquer votre travail.</h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-200">Account centralise la connexion, l’inscription, la récupération et le choix du contexte avant de vous orienter vers le bon produit DTSC.</p>
          </div>
          <div className="relative grid gap-3">
            {trustItems.map((item) => (
              <div key={item} className="flex items-start gap-3 border-t border-white/15 py-4 text-sm text-slate-100">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-lg min-w-0">
            <div className="mb-5 flex items-center gap-2 text-sm font-bold text-dtsc-blue">
              <ShieldCheck className="h-4 w-4" />
              <span>{eyebrow}</span>
            </div>
            <div className="dtsc-product-surface p-6 sm:p-8">
              <h1 className="text-3xl font-semibold tracking-[-0.035em] text-dtsc-ink">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-dtsc-muted">{description}</p>
              <div className="mt-7">{children}</div>
              {session ? (
                <ProductNavigation currentHostType={currentHostType} isDtscInternal={isDtscInternal} authenticated className="mt-7 border-t border-dtsc-border pt-5" />
              ) : null}
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-dtsc-border bg-dtsc-surface px-4 py-5 text-center text-xs text-dtsc-muted">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <span>© 2026 DTSC</span>
          <Link href={getPublicUrl("/conditions-utilisation")} className="hover:text-dtsc-blue">Conditions</Link>
          <Link href={getPublicUrl("/politique-confidentialite")} className="hover:text-dtsc-blue">Confidentialité</Link>
          <Link href={getPublicUrl("/politique-cookies")} className="hover:text-dtsc-blue">Cookies</Link>
        </div>
      </footer>
    </main>
  );
}
