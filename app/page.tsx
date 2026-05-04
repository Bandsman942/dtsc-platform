import Link from "next/link";
import { ArrowRight, BarChart3, Bot, BrainCircuit, CheckCircle2, Database, Network, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const services = [
  "Conseil numérique",
  "Développement d'applications web",
  "Automatisation des processus",
  "Analyse de données",
  "Tableaux de bord Power BI / reporting",
  "Intelligence artificielle pour entreprises",
  "Chatbots professionnels",
];

const benefits = [
  "Gain de temps opérationnel",
  "Meilleure prise de décision",
  "Automatisation des tâches répétitives",
  "Centralisation des données",
  "Support intelligent pour vos clients",
];

export default function Page() {
  return (
    <main className="min-h-screen bg-[#faf9fe] text-[#1a1c1f]">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#001736] text-white">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="font-extrabold tracking-tight text-[#001736]">DTSC</p>
              <p className="text-xs font-medium text-slate-500">Data and Tech Solutions Consulting</p>
            </div>
          </Link>
          <nav className="flex items-center gap-3">
            <Button asChild variant="ghost" className="text-[#001736] hover:bg-slate-100">
              <Link href="/auth/sign-in">Connexion</Link>
            </Button>
            <Button asChild className="bg-[#002b5b] text-white hover:bg-[#001736]">
              <Link href="/auth/sign-up">Essayer le chatbot</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-center gap-12 overflow-hidden px-4 py-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-28">
        <div className="absolute right-0 top-0 -z-10 h-96 w-1/2 rounded-l-full bg-[#d5e3fd]/60 blur-3xl" />
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#a9c7ff] bg-[#d5e3fd]/60 px-3 py-1.5 text-sm font-semibold text-[#002b5b]">
            <Sparkles className="h-4 w-4" />
            Le numérique au service de votre performance
          </p>
          <h1 className="max-w-4xl text-4xl font-bold leading-tight tracking-tight text-[#001736] sm:text-6xl">
            Votre assistant IA pour accélérer la transformation numérique de votre entreprise.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            DTSC Chatbot aide vos équipes à automatiser les tâches complexes, analyser les données et prendre des décisions plus intelligentes avec un accompagnement conseil fiable.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-xl bg-[#002b5b] text-white shadow-[0_12px_32px_rgba(0,43,91,0.16)] hover:bg-[#001736]">
              <Link href="/auth/sign-up">
                Essayer le chatbot
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-xl border-slate-300 bg-white text-[#002b5b] hover:bg-slate-50">
              <Link href="/support">Demander une démo</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="rounded-xl text-[#002b5b] hover:bg-slate-100">
              <Link href="/support">Contacter DTSC</Link>
            </Button>
          </div>
          <div className="mt-10 flex items-center gap-4 border-t border-slate-200 pt-8 text-sm text-slate-600">
            <div className="flex -space-x-3">
              {["IA", "BI", "DX"].map((label) => (
                <div key={label} className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-[#d5e3fd] text-xs font-bold text-[#002b5b]">
                  {label}
                </div>
              ))}
            </div>
            <p><span className="font-bold text-[#001736]">500+</span> cas d&apos;usage data, automatisation et IA cadrés.</p>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 -z-10 rotate-3 scale-105 rounded-3xl bg-[#d5e3fd]" />
          <div className="dtsc-card overflow-hidden p-5">
            <div className="rounded-2xl bg-white p-5">
              <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
                <div className="rounded-xl bg-[#d5e3fd] p-2 text-[#002b5b]"><Bot className="h-5 w-5" /></div>
                <p className="font-semibold text-[#001736]">Assistant DTSC</p>
              </div>
              <div className="mt-5 space-y-4 text-sm">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 p-4 text-slate-700">
                  Bonjour, décrivez votre besoin en data, automatisation, application métier ou IA.
                </div>
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#002b5b] p-4 text-white">
                  Nous voulons automatiser notre reporting commercial.
                </div>
                <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-slate-100 p-4 text-slate-700">
                  DTSC peut vous aider à centraliser vos données, définir les indicateurs clés et construire un tableau de bord fiable. Je recommande de créer un ticket pour cadrer les sources et les utilisateurs.
                </div>
              </div>
            </div>
            <div className="absolute -left-6 top-20 hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(0,43,91,0.1)] lg:flex lg:items-center lg:gap-3">
              <BarChart3 className="h-5 w-5 text-cyan-500" />
              <div><p className="text-xs text-slate-500">Analyse en cours</p><p className="text-sm font-bold text-[#001736]">+24% efficacité</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">
          {[
            { icon: BrainCircuit, title: "IA utile", text: "Un assistant cadré pour répondre avec rigueur et orienter vers l'équipe DTSC." },
            { icon: Database, title: "Data-driven", text: "Pensé pour évoluer vers une base documentaire et des workflows métiers." },
            { icon: Network, title: "SaaS sécurisé", text: "Authentification, rôles, historique et contrôle d'usage intégrés." },
          ].map((item) => (
            <div key={item.title} className="dtsc-card dtsc-card-hover p-6">
              <item.icon className="h-6 w-6 text-[#002b5b]" />
              <h2 className="mt-5 text-lg font-semibold text-[#001736]">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-[#001736]">Services principaux</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {services.map((service) => (
                <div key={service} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 shadow-[0_4px_20px_rgba(0,43,91,0.04)]">
                  <CheckCircle2 className="h-4 w-4 text-cyan-500" />
                  {service}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-bold text-[#001736]">Avantages</h2>
            <div className="mt-6 space-y-3">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-center gap-3 text-slate-700">
                  <BarChart3 className="h-4 w-4 text-cyan-500" />
                  {benefit}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-[#001736]">FAQ</h2>
        <div className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(0,43,91,0.05)]">
          {[
            ["Le chatbot remplace-t-il l'équipe DTSC ?", "Non. Il accélère la qualification et recommande une validation humaine pour les demandes commerciales, stratégiques ou complexes."],
            ["Mes conversations sont-elles conservées ?", "Oui, après connexion, les conversations sont sauvegardées pour assurer le suivi client."],
            ["Puis-je demander une démo ?", "Oui, via le bouton de contact ou la page support."],
          ].map(([question, answer]) => (
            <div key={question} className="p-5">
              <h3 className="font-semibold text-[#001736]">{question}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{answer}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
        DTSC — Data and Tech Solutions Consulting. Le numérique au service de votre performance.
      </footer>
    </main>
  );
}
