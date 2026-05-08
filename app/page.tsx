import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, Bot, BrainCircuit, CheckCircle2, Database, ShieldCheck, Sparkles } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { dtsc } from "@/lib/dtsc";

const gateways = [
  { title: "Services", href: "/services", text: "Conseil numérique, data, IA, applications métier, formation et optimisation.", icon: Database },
  { title: "Solutions", href: "/solutions", text: "Chatbot, dashboards, automatisation, portails clients et IA documentaire.", icon: Bot },
  { title: "Secteurs", href: "/secteurs", text: "Assurances, cliniques, pharmacies, PME, ONG, finance et administration.", icon: ShieldCheck },
  { title: "Projets", href: "/projets", text: "Démonstrations concrètes pour cadrer rapidement la valeur métier.", icon: BarChart3 },
];

export default function Page() {
  return (
    <main className="min-h-screen bg-dtsc-page text-dtsc-ink">
      <PublicHeader />

      <section className="relative overflow-hidden bg-gradient-to-br from-[#001736] via-[#002b5b] to-[#0057b8] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(0,194,255,0.24),transparent_32%),radial-gradient(circle_at_82%_6%,rgba(255,255,255,0.16),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-black text-cyan-200">
              <Sparkles className="h-4 w-4" />
              {dtsc.slogan}
            </p>
            <h1 className="mt-6 max-w-5xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
              Accélérez votre transformation numérique avec la data, l&apos;IA et des solutions technologiques sur mesure.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-blue-50">
              DTSC accompagne les entreprises dans la conception, l&apos;automatisation et le déploiement de solutions digitales orientées performance.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-xl bg-cyan-400 text-[#001736] shadow-[0_16px_40px_rgba(0,194,255,0.2)] hover:bg-cyan-300">
                <Link href="/contact">
                  Demander un avis
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/15">
                <Link href="/services">Découvrir nos services</Link>
              </Button>
            </div>
            <div className="mt-10 grid gap-3 border-t border-white/10 pt-8 sm:grid-cols-3">
              {[dtsc.vision, dtsc.mission, dtsc.businessModel].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm font-bold leading-6 text-blue-50">
                  <CheckCircle2 className="mb-3 h-5 w-5 text-cyan-300" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="group relative">
            <div className="absolute -inset-5 rounded-[2rem] bg-cyan-300/20 blur-2xl transition duration-500 group-hover:scale-105" />
            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/15 bg-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
              <div className="relative h-80 overflow-hidden">
                <Image src="/dtsc-logo.png" alt="Identité DTSC" fill className="object-cover opacity-90 transition duration-700 group-hover:scale-105" sizes="(max-width: 1024px) 100vw, 45vw" priority />
                <div className="absolute inset-0 bg-gradient-to-t from-[#001736] via-[#001736]/25 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Kinshasa · Afrique</p>
                  <h2 className="mt-2 text-2xl font-black">Data and Tech Solutions Consulting</h2>
                </div>
              </div>
              <div className="grid gap-3 p-5 sm:grid-cols-3">
                {["Data", "IA", "Business"].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm font-black text-white">
                    <BrainCircuit className="mb-3 h-5 w-5 text-cyan-300" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-3xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Explorer DTSC</p>
          <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Découvrez nos expertises à travers des pages dédiées.</h2>
          <p className="mt-4 leading-7 text-dtsc-muted">
            Retrouvez en un coup d&apos;œil nos services, solutions, secteurs d&apos;intervention et projets. Chaque rubrique vous présente clairement notre approche, nos expertises et la valeur que nous apportons aux organisations.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {gateways.map((item) => (
            <Link key={item.href} href={item.href} className="dtsc-card dtsc-card-hover p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dtsc-soft text-dtsc-blue">
                <item.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-xl font-black text-dtsc-ink">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-dtsc-muted">{item.text}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4">
                En savoir plus
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="rounded-[1.5rem] bg-[#001736] p-6 text-white shadow-[0_24px_80px_rgba(0,23,54,0.18)] sm:p-8">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">Pourquoi DTSC ?</p>
            <h2 className="mt-3 text-3xl font-black">Une expertise hybride entre santé, data et technologie.</h2>
            <p className="mt-4 leading-7 text-slate-300">
              DTSC accompagne les organisations dans leur transformation numérique en combinant expertise métier, analyse des données, automatisation et solutions technologiques adaptées aux réalités du terrain.
            </p>
          </div>
          <div className="grid gap-3">
            {dtsc.advantages.map((advantage) => (
              <div key={advantage} className="dtsc-card flex items-center gap-3 p-4 text-sm font-bold text-dtsc-ink">
                <CheckCircle2 className="h-5 w-5 text-cyan-500" />
                {advantage}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-[1.5rem] bg-[#002b5b] p-6 text-white shadow-[0_24px_80px_rgba(0,43,91,0.22)] sm:p-8 lg:p-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="text-3xl font-black">Passez à une nouvelle étape de votre transformation numérique.</h2>
              <p className="mt-3 max-w-3xl leading-7 text-blue-100">
                Échangeons sur vos besoins et construisons ensemble une solution adaptée à vos objectifs, à vos équipes et à votre réalité opérationnelle.
              </p>
            </div>
            <Button asChild size="lg" className="rounded-xl bg-cyan-400 text-[#001736] hover:bg-cyan-300">
              <Link href="/contact">
                Planifier un échange
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
