import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  Building2,
  CheckCircle2,
  Database,
  Megaphone,
  Network,
  Printer,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { dtsc } from "@/lib/dtsc";

const serviceIcons = [Database, BrainCircuit, ShieldCheck, Network, Bot, Megaphone, Printer];

export default function Page() {
  return (
    <main className="min-h-screen bg-dtsc-page text-dtsc-ink">
      <PublicHeader />

      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_20%_20%,rgba(0,194,255,0.18),transparent_34%),linear-gradient(135deg,rgba(0,23,54,0.08),transparent_55%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-dtsc-border bg-dtsc-surface px-3 py-1.5 text-sm font-bold text-dtsc-blue shadow-[0_10px_30px_rgba(0,43,91,0.08)]">
              <Sparkles className="h-4 w-4 text-cyan-500" />
              {dtsc.slogan}
            </p>
            <h1 className="max-w-4xl text-4xl font-black leading-tight tracking-tight text-dtsc-ink sm:text-6xl">
              Performance digitale, data et IA pour les entreprises africaines.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-dtsc-muted">
              {dtsc.summary} Notre assistant IA qualifie les besoins, structure les échanges et oriente les clients vers un cadrage DTSC lorsque la demande devient stratégique.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-xl bg-[#002b5b] text-white shadow-[0_16px_40px_rgba(0,43,91,0.2)] hover:bg-[#001736]">
                <Link href="/auth/sign-up">
                  Démarrer avec DTSC
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                <Link href="/support">Demander une démo</Link>
              </Button>
            </div>
            <div className="mt-10 grid gap-3 border-t border-dtsc-border pt-8 text-sm text-dtsc-muted sm:grid-cols-3">
              {dtsc.targets.map((target) => (
                <div key={target} className="flex items-center gap-2 rounded-xl bg-dtsc-surface px-3 py-2 shadow-[0_8px_24px_rgba(0,43,91,0.05)]">
                  <Building2 className="h-4 w-4 text-cyan-500" />
                  {target}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-cyan-300/30 via-blue-500/10 to-emerald-300/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-[1.5rem] border border-dtsc-border bg-dtsc-surface shadow-[0_24px_80px_rgba(0,23,54,0.16)]">
              <Image src="/dtsc-logo.png" alt="Identité DTSC" width={1536} height={864} className="h-56 w-full object-cover sm:h-72" priority />
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                {[
                  ["Vision", dtsc.vision],
                  ["Mission", dtsc.mission],
                  ["Marché", "Assurances, cliniques, pharmacies et PME à fort besoin de digitalisation."],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-2xl border border-dtsc-border bg-dtsc-soft p-4">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-dtsc-blue">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-dtsc-muted">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">
          {[
            { icon: BrainCircuit, title: "Conseil IA responsable", text: "Le chatbot qualifie, explique et recommande une validation humaine pour les décisions commerciales ou stratégiques." },
            { icon: Database, title: "Culture data & BI", text: "DTSC structure les KPI, les dashboards et le reporting pour transformer les données en décisions." },
            { icon: Network, title: "Plateforme SaaS évolutive", text: "Architecture prête pour RAG, base documentaire, tickets avancés, CRM et analytics." },
          ].map((item) => (
            <div key={item.title} className="dtsc-card dtsc-card-hover p-6">
              <item.icon className="h-6 w-6 text-dtsc-blue" />
              <h2 className="mt-5 text-lg font-bold text-dtsc-ink">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-dtsc-muted">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-sm font-bold text-cyan-600">Offre DTSC</p>
            <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Services principaux</h2>
            <p className="mt-3 leading-7 text-dtsc-muted">
              Une offre hybride combinant consulting, abonnements, développement, marketing, formation et produits digitaux.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {dtsc.services.map((service, index) => {
              const Icon = serviceIcons[index] || CheckCircle2;
              return (
                <div key={service} className="dtsc-card dtsc-card-hover flex items-start gap-3 p-4 text-sm font-semibold text-dtsc-ink">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-cyan-500" />
                  {service}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-[1.5rem] bg-[#001736] p-6 text-white shadow-[0_24px_80px_rgba(0,23,54,0.22)] sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="text-sm font-bold text-cyan-300">Impact attendu</p>
              <h2 className="mt-2 text-3xl font-black">Un cockpit de performance pour vos équipes.</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {dtsc.advantages.map((benefit) => (
                <div key={benefit} className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 text-sm font-semibold">
                  <BarChart3 className="h-4 w-4 text-cyan-300" />
                  {benefit}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-black text-dtsc-ink">FAQ</h2>
        <div className="mt-6 divide-y divide-dtsc-border rounded-2xl border border-dtsc-border bg-dtsc-surface shadow-[0_12px_40px_rgba(0,43,91,0.06)]">
          {[
            ["Le chatbot remplace-t-il l'équipe DTSC ?", "Non. Il accélère la qualification et recommande une validation humaine pour les demandes commerciales, stratégiques ou complexes."],
            ["Quels secteurs DTSC cible-t-il ?", "Les assurances, cliniques, pharmacies et PME, avec une approche adaptée à la réalité de Kinshasa et du marché africain."],
            ["Comment contacter DTSC ?", `WhatsApp: ${dtsc.whatsapp}. Réseaux sociaux: ${dtsc.socialHandle}.`],
          ].map(([question, answer]) => (
            <div key={question} className="p-5">
              <h3 className="font-bold text-dtsc-ink">{question}</h3>
              <p className="mt-2 text-sm leading-6 text-dtsc-muted">{answer}</p>
            </div>
          ))}
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
