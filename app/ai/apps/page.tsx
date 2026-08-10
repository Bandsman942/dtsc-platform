import { ArrowLeft, CalendarDays, CheckCircle2, CircleOff, Github, Mail, NotebookText, PanelsTopLeft, PlugZap, ReceiptText } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { listConnectedAppsForUser } from "@/lib/ai/mcp/app-catalog";

const CATEGORY_LABELS: Record<string, { fr: string; en: string }> = {
  COMMUNICATION: { fr: "Communication", en: "Communication" },
  CALENDAR: { fr: "Agenda", en: "Calendar" },
  KNOWLEDGE: { fr: "Connaissance", en: "Knowledge" },
  DEVELOPMENT: { fr: "Développement", en: "Development" },
  PROJECTS: { fr: "Projets", en: "Projects" },
  FINANCE: { fr: "Finance", en: "Finance" },
};

function AppIcon({ code }: { code: string }) {
  if (code === "GMAIL") return <Mail className="h-5 w-5" />;
  if (code === "GOOGLE_CALENDAR") return <CalendarDays className="h-5 w-5" />;
  if (code === "NOTION") return <NotebookText className="h-5 w-5" />;
  if (code === "GITHUB") return <Github className="h-5 w-5" />;
  if (code === "STRIPE") return <ReceiptText className="h-5 w-5" />;
  return <PanelsTopLeft className="h-5 w-5" />;
}

export default async function ConnectedAiAppsPage() {
  const user = await requireUser();
  const en = user.locale === "en";
  const apps = listConnectedAppsForUser(user.locale);
  const certifiedCount = apps.filter((app) => app.availability === "CERTIFIED_BY_DTSC").length;

  return (
    <AppShell user={user}>
      <main className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-6 sm:py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href="/chat" className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-dtsc-muted hover:text-dtsc-ink">
              <ArrowLeft className="h-4 w-4" />
              {en ? "Back to AI" : "Retour à l’IA"}
            </Link>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600">
                <PlugZap className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-dtsc-ink sm:text-3xl">{en ? "Connected applications" : "Applications connectées"}</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-dtsc-muted">
                  {en
                    ? "Choose the business applications the DTSC AI may use. A connector is usable only after DTSC security certification and your own account authorization."
                    : "Choisissez les applications métier que l’IA DTSC pourra utiliser. Un connecteur n’est utilisable qu’après certification de sécurité DTSC et autorisation de votre propre compte."}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface px-4 py-3 text-sm font-bold text-dtsc-ink">
            {certifiedCount} / {apps.length} {en ? "certified in this environment" : "certifiées dans cet environnement"}
          </div>
        </div>

        <section className="mb-5 rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-4 sm:p-5">
          <h2 className="text-sm font-black text-dtsc-ink">{en ? "Security first" : "Sécurité d’abord"}</h2>
          <p className="mt-1 text-sm leading-6 text-dtsc-muted">
            {en
              ? "DTSC never lets a remote MCP server grant itself permissions. Access remains subject to your DTSC session, organization, subscription, permissions, data classification and the certified tool allow-list."
              : "DTSC ne laisse jamais un serveur MCP distant s’accorder lui-même des permissions. L’accès reste soumis à votre session DTSC, votre organisation, l’abonnement, les permissions, la classification des données et la liste d’outils certifiés."}
          </p>
        </section>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => {
            const certified = app.availability === "CERTIFIED_BY_DTSC";
            const category = CATEGORY_LABELS[app.category]?.[en ? "en" : "fr"] || app.category;
            return (
              <article key={app.code} className="flex min-h-64 flex-col rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dtsc-page text-dtsc-ink"><AppIcon code={app.code} /></span>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-black text-dtsc-ink">{app.name}</h2>
                      <p className="text-xs font-bold text-dtsc-muted">{category}</p>
                    </div>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[0.68rem] font-black ${certified ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                    {certified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleOff className="h-3.5 w-3.5" />}
                    {certified ? (en ? "DTSC certified" : "Certifié DTSC") : (en ? "Not enabled" : "Non activé")}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-6 text-dtsc-muted">{app.description}</p>
                <ul className="mt-3 grid gap-1.5 text-sm text-dtsc-ink">
                  {app.capabilities.map((capability) => <li key={capability} className="flex gap-2"><span aria-hidden="true">•</span><span>{capability}</span></li>)}
                </ul>

                <div className="mt-auto pt-4">
                  <div className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2.5 text-xs leading-5 text-dtsc-muted">
                    {certified
                      ? (en
                          ? "The MCP server is certified for this DTSC environment. Personal account authorization will appear here only when the user OAuth runtime is enabled."
                          : "Le serveur MCP est certifié pour cet environnement DTSC. L’autorisation du compte personnel apparaîtra ici uniquement lorsque le runtime OAuth utilisateur sera activé.")
                      : (en
                          ? "DTSC must first certify the MCP endpoint, schemas, permissions and data policy before any account can be connected."
                          : "DTSC doit d’abord certifier l’endpoint MCP, les schémas, les permissions et la politique de données avant toute connexion de compte.")}
                  </div>
                  <div className="mt-2 text-[0.68rem] font-bold uppercase tracking-wide text-dtsc-muted">
                    {app.maturity === "OFFICIAL_PREVIEW" ? (en ? "Official preview" : "Aperçu officiel") : (en ? "Official MCP" : "MCP officiel")}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
