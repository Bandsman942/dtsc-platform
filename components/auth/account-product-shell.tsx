import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChartNoAxesCombined, CheckCircle2, HelpCircle, Layers3, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { ProductNavigation } from "@/components/layout/product-navigation";
import { ProductPreferencesControls } from "@/components/layout/product-preferences-controls";
import { getAppBaseUrl, getPublicUrl, getSupportUrl, type HostType } from "@/lib/domains";

type AccountProductShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  currentHostType?: HostType;
  session?: { activeContext?: string | null } | null;
  isDtscInternal?: boolean;
  variant?: "default" | "erp-sign-in";
  locale?: "fr" | "en";
};

const trustItems = [
  "Session sécurisée sur l’écosystème DTSC",
  "Accès séparé par produit et organisation",
  "Actions sensibles protégées et auditées",
];

const ERP_PHOTO = "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1400&q=80";

const premiumText = {
  fr: {
    eyebrow: "Un seul espace, toutes vos activités",
    headline: "Pilotez votre entreprise avec plus de clarté.",
    description: "Finance, opérations, collaborateurs et indicateurs : un environnement de gestion connecté, conçu pour les décisions du quotidien.",
    features: ["Pilotage & tableaux de bord", "Workflows & collaboration", "Données et accès maîtrisés"],
    photo: "Photographie illustrative d'un espace professionnel d'analyse de données",
    caption: "Illustration d'un environnement de pilotage",
    formEyebrow: "Votre espace sécurisé",
    welcome: "Heureux de vous retrouver.",
    intro: "Identifiez-vous puis choisissez l'espace dans lequel vous souhaitez travailler.",
    link: "Découvrir DTSC Platform",
    security: "Accès protégé · Vos données restent privées",
  },
  en: {
    eyebrow: "One workspace for your business",
    headline: "Run your organization with greater clarity.",
    description: "Finance, operations, people and insights: a connected management workspace designed for confident everyday decisions.",
    features: ["Dashboards & insights", "Workflows & collaboration", "Controlled data access"],
    photo: "Illustrative photograph of a professional business analytics workspace",
    caption: "Illustrative business analytics workspace",
    formEyebrow: "Your secure workspace",
    welcome: "Welcome back.",
    intro: "Sign in and select the workspace you want to use.",
    link: "Explore DTSC Platform",
    security: "Protected access · Your data stays private",
  },
} as const;

export function AccountProductShell({
  eyebrow,
  title,
  description,
  children,
  currentHostType = "account",
  session = null,
  isDtscInternal = false,
  variant = "default",
  locale = "fr",
}: AccountProductShellProps) {
  const premium = variant === "erp-sign-in";
  const t = premiumText[locale];
  return (
    <main className="min-h-screen overflow-x-clip bg-dtsc-page text-dtsc-ink">
      <header className="border-b border-dtsc-border bg-dtsc-surface/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="min-w-0"><DtscLogo href={getPublicUrl("/")} /></div>
          <div className="flex items-center gap-2">
            <Link href={getSupportUrl("/support")} className="hidden min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-dtsc-muted transition hover:bg-dtsc-soft hover:text-dtsc-blue sm:inline-flex">
              <HelpCircle className="h-4 w-4" aria-hidden="true" /> {locale === "en" && premium ? "Help" : "Aide"}
            </Link>
            <ProductPreferencesControls />
          </div>
        </div>
      </header>

      {premium ? (
        <div className="mx-auto grid min-h-[calc(100dvh-10rem)] max-w-[92rem] items-stretch gap-5 px-4 py-5 sm:px-6 sm:py-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(26rem,0.95fr)] lg:gap-7 lg:px-8 lg:py-9">
          <section aria-label={t.photo} className="relative order-2 flex min-h-[18rem] min-w-0 flex-col justify-between overflow-hidden rounded-[1.75rem] bg-[#001736] p-6 text-white shadow-[0_28px_80px_rgba(0,23,54,0.16)] sm:p-9 lg:order-1 lg:min-h-[42rem] lg:p-10">
            <Image
              src={ERP_PHOTO}
              fill
              sizes="(max-width: 1023px) 100vw, 54vw"
              alt={t.photo}
              className="object-cover object-center opacity-65"
              priority
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,18,41,0.72),rgba(0,27,56,0.46)_43%,rgba(0,13,35,0.94)_100%)]" />
            <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="relative z-10 max-w-lg">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-cyan-100 backdrop-blur-sm">
                <Sparkles className="h-4 w-4" aria-hidden="true" /> DTSC Platform · ERP
              </span>
              <h2 className="mt-6 max-w-lg text-3xl font-black leading-[1.12] tracking-[-0.04em] sm:text-4xl lg:text-[clamp(2.1rem,3.2vw,3.5rem)]">
                {t.headline}
              </h2>
              <p className="mt-4 max-w-md text-sm leading-7 text-blue-50 sm:text-base">
                {t.description}
              </p>
            </div>
            <div className="relative z-10 mt-8">
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {t.features.map((item, index) => {
                  const Icon = index === 0 ? ChartNoAxesCombined : index === 1 ? Layers3 : ShieldCheck;
                  return (
                    <div key={item} className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-xs font-semibold text-white backdrop-blur-md">
                      <Icon className="h-4 w-4 shrink-0 text-cyan-200" aria-hidden="true" />
                      <span>{item}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-5 text-[11px] text-slate-200/80">{t.caption}</p>
            </div>
          </section>
          <section className="order-1 flex min-w-0 items-center justify-center lg:order-2">
            <div className="w-full max-w-[35rem] min-w-0">
              <div className="mb-5 flex items-center justify-between gap-3 px-1">
                <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-dtsc-blue">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" /> {t.formEyebrow}
                </p>
                <Link href={getAppBaseUrl()} className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-dtsc-muted transition hover:text-dtsc-blue">
                  DTSC <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
              <div className="rounded-[1.75rem] border border-dtsc-border bg-dtsc-surface p-5 shadow-[0_22px_75px_rgba(0,23,54,0.08)] sm:p-7 xl:p-9">
                <h1 className="text-2xl font-black tracking-[-0.035em] text-dtsc-ink sm:text-3xl">{t.welcome}</h1>
                <p className="mt-2 text-sm leading-6 text-dtsc-muted">{t.intro}</p>
                <div className="mt-6">{children}</div>
                {session ? (
                  <ProductNavigation currentHostType={currentHostType} isDtscInternal={isDtscInternal} authenticated className="mt-7 border-t border-dtsc-border pt-5" />
                ) : null}
              </div>
              <p className="mt-4 flex items-center justify-center gap-2 px-3 text-center text-xs leading-6 text-dtsc-muted">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> {t.security}
              </p>
            </div>
          </section>
        </div>
      ) : (
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
      )}

      <footer className="border-t border-dtsc-border bg-dtsc-surface px-4 py-5 text-center text-xs text-dtsc-muted">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <span>© 2026 DTSC</span>
          <Link href={getPublicUrl("/conditions-utilisation")} className="hover:text-dtsc-blue">{locale === "en" && premium ? "Terms" : "Conditions"}</Link>
          <Link href={getPublicUrl("/politique-confidentialite")} className="hover:text-dtsc-blue">{locale === "en" && premium ? "Privacy" : "Confidentialité"}</Link>
          <Link href={getPublicUrl("/politique-cookies")} className="hover:text-dtsc-blue">Cookies</Link>
        </div>
      </footer>
    </main>
  );
}
