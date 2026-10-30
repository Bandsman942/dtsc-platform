import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { HeroImageCarousel } from "@/components/public/hero-image-carousel";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import type { PublicLongPage } from "@/lib/public-site";
import { PublicSectionWatermark } from "@/components/public/public-section-watermark";

const platformSteps = [
  { title: "Comprendre", text: "Clarifier le problème, les utilisateurs, les données et les contraintes." },
  { title: "Concevoir", text: "Choisir le levier, le livrable et la séquence d’exécution adaptés." },
  { title: "Consolider", text: "Rattacher le suivi et l’adoption à DTSC Platform quand le besoin le justifie." },
];

export function CorporatePage({ page }: { page: PublicLongPage }) {
  return (
    <main className="min-h-screen w-full max-w-[100vw] overflow-x-clip bg-dtsc-page text-dtsc-ink">
      <PublicHeader />

      <section className="relative isolate overflow-hidden border-b border-dtsc-border bg-dtsc-surface text-dtsc-ink">

        <div className="relative mx-auto grid w-full max-w-[92rem] min-w-0 items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,.92fr)] lg:px-8 lg:py-24">
          <div className="dtsc-premium-reveal min-w-0">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-dtsc-blue">
              <Sparkles className="h-4 w-4" />
              {page.eyebrow}
            </p>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight tracking-tight text-dtsc-ink sm:text-5xl">{page.title}</h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-dtsc-muted">{page.intro}</p>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-dtsc-muted">
              DTSC Platform est le produit qui prolonge cet accompagnement : il centralise les interactions, les demandes, les processus, les données et le suivi opérationnel lorsque le cas d’usage doit devenir une routine durable.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-xl border-0 bg-dtsc-blue font-semibold text-white hover:bg-[#003f91]">
                <Link href="/contact">Contacter DTSC <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-page text-dtsc-blue hover:bg-dtsc-soft">
                <Link href="/ressources">Voir nos ressources</Link>
              </Button>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {platformSteps.map((step, index) => (
                <div key={step.title} className="border-t border-dtsc-border py-4 text-dtsc-ink" style={{ animationDelay: `${index * 80}ms` }}>
                  <CheckCircle2 className="h-5 w-5 text-dtsc-blue" />
                  <p className="mt-3 text-sm font-semibold">{step.title}</p>
                  <p className="mt-2 text-xs leading-5 text-dtsc-muted">{step.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="group relative min-w-0 max-w-full overflow-hidden rounded-2xl">
            <div className="hidden" />
            <div className="relative overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-page">
              <HeroImageCarousel images={page.heroImages || [page.heroImage]} label={page.heroLabel} eyebrow="DTSC Platform" priority />
              <div className="grid min-w-0 gap-3 p-5 sm:grid-cols-3">
                {[
                  ["Offre", "Les 7 leviers structurent l’accompagnement."],
                  ["Produit", "DTSC Platform consolide les usages."],
                  ["Résultat", "Les KPI vérifient la valeur créée."],
                ].map(([title, text]) => (
                  <div key={title} className="min-w-0 border-t border-dtsc-border pt-4 text-dtsc-ink">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-dtsc-blue">{title}</p>
                    <p className="mt-2 text-xs leading-5 text-dtsc-muted">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-dtsc-border dtsc-public-band-light">
        <PublicSectionWatermark position="right" />
        <div className="relative z-10 mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">Vue d’ensemble</p>
              <h2 className="mt-2 text-3xl font-semibold text-dtsc-ink">Relier le besoin, le levier, le livrable et le produit.</h2>
            </div>
            <p className="leading-7 text-dtsc-muted">
              Chaque carte résume un angle utile. Les sections suivantes expliquent le problème traité, la réponse DTSC, le résultat attendu et la manière dont DTSC Platform peut prolonger l’expérience en exécution, collaboration ou pilotage.
            </p>
          </div>

          <div className="grid min-w-0 gap-x-8 md:grid-cols-2 xl:grid-cols-4">
            {page.cards.map((card, index) => (
              <article key={card.title} className="group min-w-0 border-t border-dtsc-border py-6" style={{ animationDelay: `${index * 70}ms` }}>

                {card.icon && <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dtsc-soft text-dtsc-blue shadow-[0_10px_30px_rgba(0,43,91,.08)]"><card.icon className="h-6 w-6" /></div>}
                <h2 className="mt-5 text-xl font-semibold text-dtsc-ink">{card.title}</h2>
                <p className="mt-3 text-sm leading-6 text-dtsc-muted">{card.text}</p>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-dtsc-blue">Prolongeable dans DTSC Platform</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {page.deepDives && (
        <section className="border-b border-dtsc-border dtsc-public-band-light">
          <div className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8">
            <div className="mb-9 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-600">Approfondir</p>
                <h2 className="mt-2 text-3xl font-semibold text-dtsc-ink">Problème client, réponse DTSC et continuité produit.</h2>
              </div>
              <p className="leading-7 text-dtsc-muted">
                Les exemples restent des cas d’application des 7 leviers officiels. DTSC Platform intervient ensuite comme produit transversal lorsque le client doit suivre, documenter ou industrialiser le cas d’usage.
              </p>
            </div>

            <div className="grid min-w-0 gap-5">
              {page.deepDives.map((item, index) => (
                <article key={item.title} className="border-t border-dtsc-border py-8" style={{ animationDelay: `${index * 60}ms` }}>
                  <div className="grid gap-8 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)]">
                    <div className="min-w-0 text-dtsc-ink">
                      <div className="relative">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-dtsc-blue">{item.eyebrow}</p>
                        <h3 className="mt-4 text-2xl font-semibold leading-tight sm:text-3xl">{item.title}</h3>
                        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-dtsc-blue">Problème</p>
                        <p className="mt-2 text-sm leading-7 text-dtsc-muted">{item.problem}</p>
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-6">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600">Ce que DTSC fait</p>
                        <p className="mt-2 text-base leading-8 text-dtsc-muted">{item.dtscAction}</p>
                      </div>
                      <div className="border-l-2 border-dtsc-border pl-4 text-sm leading-7 text-dtsc-muted">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-dtsc-blue">Rôle de DTSC Platform</p>
                        <p className="mt-2">Centraliser les interactions, les documents, les responsabilités et les indicateurs nécessaires pour transformer le livrable en usage quotidien.</p>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-3">
                        <DetailList title="Livrables" items={item.deliverables} />
                        <DetailList title="Résultats" items={item.benefits} />
                        <DetailList title="Exemples" items={item.examples} />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {(item.links || [{ label: "Contacter DTSC", href: "/contact" }]).map((link) => (
                          <Link key={`${item.title}-${link.href}`} href={link.href} className="inline-flex items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-2 text-sm font-semibold text-dtsc-blue transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-dtsc-surface">
                            {link.label}<ArrowRight className="h-4 w-4" />
                          </Link>
                        ))}
                        <Link href="/contact" className="inline-flex items-center gap-2 rounded-xl bg-[#002b5b] px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#001736]">
                          Demander une consultation <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {page.journey && (
        <section className="border-b border-dtsc-border dtsc-public-band-cyan">
          <div className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8">
            <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">Méthode DTSC</p>
                <h2 className="mt-2 text-3xl font-semibold text-dtsc-ink">{page.journey.heading}</h2>
                <p className="mt-4 leading-7 text-dtsc-muted">{page.journey.text}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {page.journey.steps.map((step, index) => (
                  <div key={step} className="border-t border-dtsc-border py-4" style={{ animationDelay: `${index * 70}ms` }}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600">Étape {String(index + 1).padStart(2, "0")}</p>
                    <p className="mt-2 text-base font-semibold text-dtsc-ink">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="border-y border-dtsc-border dtsc-public-band-soft">
        <div className="mx-auto grid max-w-[92rem] gap-5 px-4 py-16 sm:px-6 lg:px-8">
          {page.sections.map((section, index) => (
            <article key={section.heading} className="grid min-w-0 gap-5 border-t border-dtsc-border py-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]" style={{ animationDelay: `${index * 90}ms` }}>
              <div className="min-w-0 text-dtsc-ink">
                <div className="relative">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-dtsc-blue">Partie {String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-4 text-2xl font-semibold"><span className="dtsc-line-reveal">{section.heading}</span></h3>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-base leading-8 text-dtsc-muted">{section.text}</p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {section.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-start gap-3 text-sm font-medium leading-7 text-dtsc-ink">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />{bullet}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {page.faqs && (
        <section className="border-b border-dtsc-border dtsc-public-band-light">
          <div className="mx-auto grid w-full max-w-[92rem] min-w-0 gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:px-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">Questions utiles</p>
              <h2 className="mt-2 text-3xl font-semibold text-dtsc-ink">Clarifier avant de démarrer.</h2>
              <p className="mt-4 leading-7 text-dtsc-muted">Choisir le bon levier, définir un livrable concret, comprendre la place de DTSC Platform et mesurer le résultat.</p>
            </div>
            <Accordion>{page.faqs.map((item, index) => <AccordionItem key={item.question} title={item.question} defaultOpen={index === 0}>{item.answer}</AccordionItem>)}</Accordion>
          </div>
        </section>
      )}

      {page.ctaLinks && (
        <section className="border-b border-dtsc-border dtsc-public-band-soft">
          <div className="mx-auto max-w-[92rem] px-4 py-12 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-[1.75rem] bg-[#001736] p-6 text-white shadow-[0_26px_90px_rgba(0,23,54,.24)] sm:p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_15%,rgba(34,211,238,.22),transparent_28%),radial-gradient(circle_at_90%_85%,rgba(139,92,246,.22),transparent_30%)]" />
              <div className="relative grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">Prochaine étape</p>
                  <h2 className="mt-2 text-3xl font-semibold">Passez de la découverte à un cadrage utile.</h2>
                  <p className="mt-3 max-w-3xl leading-7 text-blue-100">Explorez une page complémentaire, demandez un échange ou accédez à DTSC Platform lorsque votre organisation dispose déjà d’un compte.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {page.ctaLinks.map((link) => <Button key={link.href} asChild className="rounded-xl bg-cyan-400 text-[#001736] hover:bg-cyan-300"><Link href={link.href}>{link.label}<ArrowRight className="h-4 w-4" /></Link></Button>)}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {page.sources && (
        <section className="dtsc-public-band-light">
          <div className="mx-auto max-w-[92rem] px-4 py-12 sm:px-6 lg:px-8">
            <div className="border-t border-dtsc-border pt-6">
              <h2 className="font-semibold text-dtsc-ink"><span className="text-dtsc-blue">Sources vérifiables</span> utilisées pour enrichir cette page</h2>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {page.sources.map((source) => <Link key={source.href} href={source.href} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">{source.label}<ArrowRight className="h-3.5 w-3.5" /></Link>)}
              </div>
            </div>
          </div>
        </section>
      )}

      <PublicFooter />
    </main>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="min-w-0 border-t border-dtsc-border pt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-dtsc-blue">{title}</p>
      <ul className="mt-3 grid gap-2">
        {items.map((item) => <li key={item} className="flex items-start gap-2 text-sm font-bold leading-6 text-dtsc-muted"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-500" /><span>{item}</span></li>)}
      </ul>
    </div>
  );
}
