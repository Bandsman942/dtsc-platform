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

function requireNoNativeConfirmation(relativePath) {
  requireNoText(relativePath, ["window.prompt(", "window.alert(", "window.confirm("]);
}

function editorDialogScrollChecks() {
  const relativePath = "components/ui/dialog.tsx";
  const content = read(relativePath);
  requireText(relativePath, ["data-dtsc-dialog-scroll", "touch-pan-y", "--dtsc-dialog-visual-height", "ensureFocusedControlVisible"]);

  const editorScrollBranch = content.match(/data-dtsc-dialog-scroll[\s\S]*?isEditorPresentation\s*\?\s*"([^"]+)"/);
  if (!editorScrollBranch) {
    failures.push(`${relativePath}: branche de scroll presentation=editor introuvable`);
    return;
  }

  const classes = editorScrollBranch[1].split(/\s+/);
  if (!classes.includes("overflow-y-auto")) failures.push(`${relativePath}: presentation=editor doit autoriser overflow-y-auto`);
  if (!classes.includes("overflow-x-hidden")) failures.push(`${relativePath}: presentation=editor doit masquer uniquement le débordement horizontal`);
  if (classes.includes("overflow-hidden")) failures.push(`${relativePath}: presentation=editor ne doit pas neutraliser le scroll avec overflow-hidden`);
}

function calendarChecks() {
  requireText("app/api/calendar/unified/route.ts", ["loadUnifiedWorkCalendar", "canUseInternalCalendarFeature", "CALENDAR_RANGE_TOO_LARGE"]);
  requireText("lib/standard-work-coordination/calendar.ts", ["sourceType: string", "sourceId: string", "deepLink: string", "normalizeUnifiedCalendarRange", "resolveLinkedCalendarSource", "deduplicated.set(`${event.sourceType}:${event.sourceId}`, event)", "take: 500"]);
  requireText("components/calendar/unified-work-calendar-panel.tsx", ["overflow-x-auto", "event.deepLink", 'translateSharedWork(locale, "calendar.unifiedAgenda")', "userLocale({ locale })"]);
  requireText("locales/shared-work.fr.json", ['"calendar.unifiedAgenda": "Agenda de travail unifié"']);
  requireText("locales/shared-work.en.json", ['"calendar.unifiedAgenda": "Unified work agenda"']);
  requireText("app/api/calendar/route.ts", ["OWNER_IMMUTABLE", "invitedParticipantCreate", "calendarOwnedOrAcceptedWhere", "Conflit de disponibilité détecté pour le responsable ou un participant"]);
  requireText("app/api/calendar/events/[id]/participants/respond/route.ts", ["ACCEPT", "DECLINE", "BLOCKING_CALENDAR_CONFLICT", "CALENDAR_CONFLICT_CONFIRMATION_REQUIRED"]);
  requireText("lib/calendar-participation.ts", ["responseStatus: CALENDAR_RESPONSE.ACCEPTED", "responseStatus: CALENDAR_RESPONSE.PENDING", "calendarInvitationWhere"]);
  requireText("components/calendar/internal-calendar-workspace-v2.tsx", ["internal-calendar/workspace"]);
  requireText("components/calendar/internal-calendar/workspace.tsx", ["calendarWorkspaceText", "text.myCalendar", "text.teamCalendar", "text.invitations"]);
  requireText("components/calendar/internal-calendar/availability-view.tsx", ["text.thisYear", "text.specificDate", "text.viewByCollaborator", "text.viewByStatus"]);
  requireText("locales/calendar-workspace.fr.json", ['"myCalendar": "Mon calendrier"', '"teamCalendar": "Calendrier équipe"', '"suggestSlot": "Proposer un créneau"', '"resourcesTitle": "Ressources réservables"', '"externalCalendars": "Calendriers externes"']);
  requireText("locales/calendar-workspace.en.json", ['"myCalendar": "My calendar"', '"teamCalendar": "Team calendar"', '"suggestSlot": "Suggest a time slot"', '"resourcesTitle": "Bookable resources"', '"externalCalendars": "External calendars"']);
  requireText("app/api/calendar/slot-suggestions/route.ts", ["14 * 86_400_000", "detectCalendarConflicts", "suggestionsJson"]);
  requireText("app/api/calendar/resources/reservations/route.ts", ["RESOURCE_CONFLICT", "calendarResourceReservationConflictWhere", "Seul le créateur responsable"]);
  requireText("app/api/calendar/integrations/route.ts", ["PROVIDER_NOT_CONFIGURED", "NOT_CONFIGURED", "CONSENT_REQUIRED"]);
  requireText("components/calendar/calendar-advanced-tools-panel.tsx", ["calendar-advanced-tools/panel"]);
  requireText("components/calendar/calendar-advanced-tools/panel.tsx", ["calendarWorkspaceText", "text.suggestSlot", "text.resourcesTitle", "text.externalCalendars"]);
}

