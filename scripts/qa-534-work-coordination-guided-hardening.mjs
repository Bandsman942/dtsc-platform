import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const hasAll = (source, markers) => markers.every((marker) => source.includes(marker));

const constants = read("lib/enterprise/core-v2/constants.ts");
const validators = read("lib/enterprise/core-v2/validators.ts");
const guards = read("lib/enterprise/work-coordination/hotfix-guards.ts");
const taskActionsRoute = read("app/api/enterprise/[organizationId]/tasks/[id]/actions/route.ts");
const taskCoordinationRoute = read("app/api/enterprise/[organizationId]/tasks/[id]/coordination/route.ts");
const taskWorkspace = read("components/enterprise/core-v2/enterprise-tasks-workspace.tsx");
const requestRoute = read("app/api/enterprise/[organizationId]/requests/[id]/route.ts");
const requestCoordinationRoute = read("app/api/enterprise/[organizationId]/requests/[id]/coordination/route.ts");
const requestCoordination = read("lib/standard-work-coordination/request-coordination.ts");
const requestWorkspace = read("components/enterprise/core-v2/enterprise-requests-workspace.tsx");
const requestForm = read("components/enterprise/core-v2/request-form.tsx");
const approvalWorkspace = read("components/enterprise/core-v2/enterprise-approvals-workspace.tsx");
const approvalPanel = read("components/enterprise/core-v2/approval-coordination-panel.tsx");
const approvalCoordination = read("lib/standard-work-coordination/approval-coordination.ts");
const meetingRoute = read("app/api/enterprise/[organizationId]/meetings/[id]/route.ts");
const meetingCoordinationRoute = read("app/api/enterprise/[organizationId]/meetings/[id]/coordination/route.ts");
const meetingForm = read("components/enterprise/core-v2/meeting-form.tsx");
const meetingWorkspace = read("components/enterprise/core-v2/enterprise-meetings-workspace.tsx");
const workflowWorkspace = read("components/enterprise/core-v2/enterprise-workflows-workspace.tsx");
const workflowPublishRoute = read("app/api/enterprise/[organizationId]/workflows/[id]/versions/[versionId]/publish/route.ts");
const contributing = read("docs/CONTRIBUTING.md");

// Tasks: completion must be governed by the real coordination model.
check(hasAll(guards, [
  "enterpriseTaskChecklistItem.count",
  "enterpriseTaskBlocker.count",
  "enterpriseTaskDependency.findMany",
  "TASK_CHECKLIST_INCOMPLETE",
  "TASK_BLOCKERS_OPEN",
  "TASK_DEPENDENCIES_INCOMPLETE",
]), "Task completion readiness must use checklist, blocker and dependency sources of truth");
check(hasAll(taskActionsRoute, [
  'data.action === "COMPLETE"',
  "assertEnterpriseTaskCompletionReady",
  'data.action === "BLOCK"',
  'action: "ADD_BLOCKER"',
  'data.action === "RESUME"',
  "enterpriseTaskBlocker.count",
]), "Task quick actions must use canonical completion/blocker coordination instead of status-only shortcuts");
check(hasAll(taskCoordinationRoute, ["assertTaskCoordinationMutationAllowed", '["DONE", "CANCELLED"]']), "Task coordination must become read-only for terminal tasks");
check(hasAll(validators, ['["BLOCK", "CANCEL", "ARCHIVE"]', "Un motif est obligatoire pour cette action"]), "Sensitive task actions must require a reason server-side");
check(hasAll(taskWorkspace, ['presentation="editor"', "actionComment", '["BLOCK", "CANCEL", "ARCHIVE"]', "checklist", "dépendances"]), "Task workspace must provide full-screen review and preserve sensitive action reasons");

