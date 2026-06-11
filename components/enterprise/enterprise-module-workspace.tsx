import Link from "next/link";
import { ArrowRight, Building2, CalendarDays, ClipboardList, Settings, ShieldCheck, UsersRound } from "lucide-react";
import { EnterpriseCoreWorkspace } from "@/components/enterprise/enterprise-core-workspace";
import { ENTERPRISE_CORE_MODULES, isEnterpriseCoreModuleCode } from "@/lib/enterprise/enterprise-core";
import type { EnterpriseNavigationModule } from "@/lib/enterprise/enterprise-navigation";

type ActivityBlock = { id: string; labelFr: string; labelEn: string; blockCode: string };
type SectorRecord = { id: string; title: string; summary: string | null; status: string; updatedAt: Date };
type CoreData = {
  members: Array<{ id: string; role: string; status: string; joinedAt: Date | null; user: { id: string; name: string; email: string } }>;
  departments: Array<{ id: string; labelFr: string; departmentCode: string; isActive: boolean }>;
  positions: Array<{ id: string; labelFr: string; positionCode: string; isActive: boolean }>;
  workflows: Array<{ id: string; labelFr: string; isEnabled: boolean; updatedAt: Date }>;
  requests: Array<{ id: string; title: string; status: string; priority: string; blockCode: string; updatedAt: Date }>;
  calendarEvents: Array<{ id: string; title: string; status: string; startDateTime: Date }>;
  audits: Array<{ id: string; action: string; entity: string; createdAt: Date }>;
};

