import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { workCoordinationDeepLink } from "@/lib/standard-work-coordination/deep-links";

export type UnifiedCalendarEvent = {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  timezone: string;
  status: string;
  priority: string;
  contextType: "PERSONAL" | "DTSC_INTERNAL" | "ORGANIZATION";
  organizationId: string;
  ownerId: string | null;
  participantIds: string[];
  deepLink: string;
  canEdit: boolean;
  canDelete: boolean;
};

type CalendarSource = "calendar" | "tasks" | "requests" | "approvals" | "meetings" | "workflows" | "documents";

export type UnifiedCalendarInput = {
  organizationId: string;
  userId: string;
  canSeeAll: boolean;
  dtscInternal: boolean;
  timezone: string;
  from: Date;
  to: Date;
  sources?: CalendarSource[];
  internalCalendarWhere: Prisma.InternalCalendarEventWhereInput;
};

const SOURCE_ORDER: CalendarSource[] = ["calendar", "tasks", "requests", "approvals", "meetings", "workflows", "documents"];
const ACTIVE_TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "SUBMITTED", "PENDING_APPROVAL", "CORRECTION_REQUESTED"];
const ACTIVE_REQUEST_STATUSES = ["DRAFT", "SUBMITTED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "WAITING_REQUESTER", "WAITING_APPROVAL", "CORRECTION_REQUESTED", "REOPENED"];
const ACTIVE_APPROVAL_STATUSES = ["PENDING", "IN_REVIEW", "CORRECTION_REQUESTED"];
const ACTIVE_WORKFLOW_STATUSES = ["QUEUED", "RUNNING", "WAITING", "SUSPENDED", "RETRY_SCHEDULED"];

export function normalizeUnifiedCalendarRange(from: Date, to: Date) {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new Error("INVALID_CALENDAR_RANGE");
  if (to <= from) throw new Error("INVALID_CALENDAR_RANGE");
  const maximum = 93 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maximum) throw new Error("CALENDAR_RANGE_TOO_LARGE");
  return { from, to };
}

