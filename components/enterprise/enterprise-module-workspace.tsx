import Link from "next/link";
import { ArrowRight, Building2, CalendarDays, ClipboardList, Settings, UsersRound } from "lucide-react";
import { EnterpriseApprovalsWorkspace } from "@/components/enterprise/core-v2/enterprise-approvals-workspace";
import { EnterpriseDocumentsWorkspace } from "@/components/enterprise/core-v2/enterprise-documents-workspace";
import { EnterpriseFinanceWorkspace } from "@/components/enterprise/core-v2/enterprise-finance-workspace";
import { EnterpriseMeetingsWorkspace } from "@/components/enterprise/core-v2/enterprise-meetings-workspace";
import { EnterprisePurchasesWorkspace } from "@/components/enterprise/core-v2/enterprise-purchases-workspace";
import { EnterpriseReportsWorkspace } from "@/components/enterprise/core-v2/enterprise-reports-workspace";
import { EnterpriseRequestsWorkspace } from "@/components/enterprise/core-v2/enterprise-requests-workspace";
import { EnterpriseSuppliersWorkspace } from "@/components/enterprise/core-v2/enterprise-suppliers-workspace";
import { EnterpriseTasksWorkspace } from "@/components/enterprise/core-v2/enterprise-tasks-workspace";
import { EnterpriseWorkflowsWorkspace } from "@/components/enterprise/core-v2/enterprise-workflows-workspace";
import { EnterpriseCoreWorkspace } from "@/components/enterprise/enterprise-core-workspace";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { ENTERPRISE_CORE_MODULES, isEnterpriseCoreModuleCode } from "@/lib/enterprise/enterprise-core";
import type { EnterpriseNavigationModule } from "@/lib/enterprise/enterprise-navigation";
import { ENTERPRISE_MODULE_GUIDE_MAP, getIteration04UserGuide } from "@/lib/user-guides/iteration04-guides";
import { getIteration06UserGuide } from "@/lib/user-guides/iteration06-guides";

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
type LegacyCoreRecord = {
  id: string;
  moduleCode: string;
  recordType: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedToUserId: string | null;
  validatorUserId: string | null;
  dueAt: string | null;
  sourceModule: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  updatedAt: string;
  events: Array<{ id: string; summary: string; eventType: string; createdAt: string }>;
  comments: Array<{ id: string; content: string; createdAt: string }>;
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
  coreRecords: LegacyCoreRecord[];
}) {
  const isEnglish = locale === "en";
  const activeMembers = coreData.members.filter((member) => member.status === "ACTIVE");
  const openRequests = coreData.requests.filter((request) => !["CLOSED", "CANCELLED", "REJECTED", "RESOLVED"].includes(request.status));
  const upcomingMeetings = coreData.calendarEvents.filter((event) => event.startDateTime >= new Date() && !["CANCELLED", "CLOSED"].includes(event.status));
  const moduleItems = resolveModuleItems(enterpriseModule.code, coreData, records);
  const commonDefinition = isEnterpriseCoreModuleCode(enterpriseModule.code) ? ENTERPRISE_CORE_MODULES[enterpriseModule.code] : null;
  const memberChoices = activeMembers.map((member) => ({ id: member.user.id, label: `${member.user.name} · ${member.role}` }));
  const departmentChoices = coreData.departments.filter((item) => item.isActive).map((item) => ({ id: item.id, label: item.labelFr }));
  const guideCode = ENTERPRISE_MODULE_GUIDE_MAP[enterpriseModule.code];
  const iteration06Guide = enterpriseModule.code === "FINANCE_BUDGETS"
    ? getIteration06UserGuide("FINANCE_BUDGETS", locale)
    : enterpriseModule.code === "REPORTS"
      ? getIteration06UserGuide("REPORTS", locale)
      : null;
  const guide = iteration06Guide || getIteration04UserGuide(guideCode);

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={enterpriseModule.isCore ? (isEnglish ? "Common foundation" : "Socle commun") : enterpriseModule.category}
        title={enterpriseModule.label}
        count={organizationName}
        description={enterpriseModule.description}
        secondaryActions={(
          <div className="flex flex-wrap gap-2">
            {guide ? <ContextualUserGuide guide={guide} compact /> : null}
            {canManage ? (
              <Link href="/enterprise-admin" className="inline-flex h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-black text-dtsc-blue">
                <Settings className="h-4 w-4" />
                {isEnglish ? "Configure" : "Configurer"}
              </Link>
            ) : null}
          </div>
        )}
        primaryAction={(
          <Link href="/enterprise-activities" className="inline-flex h-11 items-center gap-2 rounded-xl bg-dtsc-blue px-3 text-sm font-black text-white">
            <ArrowRight className="h-4 w-4" />
            {isEnglish ? "Open activities" : "Ouvrir les activités"}
          </Link>
        )}
      />

      {!isDedicatedCoreModule(enterpriseModule.code) ? (
        <ModuleMetrics label={isEnglish ? "Company indicators" : "Indicateurs entreprise"}>
          <ModuleMetric
            label={isEnglish ? "Active collaborators" : "Collaborateurs actifs"}
            value={activeMembers.length}
            hint={<span className="inline-flex items-center gap-1"><UsersRound className="h-3.5 w-3.5" />{organizationName}</span>}
          />
          <ModuleMetric
            label={isEnglish ? "Active departments" : "Départements actifs"}
            value={coreData.departments.filter((item) => item.isActive).length}
            hint={<span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{isEnglish ? "Current context" : "Contexte actif"}</span>}
          />
          <ModuleMetric
            label={isEnglish ? "Open requests" : "Demandes ouvertes"}
            value={openRequests.length}
            hint={<span className="inline-flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" />{isEnglish ? "To process" : "À traiter"}</span>}
          />
          <ModuleMetric
            label={isEnglish ? "Upcoming meetings" : "Réunions à venir"}
            value={upcomingMeetings.length}
            hint={<span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{isEnglish ? "Scheduled" : "Planifiées"}</span>}
          />
        </ModuleMetrics>
      ) : null}

      <ModuleContent>
        {enterpriseModule.code === "TASKS_OPERATIONS" ? (
          <EnterpriseTasksWorkspace organizationId={organizationId} members={memberChoices} departments={departmentChoices} canCreate={canCreate} canManage={canManage} locale={locale} legacyRecords={coreRecords} />
        ) : enterpriseModule.code === "INTERNAL_REQUESTS" ? (
          <EnterpriseRequestsWorkspace organizationId={organizationId} members={memberChoices} departments={departmentChoices} canCreate={canCreate} canManage={canManage} locale={locale} legacyRecords={coreRecords} />
        ) : enterpriseModule.code === "VALIDATIONS" ? (
          <EnterpriseApprovalsWorkspace organizationId={organizationId} locale={locale} legacyRecords={coreRecords} />
        ) : enterpriseModule.code === "MEETINGS" ? (
          <EnterpriseMeetingsWorkspace organizationId={organizationId} members={memberChoices} departments={departmentChoices} canCreate={canCreate} canManage={canManage} locale={locale} legacyRecords={coreRecords} />
        ) : enterpriseModule.code === "DOCUMENTS" ? (
          <EnterpriseDocumentsWorkspace organizationId={organizationId} members={memberChoices} departments={departmentChoices} canCreate={canCreate} canManage={canManage} locale={locale} legacyRecords={coreRecords.filter((record) => record.recordType === "DOCUMENT")} />
        ) : enterpriseModule.code === "SUPPLIERS_PURCHASES" ? (
          <div className="grid gap-8">
            <EnterpriseSuppliersWorkspace organizationId={organizationId} canManage={canManage} locale={locale} legacyRecords={coreRecords.filter((record) => record.recordType === "SUPPLIER")} />
            <EnterprisePurchasesWorkspace organizationId={organizationId} members={memberChoices} departments={departmentChoices} canManage={canManage} locale={locale} legacyRecords={coreRecords.filter((record) => record.recordType === "PURCHASE")} />
          </div>
        ) : enterpriseModule.code === "FINANCE_BUDGETS" ? (
          <EnterpriseFinanceWorkspace organizationId={organizationId} members={memberChoices} departments={departmentChoices} canCreate={canCreate} canManage={canManage} locale={locale} legacyRecords={coreRecords.filter((record) => ["BUDGET", "EXPENSE"].includes(record.recordType))} />
        ) : enterpriseModule.code === "REPORTS" ? (
          <EnterpriseReportsWorkspace organizationId={organizationId} canCreate={canCreate} canManage={canManage} locale={locale} legacyRecords={coreRecords.filter((record) => record.recordType === "REPORT")} />
        ) : enterpriseModule.code === "WORKFLOWS" ? (
          <EnterpriseWorkflowsWorkspace organizationId={organizationId} canManage={canManage} locale={locale} members={memberChoices} departments={departmentChoices} legacyWorkflows={coreData.workflows} />
        ) : commonDefinition ? (
          <EnterpriseCoreWorkspace
            organizationId={organizationId}
            moduleCode={enterpriseModule.code}
            title={commonDefinition.title}
            description={commonDefinition.description}
            recordTypes={commonDefinition.recordTypes}
            initialRecords={coreRecords}
            members={memberChoices}
            departments={departmentChoices}
            canCreate={canCreate}
            canManage={canManage}
          />
        ) : (
          <ModuleSection
            title={isEnglish ? "Current company data" : "Données actuelles de l'entreprise"}
            count={`${moduleItems.length}`}
            description={isEnglish ? "Objects available in the current company context." : "Objets disponibles dans le contexte de l’entreprise active."}
          >
            {moduleItems.length ? (
              <BusinessList ariaLabel={isEnglish ? "Current company data" : "Données actuelles de l'entreprise"}>
                {moduleItems.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge>{item.meta}</StatusBadge>} description={item.detail} />)}
              </BusinessList>
            ) : (
              <EmptyState compact title={isEnglish ? "No company data" : "Aucune donnée"} description={isEnglish ? "No company data has been recorded for this module yet." : "Aucune donnée n'est encore enregistrée pour ce module."} />
            )}
          </ModuleSection>
        )}

        <ModuleSection
          title={isEnglish ? "Access and responsibilities" : "Accès et responsabilités"}
          description={isEnglish ? `Actions are limited to active members of ${organizationName} according to their responsibilities.` : `Les actions sont limitées aux membres actifs de ${organizationName}, selon leurs responsabilités et les modules activés.`}
        >
          <div className="border-y border-dtsc-border py-3 text-sm leading-6 text-dtsc-muted">
            {isEnglish ? "Server permissions and the active organization remain the authority for every action." : "Les permissions serveur et l’organisation active restent l’autorité pour chaque action."}
          </div>
        </ModuleSection>

        {activityBlocks.length > 0 ? (
          <ModuleSection title={isEnglish ? "Available actions" : "Actions disponibles"} count={`${activityBlocks.length}`}>
            <BusinessList ariaLabel={isEnglish ? "Available actions" : "Actions disponibles"}>
              {activityBlocks.map((block) => (
                <BusinessListItem
                  key={block.id}
                  title={isEnglish ? block.labelEn : block.labelFr}
                  actions={(
                    <Link
                      href={`/enterprise-activities?block=${encodeURIComponent(block.blockCode)}`}
                      aria-label={`${isEnglish ? "Open" : "Ouvrir"} ${isEnglish ? block.labelEn : block.labelFr}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-dtsc-blue hover:bg-dtsc-soft"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                />
              ))}
            </BusinessList>
          </ModuleSection>
        ) : null}
      </ModuleContent>
    </ModuleWorkspace>
  );
}

function isDedicatedCoreModule(code: string) {
  return ["TASKS_OPERATIONS", "INTERNAL_REQUESTS", "VALIDATIONS", "MEETINGS", "DOCUMENTS", "SUPPLIERS_PURCHASES", "FINANCE_BUDGETS", "REPORTS", "WORKFLOWS"].includes(code);
}

function resolveModuleItems(code: string, data: CoreData, records: SectorRecord[]) {
  if (code === "COLLABORATORS_POSITIONS") {
    return [
      ...data.members.map((item) => ({ id: item.id, title: item.user.name, meta: `${item.role} · ${item.status}`, detail: item.user.email })),
      ...data.positions.map((item) => ({ id: item.id, title: item.labelFr, meta: item.isActive ? "Poste actif" : "Poste inactif", detail: item.positionCode })),
    ].slice(0, 20);
  }
  if (code === "DEPARTMENTS") {
    return data.departments.map((item) => ({ id: item.id, title: item.labelFr, meta: item.isActive ? "Département actif" : "Département inactif", detail: item.departmentCode }));
  }
  if (code === "WORKFLOWS") {
    return data.workflows.map((item) => ({ id: item.id, title: item.labelFr, meta: item.isEnabled ? "Workflow actif" : "Workflow inactif", detail: `Mis à jour le ${item.updatedAt.toLocaleDateString("fr-FR")}` }));
  }
  if (code === "AUDIT_LOGS") {
    return data.audits.map((item) => ({ id: item.id, title: item.action, meta: item.entity, detail: item.createdAt.toLocaleString("fr-FR") }));
  }
  return records.map((item) => ({ id: item.id, title: item.title, meta: item.status, detail: item.summary || `Mis à jour le ${item.updatedAt.toLocaleDateString("fr-FR")}` }));
}