// Requests: one canonical lifecycle, typed catalogue, correction editing and contextual actions.
for (const forbidden of ["TRIAGED", "ASSIGNED", "WAITING_APPROVAL", "REOPENED"]) {
  check(!constants.includes(`"${forbidden}"`), `Request core constants must not retain non-canonical status ${forbidden}`);
  check(!requestWorkspace.includes(`"${forbidden}"`), `Request workspace must not advertise non-canonical status ${forbidden}`);
  check(!requestCoordinationRoute.includes(`"${forbidden}"`), `Request coordination route must not authorize non-canonical status ${forbidden}`);
}
check(hasAll(constants, ["WAITING_REQUESTER", "CORRECTION_REQUESTED", "RESOLVED", "CLOSED"]), "Canonical request lifecycle must include coordination and approval correction states");
check(hasAll(requestCoordination, [
  'if (action === "REOPEN")',
  'return "IN_PROGRESS"',
  "revision: request.revision",
  "REVISION_CONFLICT",
]), "Request reopen must return to IN_PROGRESS and coordination transitions must be revision-safe");
check(hasAll(requestForm, ["NativeSelect", "requestTypeChoices", '"GENERAL"', '"FOLLOW_UP"']), "Request type must use the canonical controlled catalogue rather than free text");
check(hasAll(requestWorkspace, [
  "requestStatuses",
  "requestTypes",
  "requestTypeLabel",
  'presentation="editor"',
  "actionComment",
  '["SUBMITTED", "IN_REVIEW"]',
]), "Request workspace must expose canonical states/types, guided review and approval states only where the server accepts them");
check(hasAll(requestRoute, [
  'existing.status === "CORRECTION_REQUESTED"',
  "updateEnterpriseRequestCorrection",
  '["DRAFT", "CORRECTION_REQUESTED"]',
]), "Requester must be able to edit only a draft or a request explicitly returned for correction");
check(hasAll(guards, [
  "updateEnterpriseRequestCorrection",
  "organizationMember.findFirst",
  "enterpriseDepartment.findFirst",
  "REQUEST_TYPES",
  'status: "CORRECTION_REQUESTED"',
  "REVISION_CONFLICT",
]), "Correction editing must revalidate tenant member, department, canonical type changes and revision server-side");
check(hasAll(requestCoordinationRoute, [
  'canRequestInformation: context.canOperate && ["SUBMITTED", "IN_REVIEW", "IN_PROGRESS"]',
  'canResolve: context.canOperate && ["IN_REVIEW", "IN_PROGRESS", "APPROVED"]',
]), "Request coordination capabilities must match the canonical lifecycle");
check(hasAll(read("components/enterprise/core-v2/request-coordination-panel.tsx"), ["submitting", "comment.trim()", "aria-invalid"]), "Request coordination UI must require and preserve contextual notes");

// Approvals: decisions must pass through the immutable/versioned review flow.
check(!approvalWorkspace.includes('runAction(approval, "APPROVE")') && !approvalWorkspace.includes('runAction(approval, "REJECT")'), "Approval list must not allow direct final decisions outside the versioned review");
check(hasAll(approvalWorkspace, ['presentation="editor"', "ApprovalCoordinationPanel", "Examiner et décider"]), "Approval decisions must open the full-screen versioned review");
check(hasAll(approvalPanel, ["snapshotJson", "ApprovalSnapshotSummary", "Submitted content to review", "immutable snapshot"]), "Approval review must expose the immutable submitted snapshot before decision");
const correctionStart = approvalCoordination.indexOf("async function syncTargetForCorrection");
const correctionEnd = approvalCoordination.indexOf("async function syncTargetForResubmission", correctionStart);
const correctionBlock = correctionStart >= 0 && correctionEnd > correctionStart ? approvalCoordination.slice(correctionStart, correctionEnd) : "";
const resubmitStart = correctionEnd;
const resubmitEnd = approvalCoordination.indexOf("async function addApprovalEvent", resubmitStart);
const resubmitBlock = resubmitStart >= 0 && resubmitEnd > resubmitStart ? approvalCoordination.slice(resubmitStart, resubmitEnd) : "";
check(!correctionBlock.includes('entityType === "EnterpriseTask"') && !resubmitBlock.includes('entityType === "EnterpriseTask"'), "Approval correction/resubmission must not invent task lifecycle statuses outside TASK_STATUSES");
check(hasAll(approvalCoordination, ['entityType === "EnterpriseRequest"', 'status: "CORRECTION_REQUESTED"', 'status: "SUBMITTED"']), "Request approval correction/resubmission must remain explicit and versioned");

