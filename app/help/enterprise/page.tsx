import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { requireUser } from "@/lib/auth";
import { getCanonicalEnterpriseUserGuide } from "@/lib/user-guides/enterprise-guide-registry";

export default async function EnterpriseHelpPage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const user = await requireUser();
  const { module } = await searchParams;
  const code = (module || "").trim().toUpperCase();
  const guide = code ? getCanonicalEnterpriseUserGuide(code) : null;

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Centre d’aide ERP"
          title={guide?.title || "Guide utilisateur"}
          description={guide?.summary || "Aucun guide n’est encore publié pour ce module. Le support DTSC peut vous accompagner sans vous rediriger vers un guide sans rapport avec votre activité."}
        />
        <ModuleContent>
          {guide ? <ContextualUserGuide guide={guide} presentation="inline" hideTrigger /> : null}

          {guide?.relatedModules?.length ? (
            <ModuleSection title="Modules et parcours liés">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
                {guide.relatedModules.map((related) => (
                  <Link key={related.code} href={`/enterprise-modules/${encodeURIComponent(related.code)}`} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 transition hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                    <strong className="block break-words text-sm text-dtsc-ink">{related.label}</strong>
                    <span className="mt-1 block break-words text-sm leading-6 text-dtsc-muted">{related.reason}</span>
                  </Link>
                ))}
              </div>
            </ModuleSection>
          ) : null}

          <ModuleSection title="Besoin d’accompagnement">
            <div data-responsive-actions>
              {guide && code ? <Link href={`/enterprise-modules/${encodeURIComponent(code)}`} className="min-h-11 rounded-xl bg-dtsc-blue px-4 py-3 text-center text-sm font-black text-white">Revenir au module</Link> : null}
              <Link href="/support" className="min-h-11 rounded-xl border border-dtsc-border px-4 py-3 text-center text-sm font-black text-dtsc-ink">Contacter le support DTSC</Link>
              <Link href="/enterprise-admin" className="min-h-11 rounded-xl border border-dtsc-border px-4 py-3 text-center text-sm font-black text-dtsc-ink">Vérifier la configuration</Link>
            </div>
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
