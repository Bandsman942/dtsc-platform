import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const targets = [
  "components/enterprise/core-v2/enterprise-meetings-workspace.tsx",
  "components/enterprise/core-v2/meeting-form.tsx",
  "components/enterprise/core-v2/meeting-coordination-panel.tsx",
  "components/enterprise/core-v2/enterprise-requests-workspace.tsx",
  "components/enterprise/core-v2/request-form.tsx",
  "components/enterprise/core-v2/request-coordination-panel.tsx",
  "components/enterprise/core-v2/enterprise-approvals-workspace.tsx",
  "components/enterprise/core-v2/approval-coordination-panel.tsx",
];

const fr = JSON.parse(read("locales/enterprise-core.fr.json"));
const en = JSON.parse(read("locales/enterprise-core.en.json"));
const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();
check(JSON.stringify(frKeys) === JSON.stringify(enKeys), "Enterprise Core FR/EN catalogs must keep exact key parity");
for (const key of frKeys) {
  check(typeof fr[key] === "string" && fr[key].trim().length > 0, `Missing French copy for ${key}`);
  check(typeof en[key] === "string" && en[key].trim().length > 0, `Missing English copy for ${key}`);
}

for (const file of targets) {
  const source = read(file);
  check(source.includes("enterpriseCoreT"), `${file} must use the canonical Enterprise Core translator`);
  check(!/locale\s*===\s*["']en["']\s*\?\s*["'`]/.test(source), `${file} still contains a local locale===en customer-copy ternary`);
  check(!/\ben\s*\?\s*["'`]/.test(source), `${file} still contains a local en customer-copy ternary`);
  check(!source.includes('"en-GB"') && !source.includes('"fr-FR"') && !source.includes('"en-US"'), `${file} must not hardcode visible date locales`);
  check(!source.includes("toLocaleString(enterpriseCoreT("), `${file} must not translate a locale identifier as customer copy`);
}

const meetings = read("components/enterprise/core-v2/enterprise-meetings-workspace.tsx");
check(meetings.includes('searchParams.get("meeting")'), "Meetings deep-link contract must remain intact");
check(meetings.includes("meetingLocationModeLabel(locale, meeting.locationMode)"), "Meeting location mode must be projected through a localized label");
check(meetings.includes("meetingActions(meeting, Boolean(collection.meta.canManage ?? canManage), currentUserId, locale"), "Meeting action helper must receive locale explicitly");
check(meetings.includes('enterpriseCoreT(locale, "meetings.open.named", { title: meeting.title })'), "Meeting dynamic open label must be canonical i18n");
check(!meetings.includes("{meeting.locationMode}</StatusBadge>"), "Raw meeting location mode must not render in the detail badge");
check(!meetings.includes("pendingAction?.action} ·"), "Raw meeting action code must not render in the confirmation dialog");

const meetingForm = read("components/enterprise/core-v2/meeting-form.tsx");
check(meetingForm.includes('enterpriseCoreT(locale, "meeting.locationMode.ONLINE")'), "Meeting form must localize ONLINE mode");
check(meetingForm.includes('enterpriseCoreT(locale, "meeting.locationMode.HYBRID")'), "Meeting form must localize HYBRID mode");

const meetingCoordination = read("components/enterprise/core-v2/meeting-coordination-panel.tsx");
check(meetingCoordination.includes("coreFormatEnterpriseDate(conflict.startAt, locale)"), "Meeting conflict date must use the locale-aware Enterprise helper");
check(meetingCoordination.includes("coreFormatEnterpriseDate(version.createdAt, locale)"), "Meeting minutes version date must use the locale-aware Enterprise helper");
check(meetingCoordination.includes("coreStatusLabel(locale, status)"), "Agenda status choices must render canonical localized status labels");
check(meetingCoordination.includes("coreStatusLabel(locale, task.status)"), "Linked task status must render a localized label");
check(!meetingCoordination.includes(">{status}</button>"), "Raw agenda status must not be rendered as a button label");
check(!meetingCoordination.includes("{task.title} · {task.status}"), "Raw linked task status must not be rendered");

const requests = read("components/enterprise/core-v2/enterprise-requests-workspace.tsx");
check(requests.includes('searchParams.get("request")'), "Requests deep-link contract must remain intact");
check(requests.includes("items={corePriorityChoices(locale)}"), "Request priority filter must use canonical locale-aware choices");
check(requests.includes("actionsFor(requestRecord, canManage, locale"), "Request action helper must receive locale explicitly");
check(requests.includes('enterpriseCoreT(locale, "requests.open.named", { title: requestRecord.title })'), "Request dynamic open label must be canonical i18n");
check(!requests.includes("priorityChoicesEn") && !requests.includes("priorityChoicesFr"), "Request workspace must not use parallel FR/EN priority arrays");
check(!requests.includes("pendingAction?.action} ·"), "Raw request action code must not render in the confirmation dialog");