export async function loadUnifiedWorkCalendar(input: UnifiedCalendarInput) {
  const { from, to } = normalizeUnifiedCalendarRange(input.from, input.to);
  const requested = new Set(input.sources?.length ? input.sources : SOURCE_ORDER);
  const visibility = input.canSeeAll
    ? {}
    : { OR: [{ createdByUserId: input.userId }, { assignedToUserId: input.userId }] };
  const requestVisibility = input.canSeeAll
    ? {}
    : { OR: [{ requestedByUserId: input.userId }, { assignedToUserId: input.userId }] };
  const approvalVisibility = input.canSeeAll
    ? {}
    : { OR: [{ requestedByUserId: input.userId }, { approverUserId: input.userId }] };
  const meetingVisibility = input.canSeeAll
    ? {}
    : { OR: [{ organizerUserId: input.userId }, { participants: { some: { userId: input.userId } } }] };

  const [calendarEvents, tasks, requests, approvals, meetings, workflowRuns, documents] = await Promise.all([
    requested.has("calendar")
      ? prisma.internalCalendarEvent.findMany({
          where: { AND: [input.internalCalendarWhere, { startDateTime: { lte: to }, endDateTime: { gte: from } }] },
          select: {
            id: true,
            title: true,
            description: true,
            startDateTime: true,
            endDateTime: true,
            status: true,
            priority: true,
            organizationId: true,
            ownerCollaboratorId: true,
            sourceModule: true,
            sourceEntityType: true,
            sourceEntityId: true,
            participants: { where: { participantStatus: "Actif" }, select: { collaboratorId: true } },
          },
          orderBy: { startDateTime: "asc" },
          take: 500,
        })
      : Promise.resolve([]),
    requested.has("tasks")
      ? prisma.enterpriseTask.findMany({
          where: {
            organizationId: input.organizationId,
            archivedAt: null,
            status: { in: ACTIVE_TASK_STATUSES },
            AND: [visibility, { OR: [{ startAt: { lte: to }, dueAt: { gte: from } }, { startAt: null, dueAt: { gte: from, lte: to } }] }],
          },
          select: { id: true, title: true, description: true, startAt: true, dueAt: true, status: true, priority: true, assignedToUserId: true, createdByUserId: true },
          orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
          take: 500,
        })
      : Promise.resolve([]),
    requested.has("requests")
      ? prisma.enterpriseRequest.findMany({
          where: { organizationId: input.organizationId, archivedAt: null, status: { in: ACTIVE_REQUEST_STATUSES }, dueAt: { gte: from, lte: to }, AND: [requestVisibility] },
          select: { id: true, title: true, description: true, dueAt: true, status: true, priority: true, assignedToUserId: true, requestedByUserId: true },
          orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
          take: 500,
        })
      : Promise.resolve([]),
    requested.has("approvals")
      ? prisma.enterpriseApproval.findMany({
          where: { organizationId: input.organizationId, archivedAt: null, status: { in: ACTIVE_APPROVAL_STATUSES }, requestedAt: { gte: from, lte: to }, AND: [approvalVisibility] },
          select: { id: true, targetEntityType: true, targetEntityId: true, status: true, requestedAt: true, approverUserId: true, requestedByUserId: true },
          orderBy: { requestedAt: "asc" },
          take: 500,
        })
      : Promise.resolve([]),
    requested.has("meetings")
      ? prisma.enterpriseMeeting.findMany({
          where: { organizationId: input.organizationId, archivedAt: null, startAt: { lte: to }, endAt: { gte: from }, AND: [meetingVisibility] },
          select: { id: true, title: true, agenda: true, startAt: true, endAt: true, status: true, organizerUserId: true, participants: { select: { userId: true } } },
          orderBy: { startAt: "asc" },
          take: 500,
        })
      : Promise.resolve([]),
    requested.has("workflows")
      ? prisma.enterpriseWorkflowRun.findMany({
          where: {
            organizationId: input.organizationId,
            status: { in: ACTIVE_WORKFLOW_STATUSES },
            AND: [
              { OR: [{ resumeAt: { gte: from, lte: to } }, { resumeAt: null, startedAt: { gte: from, lte: to } }] },
              ...(input.canSeeAll
                ? []
                : [{ OR: [{ startedByUserId: input.userId }, { decisionActorUserId: input.userId }, { stepRuns: { some: { assignedUserId: input.userId } } }] }]),
            ],
          },
          select: { id: true, sourceEntityType: true, sourceEntityId: true, status: true, resumeAt: true, startedAt: true, startedByUserId: true, decisionActorUserId: true },
          orderBy: [{ resumeAt: "asc" }, { startedAt: "asc" }],
          take: 500,
        })
      : Promise.resolve([]),
    requested.has("documents")
      ? prisma.enterpriseDocument.findMany({
          where: {
            organizationId: input.organizationId,
            archivedAt: null,
            expiresAt: { gte: from, lte: to },
            ...(input.canSeeAll ? {} : { OR: [{ createdByUserId: input.userId }, { ownerUserId: input.userId }, { access: { some: { userId: input.userId } } }] }),
          },
          select: { id: true, title: true, description: true, status: true, expiresAt: true, ownerUserId: true, currentVersion: true },
          orderBy: { expiresAt: "asc" },
          take: 500,
        })
      : Promise.resolve([]),
  ]);

  const contextType = input.dtscInternal ? "DTSC_INTERNAL" as const : "ORGANIZATION" as const;
  const events: UnifiedCalendarEvent[] = [];

  for (const event of calendarEvents) {
    const linkedSource = resolveLinkedCalendarSource(event.sourceEntityType, event.sourceEntityId);
    const sourceType = linkedSource?.sourceType || "InternalCalendarEvent";
    const sourceId = linkedSource?.sourceId || event.id;
    events.push({
      id: `${sourceType}:${sourceId}`,
      sourceType,
      sourceId,
      title: event.title,
      description: event.description,
      startsAt: event.startDateTime,
      endsAt: event.endDateTime,
      allDay: false,
      timezone: input.timezone,
      status: event.status,
      priority: event.priority,
      contextType,
      organizationId: event.organizationId || input.organizationId,
      ownerId: event.ownerCollaboratorId,
      participantIds: event.participants.map((participant) => participant.collaboratorId),
      deepLink: linkedSource?.deepLink || workCoordinationDeepLink("CALENDAR_EVENT", event.id),
      canEdit: !linkedSource && (!event.sourceEntityId || event.sourceModule === "CALENDAR"),
      canDelete: !linkedSource && (!event.sourceEntityId || event.sourceModule === "CALENDAR"),
    });
  }

  for (const task of tasks) {
    const startsAt = task.startAt || task.dueAt;
    if (!startsAt) continue;
    events.push({
      id: `task:${task.id}`,
      sourceType: "EnterpriseTask",
      sourceId: task.id,
      title: task.title,
      description: task.description,
      startsAt,
      endsAt: task.dueAt && task.dueAt > startsAt ? task.dueAt : plusMinutes(startsAt, 30),
      allDay: !task.startAt,
      timezone: input.timezone,
      status: task.status,
      priority: task.priority,
      contextType,
      organizationId: input.organizationId,
      ownerId: task.assignedToUserId || task.createdByUserId,
      participantIds: [task.createdByUserId, task.assignedToUserId].filter((value): value is string => Boolean(value)),
      deepLink: workCoordinationDeepLink("TASK", task.id),
      canEdit: false,
      canDelete: false,
    });
  }

  for (const request of requests) {
    if (!request.dueAt) continue;
    events.push({
      id: `request:${request.id}`,
      sourceType: "EnterpriseRequest",
      sourceId: request.id,
      title: request.title,
      description: request.description,
      startsAt: request.dueAt,
      endsAt: plusMinutes(request.dueAt, 30),
      allDay: true,
      timezone: input.timezone,
      status: request.status,
      priority: request.priority,
      contextType,
      organizationId: input.organizationId,
      ownerId: request.assignedToUserId || request.requestedByUserId,
      participantIds: [request.requestedByUserId, request.assignedToUserId].filter((value): value is string => Boolean(value)),
      deepLink: workCoordinationDeepLink("REQUEST", request.id),
      canEdit: false,
      canDelete: false,
    });
  }

  for (const approval of approvals) {
    events.push({
      id: `approval:${approval.id}`,
      sourceType: "EnterpriseApproval",
      sourceId: approval.id,
      title: `Validation · ${approval.targetEntityType}`,
      description: `Décision attendue sur ${approval.targetEntityType} ${approval.targetEntityId}`,
      startsAt: approval.requestedAt,
      endsAt: plusMinutes(approval.requestedAt, 30),
      allDay: false,
      timezone: input.timezone,
      status: approval.status,
      priority: "HIGH",
      contextType,
      organizationId: input.organizationId,
      ownerId: approval.approverUserId,
      participantIds: [approval.requestedByUserId, approval.approverUserId],
      deepLink: workCoordinationDeepLink("APPROVAL", approval.id),
      canEdit: false,
      canDelete: false,
    });
  }

  for (const meeting of meetings) {
    events.push({
      id: `meeting:${meeting.id}`,
      sourceType: "EnterpriseMeeting",
      sourceId: meeting.id,
      title: meeting.title,
      description: meeting.agenda,
      startsAt: meeting.startAt,
      endsAt: meeting.endAt,
      allDay: false,
      timezone: input.timezone,
      status: meeting.status,
      priority: "NORMAL",
      contextType,
      organizationId: input.organizationId,
      ownerId: meeting.organizerUserId,
      participantIds: meeting.participants.map((participant) => participant.userId),
      deepLink: workCoordinationDeepLink("MEETING", meeting.id),
      canEdit: false,
      canDelete: false,
    });
  }

  for (const run of workflowRuns) {
    const startsAt = run.resumeAt || run.startedAt;
    events.push({
      id: `workflow:${run.id}`,
      sourceType: "EnterpriseWorkflowRun",
      sourceId: run.id,
      title: `Workflow · ${run.sourceEntityType}`,
      description: `Instance liée à ${run.sourceEntityType} ${run.sourceEntityId}`,
      startsAt,
      endsAt: plusMinutes(startsAt, 30),
      allDay: false,
      timezone: input.timezone,
      status: run.status,
      priority: run.status === "RETRY_SCHEDULED" ? "HIGH" : "NORMAL",
      contextType,
      organizationId: input.organizationId,
      ownerId: run.decisionActorUserId || run.startedByUserId,
      participantIds: [run.startedByUserId, run.decisionActorUserId].filter((value): value is string => Boolean(value)),
      deepLink: workCoordinationDeepLink("WORKFLOW_RUN", run.id),
      canEdit: false,
      canDelete: false,
    });
  }

  for (const document of documents) {
    if (!document.expiresAt) continue;
    events.push({
      id: `document:${document.id}`,
      sourceType: "EnterpriseDocument",
      sourceId: document.id,
      title: `Document à échéance · ${document.title}`,
      description: document.description,
      startsAt: document.expiresAt,
      endsAt: plusMinutes(document.expiresAt, 30),
      allDay: true,
      timezone: input.timezone,
      status: document.status,
      priority: "NORMAL",
      contextType,
      organizationId: input.organizationId,
      ownerId: document.ownerUserId,
      participantIds: document.ownerUserId ? [document.ownerUserId] : [],
      deepLink: workCoordinationDeepLink("DOCUMENT", document.id, document.currentVersion ? String(document.currentVersion) : null),
      canEdit: false,
      canDelete: false,
    });
  }

  const deduplicated = new Map<string, UnifiedCalendarEvent>();
  for (const event of events) {
    deduplicated.set(`${event.sourceType}:${event.sourceId}`, event);
  }
  return [...deduplicated.values()].sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
}

