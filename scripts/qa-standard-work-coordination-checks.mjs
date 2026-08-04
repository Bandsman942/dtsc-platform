import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scope = process.argv[2] || "all";
const failures = [];

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Fichier absent: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function requireText(relativePath, needles) {
  const content = read(relativePath);
  for (const needle of needles) {
    if (!content.includes(needle)) failures.push(`${relativePath}: contrat absent: ${needle}`);
  }
}

function requireNoText(relativePath, needles) {
  const content = read(relativePath);
  for (const needle of needles) {
    if (content.includes(needle)) failures.push(`${relativePath}: motif interdit: ${needle}`);
  }
}

function calendarChecks() {
  requireText("app/api/calendar/unified/route.ts", ["loadUnifiedWorkCalendar", "canUseInternalCalendarFeature", "CALENDAR_RANGE_TOO_LARGE"]);
  requireText("lib/standard-work-coordination/calendar.ts", [
    "sourceType: string",
    "sourceId: string",
    "deepLink: string",
    "normalizeUnifiedCalendarRange",
    "resolveLinkedCalendarSource",
    "deduplicated.set(`${event.sourceType}:${event.sourceId}`, event)",
    "take: 500",
  ]);
  requireText("components/calendar/unified-work-calendar-panel.tsx", ["overflow-x-auto", "event.deepLink", "Agenda de travail unifié"]);
  requireText("app/api/calendar/route.ts", ["OWNER_IMMUTABLE", "invitedParticipantCreate", "calendarOwnedOrAcceptedWhere", "Conflit de disponibilité détecté pour le responsable ou un participant"]);
  requireText("app/api/calendar/events/[id]/participants/respond/route.ts", ["ACCEPT", "DECLINE", "BLOCKING_CALENDAR_CONFLICT", "CALENDAR_CONFLICT_CONFIRMATION_REQUIRED"]);
  requireText("lib/calendar-participation.ts", ["responseStatus: CALENDAR_RESPONSE.ACCEPTED", "responseStatus: CALENDAR_RESPONSE.PENDING", "calendarInvitationWhere"]);
  requireText("components/calendar/internal-calendar-workspace-v2.tsx", ["Mon calendrier", "Calendrier équipe", "Invitations", "Cette année", "Date précise", "Par collaborateur", "Par statut"]);
  requireText("app/api/calendar/slot-suggestions/route.ts", ["14 * 86_400_000", "detectCalendarConflicts", "suggestionsJson"]);
  requireText("app/api/calendar/resources/reservations/route.ts", ["RESOURCE_CONFLICT", "calendarResourceReservationConflictWhere", "Seul le créateur responsable"]);
  requireText("app/api/calendar/integrations/route.ts", ["PROVIDER_NOT_CONFIGURED", "NOT_CONFIGURED", "CONSENT_REQUIRED"]);
  requireText("components/calendar/calendar-advanced-tools-panel.tsx", ["Proposer un créneau", "Ressources réservables", "Calendriers externes"]);
}

function taskChecks() {
  requireText("prisma/standard-work-coordination.prisma", ["model EnterpriseTaskChecklistItem", "model EnterpriseTaskDependency", "model EnterpriseTaskBlocker"]);
  requireText("lib/standard-work-coordination/task-coordination.ts", ["DEPENDENCY_CYCLE", "wouldCreateDependencyCycle", "TASK_BLOCKER_RESOLVED", "progress:"]);
  requireText("app/api/enterprise/[organizationId]/tasks/[id]/coordination/route.ts", ["isSameOriginRequest", "rateLimit", "context.canMutate"]);
  requireText("components/enterprise/core-v2/enterprise-tasks-workspace.tsx", ["collection.meta.currentUserId", "TaskCoordinationPanel"]);
  requireNoText("components/enterprise/core-v2/enterprise-tasks-workspace.tsx", ["|| Boolean(detail.assignedToUserId)"]);
  requireText("app/api/operations/checklists/route.ts", ["operationalChecklistProgress", "syncDerivedProgress", "OPERATIONAL_CHECKLIST_ITEM_UPDATED"]);
  requireText("app/api/activities/tasks/[id]/route.ts", ["CHECKLIST_REQUIRED", "CHECKLIST_INCOMPLETE", "OperationalStatusTransition", "Seul le collaborateur assigné ou responsable"]);
  requireNoText("app/api/activities/tasks/[id]/route.ts", ["progress: z.coerce.number"]);
  requireText("components/activities/activities-dashboard-v3.tsx", ["Vue Kanban transverse", "columnForStatus", "ActivityDetailV2"]);
}

