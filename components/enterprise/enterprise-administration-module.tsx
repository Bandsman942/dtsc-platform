"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Building2, ShieldCheck, ToggleLeft, ToggleRight } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EnterpriseModuleItem = {
  id: string;
  moduleCode: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string | null;
  moduleCategory: string;
  icon: string | null;
  isEnabled: boolean;
  isCore: boolean;
};

type EnterpriseDepartmentItem = {
  id: string;
  departmentCode: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string | null;
  isActive: boolean;
};

type EnterprisePositionItem = {
  id: string;
  positionCode: string;
  labelFr: string;
  labelEn: string;
  hierarchyLevel: number;
  isActive: boolean;
  isKeyPosition: boolean;
  department: { labelFr: string; labelEn: string } | null;
};

type EnterpriseActivityBlockItem = {
  id: string;
  blockCode: string;
  labelFr: string;
  labelEn: string;
  targetModuleCode: string | null;
  isEnabled: boolean;
};

type EnterpriseWorkflowItem = {
  id: string;
  workflowCode: string;
  labelFr: string;
  labelEn: string;
  isEnabled: boolean;
};

type EnterpriseRequestItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  createdBy: { name: string; email: string };
};

export function EnterpriseAdministrationModule({
  organization,
  dashboard,
  modules,
  departments,
  positions,
  activityBlocks,
  workflows,
  recentRequests,
}: {
  organization: {
    id: string;
    name: string;
    sector: string | null;
    sectorCode: string | null;
    businessSector: { labelFr: string; labelEn: string; icon: string | null; color: string | null } | null;
  };
  dashboard: { membersCount: number; activeModulesCount: number; modulesCount: number; openRequestsCount: number; recentRequestsCount: number };
  modules: EnterpriseModuleItem[];
  departments: EnterpriseDepartmentItem[];
  positions: EnterprisePositionItem[];
  activityBlocks: EnterpriseActivityBlockItem[];
  workflows: EnterpriseWorkflowItem[];
  recentRequests: EnterpriseRequestItem[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function toggleModule(module: EnterpriseModuleItem) {
    setMessage("");
    const response = await fetch(`/api/enterprise/${organization.id}/modules/${module.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !module.isEnabled }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Module mis à jour." : body?.message || "Mise à jour impossible.");
    if (response.ok) {
      router.refresh();
    }
  }

  async function createDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/enterprise/${organization.id}/administration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Département enregistré." : body?.message || "Enregistrement impossible.");
    if (response.ok) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <section className="dtsc-panel p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">Administration entreprise</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-dtsc-ink sm:text-4xl">Administration {organization.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-dtsc-muted">
          Modules, postes, activités et workflows isolés pour {organization.name}. Les actions restent limitées à cette organisation.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-cyan-400/14 px-3 py-1 text-xs font-black text-cyan-600">{organization.businessSector?.labelFr || organization.sector || "Secteur à préciser"}</span>
          <span className="rounded-full bg-dtsc-page px-3 py-1 text-xs font-black text-dtsc-muted">{organization.sectorCode || "NO_SECTOR"}</span>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        <Metric label="Collaborateurs" value={dashboard.membersCount} />
        <Metric label="Modules actifs" value={`${dashboard.activeModulesCount}/${dashboard.modulesCount}`} />
        <Metric label="Demandes ouvertes" value={dashboard.openRequestsCount} />
        <Metric label="Postes" value={positions.length} />
        <Metric label="Workflows" value={workflows.length} />
      </section>

      <Accordion>
        <AccordionItem title="Modules entreprise" defaultOpen>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {modules.map((module) => (
              <article key={module.id} className="dtsc-glass-list-item rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{module.moduleCategory}</p>
                    <h3 className="mt-1 text-base font-black text-dtsc-ink">{module.labelFr}</h3>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold text-dtsc-muted">{module.descriptionFr || module.moduleCode}</p>
                  </div>
                  <ActionMenu
                    label="Actions module"
                    items={[
                      {
                        key: "toggle",
                        label: module.isEnabled ? "Désactiver" : "Activer",
                        icon: module.isEnabled ? ToggleLeft : ToggleRight,
                        disabled: module.isCore && module.isEnabled,
                        onSelect: () => void toggleModule(module),
                      },
                    ]}
                  />
                </div>
                <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-[0.68rem] font-black ${module.isEnabled ? "bg-emerald-400/14 text-emerald-500" : "bg-slate-500/14 text-dtsc-muted"}`}>
                  {module.isEnabled ? "Activé" : "Désactivé"} {module.isCore ? "· socle" : ""}
                </span>
              </article>
            ))}
          </div>
        </AccordionItem>

        <AccordionItem title="Collaborateurs, postes et permissions">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {positions.map((position) => (
              <article key={position.id} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/14 text-cyan-600">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="font-black text-dtsc-ink">{position.labelFr}</h3>
                    <p className="text-xs font-bold text-dtsc-muted">{position.department?.labelFr || "Département à assigner"} · niveau {position.hierarchyLevel}</p>
                    {position.isKeyPosition && <span className="mt-2 inline-flex rounded-full bg-cyan-400/14 px-2 py-1 text-[0.68rem] font-black text-cyan-600">Poste clé</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </AccordionItem>

        <AccordionItem title="Départements">
          <form onSubmit={createDepartment} className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 md:grid-cols-2">
            <Input name="departmentCode" placeholder="CODE_DEPARTEMENT" required pattern="[A-Z0-9_]+" />
            <Input name="labelFr" placeholder="Nom du département" required />
            <Input name="labelEn" placeholder="Department name" required />
            <Input name="descriptionFr" placeholder="Description courte" />
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <Building2 className="h-4 w-4" />
              Enregistrer le département
            </Button>
          </form>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {departments.map((department) => (
              <article key={department.id} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{department.departmentCode}</p>
                <h3 className="mt-1 font-black text-dtsc-ink">{department.labelFr}</h3>
                <p className="mt-1 line-clamp-2 text-xs font-semibold text-dtsc-muted">{department.descriptionFr || department.labelEn}</p>
              </article>
            ))}
          </div>
        </AccordionItem>

        <AccordionItem title="Blocs Activités entreprise">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activityBlocks.map((block) => (
              <article key={block.id} className="dtsc-glass-list-item rounded-2xl p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{block.blockCode}</p>
                <h3 className="mt-1 font-black text-dtsc-ink">{block.labelFr}</h3>
                <p className="mt-1 text-xs font-semibold text-dtsc-muted">Cible: {block.targetModuleCode || "Socle commun"}</p>
              </article>
            ))}
          </div>
        </AccordionItem>

        <AccordionItem title="Workflows et historique">
          <div className="grid gap-3 xl:grid-cols-2">
            <div className="space-y-3">
              {workflows.map((workflow) => (
                <article key={workflow.id} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{workflow.workflowCode}</p>
                  <h3 className="mt-1 font-black text-dtsc-ink">{workflow.labelFr}</h3>
                </article>
              ))}
            </div>
            <div className="max-h-96 overflow-y-auto rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
              {recentRequests.map((request) => (
                <article key={request.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
                  <p className="text-xs font-black text-cyan-600">{request.priority} · {request.status}</p>
                  <h3 className="mt-1 font-black text-dtsc-ink">{request.title}</h3>
                  <p className="text-xs text-dtsc-muted">{request.createdBy.name}</p>
                </article>
              ))}
              {!recentRequests.length && <p className="p-4 text-sm font-semibold text-dtsc-muted">Aucune demande récente.</p>}
            </div>
          </div>
        </AccordionItem>
      </Accordion>

      {message && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-bold text-dtsc-blue">{message}</p>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted">{label}</p>
      <p className="mt-2 text-2xl font-black text-dtsc-ink">{value}</p>
    </div>
  );
}
