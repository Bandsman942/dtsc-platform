import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Bot, ClipboardCheck, FileText, GraduationCap, Layers3, Megaphone, Newspaper, Network } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { prisma } from "@/lib/prisma";
import { formatEnumLabel } from "@/lib/labels";
import { trustedSources } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Ressources DTSC — guides, cas pratiques et contenus sur les 7 leviers",
  description: "Ressources DTSC pour comprendre et appliquer les 7 leviers numériques: articles, guides, cas pratiques, démonstrations, projets, annonces et réflexions business-tech.",
  alternates: { canonical: "/ressources" },
};

export const dynamic = "force-dynamic";

const staticResources = [
  { title: "Data en Afrique", href: "/data-afrique", text: "Comprendre les enjeux de structuration des données et de décision en Afrique.", icon: Newspaper },
  { title: "BI & KPI", href: "/bi-kpi", text: "Construire des indicateurs utiles et des tableaux de bord orientés action.", icon: FileText },
  { title: "IA en entreprise", href: "/ia-entreprise", text: "Identifier les bons cas d'usage IA et garder une validation humaine.", icon: Megaphone },
];

const editorialCategories = ["Articles", "Guides", "Cas pratiques", "Démonstrations", "Projets", "Annonces", "Réflexions business-tech"];

const objectiveResources = [
  { title: "Mieux piloter", lever: "Data & BI", href: "/bi-kpi", icon: BarChart3 },
  { title: "Automatiser", lever: "Intelligence artificielle", href: "/ia-entreprise", icon: Bot },
  { title: "Digitaliser", lever: "Solutions digitales", href: "/solutions", icon: Layers3 },
  { title: "Réduire les pertes", lever: "Audit & optimisation", href: "/services", icon: ClipboardCheck },
  { title: "Former", lever: "Formations", href: "/services", icon: GraduationCap },
  { title: "Attirer des clients", lever: "Marketing digital", href: "/contact", icon: Network },
  { title: "Améliorer les supports", lever: "Imprimerie numérique", href: "/contact", icon: FileText },
];