function requestChecks() {
  requireText("app/api/enterprise/[organizationId]/requests/[id]/coordination/route.ts", ["isSameOriginRequest", "rateLimit"]);
  requireText("lib/standard-work-coordination/request-coordination.ts", ["REQUEST_INFORMATION", "REOPEN", "enterpriseOperationalEvent", "enterpriseOperationalComment"]);
}

function validationChecks() {
  requireText("prisma/standard-work-coordination.prisma", ["model EnterpriseApprovalSubmissionVersion", "model EnterpriseApprovalDecision", "idempotencyKey"]);
  requireText("lib/standard-work-coordination/approval-coordination.ts", ["CORRECTION_REASON_REQUIRED", "VERSION_MISMATCH", "recordApprovalDecision", "versionNumber", "plannedAmount: true"]);
  requireText("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts", ["REQUEST_CORRECTION", "RESUBMIT", "DELEGATE", "SELF_APPROVAL_FORBIDDEN", "notifyUser"]);
  requireNoText("lib/standard-work-coordination/approval-coordination.ts", ["totalAmount: true, revision: true, updatedAt: true } });\n    if (!item) throw new ApprovalCoordinationError(\"TARGET_NOT_FOUND\", 404, \"Budget source"]);
}

function meetingChecks() {
  requireText("prisma/standard-work-coordination.prisma", ["model EnterpriseMeetingAgendaItem", "model EnterpriseMeetingMinutesVersion", "model EnterpriseMeetingAction"]);
  requireText("lib/standard-work-coordination/meeting-coordination.ts", ["ADD_AGENDA_ITEM", "SAVE_MINUTES", "LINK_TASK", "MEETING_MINUTES_PUBLISHED"]);
  requireText("app/api/enterprise/[organizationId]/meetings/[id]/coordination/route.ts", ["isSameOriginRequest", "rateLimit"]);
}

function workflowChecks() {
  requireText("components/enterprise/core-v2/enterprise-workflows-workspace.tsx", ["EnterpriseWorkflowsWorkspace"]);
  requireText("prisma/enterprise-workflow-engine.prisma", ["model EnterpriseWorkflowVersion", "model EnterpriseWorkflowActionAttempt", "idempotencyKey", "workflowVersionId"]);
  requireText("scripts/qa-enterprise-workflow-engine-checks.mjs", ["workflow"]);
}

function documentChecks() {
  requireText("app/api/enterprise/[organizationId]/documents/[id]/links/route.ts", ["createEnterpriseLink", "EnterpriseDocument", "isSameOriginRequest", "canAccessEnterpriseDocument"]);
  requireText("components/enterprise/core-v2/enterprise-documents-workspace.tsx", ["/links", "/versions", "/download", "signedUrl"]);
  requireText("scripts/qa-enterprise-core-v2-sprint7-checks.mjs", ["EnterpriseDocumentVersion", "createSignedUrl", "private storage"]);
  requireNoText("prisma/standard-work-coordination.prisma", ["model EnterpriseDocumentLink"]);
  requireText("app/api/enterprise/[organizationId]/documents/[id]/advanced/route.ts", ["PROVIDER_NOT_CONFIGURED", "getEnterpriseDocumentSignedDownload", "DOCUMENT_INDEX_ENDPOINT", "DOCUMENT_VISUAL_DIFF_ENDPOINT", "AbortSignal.timeout"]);
  requireText("lib/technical-debt/feature-gates.ts", ["getDocumentIndexFeatureStatus", "getDocumentVisualComparisonFeatureStatus", "DISABLED"]);
}

function notificationChecks() {
  requireText("lib/standard-work-coordination/deep-links.ts", ["workCoordinationDeepLink", "isInternalWorkCoordinationLink"]);
  requireText("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts", ["workCoordinationDeepLink", "notifyUser"]);
  requireText("prisma/standard-work-coordination.prisma", ["model EnterpriseWorkReminder", "idempotencyKey"]);
}

function permissionChecks() {
  requireText("prisma/iteration04-owner-e2e-remediation.prisma", ["model DtscIndividualPermissionGrant", "model OperationalChecklistItem", "model OperationalStatusTransition", "model CalendarResource", "model CalendarExternalSyncState", "model OperationalSlaPolicy"]);
  requireText("prisma/migrations/20260804090000_iteration04_owner_e2e_remediation/migration.sql", ["CREATE TABLE \"DtscIndividualPermissionGrant\"", "CREATE TABLE \"OperationalChecklistItem\"", "CREATE TABLE \"CalendarResourceReservation\"", "CREATE TABLE \"OperationalSlaInstance\""]);
  requireText("lib/dtsc-individual-permissions.ts", ["work.past_period.submit", "admin.section.", "DENY", "validUntil"]);
  requireText("app/api/admin/individual-permissions/route.ts", ["DTSC_INDIVIDUAL_PERMISSION_GRANTED", "DTSC_INDIVIDUAL_PERMISSION_REVOKED", "reason"]);
  requireText("components/admin/dtsc-individual-permissions-panel.tsx", ["Permissions individuelles DTSC", "Motif obligatoire", "Refuser explicitement"]);
  requireText("app/api/work/submissions/[id]/submit/route.ts", ["PAST_PERIOD_PERMISSION_REQUIRED", "SUBMIT_PAST_WORK_PERIOD"]);
  requireText("components/activities/work-prestations-panel-v2.tsx", ["Historique des prestations", "canSubmitPastPeriods", "selectedSubmission"]);
}

