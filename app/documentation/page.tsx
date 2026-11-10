import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { ArrowLeft, ArrowRight, BookOpen, Code2, ExternalLink, Search, ShieldCheck } from "lucide-react";
import { getAppBaseUrl, getDocsBaseUrl, getDocsUrl, getPublicBaseUrl, getSupportBaseUrl } from "@/lib/domains";
import { getPublicDocumentation, PUBLIC_DOCUMENTATION, type DocumentationLanguage } from "@/lib/public-documentation";

export const metadata: Metadata = {
  title: "Documentation officielle | DTSC Platform",
  description: "Guides pour les utilisateurs et informations pour les futurs intégrateurs de DTSC Platform.",
  alternates: { canonical: "https://docs.dtsc-platform.com/" },
};

type Filters = { guide?: string; audience?: string; q?: string; lang?: string };
type PageProps = { searchParams?: Promise<Filters> };

const translations = {
  fr: {
    label: "Documentation DTSC",
    headline: "Apprendre DTSC Platform, à votre rythme.",
    subtitle: "Des parcours clairs pour les utilisateurs, les entreprises et les développeurs. Seules les capacités vérifiées sont présentées comme disponibles.",
    users: "Guides utilisateurs",
    developers: "Développeurs & intégrations",
    all: "Tout parcourir",
    search: "Rechercher",
    searchPlaceholder: "Rechercher un guide ou un sujet…",
    searchLabel: "Rechercher dans la documentation",
    intro: "Choisissez un sujet",
    introDescription: "Explorez les guides classés par usage ou ouvrez un article pour suivre ses étapes.",
    steps: "Étapes essentielles",
    notice: "À savoir",
    back: "Revenir au catalogue",
    openHelp: "Ouvrir l’aide dans l’application",
    app: "Accéder à l’application",
    support: "Contacter le support",
    website: "Site DTSC",
    empty: "Aucun guide ne correspond à votre recherche.",
    reset: "Effacer les filtres",
    counts: "guides documentaires",
    developerWarning: "Les API applicatives internes ne sont pas une API publique partenaire. L’accès API externe et son contrat sont en préparation.",
    verify: "Les droits, plans, paramètres et maturités métier déterminent les fonctions réellement accessibles.",
    groups: { bases: "Premiers pas", compte: "Compte et assistance", collaboration: "Collaboration", erp: "Gestion d’entreprise", dev: "Intégration & API future" },
    language: "Langue",
    home: "Accueil documentation",
    official: "Documentation publique vérifiée",
  },
  en: {
    label: "DTSC Documentation",
    headline: "Learn DTSC Platform at your own pace.",
    subtitle: "Clear paths for users, businesses and developers. Only verified capabilities are presented as available.",
    users: "User guides",
    developers: "Developers & integrations",
    all: "Browse all",
    search: "Search",
    searchPlaceholder: "Find a guide or topic…",
    searchLabel: "Search the documentation",
    intro: "Choose a topic",
    introDescription: "Browse guides by use case or open an article to follow its steps.",
    steps: "Essential steps",
    notice: "Please note",
    back: "Back to catalog",
    openHelp: "Open help inside the app",
    app: "Open the application",
    support: "Contact support",
    website: "DTSC website",
    empty: "No guides match your search.",
    reset: "Clear filters",
    counts: "documentation guides",
    developerWarning: "Internal application APIs are not a public partner API. External API access and contracts are being prepared.",
    verify: "Permissions, plans, configuration and business maturity control what is actually accessible.",
    groups: { bases: "Get started", compte: "Account & help", collaboration: "Collaboration", erp: "Business management", dev: "Integrations & future API" },
    language: "Language",
    home: "Documentation home",
    official: "Verified public documentation",
  },
} as const;

function buildLink(filters: Filters = {}) {
  const query = new URLSearchParams();
  if (filters.lang) query.set("lang", filters.lang);
  if (filters.guide) query.set("guide", filters.guide);
  if (filters.audience && filters.audience !== "all") query.set("audience", filters.audience);
  if (filters.q) query.set("q", filters.q);
  const suffix = query.toString();
  return getDocsUrl(suffix ? "/?" + suffix : "/");
}

function normalizeQuery(value: string | undefined) {
  return (value || "").trim().slice(0, 80);
}

