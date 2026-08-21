import { z } from "zod";
import {
  APPROVAL_ACTIONS,
  APPROVAL_TARGET_TYPES,
  MEETING_ACTIONS,
  MEETING_LOCATION_MODES,
  MEETING_PARTICIPANT_ROLES,
  MEETING_RESPONSE_STATUSES,
  REQUEST_ACTIONS,
  REQUEST_TYPES,
  TASK_ACTIONS,
  TASK_PRIORITIES,
  TASK_TYPES,
} from "@/lib/enterprise/core-v2/constants";

const optionalId = z.union([z.literal(""), z.string().trim().min(1).max(160)]).optional();
const optionalText = (max = 5000) => z.union([z.literal(""), z.string().trim().max(max)]).optional();
const optionalDate = z.union([z.literal(""), z.coerce.date()]).optional();
const prioritySchema = z.enum(TASK_PRIORITIES).default("NORMAL");

const sourceFields = {
  sourceModule: optionalText(120),
  sourceEntityType: optionalText(120),
  sourceEntityId: optionalId,
};

const enterpriseTaskCreateBase = z.object({
  taskType: z.enum(TASK_TYPES).default("TASK"),
  title: z.string().trim().min(3).max(180),
  description: optionalText(5000),
  priority: prioritySchema,
  assignedToUserId: optionalId,
  departmentId: optionalId,
  startAt: optionalDate,
  dueAt: optionalDate,
  parentTaskId: optionalId,
  ...sourceFields,
});

export const enterpriseTaskCreateSchema = enterpriseTaskCreateBase.superRefine((data, ctx) => {
  const startAt = data.startAt instanceof Date ? data.startAt : null;
  const dueAt = data.dueAt instanceof Date ? data.dueAt : null;
  if (startAt && dueAt && dueAt <= startAt) {
    ctx.addIssue({ code: "custom", path: ["dueAt"], message: "L’échéance doit être postérieure au début." });
  }
});

export const enterpriseTaskUpdateSchema = z.object({
  revision: z.coerce.number().int().min(1),
  title: z.string().trim().min(3).max(180).optional(),
  description: optionalText(5000),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignedToUserId: optionalId,
  departmentId: optionalId,
  startAt: optionalDate,
  dueAt: optionalDate,
});

export const enterpriseTaskActionSchema = z.object({
  action: z.enum(TASK_ACTIONS),
  revision: z.coerce.number().int().min(1),
  comment: optionalText(3000),
});

export const enterpriseRequestCreateSchema = z.object({
  requestType: z.enum(REQUEST_TYPES),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(3).max(5000),
  priority: prioritySchema,
  assignedToUserId: optionalId,
  departmentId: optionalId,
  dueAt: optionalDate,
  ...sourceFields,
});

// Les anciennes demandes peuvent contenir un type historique hors catalogue. L'update
// reste compatible afin de ne pas rendre ces fiches impossibles à modifier ; les nouvelles
// demandes, elles, sont strictement bornées par REQUEST_TYPES.
export const enterpriseRequestUpdateSchema = z.object({
  revision: z.coerce.number().int().min(1),
  requestType: z.string().trim().min(2).max(100).optional(),
  title: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().min(3).max(5000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignedToUserId: optionalId,
  departmentId: optionalId,
  dueAt: optionalDate,
});

export const enterpriseRequestActionSchema = z.object({
  action: z.enum(REQUEST_ACTIONS),
  revision: z.coerce.number().int().min(1),
  comment: optionalText(3000),
});

export const enterpriseApprovalCreateSchema = z.object({
  targetEntityType: z.enum(APPROVAL_TARGET_TYPES),
  targetEntityId: z.string().trim().min(1).max(160),
  approverUserId: z.string().trim().min(1).max(160),
});

export const enterpriseApprovalActionSchema = z.object({
  action: z.enum(APPROVAL_ACTIONS),
  revision: z.coerce.number().int().min(1),
  decisionComment: optionalText(3000),
});

const meetingParticipantSchema = z.object({
  userId: z.string().trim().min(1).max(160),
  role: z.enum(MEETING_PARTICIPANT_ROLES).default("PARTICIPANT"),
  responseStatus: z.enum(MEETING_RESPONSE_STATUSES).default("INVITED"),
});

const enterpriseMeetingCreateBase = z.object({
  title: z.string().trim().min(3).max(180),
  agenda: optionalText(8000),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  locationMode: z.enum(MEETING_LOCATION_MODES).default("ONLINE"),
  physicalLocation: optionalText(500),
  meetingLink: optionalText(1000),
  departmentId: optionalId,
  participants: z.array(meetingParticipantSchema).max(100).default([]),
  ...sourceFields,
});

export const enterpriseMeetingCreateSchema = enterpriseMeetingCreateBase.superRefine((data, ctx) => {
  if (data.endAt <= data.startAt) {
    ctx.addIssue({ code: "custom", path: ["endAt"], message: "La fin de réunion doit être postérieure au début." });
  }
  if ((data.locationMode === "PHYSICAL" || data.locationMode === "HYBRID") && !data.physicalLocation) {
    ctx.addIssue({ code: "custom", path: ["physicalLocation"], message: "Le lieu physique est obligatoire pour ce mode." });
  }
  if ((data.locationMode === "ONLINE" || data.locationMode === "HYBRID") && !data.meetingLink) {
    ctx.addIssue({ code: "custom", path: ["meetingLink"], message: "Le lien de réunion est obligatoire pour ce mode." });
  }
});

export const enterpriseMeetingUpdateSchema = z.object({
  revision: z.coerce.number().int().min(1),
  title: z.string().trim().min(3).max(180).optional(),
  agenda: optionalText(8000),
  startAt: optionalDate,
  endAt: optionalDate,
  locationMode: z.enum(MEETING_LOCATION_MODES).optional(),
  physicalLocation: optionalText(500),
  meetingLink: optionalText(1000),
  minutes: optionalText(20000),
  departmentId: optionalId,
  participants: z.array(meetingParticipantSchema).max(100).optional(),
});

export const enterpriseMeetingActionSchema = z.object({
  action: z.enum(MEETING_ACTIONS),
  revision: z.coerce.number().int().min(1),
  comment: optionalText(3000),
});

export const enterpriseMeetingDecisionCreateSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: optionalText(5000),
});

export const enterpriseMeetingDecisionTaskSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  description: optionalText(5000),
  priority: prioritySchema,
  assignedToUserId: optionalId,
  departmentId: optionalId,
  dueAt: optionalDate,
});

export const enterpriseOperationalCommentSchema = z.object({
  entityType: z.enum(["EnterpriseTask", "EnterpriseRequest", "EnterpriseApproval", "EnterpriseMeeting"]),
  entityId: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(3000),
});
