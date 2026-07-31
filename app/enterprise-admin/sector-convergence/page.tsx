import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { listSectorConvergenceStatus } from "@/lib/enterprise/sector-convergence/sync-service";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";

type PageProps = {
  searchParams: Promise<{ sector?: "PHARMACY" | "HEALTH_CARE"; status?: string; page?: string }>;
};

function badge(status: string) {
  const tone = status === "SYNCED" || status === "CUTOVER_COMPLETE"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : status === "FAILED" || status === "AMBIGUOUS" || status === "LEGACY_UNMAPPED"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return `inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`;
}

export default async function SectorConvergencePage({ searchParams }: PageProps) {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");
  const membership = await requireEnterpriseMembership(session, organizationId);
  const [adminAccess, financeAccess] = membership ? await Promise.all([
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "ADMIN_DASHBOARD", action: "manage" }),
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "FINANCE_OVERVIEW", action: "manage" }),
  ]) : [null, null];
  if (!membership || (!adminAccess?.allowed && !financeAccess?.allowed)) redirect("/dashboard");
  const filters = await searchParams;
  const page = Math.max(Number(filters.page || 1) || 1, 1);
  const status = filters.status && ["PENDING", "SYNCED", "FAILED", "AMBIGUOUS", "LEGACY_UNMAPPED", "CUTOVER_COMPLETE"].includes(filters.status) ? filters.status : undefined;
  const data = await listSectorConvergenceStatus({ organizationId, sector: filters.sector, status, page, pageSize: 30 });

  return (
    <AppShell user={user}>
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Administration entreprise</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Convergence Pharmacy & Health</h1>
            </div>
            <Link className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted" href="/enterprise-admin">Retour à l’administration</Link>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">Suivi restreint des mappings, erreurs, éléments ambigus et cutovers. Cette vue n’affiche aucune donnée clinique.</p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.counts.map((item) => (
            <article key={`${item.sector}-${item.status}`} className="rounded-2xl border bg-card p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.sector}</p>
              <p className="mt-2 text-2xl font-semibold">{item._count._all}</p>
              <span className={badge(item.status)}>{item.status}</span>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-wrap gap-2 border-b p-4">
            <Link className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" href="/enterprise-admin/sector-convergence">Tous</Link>
            <Link className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" href="/enterprise-admin/sector-convergence?sector=PHARMACY">Pharmacy</Link>
            <Link className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" href="/enterprise-admin/sector-convergence?sector=HEALTH_CARE">Health</Link>
            <Link className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" href="/enterprise-admin/sector-convergence?status=FAILED">Échecs</Link>
            <Link className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" href="/enterprise-admin/sector-convergence?status=AMBIGUOUS">Ambigus</Link>
            <Link className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" href="/enterprise-admin/sector-convergence?status=LEGACY_UNMAPPED">Legacy non mappé</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3">Secteur</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Événement</th><th className="px-4 py-3">Cible</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3">Dernière tentative</th></tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{item.sector}</td>
                    <td className="px-4 py-3"><div className="font-medium">{item.sourceEntityType}</div><div className="max-w-56 truncate font-mono text-xs text-muted-foreground">{item.sourceEntityId}</div></td>
                    <td className="px-4 py-3"><div>{item.eventType}</div><div className="text-xs text-muted-foreground">v{item.eventVersion}</div></td>
                    <td className="px-4 py-3"><div>{item.targetEntityType || "—"}</div><div className="max-w-56 truncate font-mono text-xs text-muted-foreground">{item.targetEntityId || "—"}</div></td>
                    <td className="px-4 py-3"><span className={badge(item.status)}>{item.status}</span>{item.errorCode ? <p className="mt-2 max-w-64 text-xs text-rose-600 dark:text-rose-300">{item.errorCode}</p> : null}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{item.lastAttemptAt ? new Intl.DateTimeFormat(user.locale === "en" ? "en" : "fr", { dateStyle: "medium", timeStyle: "short" }).format(item.lastAttemptAt) : "—"}</td>
                  </tr>
                ))}
                {!data.items.length ? <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Aucun élément pour ces filtres.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="font-semibold">Cutovers</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.cutovers.map((item) => (
              <article key={item.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-3"><span className="font-medium">{item.sector} · {item.domainCode}</span><span className={badge(item.status)}>{item.status}</span></div>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{item.featureFlag}</p>
              </article>
            ))}
            {!data.cutovers.length ? <p className="text-sm text-muted-foreground">Aucun cutover activé. Les flags restent sûrs par défaut.</p> : null}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
