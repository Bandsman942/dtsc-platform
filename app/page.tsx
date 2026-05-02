import Link from "next/link";
import { ArrowRight, BarChart3, Bot, BrainCircuit, CheckCircle2, Database, Network } from "lucide-react";
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
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400 text-slate-950 font-black">
              D
            </div>
            <div>
              <p className="font-semibold tracking-wide">DTSC</p>
              <p className="text-xs text-slate-400">Data and Tech Solutions Consulting</p>
            </div>
          </Link>
          <nav className="flex items-center gap-3">
            <Button asChild variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white">
              <Link href="/auth/sign-in">Connexion</Link>
            </Button>
            <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
              <Link href="/auth/sign-up">Essayer le chatbot</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
        <div>
          <p className="mb-5 inline-flex rounded-full border border-cyan-300/30 px-3 py-1 text-sm text-cyan-200">
            Le numérique au service de votre performance
          </p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            Un assistant IA professionnel pour accompagner vos clients et projets numériques.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            DTSC aide les entreprises à structurer leurs besoins, automatiser leurs processus, exploiter leurs données et déployer des solutions IA fiables.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
              <Link href="/auth/sign-up">
                Essayer le chatbot
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">
              <Link href="/support">Demander une démo</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white">
              <Link href="/support">Contacter DTSC</Link>
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-cyan-950/30">
          <div className="rounded-lg bg-slate-900 p-5">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <Bot className="h-5 w-5 text-cyan-300" />
              <p className="font-medium">Assistant DTSC</p>
            </div>
            <div className="mt-5 space-y-4 text-sm">
              <div className="max-w-[85%] rounded-lg bg-white/[0.06] p-4 text-slate-200">
                Bonjour, décrivez votre besoin en data, automatisation, application métier ou IA.
              </div>
              <div className="ml-auto max-w-[85%] rounded-lg bg-cyan-400 p-4 text-slate-950">
                Nous voulons automatiser notre reporting commercial.
              </div>
              <div className="max-w-[90%] rounded-lg bg-white/[0.06] p-4 text-slate-200">
                DTSC peut vous aider à centraliser vos données, définir les indicateurs clés et construire un tableau de bord fiable. Je recommande de créer un ticket pour cadrer la source des données, les utilisateurs et la fréquence de mise à jour.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">
          {[
            { icon: BrainCircuit, title: "IA utile", text: "Un assistant cadré pour répondre avec rigueur et orienter vers l'équipe DTSC." },
            { icon: Database, title: "Data-driven", text: "Pensé pour évoluer vers une base documentaire et des workflows métiers." },
            { icon: Network, title: "SaaS sécurisé", text: "Authentification, rôles, historique et contrôle d'usage intégrés." },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-white/10 bg-slate-950/60 p-6">
              <item.icon className="h-6 w-6 text-cyan-300" />
              <h2 className="mt-5 text-lg font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold">Services principaux</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {services.map((service) => (
                <div key={service} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-cyan-300" />
                  {service}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-semibold">Avantages</h2>
            <div className="mt-6 space-y-3">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-center gap-3 text-slate-300">
                  <BarChart3 className="h-4 w-4 text-cyan-300" />
                  {benefit}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-semibold">FAQ</h2>
        <div className="mt-6 divide-y divide-white/10 rounded-lg border border-white/10 bg-white/[0.04]">
          {[
            ["Le chatbot remplace-t-il l'équipe DTSC ?", "Non. Il accélère la qualification et recommande une validation humaine pour les demandes commerciales, stratégiques ou complexes."],
            ["Mes conversations sont-elles conservées ?", "Oui, après connexion, les conversations sont sauvegardées pour assurer le suivi client."],
            ["Puis-je demander une démo ?", "Oui, via le bouton de contact ou la page support."],
          ].map(([question, answer]) => (
            <div key={question} className="p-5">
              <h3 className="font-medium">{question}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{answer}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 py-8 text-center text-sm text-slate-500">
        DTSC — Data and Tech Solutions Consulting. Le numérique au service de votre performance.
      </footer>
    </main>
  );
}
