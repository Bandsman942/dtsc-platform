import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing expected pattern: ${label}`);
  return source.replace(from, to);
}

function replaceAllLiteral(source, from, to) {
  return source.split(from).join(to);
}

function updateJson() {
  const frPath = "locales/enterprise-core.fr.json";
  const enPath = "locales/enterprise-core.en.json";
  const fr = JSON.parse(read(frPath));
  const en = JSON.parse(read(enPath));
  const keys = {
    "meetings.open.named": ["Open {{title}}", "Ouvrir {{title}}"],
    "meetings.legacy.aria": ["Historical meetings", "Réunions historiques"],
    "requests.open.named": ["Open {{title}}", "Ouvrir {{title}}"],
    "requests.legacy.aria": ["Historical requests", "Demandes historiques"],
    "approvals.legacy.aria": ["Historical approvals", "Validations historiques"],
    "approvals.target.purchase": ["Purchases", "Achats"],
    "approvals.target.budget": ["Budgets", "Budgets"],
    "approvals.target.expense": ["Expenses", "Dépenses"],
    "requests.coordination.event.ENTERPRISE_REQUEST_REQUEST_INFORMATION": ["Information requested", "Informations demandées"],
    "requests.coordination.event.ENTERPRISE_REQUEST_RESPOND": ["Requester response", "Réponse du demandeur"],
    "requests.coordination.event.ENTERPRISE_REQUEST_RESOLVE": ["Request resolved", "Demande résolue"],
    "requests.coordination.event.ENTERPRISE_REQUEST_CLOSE": ["Request closed", "Demande clôturée"],
    "requests.coordination.event.ENTERPRISE_REQUEST_REOPEN": ["Request reopened", "Demande rouverte"],
  };
  for (const [key, [enValue, frValue]] of Object.entries(keys)) {
    en[key] = enValue;
    fr[key] = frValue;
  }
  delete en["meetings.coordination.en.gb"];
  delete fr["meetings.coordination.en.gb"];
  write(enPath, `${JSON.stringify(en, null, 2)}\n`);
  write(frPath, `${JSON.stringify(fr, null, 2)}\n`);
}

function fixMeetingsWorkspace() {
  const file = "components/enterprise/core-v2/enterprise-meetings-workspace.tsx";
  let source = read(file);
  source = replaceAllLiteral(source, '  const en = locale === "en";\n', "");
  source = source.replace("deepLinkResolved, deepLinkedMeetingId, en, organizationId", "deepLinkResolved, deepLinkedMeetingId, locale, organizationId");
  source = replaceRequired(source, 'openLabel={en ? `Open ${meeting.title}` : `Ouvrir ${meeting.title}`}', 'openLabel={enterpriseCoreT(locale, "meetings.open.named", { title: meeting.title })}', "meeting dynamic open label");
  source = replaceRequired(source, "currentUserId, en, setDetail", "currentUserId, locale, setDetail", "meeting action locale argument");
  source = replaceRequired(source, '<span>Page {collection.pagination.page}/{collection.pagination.pageCount}</span>', '<span>{enterpriseCoreT(locale, "common.page", { current: collection.pagination.page, total: collection.pagination.pageCount })}</span>', "meeting pagination");
  source = replaceRequired(source, '<BusinessList ariaLabel="legacy meetings">', '<BusinessList ariaLabel={enterpriseCoreT(locale, "meetings.legacy.aria")}>', "meeting legacy aria");
  source = replaceRequired(source, '${formatEnterpriseDate(meeting.startAt, locale)} · ${meeting.locationMode} · ${meeting.participants.length}', '${formatEnterpriseDate(meeting.startAt, locale)} · ${meetingLocationModeLabel(locale, meeting.locationMode)} · ${meeting.participants.length}', "meeting mode list label");
  source = replaceRequired(source, '<StatusBadge>{meeting.locationMode}</StatusBadge>', '<StatusBadge>{meetingLocationModeLabel(locale, meeting.locationMode)}</StatusBadge>', "meeting mode detail label");
  source = replaceRequired(source, '{pendingAction?.action} · {pendingAction?.meeting.title}', '{pendingAction ? meetingActionLabel(locale, pendingAction.action) : ""} · {pendingAction?.meeting.title}', "meeting pending action label");
  source = replaceRequired(source, 'function meetingActions(meeting: Meeting, canManage: boolean, currentUserId: string, en: boolean,', 'function meetingActions(meeting: Meeting, canManage: boolean, currentUserId: string, locale: string | null | undefined,', "meeting action helper signature");
  const marker = "function meetingActions(";
  if (!source.includes("function meetingLocationModeLabel(")) {
    const helpers = `function meetingLocationModeLabel(locale: string | null | undefined, mode: string) {\n  if (mode === "ONLINE") return enterpriseCoreT(locale, "meeting.locationMode.ONLINE");\n  if (mode === "PHYSICAL") return enterpriseCoreT(locale, "meeting.locationMode.PHYSICAL");\n  if (mode === "HYBRID") return enterpriseCoreT(locale, "meeting.locationMode.HYBRID");\n  return mode;\n}\n\nfunction meetingActionLabel(locale: string | null | undefined, action: string) {\n  if (action === "START") return enterpriseCoreT(locale, "common.start");\n  if (action === "COMPLETE") return enterpriseCoreT(locale, "common.complete");\n  if (action === "CANCEL") return enterpriseCoreT(locale, "common.cancel");\n  if (action === "ARCHIVE") return enterpriseCoreT(locale, "common.archive");\n  return action;\n}\n\n`;
    source = source.replace(marker, helpers + marker);
  }
  write(file, source);
}

function fixRequestsWorkspace() {
  const file = "components/enterprise/core-v2/enterprise-requests-workspace.tsx";
  let source = read(file);
  source = source.replace('import { formatEnterpriseDate as coreFormatEnterpriseDate, priorityChoices as corePriorityChoices, statusLabel as coreStatusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";', 'import { priorityChoices as corePriorityChoices } from "@/components/enterprise/core-v2/erp-v2-ui";');
  source = source.replace("priorityChoicesEn, priorityChoicesFr, ", "");
  source = replaceAllLiteral(source, '  const en = locale === "en";\n', "");
  source = replaceRequired(source, 'openLabel={en ? `Open ${requestRecord.title}` : `Ouvrir ${requestRecord.title}`}', 'openLabel={enterpriseCoreT(locale, "requests.open.named", { title: requestRecord.title })}', "request dynamic open label");
  source = replaceRequired(source, "actionsFor(requestRecord, canManage, en, setDetail", "actionsFor(requestRecord, canManage, locale, setDetail", "request action locale argument");
  source = replaceRequired(source, '<span>Page {collection.pagination.page}/{collection.pagination.pageCount}</span>', '<span>{enterpriseCoreT(locale, "common.page", { current: collection.pagination.page, total: collection.pagination.pageCount })}</span>', "request pagination");
  source = replaceRequired(source, '<BusinessList ariaLabel="legacy requests">', '<BusinessList ariaLabel={enterpriseCoreT(locale, "requests.legacy.aria")}>', "request legacy aria");
  source = replaceRequired(source, '{pendingAction?.action} · {pendingAction?.request.title}', '{pendingAction ? requestActionLabel(locale, pendingAction.action) : ""} · {pendingAction?.request.title}', "request pending action label");
  source = replaceRequired(source, 'function actionsFor(requestRecord: RequestItem, canManage: boolean, en: boolean,', 'function actionsFor(requestRecord: RequestItem, canManage: boolean, locale: string | null | undefined,', "request action helper signature");
  const marker = "function actionsFor(";
  if (!source.includes("function requestActionLabel(")) {
    const helper = `function requestActionLabel(locale: string | null | undefined, action: string) {\n  if (action === "SUBMIT") return enterpriseCoreT(locale, "requests.submit");\n  if (action === "TAKE") return enterpriseCoreT(locale, "requests.take.ownership");\n  if (action === "FULFILL") return enterpriseCoreT(locale, "requests.mark.fulfilled");\n  if (action === "CANCEL") return enterpriseCoreT(locale, "common.cancel");\n  if (action === "ARCHIVE") return enterpriseCoreT(locale, "common.archive");\n  return action;\n}\n\n`;
    source = source.replace(marker, helper + marker);
  }
  write(file, source);
}

function fixApprovalsWorkspace() {
  const file = "components/enterprise/core-v2/enterprise-approvals-workspace.tsx";
  let source = read(file);
  source = replaceAllLiteral(source, '  const en = locale === "en";\n', "");
  source = source.replace("deepLinkResolved, deepLinkedApprovalId, en, organizationId", "deepLinkResolved, deepLinkedApprovalId, locale, organizationId");
  source = replaceRequired(source, "approvalActions(approval, en, setDetail", "approvalActions(approval, locale, setDetail", "approval action locale argument");
  source = replaceRequired(source, '<span>Page {collection.pagination.page}/{collection.pagination.pageCount}</span>', '<span>{enterpriseCoreT(locale, "common.page", { current: collection.pagination.page, total: collection.pagination.pageCount })}</span>', "approval pagination");
  source = replaceRequired(source, '<BusinessList ariaLabel="legacy approvals">', '<BusinessList ariaLabel={enterpriseCoreT(locale, "approvals.legacy.aria")}>', "approval legacy aria");
  source = replaceAllLiteral(source, 'approval.target?.title || `${approval.targetEntityType} · ${approval.targetEntityId}`', 'approval.target?.title || `${approvalTargetLabel(locale, approval.targetEntityType)} · ${approval.targetEntityId}`');
  source = replaceAllLiteral(source, '${approval.targetEntityType} · ${formatEnterpriseDate(approval.requestedAt, locale)}', '${approvalTargetLabel(locale, approval.targetEntityType)} · ${formatEnterpriseDate(approval.requestedAt, locale)}');
  source = replaceRequired(source, 'title={detail?.target?.title || detail?.targetEntityType || ""}', 'title={detail?.target?.title || (detail ? approvalTargetLabel(locale, detail.targetEntityType) : "")}', "approval detail title");
  source = replaceRequired(source, '{detail.targetEntityType} · {detail.targetEntityId}', '{approvalTargetLabel(locale, detail.targetEntityType)} · {detail.targetEntityId}', "approval target detail label");
  source = replaceRequired(source, 'function approvalActions(approval: Approval, en: boolean,', 'function approvalActions(approval: Approval, locale: string | null | undefined,', "approval action helper signature");
  const marker = "function approvalActions(";
  if (!source.includes("function approvalTargetLabel(")) {
    const helper = `function approvalTargetLabel(locale: string | null | undefined, entityType: string) {\n  if (entityType === "EnterpriseRequest") return enterpriseCoreT(locale, "requests.requests");\n  if (entityType === "EnterpriseTask") return enterpriseCoreT(locale, "tasks.ariaLabel");\n  if (entityType === "EnterpriseMeeting") return enterpriseCoreT(locale, "meetings.meetings");\n  if (entityType === "EnterprisePurchase") return enterpriseCoreT(locale, "approvals.target.purchase");\n  if (entityType === "EnterpriseBudget") return enterpriseCoreT(locale, "approvals.target.budget");\n  if (entityType === "EnterpriseExpense") return enterpriseCoreT(locale, "approvals.target.expense");\n  if (entityType === "PharmacyQualityIncident") return enterpriseCoreT(locale, "approvals.pharmacy.incidents");\n  return entityType;\n}\n\n`;
    source = source.replace(marker, helper + marker);
  }
  write(file, source);
}

function fixRequestForm() {
  const file = "components/enterprise/core-v2/request-form.tsx";
  let source = read(file);
  source = source.replace('import { formatEnterpriseDate as coreFormatEnterpriseDate, priorityChoices as corePriorityChoices, statusLabel as coreStatusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";', 'import { priorityChoices as corePriorityChoices } from "@/components/enterprise/core-v2/erp-v2-ui";');
  source = source.replace("priorityChoicesEn, priorityChoicesFr, ", "");
  write(file, source);
}

function fixRequestCoordination() {
  const file = "components/enterprise/core-v2/request-coordination-panel.tsx";
  let source = read(file);
  source = source.replace('import { formatEnterpriseDate as coreFormatEnterpriseDate, priorityChoices as corePriorityChoices, statusLabel as coreStatusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";', 'import { formatEnterpriseDate as coreFormatEnterpriseDate, statusLabel as coreStatusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";');
  source = replaceAllLiteral(source, '  const en = locale === "en";\n', "");
  source = source.replace("}, [endpoint, en]);", "}, [endpoint, locale]);");
  source = source.replace('new Date(item.createdAt).toLocaleString(enterpriseCoreT(locale, "meetings.coordination.en.gb"))', "coreFormatEnterpriseDate(item.createdAt, locale)");
  source = replaceRequired(source, '<StatusBadge>{event.eventType}</StatusBadge>{event.fromStatus || event.toStatus ? <span className="text-xs text-dtsc-muted">{event.fromStatus || "—"} → {event.toStatus || "—"}</span> : null}', '<StatusBadge>{requestCoordinationEventLabel(locale, event.eventType)}</StatusBadge>{event.fromStatus || event.toStatus ? <span className="text-xs text-dtsc-muted">{event.fromStatus ? coreStatusLabel(locale, event.fromStatus) : "—"} → {event.toStatus ? coreStatusLabel(locale, event.toStatus) : "—"}</span> : null}', "request event labels");
  if (!source.includes("function requestCoordinationEventLabel(")) {
    source += `\nfunction requestCoordinationEventLabel(locale: string | null | undefined, eventType: string) {\n  if (eventType === "ENTERPRISE_REQUEST_REQUEST_INFORMATION") return enterpriseCoreT(locale, "requests.coordination.event.ENTERPRISE_REQUEST_REQUEST_INFORMATION");\n  if (eventType === "ENTERPRISE_REQUEST_RESPOND") return enterpriseCoreT(locale, "requests.coordination.event.ENTERPRISE_REQUEST_RESPOND");\n  if (eventType === "ENTERPRISE_REQUEST_RESOLVE") return enterpriseCoreT(locale, "requests.coordination.event.ENTERPRISE_REQUEST_RESOLVE");\n  if (eventType === "ENTERPRISE_REQUEST_CLOSE") return enterpriseCoreT(locale, "requests.coordination.event.ENTERPRISE_REQUEST_CLOSE");\n  if (eventType === "ENTERPRISE_REQUEST_REOPEN") return enterpriseCoreT(locale, "requests.coordination.event.ENTERPRISE_REQUEST_REOPEN");\n  return eventType;\n}\n`;
  }
  write(file, source);
}

function fixMeetingCoordination() {
  const file = "components/enterprise/core-v2/meeting-coordination-panel.tsx";
  let source = read(file);
  source = source.replace('import { formatEnterpriseDate as coreFormatEnterpriseDate, priorityChoices as corePriorityChoices, statusLabel as coreStatusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";', 'import { formatEnterpriseDate as coreFormatEnterpriseDate, statusLabel as coreStatusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";');
  source = replaceAllLiteral(source, '  const en = locale === "en";\n', "");
  source = source.replace("}, [endpoint, en]);", "}, [endpoint, locale]);");
  source = replaceAllLiteral(source, 'new Date(conflict.startAt).toLocaleString(enterpriseCoreT(locale, "meetings.coordination.en.gb"))', "coreFormatEnterpriseDate(conflict.startAt, locale)");
  source = replaceAllLiteral(source, 'new Date(version.createdAt).toLocaleString(enterpriseCoreT(locale, "meetings.coordination.en.gb"))', "coreFormatEnterpriseDate(version.createdAt, locale)");
  source = replaceRequired(source, 'className="h-9 shrink-0 rounded-xl border border-dtsc-border px-3 text-xs font-black">{status}</button>', 'className="h-9 shrink-0 rounded-xl border border-dtsc-border px-3 text-xs font-black">{coreStatusLabel(locale, status)}</button>', "agenda status buttons");
  source = replaceRequired(source, '{task.title} · {task.status}</option>', '{task.title} · {coreStatusLabel(locale, task.status)}</option>', "linked task status label");
  write(file, source);
}

function fixApprovalCoordination() {
  const file = "components/enterprise/core-v2/approval-coordination-panel.tsx";
  let source = read(file);
  source = source.replace('import { formatEnterpriseDate as coreFormatEnterpriseDate, priorityChoices as corePriorityChoices, statusLabel as coreStatusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";', 'import { formatEnterpriseDate as coreFormatEnterpriseDate, statusLabel as coreStatusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";');
  source = replaceAllLiteral(source, '  const en = locale === "en";\n', "");
  source = source.replace("}, [endpoint, en]);", "}, [endpoint, locale]);");
  source = replaceAllLiteral(source, 'new Date(version.submittedAt).toLocaleString(enterpriseCoreT(locale, "meetings.coordination.en.gb"))', "coreFormatEnterpriseDate(version.submittedAt, locale)");
  source = replaceAllLiteral(source, 'new Date(decision.createdAt).toLocaleString(enterpriseCoreT(locale, "meetings.coordination.en.gb"))', "coreFormatEnterpriseDate(decision.createdAt, locale)");
  source = replaceRequired(source, '<StatusBadge>{decision.decision}</StatusBadge>', '<StatusBadge>{approvalDecisionLabel(locale, decision.decision)}</StatusBadge>', "approval decision label");
  if (!source.includes("function approvalDecisionLabel(")) {
    source += `\nfunction approvalDecisionLabel(locale: string | null | undefined, decision: string) {\n  if (decision === "APPROVE") return enterpriseCoreT(locale, "approval.decision.APPROVE");\n  if (decision === "REJECT") return enterpriseCoreT(locale, "approval.decision.REJECT");\n  return decision;\n}\n`;
  }
  write(file, source);
}

updateJson();
fixMeetingsWorkspace();
fixRequestsWorkspace();
fixApprovalsWorkspace();
fixRequestForm();
fixRequestCoordination();
fixMeetingCoordination();
fixApprovalCoordination();

console.log("#313 fixup applied.");
