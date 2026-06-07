import Link from "next/link";
import { ArrowRight, ClipboardList, Settings, ShieldCheck } from "lucide-react";
import type { EnterpriseNavigationModule } from "@/lib/enterprise/enterprise-navigation";

type ActivityBlock = { id: string; labelFr: string; labelEn: string; blockCode: string };
type SectorRecord = { id: string; title: string; summary: string | null; status: string; updatedAt: Date };

export function EnterpriseModuleWorkspace({
  organizationName,
  enterpriseModule,
  activityBlocks,
  records,
  canManage,
  locale,
}: {
  organizationName: string;
  enterpriseModule: EnterpriseNavigationModule;
  activityBlocks: ActivityBlock[];
  records: SectorRecord[];
  canManage: boolean;
  locale?: string | null;
}) {
  const isEnglish = locale === "en";
  return (
    <div className="min-w-0 space-y-5">
      <section className="dtsc-panel p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">{enterpriseModule.isCore ? (isEnglish ? "Common foundation" : "Socle commun") : enterpriseModule.category}</p>
        <h1 className="mt-2 text-3xl font-black text-dtsc-ink sm:text-4xl">{enterpriseModule.label}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-dtsc-muted">{enterpriseModule.description}</p>
        <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted">{organizationName}</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-cyan-500" /><h2 className="font-black text-dtsc-ink">{isEnglish ? "Operational workspace" : "Espace opérationnel"}</h2></div>
          <div className="mt-4 grid gap-3">
            {activityBlocks.map((block) => (
              <Link key={block.id} href={`/enterprise-activities?block=${encodeURIComponent(block.blockCode)}`} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-bold text-dtsc-ink transition hover:border-cyan-300">
                <span className="min-w-0 truncate">{isEnglish ? block.labelEn : block.labelFr}</span><ArrowRight className="h-4 w-4 shrink-0 text-cyan-500" />
              </Link>
            ))}
            {!activityBlocks.length && <p className="rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">{isEnglish ? "This module is active. Its operations remain available according to company workflows and permissions." : "Ce module est actif. Ses opérations sont accessibles selon les workflows et permissions de l’entreprise."}</p>}
          </div>
        </div>
        <aside className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-500" /><h2 className="font-black text-dtsc-ink">{isEnglish ? "Controlled access" : "Accès contrôlé"}</h2></div>
          <p className="mt-3 text-sm leading-6 text-dtsc-muted">{isEnglish ? `Visibility depends on the subscription, module activation and membership in ${organizationName}.` : `La visibilité dépend de l’abonnement, de l’activation du module et de l’appartenance à ${organizationName}.`}</p>
          {canManage && <Link href="/enterprise-admin" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#002b5b] px-3 py-2 text-sm font-black text-white"><Settings className="h-4 w-4" />{isEnglish ? "Configure" : "Configurer"}</Link>}
        </aside>
      </section>

      {records.length > 0 && (
        <section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <h2 className="font-black text-dtsc-ink">{isEnglish ? "Recent module data" : "Données récentes du module"}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {records.map((record) => <article key={record.id} className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase text-cyan-600">{record.status}</p><h3 className="mt-1 font-black text-dtsc-ink">{record.title}</h3>{record.summary && <p className="mt-2 line-clamp-3 text-sm text-dtsc-muted">{record.summary}</p>}</article>)}
          </div>
        </section>
      )}
    </div>
  );
}
