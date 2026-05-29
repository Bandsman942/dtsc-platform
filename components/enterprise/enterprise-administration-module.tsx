"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Building2, MailPlus, Route, Save, ShieldCheck, SlidersHorizontal, ToggleLeft, ToggleRight, UsersRound } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HealthcareAdminWorkspace, type EnterpriseSectorRecordItem } from "@/components/enterprise/healthcare-admin-workspace";
import { translate } from "@/lib/i18n";

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
  createdAt?: string;
};

type EnterpriseDepartmentItem = {
  id: string;
  departmentCode: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string | null;
  responsibleUserId?: string | null;
  isActive: boolean;
  sortOrder?: number;
};

type EnterprisePositionItem = {
  id: string;
  positionCode: string;
  labelFr: string;
  labelEn: string;
  descriptionFr?: string | null;
  hierarchyLevel: number;
  isActive: boolean;
  isKeyPosition: boolean;
  permissionsJson?: unknown;
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
  descriptionFr?: string | null;
  isEnabled: boolean;
  stepsJson?: unknown;
};

type EnterpriseRequestItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  createdBy: { name: string; email: string };
};

type EnterpriseMemberItem = {
  id: string;
  role: string;
  status: string;
  user: { id: string; name: string; email: string };
};

const healthcareModuleCodes = new Set([
  "PATIENTS",
  "APPOINTMENTS",
  "CONSULTATIONS",
  "MEDICAL_RECORDS",
  "CARE_TEAM",
  "LABORATORY",
  "INTERNAL_PHARMACY",
  "MEDICAL_BILLING",
  "INSURANCE_COVERAGE",
  "QUALITY_INCIDENTS",
  "MEDICAL_DOCUMENTS",
  "MEDICAL_CONFIDENTIALITY",
  "HEALTH_SETTINGS",
  "HEALTH_REPORTS",
]);

const healthcarePermissions = [
  "health.patients.view",
  "health.patients.create",
  "health.patients.update",
  "health.appointments.view",
  "health.appointments.update",
  "health.consultations.view",
  "health.consultations.create",
  "health.consultations.close",
  "health.medical_records.view",
  "health.lab.validate",
  "health.pharmacy.adjust",
  "health.billing.pay",
  "health.insurance.validate",
  "health.incidents.manage",
  "health.documents.download",
  "health.settings.manage",
];

const workflowCategories = [
  "Accueil patient",
  "Consultation",
  "Laboratoire",
  "Pharmacie",
  "Facturation",
  "Assurance / prise en charge",
  "Incident qualité",
  "Confidentialité",
  "Urgence",
  "Administration",
];

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function nestedJsonText(value: unknown, key: string) {
  const objectValue = jsonObject(value);
  const nested = objectValue[key];
  return typeof nested === "string" ? nested : "";
}