// Meetings: participant responses, versioned minutes and lifecycle locks.
check(hasAll(meetingRoute, ["preserveMeetingParticipantResponses", "include: { participants: true }", "participants,"]), "Meeting edit must preserve responses for retained participants");
check(!meetingForm.includes('name="minutes"'), "General meeting form must not compete with the versioned minutes engine");
check(hasAll(meetingForm, ["needsPhysicalLocation", "needsMeetingLink", 'name="physicalLocation" required', 'name="meetingLink" type="url" required']), "Meeting location fields must be conditionally guided by ONLINE/PHYSICAL/HYBRID mode");
check(hasAll(meetingCoordinationRoute, ["assertMeetingCoordinationMutationAllowed", '["TODO", "IN_PROGRESS", "BLOCKED"]']), "Meeting coordination must lock terminal states and stop advertising impossible task states");
check(!meetingCoordinationRoute.includes('"PENDING_APPROVAL"'), "Meeting follow-up task selector must not use a task status outside TASK_STATUSES");
check(hasAll(meetingWorkspace, ['presentation="editor"', "actionComment", '["CANCEL", "ARCHIVE"]', "versioned minutes engine"]), "Meeting workspace must review sensitive lifecycle actions and reserve minutes for the versioned engine");

// Workflows: explicit publication acknowledgement, not an implicit button side effect.
check(hasAll(workflowWorkspace, [
  "publishReviewOpen",
  "confirmPublish",
  "Review workflow publication",
  "Server publication readiness",
  "Step sequence",
  "Branches to activate",
  "acknowledgeReadiness: true",
  'presentation="editor"',
]), "Workflow publication must use an explicit full-screen readiness review");
check(!workflowWorkspace.includes('onClick={() => void publish()}'), "Workflow publish button must not directly acknowledge readiness");
check(workflowWorkspace.includes('onClick={() => setPublishReviewOpen(true)}'), "Workflow publish entrypoint must open review first");
check(hasAll(workflowPublishRoute, ["workflowPublishSchema", "assertWorkflowAccess", "publishWorkflowVersion"]), "Workflow publication must remain server-validated and access controlled");

for (const workspace of [taskWorkspace, requestWorkspace, approvalWorkspace, meetingWorkspace, workflowWorkspace]) {
  check(!workspace.includes("window.prompt") && !workspace.includes("window.confirm") && !workspace.includes("window.alert"), "Work coordination professional workspaces must not use browser prompt/confirm/alert dialogs");
}
check(contributing.includes("OWNER_E2E") && contributing.includes("FORM_UX_CONTRACT.md"), "Hotfix #534 requires current CONTRIBUTING owner-E2E and form UX contracts");
check(!fs.existsSync(path.join(root, "prisma/migrations/20260830_work_coordination_guided_hardening")), "Hotfix #534 must not invent a Prisma migration when existing coordination models are sufficient");

if (failures.length) {
  console.error("FAIL qa-534-work-coordination-guided-hardening");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS qa-534-work-coordination-guided-hardening");
console.log("- Tasks cannot complete around checklist/blocker/dependency readiness and quick blocking uses the canonical blocker engine");
console.log("- Requests use one canonical lifecycle, controlled request types and a governed correction/resubmission path");
console.log("- Approvals require immutable version review; meetings preserve participant responses and versioned minutes authority");
console.log("- Workflow publication requires an explicit readiness review before server acknowledgement");
console.log("- Sensitive actions use controlled full-screen review and no browser prompt/confirm/alert");
