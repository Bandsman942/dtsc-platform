import { ArrowLeft, CalendarDays, CheckCircle2, CircleOff, Github, Link2, LockKeyhole, Mail, NotebookText, PanelsTopLeft, PlugZap, ReceiptText, ShieldCheck, Unplug } from "lucide-react";
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

const HUMAN_PERMISSION_LABELS: Record<string, { fr: string; en: string }> = {
  "https://www.googleapis.com/auth/gmail.readonly": { fr: "Lire les e-mails autorisés", en: "Read authorized email" },
  "https://www.googleapis.com/auth/calendar.readonly": { fr: "Lire les calendriers et événements", en: "Read calendars and events" },
};

function AppIcon({ code }: { code: string }) {
  if (code === "GMAIL") return <Mail className="h-5 w-5" />;
  if (code === "GOOGLE_CALENDAR") return <CalendarDays className="h-5 w-5" />;
  if (code === "NOTION") return <NotebookText className="h-5 w-5" />;
  if (code === "GITHUB") return <Github className="h-5 w-5" />;
  if (code === "STRIPE") return <ReceiptText className="h-5 w-5" />;
  return <PanelsTopLeft className="h-5 w-5" />;
}

function humanPermission(scope: string, en: boolean) {
  return HUMAN_PERMISSION_LABELS[scope]?.[en ? "en" : "fr"] || (en ? "Minimum permission certified by DTSC" : "Permission minimale certifiée par DTSC");
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
                  {en ? "Connect your business accounts to DTSC AI from the provider’s secure authorization page." : "Connectez vos comptes métier à l’IA DTSC depuis la page d’autorisation sécurisée de votre fournisseur."}
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

        <section className="mb-5 grid gap-2 sm:grid-cols-4" aria-label={en ? "Connection steps" : "Étapes de connexion"}>
          {[
            en ? "Choose an application" : "Choisissez une application",
            en ? "Review permissions" : "Vérifiez les permissions",
            en ? "Sign in with the provider" : "Authentifiez-vous chez le fournisseur",
            en ? "Return connected to DTSC" : "Revenez connecté dans DTSC",
          ].map((label, index) => (
            <div key={label} className="flex items-center gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cyan-500/10 text-xs font-black text-cyan-700 dark:text-cyan-200">{index + 1}</span>
              <span className="text-xs font-bold leading-5 text-dtsc-ink">{label}</span>
            </div>
          ))}
        </section>

        <section className="mb-5 rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-200"><ShieldCheck className="h-4 w-4" /></span>
            <div>
              <h2 className="text-sm font-black text-dtsc-ink">{en ? "Security first" : "Sécurité d’abord"}</h2>
              <p className="mt-1 text-sm leading-6 text-dtsc-muted">
                {en ? "Authorization happens on your provider’s OAuth page. DTSC keeps credentials encrypted on the server and never exposes them to the AI model or browser. Disconnecting removes the local credential." : "L’autorisation se fait sur la page OAuth de votre fournisseur. DTSC conserve les identifiants chiffrés côté serveur et ne les expose jamais au modèle IA ni au navigateur. La déconnexion supprime l’autorisation locale."}
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => {
            const connected = app.availability === "CONNECTED";
            const ready = app.availability === "READY_TO_CONNECT";
            const setupRequired = app.availability === "PLATFORM_SETUP_REQUIRED";
            const certified = app.availability !== "REQUIRES_DTSC_CERTIFICATION";
            const category = CATEGORY_LABELS[app.category]?.[en ? "en" : "fr"] || app.category;
            const permissions = [...new Set(app.scopes.map((scope) => humanPermission(scope, en)))];
            return (
              <article key={app.code} className="flex min-h-72 flex-col rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dtsc-page text-dtsc-ink"><AppIcon code={app.code} /></span>
                    <div className="min-w-0"><h2 className="truncate text-base font-black text-dtsc-ink">{app.name}</h2><p className="text-xs font-bold text-dtsc-muted">{category}</p></div>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[0.68rem] font-black ${connected ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : ready ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" : setupRequired ? "bg-blue-500/10 text-blue-700 dark:text-blue-200" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                    {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : ready ? <Link2 className="h-3.5 w-3.5" /> : setupRequired ? <LockKeyhole className="h-3.5 w-3.5" /> : <CircleOff className="h-3.5 w-3.5" />}
                    {connected ? (en ? "Connected" : "Connecté") : ready ? (en ? "Ready" : "Prêt") : setupRequired ? (en ? "DTSC setup" : "Configuration DTSC") : certified ? (en ? "DTSC certified" : "Certifié DTSC") : (en ? "Not enabled" : "Non activé")}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-6 text-dtsc-muted">{app.description}</p>
                <ul className="mt-3 grid gap-1.5 text-sm text-dtsc-ink">{app.capabilities.map((capability) => <li key={capability} className="flex gap-2"><span aria-hidden="true">•</span><span>{capability}</span></li>)}</ul>

                {permissions.length ? (
                  <div className="mt-4 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
                    <p className="text-[0.68rem] font-black uppercase tracking-wide text-dtsc-muted">{en ? "Permissions requested" : "Permissions demandées"}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">{permissions.map((permission) => <span key={permission} className="rounded-full bg-dtsc-surface px-2 py-1 text-[0.68rem] font-bold text-dtsc-ink">{permission}</span>)}</div>
                  </div>
                ) : null}

                <div className="mt-auto pt-4">
                  {connected && app.serverCode ? (
                    <form action="/api/ai/apps/oauth/disconnect" method="post">
                      <input type="hidden" name="serverCode" value={app.serverCode} />
                      <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 px-3 py-2 text-sm font-black text-rose-700 hover:bg-rose-500/5 dark:text-rose-300">
                        <Unplug className="h-4 w-4" /> {en ? "Disconnect" : "Déconnecter"}
                      </button>
                    </form>
                  ) : ready && app.serverCode && organizationId ? (
                    <div className="grid gap-2">
                      <form action="/api/ai/apps/oauth/connect" method="post">
                        <input type="hidden" name="serverCode" value={app.serverCode} />
                        <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-black text-white hover:bg-cyan-700">
                          <Link2 className="h-4 w-4" /> {en ? `Continue with ${app.name}` : `Continuer avec ${app.name}`}
                        </button>
                      </form>
                      <p className="text-center text-[0.68rem] leading-5 text-dtsc-muted">{en ? "You will authorize access directly with the provider, then return here automatically." : "Vous autoriserez l’accès directement chez le fournisseur, puis reviendrez ici automatiquement."}</p>
                    </div>
                  ) : setupRequired ? (
                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-xs leading-5 text-dtsc-muted">
                      <strong className="block text-dtsc-ink">{en ? "Integration ready on DTSC" : "Intégration prête côté DTSC"}</strong>
                      <span>{en ? "The secure sign-in button will activate automatically as soon as DTSC’s provider OAuth configuration is completed." : "Le bouton d’authentification sécurisé s’activera automatiquement dès que la configuration OAuth fournisseur de DTSC sera finalisée."}</span>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2.5 text-xs leading-5 text-dtsc-muted">
                      {certified ? (en ? "This certified server does not use personal OAuth in the current DTSC configuration." : "Ce serveur certifié n’utilise pas OAuth personnel dans la configuration DTSC actuelle.") : (en ? "DTSC must first certify this integration before it can request access to your account." : "DTSC doit d’abord certifier cette intégration avant qu’elle puisse demander l’accès à votre compte.")}
                    </div>
                  )}
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