export function EnterpriseModuleWorkspace({
  organizationId,
  organizationName,
  enterpriseModule,
  activityBlocks,
  records,
  coreData,
  canManage,
  canCreate,
  locale,
  coreRecords,
}: {
  organizationId: string;
  organizationName: string;
  enterpriseModule: EnterpriseNavigationModule;
  activityBlocks: ActivityBlock[];
  records: SectorRecord[];
  coreData: CoreData;
  canManage: boolean;
  canCreate: boolean;
  locale?: string | null;
  coreRecords: Array<{
    id: string; moduleCode: string; recordType: string; title: string; description: string | null; status: string; priority: string;
    assignedToUserId: string | null; validatorUserId: string | null; dueAt: string | null; sourceModule: string | null; sourceEntityType: string | null;
    sourceEntityId: string | null; updatedAt: string; events: Array<{ id: string; summary: string; eventType: string; createdAt: string }>;
    comments: Array<{ id: string; content: string; createdAt: string }>;
  }>;
}) {
  const isEnglish = locale === "en";
  const activeMembers = coreData.members.filter((member) => member.status === "ACTIVE");
  const openRequests = coreData.requests.filter((request) => !["CLOSED", "CANCELLED", "REJECTED", "RESOLVED"].includes(request.status));
  const upcomingMeetings = coreData.calendarEvents.filter((event) => event.startDateTime >= new Date() && !["CANCELLED", "CLOSED"].includes(event.status));
  const moduleItems = resolveModuleItems(enterpriseModule.code, coreData, records);
  const commonDefinition = isEnterpriseCoreModuleCode(enterpriseModule.code) ? ENTERPRISE_CORE_MODULES[enterpriseModule.code] : null;
  return (
    <div className="min-w-0 space-y-5">
      <section className="dtsc-panel p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">{enterpriseModule.isCore ? (isEnglish ? "Common foundation" : "Socle commun") : enterpriseModule.category}</p>
        <h1 className="mt-2 text-3xl font-black text-dtsc-ink sm:text-4xl">{enterpriseModule.label}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-dtsc-muted">{enterpriseModule.description}</p>
        <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted">{organizationName}</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={UsersRound} label={isEnglish ? "Active collaborators" : "Collaborateurs actifs"} value={activeMembers.length} />
        <Metric icon={Building2} label={isEnglish ? "Active departments" : "Départements actifs"} value={coreData.departments.filter((item) => item.isActive).length} />
        <Metric icon={ClipboardList} label={isEnglish ? "Open requests" : "Demandes ouvertes"} value={openRequests.length} />
        <Metric icon={CalendarDays} label={isEnglish ? "Upcoming meetings" : "Réunions à venir"} value={upcomingMeetings.length} />
      </section>

      {commonDefinition ? (
        <EnterpriseCoreWorkspace
          organizationId={organizationId}
          moduleCode={enterpriseModule.code}
          title={commonDefinition.title}
          description={commonDefinition.description}
          recordTypes={commonDefinition.recordTypes}
          initialRecords={coreRecords}
          members={activeMembers.map((member) => ({ id: member.user.id, label: `${member.user.name} · ${member.role}` }))}
          departments={coreData.departments.filter((item) => item.isActive).map((item) => ({ id: item.id, label: item.labelFr }))}
          canCreate={canCreate}
          canManage={canManage}
        />
      ) : <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-cyan-500" /><h2 className="font-black text-dtsc-ink">{isEnglish ? "Current company data" : "Données actuelles de l'entreprise"}</h2></div>
          <div className="mt-4 grid gap-3">
            {moduleItems.map((item) => <article key={item.id} className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase text-cyan-600">{item.meta}</p><h3 className="mt-1 font-black text-dtsc-ink">{item.title}</h3><p className="mt-1 text-sm text-dtsc-muted">{item.detail}</p></article>)}
            {!moduleItems.length && <p className="rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">{isEnglish ? "No company data has been recorded for this module yet." : "Aucune donnée n'est encore enregistrée pour ce module. Utilisez les actions disponibles pour créer le premier élément."}</p>}
          </div>
        </div>
        <aside className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-500" /><h2 className="font-black text-dtsc-ink">{isEnglish ? "Access and responsibilities" : "Accès et responsabilités"}</h2></div>
          <p className="mt-3 text-sm leading-6 text-dtsc-muted">{isEnglish ? `Actions are limited to active members of ${organizationName} according to their responsibilities.` : `Les actions sont limitées aux membres actifs de ${organizationName}, selon leurs responsabilités et les modules activés.`}</p>
          {canManage && <Link href="/enterprise-admin" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#002b5b] px-3 py-2 text-sm font-black text-white"><Settings className="h-4 w-4" />{isEnglish ? "Configure" : "Configurer"}</Link>}
          <Link href="/enterprise-activities" className="mt-2 inline-flex items-center gap-2 rounded-xl border border-dtsc-border px-3 py-2 text-sm font-black text-dtsc-ink"><ArrowRight className="h-4 w-4" />{isEnglish ? "Open activities" : "Ouvrir les activités"}</Link>
        </aside>
      </section>}

      {activityBlocks.length > 0 && (
        <section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <h2 className="font-black text-dtsc-ink">{isEnglish ? "Available actions" : "Actions disponibles"}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {activityBlocks.map((block) => <Link key={block.id} href={`/enterprise-activities?block=${encodeURIComponent(block.blockCode)}`} className="flex items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-bold text-dtsc-ink transition hover:border-cyan-300"><span>{isEnglish ? block.labelEn : block.labelFr}</span><ArrowRight className="h-4 w-4 text-cyan-500" /></Link>)}
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof UsersRound; label: string; value: number }) {
  return <article className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4"><div className="flex items-center gap-2 text-cyan-600"><Icon className="h-4 w-4" /><p className="text-xs font-black uppercase">{label}</p></div><p className="mt-2 text-3xl font-black text-dtsc-ink">{value}</p></article>;
}

function resolveModuleItems(code: string, data: CoreData, records: SectorRecord[]) {
  if (code === "COLLABORATORS_POSITIONS") return [...data.members.map((item) => ({ id: item.id, title: item.user.name, meta: `${item.role} · ${item.status}`, detail: item.user.email })), ...data.positions.map((item) => ({ id: item.id, title: item.labelFr, meta: item.isActive ? "Poste actif" : "Poste inactif", detail: item.positionCode }))].slice(0, 20);
  if (code === "DEPARTMENTS") return data.departments.map((item) => ({ id: item.id, title: item.labelFr, meta: item.isActive ? "Département actif" : "Département inactif", detail: item.departmentCode }));
  if (code === "WORKFLOWS") return data.workflows.map((item) => ({ id: item.id, title: item.labelFr, meta: item.isEnabled ? "Workflow actif" : "Workflow inactif", detail: `Mis à jour le ${item.updatedAt.toLocaleDateString("fr-FR")}` }));
  if (code === "MEETINGS") return data.calendarEvents.map((item) => ({ id: item.id, title: item.title, meta: item.status, detail: item.startDateTime.toLocaleString("fr-FR") }));
  if (code === "AUDIT_LOGS") return data.audits.map((item) => ({ id: item.id, title: item.action, meta: item.entity, detail: item.createdAt.toLocaleString("fr-FR") }));
  if (["INTERNAL_REQUESTS", "TASKS_OPERATIONS", "REPORTS"].includes(code)) return data.requests.map((item) => ({ id: item.id, title: item.title, meta: `${item.status} · ${item.priority}`, detail: item.blockCode }));
  return records.map((item) => ({ id: item.id, title: item.title, meta: item.status, detail: item.summary || `Mis à jour le ${item.updatedAt.toLocaleDateString("fr-FR")}` }));
}
