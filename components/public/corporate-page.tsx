import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { HeroImageCarousel } from "@/components/public/hero-image-carousel";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import type { PublicLongPage } from "@/lib/public-site";
import { cn } from "@/lib/utils";
import { PublicSectionWatermark } from "@/components/public/public-section-watermark";

const toneClasses = {
  blue: "from-[#001736] via-[#002b5b] to-[#0057b8]",
  cyan: "from-[#001736] via-[#004f73] to-[#00a7c7]",
  emerald: "from-[#001736] via-[#064e3b] to-[#00876f]",
  slate: "from-[#0f172a] via-[#1f2937] to-[#002b5b]",
  indigo: "from-[#001736] via-[#312e81] to-[#0057b8]",
};

const glowClasses = {
  blue: "from-cyan-300/30 via-blue-500/15 to-violet-400/20",
  cyan: "from-cyan-300/30 via-sky-500/15 to-emerald-300/18",
  emerald: "from-emerald-300/30 via-cyan-500/14 to-lime-300/18",
  slate: "from-violet-300/22 via-blue-500/15 to-cyan-300/18",
  indigo: "from-fuchsia-300/24 via-indigo-500/16 to-cyan-300/18",
};

const platformSteps = [
  { title: "Comprendre", text: "Clarifier le problème, les utilisateurs, les données et les contraintes." },
  { title: "Concevoir", text: "Choisir le levier, le livrable et la séquence d’exécution adaptés." },
  { title: "Consolider", text: "Rattacher le suivi et l’adoption à DTSC Platform quand le besoin le justifie." },
];

