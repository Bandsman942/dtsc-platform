"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Building2, CalendarDays, ExternalLink, MailPlus, Route, Save, ShieldCheck, SlidersHorizontal, ToggleLeft, ToggleRight, UsersRound } from "lucide-react";
import { HealthcareAdminWorkspace } from "@/components/enterprise/healthcare-admin-workspace";
import { PharmacyAdminWorkspace } from "@/components/enterprise/pharmacy-admin-workspace";
import { AccordionItem } from "@/components/ui/accordion";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type {
  EnterpriseAdminDashboard,
  EnterpriseAdminOrganization,
  EnterpriseCalendarEventItem,
  EnterpriseDepartmentItem,
  EnterpriseMemberItem,
  EnterpriseModuleItem,
  EnterprisePositionItem,
  EnterpriseRequestItem,
  EnterpriseSaasEntitlements,
  EnterpriseSectorRecordItem,
  EnterpriseWorkflowItem,
} from "@/lib/enterprise/enterprise-admin-types";
import { translate } from "@/lib/i18n";

export const healthcareModuleCodes = new Set([
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

export const pharmacyModuleCodes = new Set([
  "MEDICINES_PRODUCTS", "BATCH_EXPIRY", "STOCK_INVENTORY", "STOCK_RECEIPTS", "SALES_DISPENSATION", "PRESCRIPTIONS", "SUPPLIERS_ORDERS",
  "CASH_INVOICES_PAYMENTS", "RETURNS_ADJUSTMENTS_LOSSES", "ALERTS_EXPIRY_LOW_STOCK", "QUALITY_PHARMACOVIGILANCE", "PHARMACY_DOCUMENTS", "PHARMACY_REPORTS", "PHARMACY_SETTINGS",
]);

const healthcarePermissions = [
  "health.patients.view",
  "health.patients.create",
  "health.patients.update",
  "health.patients.archive",
  "health.patients.view_sensitive",
  "health.appointments.view",
  "health.appointments.create",
  "health.appointments.update",
  "health.appointments.confirm",
  "health.appointments.cancel",
  "health.appointments.mark_absent",
  "health.appointments.mark_in_progress",
  "health.appointments.complete",
  "health.appointments.convert_to_consultation",
  "health.appointments.view_sensitive",
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
const pharmacyPermissions = [
  "pharmacy.products.view", "pharmacy.products.create", "pharmacy.products.update", "pharmacy.products.archive",
  "pharmacy.batches.view", "pharmacy.batches.create", "pharmacy.batches.update", "pharmacy.batches.quarantine", "pharmacy.batches.recall",
  "pharmacy.stock.view", "pharmacy.stock.inventory", "pharmacy.stock.adjust", "pharmacy.receipts.create", "pharmacy.receipts.validate",
  "pharmacy.sales.view", "pharmacy.sales.create", "pharmacy.sales.validate", "pharmacy.sales.cancel",
  "pharmacy.prescriptions.view", "pharmacy.prescriptions.validate", "pharmacy.suppliers.view", "pharmacy.purchase_orders.validate",
  "pharmacy.cash.view", "pharmacy.cash.close", "pharmacy.adjustments.validate", "pharmacy.alerts.manage", "pharmacy.quality.manage",
  "pharmacy.documents.view", "pharmacy.reports.view", "pharmacy.settings.update",
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

type AdminMutationHandler = (event: FormEvent<HTMLFormElement>, successMessage: string) => void | Promise<void>;
type InviteMemberHandler = (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
type ToggleModuleHandler = (enterpriseModule: EnterpriseModuleItem) => void | Promise<void>;

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function nestedJsonText(value: unknown, key: string) {
  const objectValue = jsonObject(value);
  const nested = objectValue[key];
  return typeof nested === "string" ? nested : "";
}

export function EnterpriseDashboardSummary({
  organization,
  dashboard,
  entitlements,
  activeMembers,
  pendingMembers,
  visibleModules,
}: {
  organization: EnterpriseAdminOrganization;
  dashboard: EnterpriseAdminDashboard;
  entitlements: EnterpriseSaasEntitlements;
  activeMembers: EnterpriseMemberItem[];
  pendingMembers: EnterpriseMemberItem[];
  visibleModules: EnterpriseModuleItem[];
}) {
  return (
    <>
      <section className="dtsc-panel p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">Administration entreprise</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-dtsc-ink sm:text-4xl">Administration {organization.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-dtsc-muted">
          Modules, postes, permissions, procédures et paramètres isolés pour {organization.name}. Les actions restent limitées à cette organisation.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-cyan-400/14 px-3 py-1 text-xs font-black text-cyan-600">{organization.businessSector?.labelFr || organization.sector || "Secteur à préciser"}</span>
          <span className="rounded-full bg-dtsc-page px-3 py-1 text-xs font-black text-dtsc-muted">{organization.sectorCode || "NO_SECTOR"}</span>
          <span className="rounded-full bg-dtsc-page px-3 py-1 text-xs font-black text-dtsc-muted">Plan {entitlements.planLabel}</span>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${entitlements.subscriptionActive ? "bg-emerald-400/14 text-emerald-600" : "bg-amber-400/18 text-amber-700"}`}>
            {entitlements.subscriptionActive ? "Abonnement actif" : `Statut ${entitlements.subscriptionStatus}`}
          </span>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label="Collaborateurs actifs" value={activeMembers.length} />
        <Metric label="Limite utilisateurs" value={entitlements.limits.maxUsers} />
        <Metric label="Modules actifs" value={`${visibleModules.filter((enterpriseModule) => enterpriseModule.isEnabled).length}/${visibleModules.length}`} />
        <Metric label="Limite modules" value={entitlements.limits.maxActiveModules} />
        <Metric label="Demandes ouvertes" value={dashboard.openRequestsCount} />
        <Metric label="Invitations" value={pendingMembers.length} />
        <Metric label="Tâches ouvertes" value={dashboard.openTasksCount} />
        <Metric label="Tâches en retard" value={dashboard.overdueTasksCount} />
        <Metric label="Validations en attente" value={dashboard.pendingValidationsCount} />
        <Metric label="Documents récents" value={dashboard.recentDocumentsCount} />
        <Metric label="Budgets actifs" value={dashboard.activeBudgetsCount} />
        <Metric label="Fournisseurs actifs" value={dashboard.activeSuppliersCount} />
      </section>
    </>
  );
}

export function EnterpriseHealthcareSection({
  organizationId,
  sectorCode,
  sectorRecords,
  activeMembers,
  departments,
  positions,
  activeHealthcareModuleCodes,
  locale,
}: {
  organizationId: string;
  sectorCode: string | null;
  sectorRecords: EnterpriseSectorRecordItem[];
  activeMembers: EnterpriseMemberItem[];
  departments: EnterpriseDepartmentItem[];
  positions: EnterprisePositionItem[];
  activeHealthcareModuleCodes: Set<string>;
  locale?: string | null;
}) {
  if (sectorCode !== "HEALTH_CARE") {
    return null;
  }

  return (
    <AccordionItem title={translate(locale, "enterpriseHealthcare.accordionTitle")} defaultOpen>
      <HealthcareAdminWorkspace
        organizationId={organizationId}
        records={sectorRecords}
        members={activeMembers}
        departments={departments}
        positions={positions}
        activeModuleCodes={activeHealthcareModuleCodes}
        locale={locale}
      />
    </AccordionItem>
  );
}

export function EnterprisePharmacySection({
  organizationId, sectorCode, sectorRecords, activeMembers, departments, activePharmacyModuleCodes,
}: {
  organizationId: string; sectorCode: string | null; sectorRecords: EnterpriseSectorRecordItem[]; activeMembers: EnterpriseMemberItem[]; departments: EnterpriseDepartmentItem[]; activePharmacyModuleCodes: Set<string>;
}) {
  if (sectorCode !== "PHARMACY") return null;
  return <AccordionItem title="Pharmacie - sous-modules métier" defaultOpen><PharmacyAdminWorkspace organizationId={organizationId} records={sectorRecords} members={activeMembers} departments={departments} activeModuleCodes={activePharmacyModuleCodes} /></AccordionItem>;
}

export function EnterpriseModulesPanel({
  organization,
  visibleModules,
  toggleModule,
}: {
  organization: EnterpriseAdminOrganization;
  visibleModules: EnterpriseModuleItem[];
  toggleModule: ToggleModuleHandler;
}) {
  return (
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
                    key: "open",
                    label: "Ouvrir le module",
                    icon: ExternalLink,
                    disabled: !enterpriseModule.isEnabled || enterpriseModule.accessAllowed === false,
                    onSelect: () => window.location.assign(`/enterprise-modules/${encodeURIComponent(enterpriseModule.moduleCode)}`),
                  },
                  {
                    key: "toggle",
                    label: enterpriseModule.isEnabled ? "Désactiver" : "Activer",
                    icon: enterpriseModule.isEnabled ? ToggleLeft : ToggleRight,
                    disabled: (enterpriseModule.isCore && enterpriseModule.isEnabled) || (!enterpriseModule.isEnabled && enterpriseModule.accessAllowed === false),
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
              {enterpriseModule.requiredPlan && <span className="inline-flex rounded-full bg-dtsc-page px-2 py-1 text-[0.68rem] font-black text-dtsc-muted">Plan {enterpriseModule.requiredPlan}</span>}
              {enterpriseModule.accessAllowed === false && <span className="inline-flex rounded-full bg-amber-400/18 px-2 py-1 text-[0.68rem] font-black text-amber-700">Non inclus</span>}
            </div>
            {enterpriseModule.accessAllowed === false && enterpriseModule.accessMessage && (
              <p className="mt-3 rounded-xl bg-amber-400/12 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">{enterpriseModule.accessMessage}</p>
            )}
          </article>
        ))}
      </div>
    </AccordionItem>
  );
}

export function EnterpriseCalendarPanel({
  organizationName,
  calendarEvents,
  locale,
}: {
  organizationName: string;
  calendarEvents: EnterpriseCalendarEventItem[];
  locale?: string | null;
}) {
  return (
    <AccordionItem title={translate(locale, "enterpriseCalendar.title")}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{translate(locale, "enterpriseCalendar.eyebrow")}</p>
              <h2 className="mt-1 text-lg font-black text-dtsc-ink">{translate(locale, "enterpriseCalendar.eventsTitle")} {organizationName}</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-dtsc-muted">{translate(locale, "enterpriseCalendar.description")}</p>
            </div>
            <Button asChild className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <a href="/calendar">
                <CalendarDays className="h-4 w-4" />
                {translate(locale, "enterpriseCalendar.open")}
              </a>
            </Button>
          </div>
          <div className="mt-4 grid gap-3">
            {calendarEvents.map((event) => (
              <article key={event.id} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{event.eventType} · {event.priority}</p>
                    <h3 className="mt-1 truncate text-base font-black text-dtsc-ink">{event.title}</h3>
                    <p className="mt-1 text-xs font-semibold text-dtsc-muted">
                      {new Date(event.startDateTime).toLocaleString("fr-FR")} - {new Date(event.endDateTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className="rounded-full bg-cyan-400/14 px-2 py-1 text-[0.68rem] font-black text-cyan-600">{event.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-dtsc-page px-2 py-1 text-[0.68rem] font-black text-dtsc-muted">{event.visibility}</span>
                  <span className="rounded-full bg-dtsc-page px-2 py-1 text-[0.68rem] font-black text-dtsc-muted">{event.participants?.length || 0} participant(s)</span>
                </div>
              </article>
            ))}
            {!calendarEvents.length && <EmptyState text={translate(locale, "enterpriseCalendar.empty")} />}
          </div>
        </section>
        <aside className="rounded-2xl border border-cyan-300/25 bg-cyan-400/10 p-4">
          <CalendarDays className="h-6 w-6 text-cyan-600" />
          <h3 className="mt-3 font-black text-dtsc-ink">{translate(locale, "enterpriseCalendar.privacyTitle")}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-dtsc-muted">{translate(locale, "enterpriseCalendar.privacyDescription")}</p>
        </aside>
      </div>
    </AccordionItem>
  );
}

export function EnterpriseMembersPanel({
  members,
  pendingMembers,
  activeMembers,
  inviteMember,
}: {
  members: EnterpriseMemberItem[];
  pendingMembers: EnterpriseMemberItem[];
  activeMembers: EnterpriseMemberItem[];
  inviteMember: InviteMemberHandler;
}) {
  return (
    <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
      <div className="flex items-center gap-2">
        <UsersRound className="h-5 w-5 text-cyan-600" />
        <h2 className="text-lg font-black text-dtsc-ink">Collaborateurs</h2>
      </div>
      <form onSubmit={(event) => void inviteMember(event)} className="mt-4 grid gap-3 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-4 md:grid-cols-[1fr_12rem]">
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
  );
}

export function EnterprisePositionsPanel({
  sectorCode,
  departments,
  positions,
  submitAdminMutation,
}: {
  sectorCode?: string | null;
  departments: EnterpriseDepartmentItem[];
  positions: EnterprisePositionItem[];
  submitAdminMutation: AdminMutationHandler;
}) {
  return (
    <>
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
            {(sectorCode === "PHARMACY" ? pharmacyPermissions : healthcarePermissions).map((permission) => (
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
    </>
  );
}

export function EnterpriseDepartmentsPanel({
  departments,
  activeMembers,
  memberNameById,
  submitAdminMutation,
}: {
  departments: EnterpriseDepartmentItem[];
  activeMembers: EnterpriseMemberItem[];
  memberNameById: Map<string, string>;
  submitAdminMutation: AdminMutationHandler;
}) {
  return (
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
  );
}

export function EnterpriseWorkflowsPanel({
  sectorCode,
  workflows,
  departments,
  activeMembers,
  submitAdminMutation,
}: {
  sectorCode?: string | null;
  workflows: EnterpriseWorkflowItem[];
  departments: EnterpriseDepartmentItem[];
  activeMembers: EnterpriseMemberItem[];
  submitAdminMutation: AdminMutationHandler;
}) {
  return (
    <AccordionItem title="Workflows / Procédures">
      <EnterpriseFormDialogCard title="Workflows / Procédures" description="Créez une procédure interne, assignez des responsables et partagez-la aux collaborateurs concernés." buttonLabel="Ouvrir le formulaire workflow" icon={<Route className="h-4 w-4" />}>
        <form onSubmit={(event) => void submitAdminMutation(event, "Workflow enregistré et partagé si des destinataires ont été sélectionnés.")} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="entityType" value="workflow" />
          <Input name="workflowCode" placeholder="CODE_WORKFLOW" required pattern="[A-Z0-9_]+" />
          <Input name="labelFr" placeholder="Titre de la procédure" required />
          <Input name="labelEn" placeholder="Procedure title" required />
          <select name="category" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
            {(sectorCode === "PHARMACY" ? ["Vente comptoir", "Réception stock", "Inventaire", "Gestion péremptions", "Réapprovisionnement", "Gestion retour client", "Gestion rappel de lot", "Caisse", "Incident qualité", "Ordonnance / prescription", "Conservation / stockage", "Administration"] : workflowCategories).map((category) => <option key={category} value={category}>{category}</option>)}
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
  );
}

export function EnterpriseBrandingSettingsPanel({
  sectorCode,
  organization,
  submitAdminMutation,
}: {
  sectorCode?: string | null;
  organization: EnterpriseAdminOrganization;
  submitAdminMutation: AdminMutationHandler;
}) {
  const settings = jsonObject(organization.settingsJson);
  const healthSettings = jsonObject(settings.health);
  const pharmacySettings = jsonObject(settings.pharmacy);
  const branding = jsonObject(organization.brandingJson);

  return (
    <AccordionItem title="Paramètres entreprise">
      <EnterpriseFormDialogCard title="Paramètres entreprise" description="Modifiez les paramètres généraux et santé persistés pour cette entreprise." buttonLabel="Ouvrir les paramètres entreprise" icon={<SlidersHorizontal className="h-4 w-4" />}>
        <form onSubmit={(event) => void submitAdminMutation(event, "Paramètres entreprise enregistrés.")} className="grid gap-4">
          <input type="hidden" name="entityType" value="settings" />
          <section className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 md:grid-cols-2">
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-cyan-600 md:col-span-2">Paramètres généraux</h3>
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
          {sectorCode === "PHARMACY" ? <section className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 md:grid-cols-2">
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-emerald-600 md:col-span-2">Paramètres pharmacie</h3>
            <Input name="pharmacyType" defaultValue={nestedJsonText(pharmacySettings, "pharmacyType")} placeholder="Officine, pharmacie interne, dépôt léger..." />
            <Input name="pharmacyCurrency" defaultValue={nestedJsonText(pharmacySettings, "currency") || "USD"} placeholder="Devise" />
            <Input name="pharmacySalePrefix" defaultValue={nestedJsonText(pharmacySettings, "salePrefix") || "VTE-"} placeholder="Préfixe vente" />
            <Input name="pharmacyOrderPrefix" defaultValue={nestedJsonText(pharmacySettings, "orderPrefix") || "CMD-"} placeholder="Préfixe commande" />
            <Input name="pharmacyReceiptPrefix" defaultValue={nestedJsonText(pharmacySettings, "receiptPrefix") || "REC-"} placeholder="Préfixe réception" />
            <Input name="pharmacyExpiryAlertDays" type="number" defaultValue={String(pharmacySettings.expiryAlertDays || 90)} placeholder="Alerte péremption en jours" />
            <input type="hidden" name="pharmacyFefoEnabled" value="off" />
            <label className="flex items-center gap-2 text-sm font-bold text-dtsc-ink"><input name="pharmacyFefoEnabled" type="checkbox" defaultChecked={pharmacySettings.fefoEnabled !== false} /> Rotation FEFO activée</label>
            <input type="hidden" name="pharmacyNegativeStockBlocked" value="off" />
            <label className="flex items-center gap-2 text-sm font-bold text-dtsc-ink"><input name="pharmacyNegativeStockBlocked" type="checkbox" defaultChecked={pharmacySettings.negativeStockBlocked !== false} /> Bloquer le stock négatif</label>
          </section> : <section className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 md:grid-cols-2">
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-cyan-600 md:col-span-2">Paramètres santé</h3>
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
          </section>}
          <Button className="w-fit rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
            <SlidersHorizontal className="h-4 w-4" />
            Enregistrer les paramètres
          </Button>
        </form>
      </EnterpriseFormDialogCard>
    </AccordionItem>
  );
}

export function EnterpriseRecentRequestsPanel({ recentRequests }: { recentRequests: EnterpriseRequestItem[] }) {
  if (!recentRequests.length) {
    return null;
  }

  return (
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
    <div className="grid gap-1 text-sm font-black text-dtsc-ink">
      <span className="text-xs uppercase tracking-[0.14em] text-dtsc-muted">{label}</span>
      <div className="max-h-44 min-h-32 overflow-y-auto rounded-xl border border-dtsc-border bg-dtsc-surface p-2">
        {members.length > 0 ? (
          <div className="grid gap-2">
            {members.map((member) => (
              <label key={member.user.id} className="flex min-w-0 items-start gap-2 rounded-xl bg-dtsc-page px-3 py-2 text-sm font-semibold text-dtsc-ink">
                <input name={name} value={member.user.id} type="checkbox" className="mt-1 h-4 w-4 rounded border-dtsc-border text-cyan-500" />
                <span className="min-w-0">
                  <span className="block truncate">{member.user.name}</span>
                  <span className="block truncate text-xs text-dtsc-muted">{member.user.email}</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-dtsc-page px-3 py-2 text-sm font-semibold text-dtsc-muted">Aucun collaborateur actif disponible.</p>
        )}
      </div>
      <span className="text-xs font-semibold text-dtsc-muted">Cochez les collaborateurs concernés par ce workflow.</span>
    </div>
  );
}