function resolveLinkedCalendarSource(entityType: string | null, entityId: string | null) {
  if (!entityType || !entityId) return null;
  if (entityType === "EnterpriseTask") return { sourceType: entityType, sourceId: entityId, deepLink: workCoordinationDeepLink("TASK", entityId) };
  if (entityType === "EnterpriseRequest") return { sourceType: entityType, sourceId: entityId, deepLink: workCoordinationDeepLink("REQUEST", entityId) };
  if (entityType === "EnterpriseApproval") return { sourceType: entityType, sourceId: entityId, deepLink: workCoordinationDeepLink("APPROVAL", entityId) };
  if (entityType === "EnterpriseMeeting") return { sourceType: entityType, sourceId: entityId, deepLink: workCoordinationDeepLink("MEETING", entityId) };
  if (entityType === "EnterpriseWorkflowRun") return { sourceType: entityType, sourceId: entityId, deepLink: workCoordinationDeepLink("WORKFLOW_RUN", entityId) };
  if (entityType === "EnterpriseDocument") return { sourceType: entityType, sourceId: entityId, deepLink: workCoordinationDeepLink("DOCUMENT", entityId) };
  if (entityType === "EnterpriseActivityRequest") return { sourceType: entityType, sourceId: entityId, deepLink: workCoordinationDeepLink("ACTIVITY", entityId) };
  return null;
}

function plusMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60_000);
}