export function EnterpriseAdministrationModule({
  organization,
  dashboard,
  modules,
  members,
  departments,
  positions,
  workflows,
  recentRequests,
  sectorRecords,
  locale,
}: {
  organization: {
    id: string;
    name: string;
    sector: string | null;
    sectorCode: string | null;
    country?: string | null;
    city?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    logoUrl?: string | null;
    timezone?: string | null;
    settingsJson?: unknown;
    brandingJson?: unknown;
    businessSector: { labelFr: string; labelEn: string; icon: string | null; color: string | null } | null;
  };
  dashboard: { membersCount: number; activeModulesCount: number; modulesCount: number; openRequestsCount: number; recentRequestsCount: number };
  modules: EnterpriseModuleItem[];
  members: EnterpriseMemberItem[];
  departments: EnterpriseDepartmentItem[];
  positions: EnterprisePositionItem[];
  activityBlocks: EnterpriseActivityBlockItem[];
  workflows: EnterpriseWorkflowItem[];
  recentRequests: EnterpriseRequestItem[];
  sectorRecords: EnterpriseSectorRecordItem[];
  locale?: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const activeMembers = useMemo(() => members.filter((member) => member.status === "ACTIVE"), [members]);
  const pendingMembers = useMemo(() => members.filter((member) => member.status === "INVITED"), [members]);
  const memberNameById = useMemo(() => new Map(activeMembers.map((member) => [member.user.id, member.user.name])), [activeMembers]);
  const visibleModules = useMemo(
    () => modules.filter((enterpriseModule) => enterpriseModule.isCore || organization.sectorCode !== "HEALTH_CARE" || healthcareModuleCodes.has(enterpriseModule.moduleCode)),
    [modules, organization.sectorCode],
  );
  const activeHealthcareModuleCodes = useMemo(() => new Set(modules.filter((enterpriseModule) => enterpriseModule.isEnabled).map((enterpriseModule) => enterpriseModule.moduleCode)), [modules]);
  const settings = jsonObject(organization.settingsJson);
  const healthSettings = jsonObject(settings.health);
  const branding = jsonObject(organization.brandingJson);

  async function submitAdminMutation(event: FormEvent<HTMLFormElement>, successMessage: string) {
    event.preventDefault();
    setMessage("");
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const payload: Record<string, unknown> = Object.fromEntries(formData.entries());
    payload.permissions = formData.getAll("permissions").map(String);
    payload.responsibleUserIds = formData.getAll("responsibleUserIds").map(String).filter(Boolean);
    payload.recipientUserIds = formData.getAll("recipientUserIds").map(String).filter(Boolean);
    payload.isActive = formData.getAll("isActive").includes("on");
    payload.isEnabled = formData.getAll("isEnabled").includes("on") || !formData.has("isEnabled");
    payload.isKeyPosition = formData.getAll("isKeyPosition").includes("on");
    payload.enhancedMedicalPrivacy = formData.getAll("enhancedMedicalPrivacy").includes("on") || !formData.has("enhancedMedicalPrivacy");
    const response = await fetch(`/api/enterprise/${organization.id}/administration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? successMessage : body?.message || "Enregistrement impossible.");
    if (response.ok) {
      formElement.reset();
      router.refresh();
    }
  }

  async function toggleModule(enterpriseModule: EnterpriseModuleItem) {
    setMessage("");
    const response = await fetch(`/api/enterprise/${organization.id}/modules/${enterpriseModule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !enterpriseModule.isEnabled }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Module mis à jour." : body?.message || "Mise à jour impossible.");
    if (response.ok) {
      router.refresh();
    }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const formElement = event.currentTarget;
    const payload = Object.fromEntries(new FormData(formElement).entries());
    const response = await fetch(`/api/enterprise/${organization.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Invitation envoyée. Le collaborateur devra l'accepter avant intégration." : body?.message || "Invitation impossible.");
    if (response.ok) {
      formElement.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <section className="dtsc-panel p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">Administration entreprise</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-dtsc-ink sm:text-4xl">Administration {organization.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-dtsc-muted">
          Modules, postes, permissions, procédures et paramètres isolés pour {organization.name}. Les actions restent limitées à cette organisation.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-cyan-400/14 px-3 py-1 text-xs font-black text-cyan-600">{organization.businessSector?.labelFr || organization.sector || "Secteur à préciser"}</span>
          <span className="rounded-full bg-dtsc-page px-3 py-1 text-xs font-black text-dtsc-muted">{organization.sectorCode || "NO_SECTOR"}</span>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Collaborateurs actifs" value={activeMembers.length} />
        <Metric label="Invitations" value={pendingMembers.length} />
        <Metric label="Modules actifs" value={`${visibleModules.filter((enterpriseModule) => enterpriseModule.isEnabled).length}/${visibleModules.length}`} />
        <Metric label="Demandes ouvertes" value={dashboard.openRequestsCount} />
        <Metric label="Postes" value={positions.length} />
        <Metric label="Workflows" value={workflows.length} />
      </section>

      <Accordion>
        {organization.sectorCode === "HEALTH_CARE" && (
          <AccordionItem title={translate(locale, "enterpriseHealthcare.accordionTitle")} defaultOpen>
            <HealthcareAdminWorkspace
              organizationId={organization.id}
              records={sectorRecords}
              members={activeMembers}
              departments={departments}
              positions={positions}
              activeModuleCodes={activeHealthcareModuleCodes}
              locale={locale}
            />
          </AccordionItem>
        )}

        <AccordionItem title="Modules entreprise" defaultOpen>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleModules.map((enterpriseModule) => (
              <article key={enterpriseModule.id} className="dtsc-glass-list-item rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{enterpriseModule.isCore ? "Socle commun" : organization.businessSector?.labelFr || enterpriseModule.moduleCategory}</p>
                    <h3 className="mt-1 text-base font-black text-dtsc-ink">{enterpriseModule.labelFr}</h3>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold text-dtsc-muted">{enterpriseModule.descriptionFr || enterpriseModule.moduleCode}</p>
                  </div>
                  <ActionMenu
                    label="Actions module"
                    items={[
                      {
                        key: "toggle",
                        label: enterpriseModule.isEnabled ? "Désactiver" : "Activer",
                        icon: enterpriseModule.isEnabled ? ToggleLeft : ToggleRight,
                        disabled: enterpriseModule.isCore && enterpriseModule.isEnabled,
                        onSelect: () => void toggleModule(enterpriseModule),
                      },
                    ]}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`inline-flex rounded-full px-2 py-1 text-[0.68rem] font-black ${enterpriseModule.isEnabled ? "bg-emerald-400/14 text-emerald-500" : "bg-slate-500/14 text-dtsc-muted"}`}>
                    {enterpriseModule.isEnabled ? "Activé" : "Désactivé"} {enterpriseModule.isCore ? "· socle" : ""}
                  </span>
                  {enterpriseModule.createdAt && <span className="inline-flex rounded-full bg-dtsc-page px-2 py-1 text-[0.68rem] font-black text-dtsc-muted">Activation {new Date(enterpriseModule.createdAt).toLocaleDateString("fr-FR")}</span>}
                </div>
              </article>
            ))}
          </div>
        </AccordionItem>

        <AccordionItem title="Collaborateurs, postes et permissions" defaultOpen>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)]">
            <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <div className="flex items-center gap-2">
                <UsersRound className="h-5 w-5 text-cyan-600" />
                <h2 className="text-lg font-black text-dtsc-ink">Collaborateurs</h2>
              </div>
              <form onSubmit={inviteMember} className="mt-4 grid gap-3 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-4 md:grid-cols-[1fr_12rem]">
                <Input name="email" type="email" placeholder="Email d'un utilisateur existant" required />
                <select name="role" defaultValue="MEMBER" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                  <option value="MEMBER">Collaborateur</option>
                  <option value="MANAGER">Manager</option>
                  <option value="GUEST">Invité</option>
                </select>
                <textarea name="message" placeholder="Message d'invitation optionnel" className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink md:col-span-2" />
                <Button className="w-fit rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
                  <MailPlus className="h-4 w-4" />
                  Inviter un collaborateur existant
                </Button>
              </form>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {pendingMembers.map((member) => (
                  <MemberCard key={member.id} member={member} statusLabel="Invitation en attente" />
                ))}
                {activeMembers.map((member) => (
                  <MemberCard key={member.id} member={member} statusLabel="Actif" />
                ))}
                {!members.length && <EmptyState text="Aucun collaborateur ou invitation pour cette entreprise." />}
              </div>
            </section>

            <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-cyan-600" />
                <h2 className="text-lg font-black text-dtsc-ink">Postes & permissions</h2>
              </div>
              <form onSubmit={(event) => void submitAdminMutation(event, "Poste enregistré.")} className="mt-4 grid gap-3">
                <input type="hidden" name="entityType" value="position" />
                <Input name="positionCode" placeholder="CODE_POSTE" required pattern="[A-Z0-9_]+" />
                <Input name="labelFr" placeholder="Nom du poste" required />
                <Input name="labelEn" placeholder="Position name" required />
                <select name="departmentId" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                  <option value="">Département par défaut</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.labelFr}</option>)}
                </select>
                <Input name="hierarchyLevel" type="number" placeholder="Niveau hiérarchique" defaultValue="50" />
                <textarea name="descriptionFr" placeholder="Description du poste" className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" />
                <input type="hidden" name="isActive" value="off" />
                <input type="hidden" name="isKeyPosition" value="off" />
                <label className="flex items-center gap-2 text-sm font-bold text-dtsc-ink"><input name="isKeyPosition" type="checkbox" /> Poste clé</label>
                <label className="flex items-center gap-2 text-sm font-bold text-dtsc-ink"><input name="isActive" type="checkbox" defaultChecked /> Poste actif</label>
                <div className="max-h-44 overflow-y-auto rounded-2xl border border-dtsc-border bg-dtsc-surface p-3">
                  {healthcarePermissions.map((permission) => (
                    <label key={permission} className="mb-2 flex items-center gap-2 text-xs font-bold text-dtsc-ink">
                      <input name="permissions" value={permission} type="checkbox" />
                      {permission}
                    </label>
                  ))}
                </div>
                <Button className="w-fit rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
                  <Save className="h-4 w-4" />
                  Enregistrer le poste
                </Button>
              </form>
            </section>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {positions.map((position) => (
              <article key={position.id} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{position.positionCode}</p>
                <h3 className="mt-1 font-black text-dtsc-ink">{position.labelFr}</h3>
                <p className="text-xs font-bold text-dtsc-muted">{position.department?.labelFr || "Département à assigner"} · niveau {position.hierarchyLevel}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={`rounded-full px-2 py-1 text-[0.68rem] font-black ${position.isActive ? "bg-emerald-400/14 text-emerald-600" : "bg-slate-500/14 text-dtsc-muted"}`}>{position.isActive ? "Actif" : "Inactif"}</span>
                  {position.isKeyPosition && <span className="rounded-full bg-cyan-400/14 px-2 py-1 text-[0.68rem] font-black text-cyan-600">Poste clé</span>}
                </div>
              </article>
            ))}
          </div>
        </AccordionItem>

        <AccordionItem title="Départements">
          <EnterpriseFormDialogCard title="Manager les départements" description="Créez ou mettez à jour les départements de cette entreprise dans une vue dédiée." buttonLabel="Ouvrir le formulaire département" icon={<Building2 className="h-4 w-4" />}>
          <form onSubmit={(event) => void submitAdminMutation(event, "Département enregistré.")} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="entityType" value="department" />
            <Input name="departmentCode" placeholder="CODE_DEPARTEMENT" required pattern="[A-Z0-9_]+" />
            <Input name="labelFr" placeholder="Nom du département" required />
            <Input name="labelEn" placeholder="Department name" required />
            <select name="responsibleUserId" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              <option value="">Responsable optionnel</option>
              {activeMembers.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name}</option>)}
            </select>
            <Input name="sortOrder" type="number" placeholder="Ordre d'affichage" defaultValue="0" />
            <Input name="descriptionFr" placeholder="Description courte" />
            <input type="hidden" name="isActive" value="off" />
            <label className="flex items-center gap-2 text-sm font-bold text-dtsc-ink"><input name="isActive" type="checkbox" defaultChecked /> Département actif</label>
            <Button className="w-fit rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <Building2 className="h-4 w-4" />
              Enregistrer le département
            </Button>
          </form>
          </EnterpriseFormDialogCard>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {departments.map((department) => (
              <article key={department.id} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{department.departmentCode}</p>
                  <h3 className="mt-1 font-black text-dtsc-ink">{department.labelFr}</h3>
                  <p className="mt-1 line-clamp-2 text-xs font-semibold text-dtsc-muted">{department.descriptionFr || department.labelEn}</p>
                  <p className="mt-3 text-xs font-bold text-dtsc-muted">
                    Responsable: {department.responsibleUserId ? memberNameById.get(department.responsibleUserId) || "Membre non disponible" : "Non assigné"}
                  </p>
                </article>
              ))}
          </div>
        </AccordionItem>

        <AccordionItem title="Workflows / Procédures">
          <EnterpriseFormDialogCard title="Workflows / Procédures" description="Créez une procédure interne, assignez des responsables et partagez-la aux collaborateurs concernés." buttonLabel="Ouvrir le formulaire workflow" icon={<Route className="h-4 w-4" />}>
          <form onSubmit={(event) => void submitAdminMutation(event, "Workflow enregistré et partagé si des destinataires ont été sélectionnés.")} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="entityType" value="workflow" />
            <Input name="workflowCode" placeholder="CODE_WORKFLOW" required pattern="[A-Z0-9_]+" />
            <Input name="labelFr" placeholder="Titre de la procédure" required />
            <Input name="labelEn" placeholder="Procedure title" required />
            <select name="category" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              {workflowCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select name="departmentId" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              <option value="">Département concerné</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.labelFr}</option>)}
            </select>
            <Input name="recommendedDelay" placeholder="Délai recommandé" />
            <select name="status" defaultValue="ACTIVE" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              <option value="DRAFT">Brouillon</option>
              <option value="ACTIVE">Actif</option>
              <option value="SHARED">Partagé</option>
              <option value="ARCHIVED">Archivé</option>
            </select>
            <textarea name="descriptionFr" placeholder="Description" className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink md:col-span-2" />
            <textarea name="steps" placeholder="Étapes, une par ligne" className="min-h-32 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink md:col-span-2" />
            <textarea name="documents" placeholder="Documents liés ou références internes" className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink md:col-span-2" />
            <UserMultiSelect name="responsibleUserIds" label="Responsables" members={activeMembers} />
            <UserMultiSelect name="recipientUserIds" label="Collaborateurs destinataires" members={activeMembers} />
            <input type="hidden" name="isEnabled" value="off" />
            <label className="flex items-center gap-2 text-sm font-bold text-dtsc-ink"><input name="isEnabled" type="checkbox" defaultChecked /> Workflow actif</label>
            <Button className="w-fit rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <Route className="h-4 w-4" />
              Enregistrer le workflow
            </Button>
          </form>
          </EnterpriseFormDialogCard>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {workflows.map((workflow) => (
              <article key={workflow.id} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{workflow.workflowCode}</p>
                <h3 className="mt-1 font-black text-dtsc-ink">{workflow.labelFr}</h3>
                <p className="mt-1 line-clamp-2 text-xs font-semibold text-dtsc-muted">{workflow.descriptionFr || "Procédure interne entreprise."}</p>
              </article>
            ))}
          </div>
        </AccordionItem>

        <AccordionItem title="Paramètres entreprise">
          <EnterpriseFormDialogCard title="Paramètres entreprise" description="Modifiez les paramètres généraux et santé persistés pour cette entreprise." buttonLabel="Ouvrir les paramètres entreprise" icon={<SlidersHorizontal className="h-4 w-4" />}>
          <form onSubmit={(event) => void submitAdminMutation(event, "Paramètres entreprise enregistrés.")} className="grid gap-4">
            <input type="hidden" name="entityType" value="settings" />
            <section className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 md:grid-cols-2">
              <h3 className="md:col-span-2 text-sm font-black uppercase tracking-[0.14em] text-cyan-600">Paramètres généraux</h3>
              <Input name="displayName" defaultValue={organization.name} placeholder="Nom affiché" required />
              <Input name="logoUrl" defaultValue={organization.logoUrl || ""} placeholder="URL logo" />
              <Input name="primaryColor" defaultValue={nestedJsonText(branding, "primaryColor")} placeholder="Couleur principale" />
              <Input name="country" defaultValue={organization.country || ""} placeholder="Pays" />
              <Input name="city" defaultValue={organization.city || ""} placeholder="Ville" />
              <Input name="address" defaultValue={organization.address || ""} placeholder="Adresse" />
              <Input name="phone" defaultValue={organization.phone || ""} placeholder="Téléphone" />
              <Input name="email" defaultValue={organization.email || ""} placeholder="Email principal" />
              <select name="defaultLanguage" defaultValue={nestedJsonText(settings, "defaultLanguage") || "fr"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
              <Input name="timezone" defaultValue={organization.timezone || "Africa/Kinshasa"} placeholder="Fuseau horaire" />
            </section>
            <section className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 md:grid-cols-2">
              <h3 className="md:col-span-2 text-sm font-black uppercase tracking-[0.14em] text-cyan-600">Paramètres santé</h3>
              <select name="establishmentType" defaultValue={nestedJsonText(healthSettings, "establishmentType") || "CLINIC"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                <option value="CABINET">Cabinet</option>
                <option value="CLINIC">Clinique</option>
                <option value="HOSPITAL">Hôpital</option>
                <option value="MEDICAL_CENTER">Centre médical</option>
              </select>
              <Input name="patientPrefix" defaultValue={nestedJsonText(healthSettings, "patientPrefix") || "PAT-"} placeholder="Préfixe patient" />
              <Input name="invoicePrefix" defaultValue={nestedJsonText(healthSettings, "invoicePrefix") || "FAC-"} placeholder="Préfixe facture" />
              <Input name="consultationLockHours" type="number" defaultValue={String(healthSettings.consultationLockHours || 48)} placeholder="Verrouillage consultation clôturée" />
              <Input name="activeServices" defaultValue={nestedJsonText(healthSettings, "activeServices")} placeholder="Services actifs" />
              <Input name="medicalRecordRoles" defaultValue={nestedJsonText(healthSettings, "medicalRecordRoles")} placeholder="Rôles dossier médical" />
              <Input name="closeConsultationRoles" defaultValue={nestedJsonText(healthSettings, "closeConsultationRoles")} placeholder="Rôles clôture consultation" />
              <Input name="reopenConsultationRoles" defaultValue={nestedJsonText(healthSettings, "reopenConsultationRoles")} placeholder="Rôles réouverture consultation" />
              <Input name="labValidationRoles" defaultValue={nestedJsonText(healthSettings, "labValidationRoles")} placeholder="Rôles validation labo" />
              <Input name="pharmacyAlertOptions" defaultValue={nestedJsonText(healthSettings, "pharmacyAlertOptions")} placeholder="Alertes pharmacie" />
              <Input name="laboratoryAlertOptions" defaultValue={nestedJsonText(healthSettings, "laboratoryAlertOptions")} placeholder="Alertes laboratoire" />
              <Input name="criticalIncidentOptions" defaultValue={nestedJsonText(healthSettings, "criticalIncidentOptions")} placeholder="Incidents critiques" />
              <input type="hidden" name="enhancedMedicalPrivacy" value="off" />
              <label className="flex items-center gap-2 text-sm font-bold text-dtsc-ink"><input name="enhancedMedicalPrivacy" type="checkbox" defaultChecked={healthSettings.enhancedMedicalPrivacy !== false} /> Confidentialité médicale renforcée</label>
            </section>
            <Button className="w-fit rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <SlidersHorizontal className="h-4 w-4" />
              Enregistrer les paramètres
            </Button>
          </form>
          </EnterpriseFormDialogCard>
        </AccordionItem>
      </Accordion>

      {recentRequests.length > 0 && (
        <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <h2 className="text-lg font-black text-dtsc-ink">Historique récent</h2>
          <div className="mt-3 grid gap-2">
            {recentRequests.map((request) => (
              <article key={request.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
                <p className="text-xs font-black text-cyan-600">{request.priority} · {request.status}</p>
                <h3 className="mt-1 font-black text-dtsc-ink">{request.title}</h3>
                <p className="text-xs text-dtsc-muted">{request.createdBy.name}</p>
              </article>
            ))}
          </div>
        </section>
      )}

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

function MemberCard({ member, statusLabel }: { member: EnterpriseMemberItem; statusLabel: string }) {
  return (
    <article className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{member.role} · {statusLabel}</p>
      <h3 className="mt-1 font-black text-dtsc-ink">{member.user.name}</h3>
      <p className="text-xs font-semibold text-dtsc-muted">{member.user.email}</p>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm font-semibold text-dtsc-muted">{text}</p>;
}

function EnterpriseFormDialogCard({
  title,
  description,
  buttonLabel,
  icon,
  children,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
        <p className="text-sm font-semibold leading-6 text-dtsc-muted">{description}</p>
        <Button type="button" onClick={() => setOpen(true)} className="mt-4 w-fit rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          {icon}
          {buttonLabel}
        </Button>
      </div>
      <Dialog open={open} title={title} description={description} onClose={() => setOpen(false)} className="h-[92dvh] max-w-6xl">
        {children}
      </Dialog>
    </>
  );
}

function UserMultiSelect({ name, label, members }: { name: string; label: string; members: EnterpriseMemberItem[] }) {
  return (
    <label className="grid gap-1 text-sm font-black text-dtsc-ink">
      <span className="text-xs uppercase tracking-[0.14em] text-dtsc-muted">{label}</span>
      <select name={name} multiple className="min-h-36 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm font-semibold text-dtsc-ink">
        {members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name}</option>)}
      </select>
      <span className="text-xs font-semibold text-dtsc-muted">Maintenez Ctrl ou Cmd pour sélectionner plusieurs collaborateurs.</span>
    </label>
  );
}