export function CorporatePage({ page }: { page: PublicLongPage }) {
  return (
    <main className="min-h-screen w-full max-w-[100vw] overflow-x-clip bg-dtsc-page text-dtsc-ink">
      <PublicHeader />

      <section className={cn("relative isolate overflow-hidden bg-gradient-to-br text-white", toneClasses[page.tone])}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(0,194,255,0.26),transparent_30%),radial-gradient(circle_at_82%_5%,rgba(139,92,246,0.22),transparent_28%),radial-gradient(circle_at_70%_84%,rgba(236,72,153,0.14),transparent_26%)]" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.14)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.14)_1px,transparent_1px)] [background-size:38px_38px]" />

        <div className="relative mx-auto grid w-full max-w-[92rem] min-w-0 items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,.92fr)] lg:px-8 lg:py-24">
          <div className="dtsc-premium-reveal min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm font-black text-cyan-200 shadow-[0_12px_30px_rgba(0,194,255,0.12)] backdrop-blur-xl">
              <Sparkles className="h-4 w-4" />
              {page.eyebrow}
            </p>
            <h1 className="dtsc-hero-heading dtsc-text-shimmer mt-6 max-w-4xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">{page.title}</h1>
            <p className="dtsc-premium-reveal-delay mt-6 max-w-3xl text-lg leading-8 text-blue-50">{page.intro}</p>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-blue-100/90">
              DTSC Platform est le produit qui prolonge cet accompagnement : il centralise les interactions, les demandes, les processus, les données et le suivi opérationnel lorsque le cas d’usage doit devenir une routine durable.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="dtsc-animated-gradient rounded-xl border-0 font-black text-[#001736] shadow-[0_18px_50px_rgba(0,194,255,.22)] hover:-translate-y-0.5">
                <Link href="/contact">Contacter DTSC <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl border-white/20 bg-white/10 text-white backdrop-blur-xl hover:-translate-y-0.5 hover:bg-white/15">
                <Link href="/ressources">Voir nos ressources</Link>
              </Button>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {platformSteps.map((step, index) => (
                <div key={step.title} className="dtsc-premium-reveal rounded-2xl border border-white/10 bg-white/10 p-4 text-white shadow-[0_16px_36px_rgba(0,0,0,.12)] backdrop-blur-xl" style={{ animationDelay: `${index * 80}ms` }}>
                  <CheckCircle2 className="h-5 w-5 text-cyan-300" />
                  <p className="mt-3 text-sm font-black">{step.title}</p>
                  <p className="mt-2 text-xs leading-5 text-blue-100">{step.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="dtsc-premium-reveal-delay group relative min-w-0 max-w-full overflow-hidden rounded-[2rem]">
            <div className={cn("absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br blur-3xl transition duration-700 group-hover:scale-105", glowClasses[page.tone])} />
            <div className="relative overflow-hidden rounded-[1.75rem] border border-white/15 bg-white/10 shadow-[0_30px_100px_rgba(0,0,0,.28)] backdrop-blur-xl">
              <HeroImageCarousel images={page.heroImages || [page.heroImage]} label={page.heroLabel} eyebrow="DTSC Platform" priority />
              <div className="grid min-w-0 gap-3 p-5 sm:grid-cols-3">
                {[
                  ["Offre", "Les 7 leviers structurent l’accompagnement."],
                  ["Produit", "DTSC Platform consolide les usages."],
                  ["Résultat", "Les KPI vérifient la valeur créée."],
                ].map(([title, text]) => (
                  <div key={title} className="min-w-0 rounded-2xl border border-white/10 bg-[#071427]/45 p-4 text-white transition hover:-translate-y-0.5 hover:bg-[#071427]/65">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">{title}</p>
                    <p className="mt-2 text-xs leading-5 text-blue-100">{text}</p>
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
              <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Vue d’ensemble</p>
              <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Relier le besoin, le levier, le livrable et le produit.</h2>
            </div>
            <p className="leading-7 text-dtsc-muted">
              Chaque carte résume un angle utile. Les sections suivantes expliquent le problème traité, la réponse DTSC, le résultat attendu et la manière dont DTSC Platform peut prolonger l’expérience en exécution, collaboration ou pilotage.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {page.cards.map((card, index) => (
              <article key={card.title} className={cn(index % 2 === 0 ? "dtsc-card" : "dtsc-card-alt", "dtsc-card-hover dtsc-premium-reveal relative overflow-hidden p-6 shadow-[0_18px_50px_rgba(0,43,91,.08)]")} style={{ animationDelay: `${index * 70}ms` }}>
                <span className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", index % 4 === 0 ? "from-cyan-400 to-blue-500" : index % 4 === 1 ? "from-violet-500 to-fuchsia-400" : index % 4 === 2 ? "from-emerald-500 to-cyan-400" : "from-amber-400 to-orange-500")} />
                {card.icon && <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dtsc-soft text-dtsc-blue shadow-[0_10px_30px_rgba(0,43,91,.08)]"><card.icon className="h-6 w-6" /></div>}
                <h2 className="mt-5 text-xl font-black text-dtsc-ink">{card.title}</h2>
                <p className="mt-3 text-sm leading-6 text-dtsc-muted">{card.text}</p>
                <p className="mt-5 text-xs font-black uppercase tracking-[0.14em] text-dtsc-blue">Prolongeable dans DTSC Platform</p>
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
                <p className="text-sm font-black uppercase tracking-[0.18em] text-violet-600">Approfondir</p>
                <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Problème client, réponse DTSC et continuité produit.</h2>
              </div>
              <p className="leading-7 text-dtsc-muted">
                Les exemples restent des cas d’application des 7 leviers officiels. DTSC Platform intervient ensuite comme produit transversal lorsque le client doit suivre, documenter ou industrialiser le cas d’usage.
              </p>
            </div>

            <div className="grid min-w-0 gap-5">
              {page.deepDives.map((item, index) => (
                <article key={item.title} className={cn("dtsc-premium-reveal overflow-hidden rounded-[1.5rem] border border-dtsc-border shadow-[0_18px_60px_rgba(0,43,91,.08)]", index % 2 === 0 ? "bg-dtsc-surface" : "bg-dtsc-soft")} style={{ animationDelay: `${index * 60}ms` }}>
                  <div className="grid gap-0 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)]">
                    <div className={cn("relative overflow-hidden bg-gradient-to-br p-6 text-white sm:p-7", toneClasses[page.tone])}>
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(255,255,255,.16),transparent_30%)]" />
                      <div className="relative">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">{item.eyebrow}</p>
                        <h3 className="mt-4 text-2xl font-black leading-tight sm:text-3xl">{item.title}</h3>
                        <p className="mt-5 text-sm font-black uppercase tracking-[0.16em] text-cyan-200">Problème</p>
                        <p className="mt-2 text-sm leading-6 text-blue-50">{item.problem}</p>
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-5 p-6 sm:p-7">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">Ce que DTSC fait</p>
                        <p className="mt-2 text-base leading-8 text-dtsc-muted">{item.dtscAction}</p>
                      </div>
                      <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm leading-6 text-dtsc-muted">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-dtsc-blue">Rôle de DTSC Platform</p>
                        <p className="mt-2">Centraliser les interactions, les documents, les responsabilités et les indicateurs nécessaires pour transformer le livrable en usage quotidien.</p>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-3">
                        <DetailList title="Livrables" items={item.deliverables} />
                        <DetailList title="Résultats" items={item.benefits} />
                        <DetailList title="Exemples" items={item.examples} />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {(item.links || [{ label: "Contacter DTSC", href: "/contact" }]).map((link) => (
                          <Link key={`${item.title}-${link.href}`} href={link.href} className="inline-flex items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-2 text-sm font-black text-dtsc-blue transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-dtsc-surface">
                            {link.label}<ArrowRight className="h-4 w-4" />
                          </Link>
                        ))}
                        <Link href="/contact" className="inline-flex items-center gap-2 rounded-xl bg-[#002b5b] px-4 py-2 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#001736]">
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
                <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Méthode DTSC</p>
                <h2 className="mt-2 text-3xl font-black text-dtsc-ink">{page.journey.heading}</h2>
                <p className="mt-4 leading-7 text-dtsc-muted">{page.journey.text}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {page.journey.steps.map((step, index) => (
                  <div key={step} className="dtsc-card-hover dtsc-premium-reveal rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-[0_12px_34px_rgba(0,43,91,.08)]" style={{ animationDelay: `${index * 70}ms` }}>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">Étape {String(index + 1).padStart(2, "0")}</p>
                    <p className="mt-2 text-base font-black text-dtsc-ink">{step}</p>
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
            <article key={section.heading} className={cn("dtsc-premium-reveal grid min-w-0 overflow-hidden rounded-2xl border border-dtsc-border shadow-[0_12px_40px_rgba(0,43,91,.08)] lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]", index % 2 === 0 ? "bg-dtsc-surface" : "bg-dtsc-soft")} style={{ animationDelay: `${index * 90}ms` }}>
              <div className={cn("relative overflow-hidden bg-gradient-to-br p-6 text-white", toneClasses[page.tone])}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(255,255,255,.15),transparent_30%)]" />
                <div className="relative">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Partie {String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-4 text-2xl font-black"><span className="dtsc-line-reveal">{section.heading}</span></h3>
                </div>
              </div>
              <div className="min-w-0 p-6">
                <p className="text-base leading-8 text-dtsc-muted">{section.text}</p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {section.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-start gap-3 rounded-xl border border-dtsc-border/70 bg-dtsc-page p-3 text-sm font-bold text-dtsc-ink">
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
              <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Questions utiles</p>
              <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Clarifier avant de démarrer.</h2>
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
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-200">Prochaine étape</p>
                  <h2 className="mt-2 text-3xl font-black">Passez de la découverte à un cadrage utile.</h2>
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
            <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-6 shadow-[0_12px_40px_rgba(0,43,91,.06)]">
              <h2 className="font-black text-dtsc-ink"><span className="text-dtsc-blue">Sources vérifiables</span> utilisées pour enrichir cette page</h2>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {page.sources.map((source) => <Link key={source.href} href={source.href} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">{source.label}<ArrowRight className="h-3.5 w-3.5" /></Link>)}
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
    <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-dtsc-blue">{title}</p>
      <ul className="mt-3 grid gap-2">
        {items.map((item) => <li key={item} className="flex items-start gap-2 text-sm font-bold leading-6 text-dtsc-muted"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-500" /><span>{item}</span></li>)}
      </ul>
    </div>
  );
}