const requestForm = read("components/enterprise/core-v2/request-form.tsx");
check(requestForm.includes("items={corePriorityChoices(locale)}"), "Request form must use canonical locale-aware priority choices");
check(!requestForm.includes("priorityChoicesEn") && !requestForm.includes("priorityChoicesFr"), "Request form must not use parallel FR/EN priority arrays");

const requestCoordination = read("components/enterprise/core-v2/request-coordination-panel.tsx");
check(requestCoordination.includes("coreFormatEnterpriseDate(item.createdAt, locale)"), "Request coordination dates must use the locale-aware helper");
check(requestCoordination.includes("requestCoordinationEventLabel(locale, event.eventType)"), "Request lifecycle event type must be projected through a localized label");
check(requestCoordination.includes("coreStatusLabel(locale, event.fromStatus)"), "Request lifecycle source status must be localized");
check(requestCoordination.includes("coreStatusLabel(locale, event.toStatus)"), "Request lifecycle destination status must be localized");
check(!requestCoordination.includes("<StatusBadge>{event.eventType}</StatusBadge>"), "Raw request lifecycle event type must not render");

const approvals = read("components/enterprise/core-v2/enterprise-approvals-workspace.tsx");
check(approvals.includes('searchParams.get("approval")'), "Approvals deep-link contract must remain intact");
check(approvals.includes("approvalActions(approval, locale"), "Approval action helper must receive locale explicitly");
check(approvals.includes("approvalTargetLabel(locale, approval.targetEntityType)"), "Approval target type must be localized in list projections");
check(!approvals.includes("pending?.approval.targetEntityType}>{"), "Approval confirmation must not rely on a raw target type label");

const approvalCoordination = read("components/enterprise/core-v2/approval-coordination-panel.tsx");
check(approvalCoordination.includes("coreFormatEnterpriseDate(version.submittedAt, locale)"), "Approval version date must use the locale-aware helper");
check(approvalCoordination.includes("coreFormatEnterpriseDate(decision.createdAt, locale)"), "Approval decision date must use the locale-aware helper");
check(approvalCoordination.includes("approvalDecisionLabel(locale, decision.decision)"), "Approval decision codes must be projected through localized labels");
check(!approvalCoordination.includes("<StatusBadge>{decision.decision}</StatusBadge>"), "Raw approval decision code must not render");

for (const key of [
  "status.TRIAGED",
  "status.ASSIGNED",
  "status.WAITING_REQUESTER",
  "status.WAITING_APPROVAL",
  "status.CORRECTION_REQUESTED",
  "status.REOPENED",
  "status.DISCUSSED",
  "status.DEFERRED",
  "meeting.locationMode.ONLINE",
  "meeting.locationMode.PHYSICAL",
  "meeting.locationMode.HYBRID",
  "approval.decision.APPROVE",
  "approval.decision.REJECT",
  "requests.coordination.event.ENTERPRISE_REQUEST_REQUEST_INFORMATION",
  "requests.coordination.event.ENTERPRISE_REQUEST_RESPOND",
  "requests.coordination.event.ENTERPRISE_REQUEST_RESOLVE",
  "requests.coordination.event.ENTERPRISE_REQUEST_CLOSE",
  "requests.coordination.event.ENTERPRISE_REQUEST_REOPEN",
]) {
  check(typeof fr[key] === "string" && typeof en[key] === "string", `Canonical coordination key missing in FR/EN: ${key}`);
}

const runner = read("scripts/run-regression-qa-ci.mjs");
check(runner.includes("qa-enterprise-core-coordination-i18n-313.mjs"), "#313 QA must be integrated into Regression QA");

for (const tempFile of [
  ".github/workflows/tmp-313-enterprise-coordination-i18n.yml",
  "scripts/tmp-313-enterprise-coordination-i18n-codemod.mjs",
  "scripts/tmp-313-enterprise-coordination-i18n-fixup.mjs",
]) {
  check(!fs.existsSync(path.join(root, tempFile)), `Temporary #313 artifact must not remain in final branch: ${tempFile}`);
}

if (failures.length) {
  console.error("Issue #313 Enterprise coordination i18n QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Issue #313 Enterprise coordination i18n QA passed: Meetings, Requests and Approvals use canonical FR/EN copy, locale-aware dates/statuses and no raw coordination codes in guarded customer surfaces.");