function slaChecks() {
  requireText("app/api/operations/sla/route.ts", ["CREATE_POLICY", "BIND_INSTANCE", "EVALUATE", "ARCHIVE_POLICY"]);
  requireText("lib/operational-sla.ts", ["bindOperationalSlaInstance", "WARNING", "BREACHED"]);
  requireText("components/admin/operational-sla-panel.tsx", ["SLA opérationnels avancés", "Politiques actives", "Évaluer maintenant"]);
}

function guideChecks() {
  const guides = [
    "CALENDAR",
    "DTSC_ACTIVITIES",
    "ENTERPRISE_ACTIVITIES",
    "TASKS_OPERATIONS",
    "INTERNAL_REQUESTS",
    "VALIDATIONS",
    "MEETINGS",
    "WORKFLOWS",
    "DOCUMENTS",
  ];
  for (const guide of guides) requireText(`docs/user-guides/${guide}.md`, ["# Guide utilisateur", "Guide"]);
  requireText("docs/user-guides/ADMIN_RBAC_INDIVIDUAL_PERMISSIONS.md", ["Permissions individuelles DTSC", "ALLOW", "DENY", "work.past_period.submit"]);
  requireText("lib/user-guides/iteration04-guides.ts", ["CALENDAR:", "DTSC_ACTIVITIES:", "ENTERPRISE_ACTIVITIES:", "ADMIN_RBAC:", "updatedAt: \"2026-08-04\""]);
  requireText("components/user-guides/contextual-user-guide.tsx", [
    "useAppLocale",
    "translate",
    "userGuides.common.userGuide",
    "userGuides.common.searchLabel",
    "userGuides.common.searchPlaceholder",
    "userGuides.common.limitations",
  ]);
  requireText("locales/fr.json", [
    '"userGuide": "Guide utilisateur"',
    '"searchLabel": "Rechercher dans le guide"',
    '"limitations": "Fonctionnalités conditionnelles ou limites connues"',
  ]);
  requireText("locales/en.json", [
    '"userGuide": "User guide"',
    '"searchLabel": "Search this guide"',
    '"limitations": "Conditional features or known limitations"',
  ]);
  requireText("components/admin/admin-access-panel.tsx", ["ContextualUserGuide", "ADMIN_RBAC"]);
  requireText("components/enterprise/enterprise-module-workspace.tsx", ["ENTERPRISE_MODULE_GUIDE_MAP", "ContextualUserGuide"]);
  requireText("components/enterprise/enterprise-activities-module.tsx", ["ENTERPRISE_ACTIVITIES", "ContextualUserGuide"]);
  requireText("docs/MANUAL_E2E_STANDARD_MODULES_ITERATION_04.md", ["NON_EXÉCUTÉ", "Tests E2E manuels préparés — validation du propriétaire en attente"]);
}

function imageDebtChecks() {
  requireNoText("components/chat/ConversationAvatar.tsx", ["<img"]);
  requireNoText("components/dtsc/ui-components.tsx", ["<img"]);
  requireNoText("components/activities/activity-detail.tsx", ["<img"]);
  requireText("components/chat/ConversationAvatar.tsx", ["next/image", "<Image"]);
  requireText("components/activities/activity-detail.tsx", ["next/image", "<Image"]);
}

const checks = {
  calendar: calendarChecks,
  activities: permissionChecks,
  tasks: taskChecks,
  requests: requestChecks,
  validations: validationChecks,
  meetings: meetingChecks,
  workflows: workflowChecks,
  documents: documentChecks,
  notifications: notificationChecks,
  guides: guideChecks,
  permissions: permissionChecks,
  sla: slaChecks,
  images: imageDebtChecks,
};

if (scope === "all") {
  for (const check of Object.values(checks)) check();
} else if (checks[scope]) {
  checks[scope]();
} else {
  failures.push(`Périmètre QA inconnu: ${scope}`);
}

if (failures.length) {
  console.error(`Échec QA coordination du travail (${scope})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`QA coordination du travail réussie (${scope}).`);
