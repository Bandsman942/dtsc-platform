import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { HeroImageCarousel } from "@/components/public/hero-image-carousel";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import type { PublicLongPage } from "@/lib/public-site";
import { cn } from "@/lib/utils";

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
          <div className="animate-slide-up">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-black text-cyan-200 shadow-[0_12px_30px_rgba(0,194,255,0.12)]">
              <Sparkles className="h-4 w-4" />
              {page.eyebrow}
            </p>
            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
              <span className="bg-gradient-to-r from-white via-cyan-100 to-blue-100 bg-clip-text text-transparent">{page.title}</span>
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-blue-50 animate-slide-up">{page.intro}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-xl bg-cyan-400 text-[#001736] hover:bg-cyan-300">
                <Link href="/contact">
                  Demander une consultation
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

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {page.cards.map((card) => (
            <article key={card.title} className="dtsc-card dtsc-card-hover p-6">
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
      </section>

      <section className="border-y border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 py-16 sm:px-6 lg:px-8">
          {page.sections.map((section, index) => (
            <article key={section.heading} className="grid overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-page shadow-[0_12px_40px_rgba(0,43,91,0.06)] lg:grid-cols-[320px_1fr]">
              <div className={cn("bg-gradient-to-br p-6 text-white", toneClasses[page.tone])}>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Partie {String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-4 text-2xl font-black">{section.heading}</h3>
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

      {page.sources && (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
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
        </section>
      )}

      <PublicFooter />
    </main>
  );
}
