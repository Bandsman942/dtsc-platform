import { ArrowLeft, CalendarDays, CheckCircle2, CircleOff, Github, Link2, Mail, NotebookText, PanelsTopLeft, PlugZap, ReceiptText, Unplug } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { listConnectedAppsForUser } from "@/lib/ai/mcp/app-catalog";
import { getActiveOrganizationId } from "@/lib/organizations";

export const dynamic = "force-dynamic";

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
  const session = await getSession();
  const en = user.locale === "en";
  const organizationId = getActiveOrganizationId(session);
  const apps = await listConnectedAppsForUser({ locale: user.locale, userId: user.id, organizationId });
  const certifiedCount = apps.filter((app) => app.availability !== "REQUIRES_DTSC_CERTIFICATION").length;
  const connectedCount = apps.filter((app) => app.availability === "CONNECTED").length;

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
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600"><PlugZap className="h-5 w-5" /></span>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-dtsc-ink sm:text-3xl">{en ? "Connected applications" : "Applications connectées"}</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-dtsc-muted">
                  {en ? "Connect your own business accounts to the DTSC AI. Only DTSC-certified MCP servers can request authorization." : "Connectez vos propres comptes métier à l’IA DTSC. Seuls les serveurs MCP certifiés par DTSC peuvent demander une autorisation."}
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2 text-sm font-bold text-dtsc-ink">
            <span className="rounded-2xl border border-dtsc-border bg-dtsc-surface px-3 py-2">{connectedCount} {en ? "connected" : "connectées"}</span>
            <span className="rounded-2xl border border-dtsc-border bg-dtsc-surface px-3 py-2">{certifiedCount} {en ? "certified" : "certifiées"}</span>
          </div>
        </div>

        {!organizationId ? (
          <section className="mb-5 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-6 text-dtsc-muted">
            {en ? "Select an active organization before connecting an application. Connections are isolated per user and organization." : "Sélectionnez une organisation active avant de connecter une application. Les connexions sont isolées par utilisateur et par organisation."}
          </section>
        ) : null}

        <section className="mb-5 rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-4 sm:p-5">
          <h2 className="text-sm font-black text-dtsc-ink">{en ? "Security first" : "Sécurité d’abord"}</h2>
          <p className="mt-1 text-sm leading-6 text-dtsc-muted">
            {en ? "Authorization uses your provider’s OAuth page. DTSC stores tokens encrypted on the server and never exposes them to the AI model, browser or logs. Disconnecting destroys the local credential." : "L’autorisation utilise la page OAuth de votre fournisseur. DTSC conserve les jetons chiffrés côté serveur et ne les expose jamais au modèle IA, au navigateur ou aux logs. La déconnexion détruit le credential local."}
          </p>
        </section>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => {
            const connected = app.availability === "CONNECTED";
            const ready = app.availability === "READY_TO_CONNECT";
            const certified = app.availability !== "REQUIRES_DTSC_CERTIFICATION";
            const category = CATEGORY_LABELS[app.category]?.[en ? "en" : "fr"] || app.category;
            return (
              <article key={app.code} className="flex min-h-72 flex-col rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dtsc-page text-dtsc-ink"><AppIcon code={app.code} /></span>
                    <div className="min-w-0"><h2 className="truncate text-base font-black text-dtsc-ink">{app.name}</h2><p className="text-xs font-bold text-dtsc-muted">{category}</p></div>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[0.68rem] font-black ${connected ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : certified ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                    {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : certified ? <Link2 className="h-3.5 w-3.5" /> : <CircleOff className="h-3.5 w-3.5" />}
                    {connected ? (en ? "Connected" : "Connecté") : ready ? (en ? "Ready to connect" : "Prêt à connecter") : certified ? (en ? "DTSC certified" : "Certifié DTSC") : (en ? "Not enabled" : "Non activé")}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-6 text-dtsc-muted">{app.description}</p>
                <ul className="mt-3 grid gap-1.5 text-sm text-dtsc-ink">{app.capabilities.map((capability) => <li key={capability} className="flex gap-2"><span aria-hidden="true">•</span><span>{capability}</span></li>)}</ul>

                <div className="mt-auto pt-4">
                  {connected && app.serverCode ? (
                    <form action="/api/ai/apps/oauth/disconnect" method="post">
                      <input type="hidden" name="serverCode" value={app.serverCode} />
                      <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 px-3 py-2 text-sm font-black text-rose-700 hover:bg-rose-500/5 dark:text-rose-300">
                        <Unplug className="h-4 w-4" /> {en ? "Disconnect" : "Déconnecter"}
                      </button>
                    </form>
                  ) : ready && app.serverCode && organizationId ? (
                    <form action="/api/ai/apps/oauth/connect" method="post">
                      <input type="hidden" name="serverCode" value={app.serverCode} />
                      <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-black text-white hover:bg-cyan-700">
                        <Link2 className="h-4 w-4" /> {en ? `Connect ${app.name}` : `Connecter ${app.name}`}
                      </button>
                    </form>
                  ) : (
                    <div className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2.5 text-xs leading-5 text-dtsc-muted">
                      {certified ? (en ? "This certified server does not use personal OAuth in the current DTSC configuration." : "Ce serveur certifié n’utilise pas OAuth personnel dans la configuration DTSC actuelle.") : (en ? "DTSC must first certify the MCP endpoint, schemas, permissions and data policy." : "DTSC doit d’abord certifier l’endpoint MCP, les schémas, les permissions et la politique de données.")}
                    </div>
                  )}
                  {app.scopes.length ? <p className="mt-2 text-[0.68rem] leading-5 text-dtsc-muted">{en ? "Requested permissions:" : "Autorisations demandées :"} {app.scopes.join(", ")}</p> : null}
                  <div className="mt-2 text-[0.68rem] font-bold uppercase tracking-wide text-dtsc-muted">{app.maturity === "OFFICIAL_PREVIEW" ? (en ? "Official preview" : "Aperçu officiel") : (en ? "Official MCP" : "MCP officiel")}</div>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