export default async function RessourcesPage() {
  const publications = await prisma.publicPublication.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { name: true, jobTitle: true, avatarUrl: true, publicProfileConsent: true } },
    },
    take: 80,
  });
  const latestPublications = publications.slice(0, 3);
  const groupedPublications = publications.reduce<Record<string, typeof publications>>((groups, publication) => {
    const label = formatEnumLabel(publication.category);
    groups[label] = [...(groups[label] || []), publication];
    return groups;
  }, {});
  const publicationGroups = Object.entries(groupedPublications);

  return (
    <main className="min-h-screen w-full max-w-[100vw] overflow-x-clip bg-dtsc-page text-dtsc-ink">
      <PublicHeader />
      <section className="relative overflow-hidden border-b border-dtsc-border bg-gradient-to-br from-[#0f172a] via-[#002b5b] to-[#0057b8] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(0,194,255,0.22),transparent_32%)]" />
        <div className="dtsc-premium-reveal relative mx-auto w-full max-w-7xl min-w-0 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-cyan-200">Ressources & annonces</p>
          <h1 className="dtsc-text-shimmer mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">Comprendre les 7 leviers numériques DTSC avant de lancer un projet.</h1>
          <p className="dtsc-premium-reveal-delay mt-5 max-w-3xl text-lg leading-8 text-blue-50">
            DTSC publie des contenus pour aider les dirigeants à comprendre, choisir et appliquer les 7 leviers: Data & BI, Intelligence artificielle, Solutions digitales, Audit & optimisation, Formations, Marketing digital et Imprimerie numérique.
          </p>
        </div>
      </section>

      <section className="dtsc-public-band-light border-b border-dtsc-border">
        <div className="mx-auto w-full max-w-7xl min-w-0 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Catégories éditoriales</p>
              <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Lire selon le format qui vous aide le plus.</h2>
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              {editorialCategories.map((category) => (
                <span key={category} className="rounded-full border border-dtsc-border bg-dtsc-soft px-3 py-1.5 text-sm font-black text-dtsc-blue">
                  {category}
                </span>
              ))}
            </div>
          </div>
          <div className="grid min-w-0 gap-4 md:grid-cols-3">
            {staticResources.map((resource, index) => (
              <Link
                key={resource.href}
                href={resource.href}
                className={`${index % 2 === 0 ? "dtsc-card" : "dtsc-card-alt"} dtsc-card-hover dtsc-premium-reveal p-6`}
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <resource.icon className="h-6 w-6 text-cyan-500" />
                <h2 className="mt-5 text-xl font-black text-dtsc-ink">{resource.title}</h2>
                <p className="mt-3 text-sm leading-6 text-dtsc-muted">{resource.text}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4">
                  Lire
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-dtsc-border dtsc-public-band-cyan">
        <div className="mx-auto w-full max-w-7xl min-w-0 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Lire selon votre objectif</p>
            <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Choisissez un objectif, retrouvez le levier DTSC associé.</h2>
          </div>
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {objectiveResources.map((item, index) => (
              <Link
                key={item.title}
                href={item.href}
                className={`${index % 2 === 0 ? "dtsc-card" : "dtsc-card-alt"} dtsc-card-hover dtsc-premium-reveal p-6`}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <item.icon className="h-6 w-6 text-cyan-500" />
                <h3 className="mt-5 text-xl font-black text-dtsc-ink">{item.title}</h3>
                <p className="mt-3 rounded-xl bg-dtsc-soft px-3 py-2 text-sm font-black text-dtsc-blue">{item.lever}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4">
                  Lire
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-dtsc-border dtsc-public-band-soft">
        <div className="mx-auto w-full max-w-7xl min-w-0 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Publications DTSC</p>
            <h2 className="dtsc-ink-shimmer mt-2 text-3xl font-black text-dtsc-ink">Contenus publiés depuis l&apos;administration</h2>
          </div>
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="dtsc-card overflow-hidden">
              <div className="border-b border-dtsc-border p-6">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">Explorer par catégorie</p>
                <h3 className="mt-2 text-2xl font-black text-dtsc-ink">Tous les contenus publiés</h3>
                <p className="mt-2 text-sm leading-6 text-dtsc-muted">
                  Ouvrez une catégorie pour accéder directement aux articles, annonces, guides et cas pratiques disponibles.
                </p>
              </div>
              {publicationGroups.length > 0 ? (
                <Accordion>
                  {publicationGroups.map(([category, items], index) => (
                    <AccordionItem
                      key={category}
                      defaultOpen={index === 0}
                      title={
                        <span className="flex w-full min-w-0 items-center justify-between gap-3">
                          <span className="min-w-0 break-words">{category}</span>
                          <span className="rounded-full bg-dtsc-soft px-2.5 py-1 text-xs font-black text-dtsc-blue">
                            {items.length}
                          </span>
                        </span>
                      }
                    >
                      <div className="grid min-w-0 gap-3">
                        {items.map((publication) => (
                          <Link
                            key={publication.id}
                            href={`/ressources/${publication.slug}`}
                            className="group min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-4 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-dtsc-soft"
                          >
                            <p className="break-words text-sm font-black text-dtsc-ink">{publication.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-dtsc-muted">{publication.excerpt}</p>
                            <span className="mt-3 inline-flex items-center gap-2 text-xs font-black text-dtsc-blue underline underline-offset-4">
                              Lire l&apos;article
                              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                            </span>
                          </Link>
                        ))}
                      </div>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <div className="p-6">
                  <p className="text-sm leading-7 text-dtsc-muted">
                    Les premières ressources publiques DTSC seront bientôt disponibles. En attendant, vous pouvez découvrir nos 7 leviers numériques ou nous contacter pour cadrer votre besoin.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link href="/services" className="inline-flex items-center gap-2 rounded-xl bg-[#002b5b] px-4 py-2 text-sm font-black text-white hover:bg-[#001736]">
                      Découvrir les 7 leviers
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link href="/contact" className="inline-flex items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-2 text-sm font-black text-dtsc-blue hover:bg-dtsc-soft">
                      Contacter DTSC
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="mb-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-5 shadow-[0_12px_34px_rgba(0,43,91,0.08)]">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">À la une</p>
                <h3 className="mt-2 text-2xl font-black text-dtsc-ink">Les 3 dernières publications</h3>
                <p className="mt-2 text-sm leading-6 text-dtsc-muted">
                  Les cartes mettent en avant les nouveautés récentes. La liste complète reste accessible par catégorie.
                </p>
              </div>
              <div className="grid min-w-0 gap-4 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {latestPublications.map((publication) => (
                  <Link key={publication.id} href={`/ressources/${publication.slug}`} className="dtsc-card dtsc-card-hover dtsc-premium-reveal p-6">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{formatEnumLabel(publication.category)}</p>
                    <h3 className="mt-3 break-words text-xl font-black text-dtsc-ink">{publication.title}</h3>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-dtsc-muted">{publication.excerpt}</p>
                    {publication.author?.publicProfileConsent && (
                      <span className="mt-5 flex items-center gap-3 text-xs font-bold text-dtsc-muted">
                        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-dtsc-soft text-dtsc-blue">
                          {publication.author.avatarUrl ? <img src={publication.author.avatarUrl} alt="" className="h-full w-full object-cover" /> : publication.author.name.slice(0, 2).toUpperCase()}
                        </span>
                        {publication.author.name}
                      </span>
                    )}
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4">
                      Ouvrir
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="dtsc-public-band-cyan">
        <div className="mx-auto w-full max-w-7xl min-w-0 px-4 py-12 sm:px-6 lg:px-8">
        <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-6 shadow-[0_12px_34px_rgba(0,43,91,0.08)]">
          <h2 className="font-black text-dtsc-ink">Sources de veille utilisées</h2>
          <div className="mt-4 grid min-w-0 gap-2 md:grid-cols-2">
            {trustedSources.map((source) => (
              <Link key={source.href} href={source.href} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">
                {source.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ))}
          </div>
        </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
