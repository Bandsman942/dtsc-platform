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
}

function taskChecks() {
  requireText("prisma/standard-work-coordination.prisma", ["model EnterpriseTaskChecklistItem", "model EnterpriseTaskDependency", "model EnterpriseTaskBlocker"]);
  requireText("lib/standard-work-coordination/task-coordination.ts", ["DEPENDENCY_CYCLE", "wouldCreateDependencyCycle", "TASK_BLOCKER_RESOLVED", "progress:"]);
  requireText("app/api/enterprise/[organizationId]/tasks/[id]/coordination/route.ts", ["isSameOriginRequest", "rateLimit", "context.canMutate"]);
  requireText("components/enterprise/core-v2/enterprise-tasks-workspace.tsx", ["collection.meta.currentUserId", "TaskCoordinationPanel"]);
  requireNoText("components/enterprise/core-v2/enterprise-tasks-workspace.tsx", ["|| Boolean(detail.assignedToUserId)"]);
}

function requestChecks() {
  requireText("app/api/enterprise/[organizationId]/requests/[id]/coordination/route.ts", ["isSameOriginRequest", "rateLimit"]);
  requireText("lib/standard-work-coordination/request-coordination.ts", ["REQUEST_INFORMATION", "REOPEN", "EnterpriseOperationalEvent"]);
}

function validationChecks() {
  requireText("prisma/standard-work-coordination.prisma", ["model EnterpriseApprovalSubmissionVersion", "model EnterpriseApprovalDecision", "idempotencyKey"]);
  requireText("lib/standard-work-coordination/approval-coordination.ts", ["CORRECTION_REASON_REQUIRED", "VERSION_MISMATCH", "recordApprovalDecision", "versionNumber", "plannedAmount: true"]);
  requireText("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts", ["REQUEST_CORRECTION", "RESUBMIT", "DELEGATE", "SELF_APPROVAL_FORBIDDEN", "notifyUser"]);
  requireNoText("lib/standard-work-coordination/approval-coordination.ts", ["totalAmount: true, revision: true, updatedAt: true } });\n    if (!item) throw new ApprovalCoordinationError(\"TARGET_NOT_FOUND\", 404, \"Budget source"]);
}

function meetingChecks() {
  requireText("prisma/standard-work-coordination.prisma", ["model EnterpriseMeetingAgendaItem", "model EnterpriseMeetingMinutesVersion", "model EnterpriseMeetingAction"]);
  requireText("lib/standard-work-coordination/meeting-coordination.ts", ["ADD_AGENDA_ITEM", "SAVE_MINUTES", "PUBLISH_MINUTES", "CREATE_FOLLOW_UP_TASK"]);
  requireText("app/api/enterprise/[organizationId]/meetings/[id]/coordination/route.ts", ["isSameOriginRequest", "rateLimit"]);
}

function workflowChecks() {
  requireText("components/enterprise/core-v2/enterprise-workflows-workspace.tsx", ["EnterpriseWorkflowsWorkspace"]);
  requireText("lib/enterprise/workflows/runtime-utils.ts", ["idempotency"]);
  requireText("scripts/qa-enterprise-workflow-engine-checks.mjs", ["workflow"]);
}

function documentChecks() {
  requireText("app/api/enterprise/[organizationId]/documents/[id]/links/route.ts", ["createEnterpriseLink", "EnterpriseDocument", "isSameOriginRequest", "canAccessEnterpriseDocument"]);
  requireText("components/enterprise/core-v2/enterprise-documents-workspace.tsx", ["/links", "/versions", "/download", "signedUrl"]);
  requireText("scripts/qa-enterprise-core-v2-sprint7-checks.mjs", ["documents"]);
  requireNoText("prisma/standard-work-coordination.prisma", ["model EnterpriseDocumentLink"]);
}

function notificationChecks() {
  requireText("lib/standard-work-coordination/deep-links.ts", ["workCoordinationDeepLink", "isInternalWorkCoordinationLink"]);
  requireText("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts", ["workCoordinationDeepLink", "notifyUser"]);
  requireText("prisma/standard-work-coordination.prisma", ["model EnterpriseWorkReminder", "idempotencyKey"]);
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
  for (const guide of guides) requireText(`docs/user-guides/${guide}.md`, ["#", "Limites"]);
  requireText("docs/MANUAL_E2E_STANDARD_MODULES_ITERATION_04.md", ["NON_EXÉCUTÉ", "Tests E2E manuels préparés — validation du propriétaire en attente"]);
}

const checks = {
  calendar: calendarChecks,
  activities: requestChecks,
  tasks: taskChecks,
  requests: requestChecks,
  validations: validationChecks,
  meetings: meetingChecks,
  workflows: workflowChecks,
  documents: documentChecks,
  notifications: notificationChecks,
  guides: guideChecks,
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