function taskChecks() {
  requireText("prisma/standard-work-coordination.prisma", ["model EnterpriseTaskChecklistItem", "model EnterpriseTaskDependency", "model EnterpriseTaskBlocker"]);
  requireText("lib/standard-work-coordination/task-coordination.ts", ["DEPENDENCY_CYCLE", "wouldCreateDependencyCycle", "TASK_BLOCKER_RESOLVED", "progress:"]);
  requireText("app/api/enterprise/[organizationId]/tasks/[id]/actions/route.ts", [
    "TASK_ACTION_REASON_REQUIRED",
    "TASK_CHECKLIST_INCOMPLETE",
    "TASK_OPEN_BLOCKERS",
    "TASK_DEPENDENCIES_INCOMPLETE",
    "enterpriseTaskChecklistItem.count",
    "enterpriseTaskBlocker.count",
    "enterpriseTaskDependency.findMany",
    'status: "DONE"',
  ]);
  requireText("app/api/enterprise/[organizationId]/tasks/[id]/coordination/route.ts", ["isSameOriginRequest", "rateLimit", "context.canMutate", "coordinationMutable", "TASK_COORDINATION_LOCKED", '["DONE", "CANCELLED"]']);
  requireText("components/enterprise/core-v2/enterprise-tasks-workspace.tsx", ["collection.meta.currentUserId", "TaskCoordinationPanel", "actionComment", "aria-invalid", 'presentation="editor"']);
  requireNoText("components/enterprise/core-v2/enterprise-tasks-workspace.tsx", ["|| Boolean(detail.assignedToUserId)"]);
  requireNoNativeConfirmation("components/enterprise/core-v2/enterprise-tasks-workspace.tsx");
  requireText("app/api/operations/checklists/route.ts", ["operationalChecklistProgress", "syncDerivedOperationalProgress", "OPERATIONAL_CHECKLIST_ITEM_UPDATED"]);
  requireText("app/api/activities/tasks/[id]/route.ts", ["validateOperationalClosure", "CHECKLIST_INCOMPLETE", "OperationalStatusTransition", "Seul le collaborateur assigné ou responsable"]);
  requireNoText("app/api/activities/tasks/[id]/route.ts", ["progress: z.coerce.number"]);
  requireText("components/activities/activities-dashboard-v3.tsx", ["translateActivities", "columnForStatus", "ActivityDetailV2"]);
  requireText("locales/activities.fr.json", ['"transverseKanbanLabel": "Vue Kanban transverse"']);
  requireText("locales/activities.en.json", ['"transverseKanbanLabel": "Cross-workspace Kanban view"']);
}

