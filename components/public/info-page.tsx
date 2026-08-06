import Link from "next/link";
import { ArrowRight, BarChart3, CheckCircle2, Database, Layers3, ShieldCheck, Sparkles } from "lucide-react";
import { HeroImageCarousel } from "@/components/public/hero-image-carousel";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { type PublicPageContent, sources } from "@/lib/public-content";

export function InfoPage({
  title,
  eyebrow,
  intro,
  narrative,
  heroImage,
  heroImages,
  imageAlt,
  highlights,
  sections,
  faqs,
  relatedLinks,
  sourceList = sources,
}: PublicPageContent & {
  sourceList?: Array<{ label: string; href: string }>;
}) {
  return (
    <main className="min-h-screen w-full max-w-[100vw] overflow-x-clip bg-dtsc-page text-dtsc-ink">
      <PublicHeader />

      <section className="relative isolate overflow-hidden border-b border-dtsc-border dtsc-public-band-light">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_16%,rgba(0,194,255,0.18),transparent_31%),radial-gradient(circle_at_86%_14%,rgba(139,92,246,0.16),transparent_29%),radial-gradient(circle_at_72%_88%,rgba(236,72,153,0.1),transparent_25%)]" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(0,43,91,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(0,43,91,.16)_1px,transparent_1px)] [background-size:38px_38px]" />

        <div className="relative mx-auto grid w-full max-w-[92rem] min-w-0 items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)] lg:px-8 lg:py-20">
          <div className="dtsc-premium-reveal min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-200">
              <Sparkles className="h-4 w-4" />{eyebrow}
            </p>
            <h1 className="dtsc-ink-shimmer mt-5 text-4xl font-black tracking-tight text-dtsc-ink sm:text-6xl">{title}</h1>
            <p className="dtsc-premium-reveal-delay mt-5 max-w-3xl text-lg leading-8 text-dtsc-muted">{intro}</p>
            <p className="mt-5 max-w-3xl leading-8 text-dtsc-muted">{narrative}</p>
            <p className="mt-4 max-w-3xl rounded-2xl border border-dtsc-border bg-dtsc-surface/80 p-4 text-sm leading-7 text-dtsc-blue shadow-[0_14px_40px_rgba(0,43,91,.07)] backdrop-blur-xl">
              DTSC Platform prolonge ce sujet côté produit : l’espace permet de centraliser les interactions, les contenus, les décisions et les routines opérationnelles qui découlent de l’accompagnement.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {highlights.map((item, index) => (
                <div key={item.label} className="dtsc-premium-reveal relative overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-[0_12px_34px_rgba(0,43,91,.08)]" style={{ animationDelay: `${index * 70}ms` }}>
                  <span className={index === 0 ? "absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 to-blue-500" : index === 1 ? "absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 to-fuchsia-400" : "absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-cyan-400"} />
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-dtsc-muted">{item.label}</p>
                  <p className="mt-2 text-2xl font-black text-dtsc-blue">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <InteractiveVisual title={title} imageAlt={imageAlt} heroImage={heroImage} heroImages={heroImages} />
        </div>
      </section>

      <section className="border-y border-dtsc-border dtsc-public-band-soft">
        <div className="mx-auto w-full max-w-[92rem] min-w-0 px-4 py-14 sm:px-6 lg:px-8">
          <div className="mb-8 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Analyse DTSC</p>
              <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Comprendre le sujet, puis le transformer en usage.</h2>
            </div>
            <p className="leading-7 text-dtsc-muted">
              Les contenus publics DTSC aident à comprendre les 7 leviers et leurs cas d’application. DTSC Platform représente le prolongement produit lorsque le sujet doit devenir un processus suivi, partagé et mesurable.
            </p>
          </div>

          <div className="grid min-w-0 gap-5">
            {sections.map((section, index) => (
              <article key={section.heading} className={`group dtsc-premium-reveal grid min-w-0 overflow-hidden rounded-[1.5rem] border border-dtsc-border shadow-[0_18px_55px_rgba(0,43,91,.08)] transition hover:-translate-y-1 hover:shadow-[0_28px_80px_rgba(0,43,91,.13)] lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] ${index % 2 === 0 ? "bg-dtsc-surface" : "bg-dtsc-soft"}`} style={{ animationDelay: `${index * 90}ms` }}>
                <div className="relative min-h-56 overflow-hidden bg-[#001736] p-6 text-white">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(34,211,238,.28),transparent_36%),radial-gradient(circle_at_90%_90%,rgba(139,92,246,.22),transparent_38%)] transition duration-700 group-hover:scale-105" />
                  <div className="relative flex h-full flex-col justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-cyan-200 shadow-[0_12px_34px_rgba(0,0,0,.18)]">
                      {index === 0 ? <Database className="h-6 w-6" /> : index === 1 ? <BarChart3 className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Perspective {String(index + 1).padStart(2, "0")}</p>
                      <h3 className="mt-3 text-2xl font-black"><span className="dtsc-line-reveal">{section.heading}</span></h3>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 p-6 sm:p-7">
                  <p className="text-base leading-8 text-dtsc-muted">{section.text}</p>
                  <div className="mt-5 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm leading-6 text-dtsc-muted">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-dtsc-blue">DTSC Platform comme produit</p>
                    <p className="mt-2">Le sujet ne reste pas théorique : il peut être rattaché à un espace de collaboration, de suivi, de données, de support ou d’exécution selon la maturité et les priorités de l’organisation.</p>
                  </div>
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

          <div className="mt-10 rounded-[1.5rem] border border-dtsc-border bg-dtsc-surface p-6 shadow-[0_16px_50px_rgba(0,43,91,.08)]">
            <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-violet-600">Questions pratiques</p>
                <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Passer de la compréhension à l’action.</h2>
                <p className="mt-4 leading-7 text-dtsc-muted">Les réponses relient le sujet au bon levier DTSC, au premier résultat à mesurer et au rôle éventuel de DTSC Platform.</p>
                {relatedLinks && (
                  <div className="mt-6 flex flex-wrap gap-3">
                    {relatedLinks.map((link) => (
                      <Link key={link.href} href={link.href} className="inline-flex items-center gap-2 rounded-xl bg-[#002b5b] px-4 py-2 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#001736]">
                        {link.label}<ArrowRight className="h-4 w-4" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              {faqs && <Accordion>{faqs.map((item, index) => <AccordionItem key={item.question} title={item.question} defaultOpen={index === 0}>{item.answer}</AccordionItem>)}</Accordion>}
            </div>
          </div>

          <div className="mt-10 rounded-[1.5rem] border border-dtsc-border bg-dtsc-surface p-6 shadow-[0_12px_40px_rgba(0,43,91,.08)]">
            <h2 className="font-black text-dtsc-ink">Sources vérifiables</h2>
            <div className="mt-4 grid gap-2">
              {sourceList.map((source) => (
                <Link key={source.href} href={source.href} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">
                  {source.label}<ArrowRight className="h-3.5 w-3.5" />
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

function InteractiveVisual({
  title,
  imageAlt,
  heroImage,
  heroImages,
}: {
  title: string;
  imageAlt: string;
  heroImage?: string;
  heroImages?: string[];
}) {
  return (
    <div className="dtsc-premium-reveal-delay group relative min-w-0 max-w-full overflow-hidden rounded-[2rem]">
      <div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-cyan-300/30 via-blue-500/15 to-violet-400/20 blur-3xl transition duration-700 group-hover:scale-105" />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-dtsc-border bg-dtsc-surface shadow-[0_28px_90px_rgba(0,23,54,.18)]">
        <HeroImageCarousel images={heroImages || [heroImage || "/dtsc-logo.png"]} label={imageAlt || title} eyebrow="DTSC Insight" priority className="h-72" />
        <div className="grid min-w-0 gap-3 p-5 sm:grid-cols-3">
          {[
            ["Diagnostic", "Comprendre les données, les utilisateurs et les contraintes."],
            ["Architecture", "Définir le modèle, les responsabilités et le premier livrable."],
            ["Exécution", "Transformer le sujet en usage suivi dans DTSC Platform."],
          ].map(([step, text], index) => (
            <div key={step} className="relative min-w-0 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-page p-4 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-dtsc-soft">
              <span className={index === 0 ? "absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 to-blue-500" : index === 1 ? "absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 to-fuchsia-400" : "absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-cyan-400"} />
              <Layers3 className="h-5 w-5 text-cyan-500" />
              <p className="mt-3 text-sm font-black text-dtsc-ink">{step}</p>
              <p className="mt-1 text-xs leading-5 text-dtsc-muted">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