export default async function DocumentationPage({ searchParams }: PageProps) {
  const [params, cookieStore, requestHeaders] = await Promise.all([
    searchParams || Promise.resolve({} as Filters),
    cookies(),
    headers(),
  ]);
  const localeHint = params.lang || cookieStore.get("dtsc_locale")?.value || requestHeaders.get("accept-language")?.slice(0, 2);
  const lang: DocumentationLanguage = localeHint === "en" ? "en" : "fr";
  const t = translations[lang];
  const audience = params.audience === "users" || params.audience === "developers" ? params.audience : "all";
  const q = normalizeQuery(params.q);
  const article = getPublicDocumentation(params.guide);
  const filtered = PUBLIC_DOCUMENTATION.filter((item) => {
    if (audience !== "all" && item.audience !== audience) return false;
    const haystack = [item[lang].title, item[lang].summary, item[lang].steps.join(" "), t.groups[item.group]].join(" ").toLocaleLowerCase();
    return !q || haystack.includes(q.toLocaleLowerCase());
  });
  const categories = ["bases", "compte", "collaboration", "erp", "dev"] as const;

  return (
    <main className="min-h-screen w-full min-w-0 max-w-full bg-dtsc-page text-dtsc-ink" lang={lang}>
      <header className="border-b border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href={buildLink({ lang })} className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl font-bold text-dtsc-ink focus-visible:outline-2 focus-visible:outline-dtsc-blue" aria-label={t.home}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dtsc-blue text-white"><BookOpen className="h-5 w-5" aria-hidden="true" /></span>
            <span className="min-w-0 break-words text-base tracking-tight sm:text-lg">{t.label}</span>
          </Link>
          <nav aria-label={t.label} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <Link href={getPublicBaseUrl() || "https://dtsc-platform.com"} className="min-h-11 rounded-xl px-3 py-3 text-dtsc-muted hover:text-dtsc-blue">{t.website}</Link>
            <Link href={getAppBaseUrl() || "https://app.dtsc-platform.com"} className="min-h-11 rounded-xl bg-dtsc-blue px-4 py-3 font-semibold text-white hover:opacity-90">{t.app}</Link>
            <Link href={buildLink({ lang: lang === "fr" ? "en" : "fr", ...(article ? { guide: article.slug } : { audience, q }) })} className="min-h-11 rounded-xl border border-dtsc-border px-3 py-3 font-semibold text-dtsc-ink" lang={lang === "fr" ? "en" : "fr"} aria-label={t.language}>
              {lang === "fr" ? "EN" : "FR"}
            </Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto w-full max-w-6xl min-w-0 px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-dtsc-blue"><ShieldCheck className="h-4 w-4" aria-hidden="true" />{t.official}</p>
          <h1 className="mt-3 max-w-4xl break-words text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{t.headline}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-dtsc-muted sm:text-lg">{t.subtitle}</p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl min-w-0 px-4 py-9 sm:px-6">
        {article ? (
          <section aria-labelledby="article-title" className="min-w-0">
            <Link href={buildLink({ lang, audience: article.audience })} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-dtsc-blue hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t.back}</Link>
            <div className="mt-5 rounded-2xl border border-dtsc-border bg-dtsc-surface p-5 shadow-sm sm:p-9">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dtsc-blue">{t.groups[article.group]}</p>
              <h2 id="article-title" className="mt-3 break-words text-2xl font-bold sm:text-4xl">{article[lang].title}</h2>
              <p className="mt-4 max-w-3xl text-base leading-8 text-dtsc-muted">{article[lang].summary}</p>
              <h3 className="mt-8 text-lg font-bold">{t.steps}</h3>
              <ol className="mt-4 space-y-4">
                {article[lang].steps.map((step, index) => (
                  <li key={index} className="flex min-w-0 items-start gap-4 rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm leading-7">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dtsc-blue font-bold text-white">{index + 1}</span>
                    <span className="min-w-0 break-words">{step}</span>
                  </li>
                ))}
              </ol>
              <aside className="mt-7 rounded-xl border border-cyan-200 bg-cyan-50 p-5 text-sm leading-7 text-slate-800 dark:border-cyan-900 dark:bg-slate-800 dark:text-slate-100">
                <p className="font-bold">{t.notice}</p>
                <p className="mt-1">{article[lang].notice}</p>
              </aside>
              <div className="mt-8 flex flex-wrap gap-3" data-responsive-actions>
                {article.audience === "users" ? (
                  <Link href={getAppBaseUrl() + (article.group === "erp" ? "/help/enterprise" : "/help/standard")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-dtsc-blue px-4 py-3 text-sm font-semibold text-white hover:opacity-90">{t.openHelp}<ExternalLink className="h-4 w-4" aria-hidden="true" /></Link>
                ) : (
                  <Link href={buildLink({ lang, guide: "api-feuille-de-route" })} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-dtsc-blue px-4 py-3 text-sm font-semibold text-white">{t.developers}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                )}
                <Link href={getSupportBaseUrl() + "/support"} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-4 py-3 text-sm font-semibold">{t.support}</Link>
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="flex min-w-0 flex-wrap gap-2" role="navigation" aria-label={t.intro}>
              {([
                ["all", t.all, BookOpen],
                ["users", t.users, BookOpen],
                ["developers", t.developers, Code2],
              ] as const).map(([value, label, Icon]) => (
                <Link key={value} href={buildLink({ lang, audience: value, q })} aria-current={audience === value ? "page" : undefined} className={audience === value ? "inline-flex min-h-11 items-center gap-2 rounded-full bg-dtsc-blue px-4 py-3 text-sm font-semibold text-white" : "inline-flex min-h-11 items-center gap-2 rounded-full border border-dtsc-border bg-dtsc-surface px-4 py-3 text-sm font-semibold hover:bg-dtsc-soft"}>
                  <Icon className="h-4 w-4" aria-hidden="true" />{label}
                </Link>
              ))}
            </div>
            <form action="/" method="get" role="search" className="mt-6 flex w-full min-w-0 max-w-2xl items-center gap-2">
              <input type="hidden" name="lang" value={lang} />
              {audience !== "all" ? <input type="hidden" name="audience" value={audience} /> : null}
              <label htmlFor="documentation-search" className="sr-only">{t.searchLabel}</label>
              <input id="documentation-search" type="search" name="q" defaultValue={q} maxLength={80} placeholder={t.searchPlaceholder} className="min-h-11 w-full min-w-0 flex-1 rounded-xl border border-dtsc-border bg-dtsc-surface px-4 text-sm focus-visible:outline-2 focus-visible:outline-dtsc-blue" />
              <button type="submit" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-dtsc-blue px-4 py-3 text-sm font-semibold text-white"><Search className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{t.search}</span></button>
            </form>

            <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <p>{t.verify}</p><p className="mt-1 font-semibold">{t.developerWarning}</p>
            </div>
            <section aria-labelledby="catalog-title" className="mt-10 min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div><h2 id="catalog-title" className="text-2xl font-bold">{t.intro}</h2><p className="mt-1 text-sm text-dtsc-muted">{t.introDescription}</p></div>
                <span className="text-sm text-dtsc-muted">{filtered.length} {t.counts}</span>
              </div>
              {filtered.length ? categories.map((category) => {
                const entries = filtered.filter((item) => item.group === category);
                if (!entries.length) return null;
                return (
                  <div key={category} className="mt-9 min-w-0">
                    <h3 className="text-lg font-bold">{t.groups[category]}</h3>
                    <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                      {entries.map((entry) => (
                        <Link key={entry.slug} href={buildLink({ lang, guide: entry.slug })} className="group block min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-5 shadow-sm transition hover:border-cyan-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-dtsc-blue">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-dtsc-soft text-dtsc-blue">{entry.audience === "users" ? <BookOpen className="h-5 w-5" aria-hidden="true" /> : <Code2 className="h-5 w-5" aria-hidden="true" />}</span>
                          <h4 className="mt-3 break-words text-lg font-semibold group-hover:text-dtsc-blue">{entry[lang].title}</h4>
                          <p className="mt-2 text-sm leading-6 text-dtsc-muted">{entry[lang].summary}</p>
                          <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-dtsc-blue">{t.intro}<ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              }) : <p className="mt-8 rounded-xl border border-dtsc-border bg-dtsc-surface p-6 text-sm">{t.empty} <Link className="font-semibold text-dtsc-blue underline" href={buildLink({ lang })}>{t.reset}</Link></p>}
            </section>
          </>
        )}
      </div>

      <footer className="mt-8 border-t border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-7 text-sm text-dtsc-muted sm:px-6">
          <span>© DTSC — Data and Tech Solutions Consulting</span>
          <div className="flex flex-wrap gap-4"><Link href={getDocsBaseUrl() || "https://docs.dtsc-platform.com"} className="hover:text-dtsc-blue">{t.home}</Link><Link href={getSupportBaseUrl() + "/support"} className="hover:text-dtsc-blue">{t.support}</Link></div>
        </div>
      </footer>
    </main>
  );
}
