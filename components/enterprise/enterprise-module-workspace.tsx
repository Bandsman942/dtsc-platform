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
import type { ProcurementUiCapabilities } from "@/components/enterprise/professional/enterprise-procurement-operations-workspace";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { ENTERPRISE_CORE_MODULES, isEnterpriseCoreModuleCode } from "@/lib/enterprise/enterprise-core";
import { getControlledStatusLabel } from "@/lib/enterprise/i18n/business-labels";
import { translateWorkspaceGeneralization, type WorkspaceGeneralizationKey } from "@/lib/i18n";
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
  organizationLogoUrl,
  enterpriseModule,
  activityBlocks,
  records,
  coreData,
  canManage,
  canCreate,
  capabilities,
  locale,
  coreRecords,
}: {
  organizationId: string;
  organizationName: string;
  organizationLogoUrl?: string | null;
  enterpriseModule: EnterpriseNavigationModule;
  activityBlocks: ActivityBlock[];
  records: SectorRecord[];
  coreData: CoreData;
  canManage: boolean;
  canCreate: boolean;
  capabilities: ProcurementUiCapabilities;
  locale?: string | null;
  coreRecords: LegacyCoreRecord[];
}) {
  const isEnglish = locale === "en";
  const tw = (key: WorkspaceGeneralizationKey) => translateWorkspaceGeneralization(locale, key);
  const activeMembers = coreData.members.filter((member) => member.status === "ACTIVE");
  const openRequests = coreData.requests.filter((request) => !["CLOSED", "CANCELLED", "REJECTED", "RESOLVED"].includes(request.status));
  const upcomingMeetings = coreData.calendarEvents.filter((event) => event.startDateTime >= new Date() && !["CANCELLED", "CLOSED"].includes(event.status));
  const moduleItems = resolveModuleItems(enterpriseModule.code, coreData, records, locale);
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
        eyebrow={enterpriseModule.isCore ? tw("commonFoundation") : enterpriseModule.category}
        title={enterpriseModule.label}
        count={organizationName}
        description={enterpriseModule.description}
        secondaryActions={(
          <div className="flex flex-wrap gap-2">
            {guide ? <ContextualUserGuide guide={guide} compact /> : null}
            {canManage ? (
              <Link href="/enterprise-admin" className="inline-flex h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-black text-dtsc-blue">
                <Settings className="h-4 w-4" />
                {tw("configure")}
              </Link>
            ) : null}
          </div>
        )}
        primaryAction={(
          <Link href="/enterprise-activities" className="inline-flex h-11 items-center gap-2 rounded-xl bg-dtsc-blue px-3 text-sm font-black text-white">
            <ArrowRight className="h-4 w-4" />
            {tw("openActivities")}
          </Link>
        )}
      />

      {!isDedicatedCoreModule(enterpriseModule.code) ? (
        <ModuleMetrics label={tw("companyIndicators")}>
          <ModuleMetric
            label={tw("activeCollaborators")}
            value={activeMembers.length}
            hint={<span className="inline-flex items-center gap-1"><UsersRound className="h-3.5 w-3.5" />{organizationName}</span>}
          />
          <ModuleMetric
            label={tw("activeDepartments")}
            value={coreData.departments.filter((item) => item.isActive).length}
            hint={<span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{tw("currentContext")}</span>}
          />
          <ModuleMetric
            label={tw("openRequests")}
            value={openRequests.length}
            hint={<span className="inline-flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" />{tw("toProcess")}</span>}
          />
          <ModuleMetric
            label={tw("upcomingMeetings")}
            value={upcomingMeetings.length}
            hint={<span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{tw("scheduled")}</span>}
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
            <EnterpriseSuppliersWorkspace organizationId={organizationId} canManage={capabilities.canWrite} locale={locale} legacyRecords={coreRecords.filter((record) => record.recordType === "SUPPLIER")} />
            <EnterprisePurchasesWorkspace organizationId={organizationId} members={memberChoices} departments={departmentChoices} capabilities={capabilities} locale={locale} legacyRecords={coreRecords.filter((record) => record.recordType === "PURCHASE")} />
          </div>
        ) : enterpriseModule.code === "FINANCE_BUDGETS" ? (
          <EnterpriseFinanceWorkspace organizationId={organizationId} members={memberChoices} departments={departmentChoices} canCreate={canCreate} canManage={canManage} locale={locale} legacyRecords={coreRecords.filter((record) => ["BUDGET", "EXPENSE"].includes(record.recordType))} />
        ) : enterpriseModule.code === "REPORTS" ? (
          <EnterpriseReportsWorkspace organizationId={organizationId} organizationName={organizationName} organizationLogoUrl={organizationLogoUrl} canCreate={canCreate} canManage={canManage} locale={locale} legacyRecords={coreRecords.filter((record) => record.recordType === "REPORT")} />
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
            title={tw("currentCompanyData")}
            count={`${moduleItems.length}`}
            description={tw("currentCompanyDataDescription")}
          >
            {moduleItems.length ? (
              <BusinessList ariaLabel={tw("currentCompanyData")}>
                {moduleItems.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge>{item.meta}</StatusBadge>} description={item.detail} />)}
              </BusinessList>
            ) : (
              <EmptyState compact title={tw("noCompanyData")} description={tw("noCompanyDataDescription")} />
            )}
          </ModuleSection>
        )}

        <ModuleSection
          title={tw("accessResponsibilities")}
          description={tw("accessResponsibilitiesDescription")}
        >
          <div className="border-y border-dtsc-border py-3 text-sm leading-6 text-dtsc-muted">
            {tw("serverPermissionsAuthority")}
          </div>
        </ModuleSection>

        {activityBlocks.length > 0 ? (
          <ModuleSection title={tw("availableActions")} count={`${activityBlocks.length}`}>
            <BusinessList ariaLabel={tw("availableActions")}>
              {activityBlocks.map((block) => (
                <BusinessListItem
                  key={block.id}
                  title={isEnglish ? block.labelEn : block.labelFr}
                  actions={(
                    <Link
                      href={`/enterprise-activities?block=${encodeURIComponent(block.blockCode)}`}
                      aria-label={`${tw("open")} ${isEnglish ? block.labelEn : block.labelFr}`}
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

function humanizeBusinessCode(value: string) {
  return value
    .replaceAll("_", " ")
    .toLocaleLowerCase()
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

function resolveModuleItems(code: string, data: CoreData, records: SectorRecord[], locale?: string | null) {
  const t = (key: WorkspaceGeneralizationKey) => translateWorkspaceGeneralization(locale, key);
  const intlLocale = locale === "en" ? "en-US" : "fr-FR";
  const status = (value: string) => getControlledStatusLabel(value, locale) || humanizeBusinessCode(value);
  const updated = (value: Date) => `${t("updatedOn")} ${value.toLocaleDateString(intlLocale)}`;
  if (code === "COLLABORATORS_POSITIONS") {
    return [
      ...data.members.map((item) => ({ id: item.id, title: item.user.name, meta: `${humanizeBusinessCode(item.role)} · ${status(item.status)}`, detail: item.user.email })),
      ...data.positions.map((item) => ({ id: item.id, title: item.labelFr, meta: item.isActive ? t("activePosition") : t("inactivePosition"), detail: item.positionCode })),
    ].slice(0, 20);
  }
  if (code === "DEPARTMENTS") {
    return data.departments.map((item) => ({ id: item.id, title: item.labelFr, meta: item.isActive ? t("activeDepartment") : t("inactiveDepartment"), detail: item.departmentCode }));
  }
  if (code === "WORKFLOWS") {
    return data.workflows.map((item) => ({ id: item.id, title: item.labelFr, meta: item.isEnabled ? t("workflowActive") : t("workflowInactive"), detail: updated(item.updatedAt) }));
  }
  if (code === "AUDIT_LOGS") {
    return data.audits.map((item) => ({ id: item.id, title: item.action, meta: item.entity, detail: item.createdAt.toLocaleString(intlLocale) }));
  }
  return records.map((item) => ({ id: item.id, title: item.title, meta: status(item.status), detail: item.summary || updated(item.updatedAt) }));
}
