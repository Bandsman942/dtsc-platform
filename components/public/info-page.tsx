import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, CheckCircle2, Database, Layers3, ShieldCheck } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { type PublicPageContent, sources } from "@/lib/public-content";

export function InfoPage({
  title,
  eyebrow,
  intro,
  narrative,
  imageAlt,
  highlights,
  sections,
  sourceList = sources,
}: PublicPageContent & {
  sourceList?: Array<{ label: string; href: string }>;
}) {
  return (
    <main className="min-h-screen bg-dtsc-page text-dtsc-ink">
      <PublicHeader />
      <section className="relative overflow-hidden border-b border-dtsc-border dtsc-public-band-light">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(0,194,255,0.16),transparent_32%),radial-gradient(circle_at_85%_15%,rgba(0,87,184,0.12),transparent_28%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-20">
          <div className="dtsc-premium-reveal">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-cyan-600">{eyebrow}</p>
            <h1 className="dtsc-ink-shimmer mt-3 text-4xl font-black tracking-tight text-dtsc-ink sm:text-6xl">{title}</h1>
            <p className="dtsc-premium-reveal-delay mt-5 max-w-3xl text-lg leading-8 text-dtsc-muted">{intro}</p>
            <p className="dtsc-premium-reveal-delay mt-5 max-w-3xl leading-8 text-dtsc-muted">{narrative}</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {highlights.map((item, index) => (
                <div
                  key={item.label}
                  className="dtsc-premium-reveal rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-[0_10px_28px_rgba(0,43,91,0.08)]"
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-dtsc-muted">{item.label}</p>
                  <p className="mt-2 text-2xl font-black text-dtsc-blue">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <InteractiveVisual title={title} imageAlt={imageAlt} />
        </div>
      </section>

      <section className="dtsc-public-band-soft border-y border-dtsc-border">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-8 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Analyse DTSC</p>
            <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Ce que vous devez retenir</h2>
          </div>
          <p className="leading-7 text-dtsc-muted">
            Les contenus publics DTSC sont conçus pour aider les visiteurs à comprendre les 7 leviers numériques et leurs exemples d&apos;application avant de créer un compte. Les décisions sensibles restent orientées vers un échange humain.
          </p>
        </div>

        <div className="grid gap-5">
          {sections.map((section, index) => (
            <article
              key={section.heading}
              className={`group dtsc-premium-reveal grid overflow-hidden rounded-2xl border border-dtsc-border shadow-[0_12px_40px_rgba(0,43,91,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(0,43,91,0.12)] lg:grid-cols-[320px_1fr] ${index % 2 === 0 ? "bg-dtsc-surface" : "bg-dtsc-soft"}`}
              style={{ animationDelay: `${index * 90}ms` }}
            >
              <div className="relative min-h-56 overflow-hidden bg-[#001736] p-6 text-white">
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,194,255,0.28),transparent_58%)] transition duration-500 group-hover:scale-110" />
                <div className="relative flex h-full flex-col justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-cyan-200">
                    {index === 0 ? <Database className="h-6 w-6" /> : index === 1 ? <BarChart3 className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Module {String(index + 1).padStart(2, "0")}</p>
                    <h3 className="mt-2 text-2xl font-black"><span className="dtsc-line-reveal">{section.heading}</span></h3>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <p className="text-base leading-8 text-dtsc-muted">{section.text}</p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {section.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-start gap-3 rounded-xl bg-dtsc-page p-3 text-sm font-bold text-dtsc-ink">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
                      {bullet}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-dtsc-border bg-dtsc-surface p-6 shadow-[0_12px_40px_rgba(0,43,91,0.08)]">
          <h2 className="font-black text-dtsc-ink">Sources vérifiables</h2>
          <div className="mt-4 grid gap-2">
            {sourceList.map((source) => (
              <Link key={source.href} href={source.href} target="_blank" className="inline-flex w-fit items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">
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

function InteractiveVisual({ title, imageAlt }: { title: string; imageAlt: string }) {
  return (
    <div className="group relative">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-cyan-300/30 via-blue-500/10 to-emerald-300/20 blur-2xl transition duration-500 group-hover:scale-105" />
      <div className="relative overflow-hidden rounded-[1.5rem] border border-dtsc-border bg-dtsc-surface shadow-[0_24px_80px_rgba(0,23,54,0.16)]">
        <div className="relative h-72 overflow-hidden bg-[#001736]">
          <Image src="/dtsc-logo.png" alt={imageAlt} fill className="object-cover opacity-90 transition duration-700 group-hover:scale-105" sizes="(max-width: 1024px) 100vw, 50vw" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-[#001736] via-[#001736]/35 to-transparent" />
          <div className="absolute bottom-5 left-5 right-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">DTSC Insight</p>
            <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {["Diagnostic", "Architecture", "Exécution"].map((step) => (
            <div key={step} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 transition hover:border-cyan-300 hover:bg-dtsc-soft">
              <Layers3 className="h-5 w-5 text-cyan-500" />
              <p className="mt-3 text-sm font-black text-dtsc-ink">{step}</p>
              <p className="mt-1 text-xs leading-5 text-dtsc-muted">Approche progressive, mesurable et orientée performance.</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