function requestChecks() {
  requireText("lib/enterprise/core-v2/constants.ts", ["REQUEST_COORDINATION_ACTIONS", "REQUEST_TRANSITIONS"]);
  requireText("app/api/enterprise/[organizationId]/requests/[id]/coordination/route.ts", ["isSameOriginRequest", "rateLimit", "canCoordinateRequest", "parsed.data.revision"]);
  requireText("lib/standard-work-coordination/request-coordination.ts", ["revisionSchema", "REQUEST_INFORMATION", "REOPEN", "REQUEST_TRANSITIONS[action]", "revision: args.payload.revision", "REVISION_CONFLICT", "enterpriseOperationalEvent", "enterpriseOperationalComment"]);
  requireNoText("lib/standard-work-coordination/request-coordination.ts", ['status: "WAITING_REQUESTER"', 'status: "RESOLVED"', 'status: "CLOSED"', 'status: "REOPENED"']);
  requireText("lib/enterprise/core-v2/validators.ts", ["requestType: z.enum(REQUEST_TYPES)"]);
  requireText("components/enterprise/core-v2/request-form.tsx", ["requestTypeChoices", 'name="requestType"', "NativeSelect"]);
  requireNoText("components/enterprise/core-v2/request-form.tsx", ['<Input name="requestType"']);
  requireText("components/enterprise/core-v2/enterprise-requests-workspace.tsx", ["requestTypeChoices", "requestTypeLabel", 'presentation="editor"']);
  requireNoText("components/enterprise/core-v2/enterprise-requests-workspace.tsx", ["WAITING_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "ASSIGNED", "IN_PROGRESS"]);
  requireNoNativeConfirmation("components/enterprise/core-v2/enterprise-requests-workspace.tsx");
}

function validationChecks() {
  requireText("prisma/standard-work-coordination.prisma", ["model EnterpriseApprovalSubmissionVersion", "model EnterpriseApprovalDecision", "idempotencyKey"]);
  requireText("lib/standard-work-coordination/approval-coordination.ts", ["CORRECTION_REASON_REQUIRED", "VERSION_MISMATCH", "recordApprovalDecision", "versionNumber", "plannedAmount: true", "assertEnterpriseApprovalCandidate", "enterpriseApprovalModuleForTarget"]);
  requireText("lib/enterprise/core-v2/validators.ts", ["reviewedVersionId: optionalId"]);
  requireText("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts", ["PREPARE_REVIEW", "REQUEST_CORRECTION", "RESUBMIT", "DELEGATE", "decideAssignedEnterpriseApproval", "notifyUser", "reviewedVersionId", "APPROVAL_REVIEW_REQUIRED", "ENTERPRISE_APPROVAL_REVIEW_PREPARED"]);
  requireText("components/enterprise/core-v2/approval-coordination-panel.tsx", ["PREPARE_REVIEW", "reviewedVersionId", "snapshotJson", "aria-invalid"]);
  requireText("components/enterprise/core-v2/enterprise-approvals-workspace.tsx", ["ApprovalCoordinationPanel", 'presentation="editor"', "function approvalActions"]);
  requireNoText("components/enterprise/core-v2/enterprise-approvals-workspace.tsx", ["CheckCircle2", "XCircle", "enterpriseV2Mutation", 'action: "APPROVE"', 'action: "REJECT"']);
  requireNoNativeConfirmation("components/enterprise/core-v2/enterprise-approvals-workspace.tsx");
  requireText("lib/enterprise/approval-assignment.ts", ["assertEnterpriseApprovalDecision", "canUseSelfApprovalOverride", "SELF_APPROVAL_FORBIDDEN", "policy.selfApprovalModuleCodes.includes"]);
  requireText("lib/enterprise/core-v2/approval-assignment-service.ts", ["decideAssignedEnterpriseApproval", "assertEnterpriseApprovalDecision", "selfApprovalOverride"]);
  requireNoText("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts", ["Vous ne pouvez pas décider sur votre propre soumission"]);
  requireNoText("lib/standard-work-coordination/approval-coordination.ts", ["totalAmount: true, revision: true, updatedAt: true } });\n    if (!item) throw new ApprovalCoordinationError(\"TARGET_NOT_FOUND\", 404, \"Budget source"]);
}

function meetingChecks() {
  requireText("prisma/standard-work-coordination.prisma", ["model EnterpriseMeetingAgendaItem", "model EnterpriseMeetingMinutesVersion", "model EnterpriseMeetingAction"]);
  requireText("lib/standard-work-coordination/meeting-coordination.ts", ["ADD_AGENDA_ITEM", "SAVE_MINUTES", "LINK_TASK", "MEETING_MINUTES_PUBLISHED", "MEETING_COORDINATION_LOCKED", "AGENDA_STRUCTURE_LOCKED", "AGENDA_STATUS_LOCKED", "MINUTES_NOT_AVAILABLE", "MINUTES_PUBLISH_REQUIRES_COMPLETION", "FOLLOW_UP_NOT_AVAILABLE"]);
  requireText("app/api/enterprise/[organizationId]/meetings/[id]/coordination/route.ts", ["isSameOriginRequest", "rateLimit", "meetingCoordinationCapabilities"]);
  requireText("lib/enterprise/core-v2/validators.ts", ["enterpriseMeetingUpdateSchema"]);
  requireNoText("lib/enterprise/core-v2/validators.ts", ["minutes: optionalText(20000)"]);
  requireNoText("app/api/enterprise/[organizationId]/meetings/[id]/route.ts", ["minutes: data.minutes"]);
  requireText("components/enterprise/core-v2/meeting-form.tsx", ["locationMode", "needsPhysicalLocation", "needsMeetingLink", 'type="url"', 'aria-required="true"']);
  requireNoText("components/enterprise/core-v2/meeting-form.tsx", ['name="minutes"']);
  requireText("components/enterprise/core-v2/enterprise-meetings-workspace.tsx", ["actionComment", "actionError", "physicalLocation: locationMode === \"ONLINE\" ? \"\"", "meetingLink: locationMode === \"PHYSICAL\" ? \"\"", 'presentation="editor"']);
  requireNoNativeConfirmation("components/enterprise/core-v2/enterprise-meetings-workspace.tsx");
}

function workflowChecks() {
  requireText("components/enterprise/core-v2/enterprise-workflows-workspace.tsx", ["EnterpriseWorkflowsWorkspace", "WorkflowPublishReview", "draftDirty", "stepError", "transitionError", 'presentation="editor"']);
  requireNoText("components/enterprise/core-v2/enterprise-workflows-workspace.tsx", ["acknowledgeReadiness: true"]);
  requireNoNativeConfirmation("components/enterprise/core-v2/enterprise-workflows-workspace.tsx");
  requireText("components/enterprise/core-v2/workflow-publish-review.tsx", ["reviewToken", "reviewedVersionId", "Publish reviewed version", "Publier la version revue", 'presentation="editor"']);
  requireText("lib/enterprise/workflows/validators.ts", ["reviewedVersionId: idSchema", "reviewToken:", "^[a-f0-9]{64}$"]);
  requireText("app/api/enterprise/[organizationId]/workflows/[id]/versions/[versionId]/publish/route.ts", ["createHash", 'createHash("sha256")', "WORKFLOW_REVIEW_VERSION_MISMATCH", "WORKFLOW_REVIEW_STALE", "reviewedVersionId", "reviewToken", "loadPublishReview"]);
  requireText("prisma/enterprise-workflow-engine.prisma", ["model EnterpriseWorkflowVersion", "model EnterpriseWorkflowActionAttempt", "idempotencyKey", "workflowVersionId"]);
  requireText("scripts/qa-enterprise-workflow-engine-checks.mjs", ["workflow"]);
}

function documentChecks() {
  requireText("app/api/enterprise/[organizationId]/documents/[id]/links/route.ts", ["createEnterpriseLink", "EnterpriseDocument", "isSameOriginRequest", "canAccessEnterpriseDocument"]);
  requireText("components/enterprise/core-v2/enterprise-documents-workspace.tsx", ["/links", "/versions", "/download", "signedUrl"]);
  requireText("scripts/qa-enterprise-core-v2-sprint7-checks.mjs", ["EnterpriseDocumentVersion", "createSignedUrl", "private storage"]);
  requireNoText("prisma/standard-work-coordination.prisma", ["model EnterpriseDocumentLink"]);
  requireText("app/api/enterprise/[organizationId]/documents/[id]/advanced/route.ts", ["PROVIDER_NOT_CONFIGURED", "NOT_CONFIGURED", "getEnterpriseDocumentSignedDownload", "DOCUMENT_INDEX_ENDPOINT", "DOCUMENT_VISUAL_DIFF_ENDPOINT", "AbortSignal.timeout"]);
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
  requireText("components/activities/work-prestations-panel-v2.tsx", ["translateActivities", "canSubmitPastPeriods", "selectedSubmission"]);
  requireText("locales/activities.fr.json", ['"work.historyTitle": "Historique des prestations"']);
  requireText("locales/activities.en.json", ['"work.historyTitle": "Submission history"']);
}

function slaChecks() {
  requireText("app/api/operations/sla/route.ts", ["CREATE_POLICY", "BIND_INSTANCE", "EVALUATE", "ARCHIVE_POLICY"]);
  requireText("lib/operational-sla.ts", ["bindOperationalSlaInstance", "WARNING", "BREACHED"]);
  requireText("components/admin/operational-sla-panel.tsx", ["useAppLocale", "getOperationalSlaAdminCopy", "copy.eyebrow", "copy.policies.title", "copy.evaluateNow"]);
  requireText("lib/operational-sla-i18n.ts", ["SLA opérationnels avancés", "Advanced operational SLAs", "Politiques actives", "Active policies", "Évaluer maintenant", "Evaluate now"]);
}

function guideChecks() {
  const guides = ["CALENDAR", "DTSC_ACTIVITIES", "ENTERPRISE_ACTIVITIES", "TASKS_OPERATIONS", "INTERNAL_REQUESTS", "VALIDATIONS", "MEETINGS", "WORKFLOWS", "DOCUMENTS"];
  for (const guide of guides) requireText(`docs/user-guides/${guide}.md`, ["# Guide utilisateur", "Guide"]);
  requireText("docs/user-guides/ADMIN_RBAC_INDIVIDUAL_PERMISSIONS.md", ["Permissions individuelles DTSC", "ALLOW", "DENY", "work.past_period.submit"]);
  requireText("lib/user-guides/iteration04-guides.ts", ["CALENDAR:", "DTSC_ACTIVITIES:", "ENTERPRISE_ACTIVITIES:", "ADMIN_RBAC:", "updatedAt: \"2026-08-04\""]);
  requireText("components/user-guides/contextual-user-guide.tsx", ["useAppLocale", "translate", "userGuides.common.userGuide", "userGuides.common.searchLabel", "userGuides.common.searchPlaceholder", "userGuides.common.limitations"]);
  requireText("locales/fr.json", ['"userGuide": "Guide utilisateur"', '"searchLabel": "Rechercher dans le guide"', '"searchPlaceholder": "Tapez un mot-clé"', '"limitations": "Fonctionnalités conditionnelles ou limites connues"']);
  requireText("locales/en.json", ['"userGuide": "User guide"', '"searchLabel": "Search this guide"', '"searchPlaceholder": "Type a keyword"', '"limitations": "Conditional features or known limitations"']);
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

const checks = { calendar: calendarChecks, activities: permissionChecks, tasks: taskChecks, requests: requestChecks, validations: validationChecks, meetings: meetingChecks, workflows: workflowChecks, documents: documentChecks, notifications: notificationChecks, guides: guideChecks, permissions: permissionChecks, sla: slaChecks, images: imageDebtChecks };

const editorDialogScopes = new Set(["all", "tasks", "requests", "validations", "meetings", "workflows"]);
if (editorDialogScopes.has(scope)) editorDialogScrollChecks();

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
