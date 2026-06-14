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

export function CorporatePage({ page }: { page: PublicLongPage }) {
  return (
    <main className="min-h-screen bg-dtsc-page text-dtsc-ink">
      <PublicHeader />

      <section className={cn("relative overflow-hidden bg-gradient-to-br text-white", toneClasses[page.tone])}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,194,255,0.24),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.16),transparent_28%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:px-8 lg:py-24">
          <div className="dtsc-premium-reveal">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-black text-cyan-200 shadow-[0_12px_30px_rgba(0,194,255,0.12)]">
              <Sparkles className="h-4 w-4" />
              {page.eyebrow}
            </p>
            <h1 className="dtsc-hero-heading dtsc-text-shimmer mt-6 max-w-4xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
              {page.title}
            </h1>
            <p className="dtsc-premium-reveal-delay mt-6 max-w-3xl text-lg leading-8 text-blue-50">{page.intro}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-xl bg-cyan-400 text-[#001736] hover:bg-cyan-300">
                <Link href="/contact">
                  Contacter DTSC
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/15">
                <Link href="/ressources">Voir nos ressources</Link>
              </Button>
            </div>
          </div>

          <div className="group relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-cyan-300/20 blur-2xl transition duration-500 group-hover:scale-105" />
            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/15 bg-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
              <HeroImageCarousel images={page.heroImages || [page.heroImage]} label={page.heroLabel} eyebrow="DTSC Platform" priority />
              <div className="grid gap-3 p-5 sm:grid-cols-3">
                {["Comprendre", "Construire", "Mesurer"].map((step) => (
                  <div key={step} className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/15">
                    <CheckCircle2 className="mb-3 h-5 w-5 text-cyan-300" />
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="dtsc-public-band-light border-b border-dtsc-border">
        <PublicSectionWatermark position="right" />
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Vue d&apos;ensemble</p>
            <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Les points clés à explorer avant de passer à l&apos;action.</h2>
            <p className="mt-3 leading-7 text-dtsc-muted">
              Chaque carte résume un levier, un cas d&apos;usage ou une responsabilité. Les sections suivantes détaillent le problème traité, le livrable possible et le résultat client attendu.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {page.cards.map((card, index) => (
              <article
                key={card.title}
                className={cn(index % 2 === 0 ? "dtsc-card" : "dtsc-card-alt", "dtsc-card-hover dtsc-premium-reveal p-6")}
                style={{ animationDelay: `${index * 70}ms` }}
              >
                {card.icon && (
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dtsc-soft text-dtsc-blue">
                    <card.icon className="h-6 w-6" />
                  </div>
                )}
                <h2 className="mt-5 text-xl font-black text-dtsc-ink">{card.title}</h2>
                <p className="mt-3 text-sm leading-6 text-dtsc-muted">{card.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {page.deepDives && (
        <section className="border-b border-dtsc-border dtsc-public-band-light">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="mb-9 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Approfondir</p>
                <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Problème client, réponse DTSC et résultat mesurable.</h2>
              </div>
              <p className="leading-7 text-dtsc-muted">
                Ces blocs relient chaque besoin à une action concrète. Les exemples restent des cas d&apos;application rattachés aux 7 leviers numériques officiels, avec des liens vers les pages existantes pour poursuivre la lecture.
              </p>
            </div>

            <div className="grid gap-5">
              {page.deepDives.map((item, index) => (
                <article
                  key={item.title}
                  className={cn(
                    "dtsc-premium-reveal overflow-hidden rounded-[1.5rem] border border-dtsc-border shadow-[0_18px_60px_rgba(0,43,91,0.08)]",
                    index % 2 === 0 ? "bg-dtsc-surface" : "bg-dtsc-soft"
                  )}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <div className="grid gap-0 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
                    <div className={cn("bg-gradient-to-br p-6 text-white sm:p-7", toneClasses[page.tone])}>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">{item.eyebrow}</p>
                      <h3 className="mt-4 text-2xl font-black leading-tight sm:text-3xl">{item.title}</h3>
                      <p className="mt-5 text-sm font-black uppercase tracking-[0.16em] text-cyan-200">Problème</p>
                      <p className="mt-2 text-sm leading-6 text-blue-50">{item.problem}</p>
                    </div>
                    <div className="grid gap-5 p-6 sm:p-7">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">Ce que DTSC fait</p>
                        <p className="mt-2 text-base leading-8 text-dtsc-muted">{item.dtscAction}</p>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-3">
                        <DetailList title="Livrables" items={item.deliverables} />
                        <DetailList title="Résultats" items={item.benefits} />
                        <DetailList title="Exemples" items={item.examples} />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {(item.links || [{ label: "Contacter DTSC", href: "/contact" }]).map((link) => (
                          <Link
                            key={`${item.title}-${link.href}`}
                            href={link.href}
                            className="inline-flex items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-2 text-sm font-black text-dtsc-blue underline-offset-4 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-dtsc-surface hover:underline"
                          >
                            {link.label}
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        ))}
                        <Link
                          href="/contact"
                          className="inline-flex items-center gap-2 rounded-xl bg-[#002b5b] px-4 py-2 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#001736]"
                        >
                          Demander une consultation
                          <ArrowRight className="h-4 w-4" />
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
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Méthode DTSC</p>
                <h2 className="mt-2 text-3xl font-black text-dtsc-ink">{page.journey.heading}</h2>
                <p className="mt-4 leading-7 text-dtsc-muted">{page.journey.text}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {page.journey.steps.map((step, index) => (
                  <div key={step} className="dtsc-card-hover rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-[0_12px_34px_rgba(0,43,91,0.08)]">
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
        <div className="mx-auto grid max-w-7xl gap-5 px-4 py-16 sm:px-6 lg:px-8">
          {page.sections.map((section, index) => (
            <article
              key={section.heading}
              className={cn("dtsc-premium-reveal grid overflow-hidden rounded-2xl border border-dtsc-border shadow-[0_12px_40px_rgba(0,43,91,0.08)] lg:grid-cols-[320px_1fr]", index % 2 === 0 ? "bg-dtsc-surface" : "bg-dtsc-soft")}
              style={{ animationDelay: `${index * 90}ms` }}
            >
              <div className={cn("bg-gradient-to-br p-6 text-white", toneClasses[page.tone])}>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Partie {String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-4 text-2xl font-black"><span className="dtsc-line-reveal">{section.heading}</span></h3>
              </div>
              <div className="p-6">
                <p className="text-base leading-8 text-dtsc-muted">{section.text}</p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {section.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-start gap-3 rounded-xl bg-dtsc-surface p-3 text-sm font-bold text-dtsc-ink">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
                      {bullet}
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
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Questions utiles</p>
              <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Clarifier avant de démarrer.</h2>
              <p className="mt-4 leading-7 text-dtsc-muted">
                Les réponses restent orientées client: choisir le bon levier, définir un livrable concret et mesurer un résultat.
              </p>
            </div>
            <Accordion>
              {page.faqs.map((item, index) => (
                <AccordionItem key={item.question} title={item.question} defaultOpen={index === 0}>
                  {item.answer}
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      )}

      {page.ctaLinks && (
        <section className="border-b border-dtsc-border dtsc-public-band-soft">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="rounded-[1.5rem] bg-[#002b5b] p-6 text-white shadow-[0_24px_80px_rgba(0,43,91,0.22)] sm:p-8">
              <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-200">Prochaine étape</p>
                  <h2 className="mt-2 text-3xl font-black">Choisissez une page utile ou demandez un cadrage.</h2>
                  <p className="mt-3 max-w-3xl leading-7 text-blue-100">
                    Les liens ci-dessous renvoient uniquement vers des pages publiques existantes pour poursuivre la découverte ou préparer un échange commercial.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {page.ctaLinks.map((link) => (
                    <Button key={link.href} asChild className="rounded-xl bg-cyan-400 text-[#001736] hover:bg-cyan-300">
                      <Link href={link.href}>
                        {link.label}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {page.sources && (
        <section className="dtsc-public-band-light">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-6 shadow-[0_12px_40px_rgba(0,43,91,0.06)]">
              <h2 className="font-black text-dtsc-ink">
                <span className="text-dtsc-blue">Sources vérifiables</span> utilisées pour enrichir cette page
              </h2>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {page.sources.map((source) => (
                <Link key={source.href} href={source.href} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">
                  {source.label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ))}
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
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-dtsc-blue">{title}</p>
      <ul className="mt-3 grid gap-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm font-bold leading-6 text-dtsc-muted">
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-500" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
