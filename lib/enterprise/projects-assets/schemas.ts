import { z } from "zod";

export const enterpriseProjectCreateSchema = z.object({
  name: z.string().trim().min(2).max(240),
  description: z.string().trim().max(8000).optional().nullable(),
  projectType: z.enum(["CLIENT", "INTERNAL", "SERVICE", "IMPLEMENTATION"]).default("CLIENT"),
  businessPartyId: z.string().trim().min(1).optional().nullable(),
  contractId: z.string().trim().min(1).optional().nullable(),
  ownerUserId: z.string().trim().min(1).optional().nullable(),
  departmentId: z.string().trim().min(1).optional().nullable(),
  siteId: z.string().trim().min(1).optional().nullable(),
  budgetId: z.string().trim().min(1).optional().nullable(),
  currency: z.string().trim().toUpperCase().length(3).optional().nullable(),
  indicativeBudget: z.coerce.number().nonnegative().max(1_000_000_000_000).optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  targetEndDate: z.coerce.date().optional().nullable(),
  members: z.array(z.object({
    employeeId: z.string().trim().min(1),
    role: z.string().trim().min(2).max(120).default("MEMBER"),
    allocationPercent: z.coerce.number().int().min(1).max(100).default(100),
  })).max(500).default([]),
}).superRefine((value, ctx) => {
  if (value.projectType === "CLIENT" && !value.businessPartyId && !value.contractId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["businessPartyId"],
      message: "Un projet client doit référencer un client ou un contrat client.",
    });
  }
});

export const projectTransitionSchema = z.object({
  action: z.enum(["PLAN", "START", "MARK_AT_RISK", "BLOCK", "RESUME", "COMPLETE", "CLOSE", "CANCEL"]),
  revision: z.coerce.number().int().positive(),
  comment: z.string().trim().max(4000).optional().nullable(),
}).superRefine((value, ctx) => {
  if (["MARK_AT_RISK", "BLOCK", "CANCEL"].includes(value.action) && (!value.comment || value.comment.trim().length < 3)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["comment"], message: "Un motif est requis pour cette transition." });
  }
});

export const projectMilestoneCreateSchema = z.object({
  name: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  ownerUserId: z.string().trim().min(1).optional().nullable(),
  approvalRequired: z.boolean().default(false),
});

export const projectMilestoneTransitionSchema = z.object({
  action: z.enum(["COMPLETE", "SUBMIT_APPROVAL"]),
  revision: z.coerce.number().int().positive(),
  approverUserId: z.string().trim().min(1).optional().nullable(),
  comment: z.string().trim().max(4000).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.action === "SUBMIT_APPROVAL" && !value.approverUserId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["approverUserId"], message: "Un validateur est requis pour ce jalon." });
  }
});

export const projectDeliverableCreateSchema = z.object({
  milestoneId: z.string().trim().min(1).optional().nullable(),
  name: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4000).optional().nullable(),
  ownerUserId: z.string().trim().min(1).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  documentId: z.string().trim().min(1).optional().nullable(),
});

export const projectDeliverableTransitionSchema = z.object({
  action: z.enum(["SUBMIT", "ACCEPT", "REQUEST_CHANGES", "REJECT"]),
  revision: z.coerce.number().int().positive(),
  comment: z.string().trim().max(4000).optional().nullable(),
}).superRefine((value, ctx) => {
  if (["REQUEST_CHANGES", "REJECT"].includes(value.action) && (!value.comment || value.comment.trim().length < 3)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["comment"], message: "Un motif de revue est requis." });
  }
});

export const projectRiskCreateSchema = z.object({
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().min(2).max(6000),
  category: z.string().trim().max(120).optional().nullable(),
  probability: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  impact: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  ownerUserId: z.string().trim().min(1).optional().nullable(),
  mitigationPlan: z.string().trim().max(6000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

export const projectRiskTransitionSchema = z.object({
  action: z.enum(["CLOSE", "REOPEN"]),
  revision: z.coerce.number().int().positive(),
  comment: z.string().trim().max(4000).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.action === "CLOSE" && (!value.comment || value.comment.trim().length < 3)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["comment"], message: "Un motif de clôture est requis." });
  }
});

export const projectIssueCreateSchema = z.object({
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().min(2).max(6000),
  issueType: z.string().trim().max(120).optional().nullable(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  ownerUserId: z.string().trim().min(1).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

export const projectIssueTransitionSchema = z.object({
  action: z.enum(["RESOLVE", "CLOSE", "REOPEN"]),
  revision: z.coerce.number().int().positive(),
  resolution: z.string().trim().max(6000).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.action === "RESOLVE" && (!value.resolution || value.resolution.trim().length < 3)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["resolution"], message: "Une résolution est requise." });
  }
});

export const assetCategoryCreateSchema = z.object({
  code: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4000).optional().nullable(),
});

export const assetCreateSchema = z.object({
  code: z.string().trim().min(2).max(100).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4000).optional().nullable(),
  categoryId: z.string().trim().min(1).optional().nullable(),
  serialNumber: z.string().trim().max(240).optional().nullable(),
  siteId: z.string().trim().min(1).optional().nullable(),
  storageLocationId: z.string().trim().min(1).optional().nullable(),
  responsibleEmployeeId: z.string().trim().min(1).optional().nullable(),
  supplierId: z.string().trim().min(1).optional().nullable(),
  purchaseId: z.string().trim().min(1).optional().nullable(),
  acquisitionDate: z.coerce.date().optional().nullable(),
  indicativeValue: z.coerce.number().nonnegative().max(1_000_000_000_000).optional().nullable(),
  currency: z.string().trim().toUpperCase().length(3).optional().nullable(),
  condition: z.enum(["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"]).default("GOOD"),
  warrantyEndsAt: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export const assetAssignmentCreateSchema = z.object({
  employeeId: z.string().trim().min(1).optional().nullable(),
  departmentId: z.string().trim().min(1).optional().nullable(),
  assignedAt: z.coerce.date().default(() => new Date()),
  expectedReturnAt: z.coerce.date().optional().nullable(),
  initialCondition: z.enum(["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"]),
  notes: z.string().trim().max(4000).optional().nullable(),
}).refine((value) => Boolean(value.employeeId) !== Boolean(value.departmentId), {
  message: "Choisissez soit un collaborateur, soit un département.",
  path: ["employeeId"],
});

export const assetReturnSchema = z.object({
  revision: z.coerce.number().int().positive(),
  returnedAt: z.coerce.date().default(() => new Date()),
  returnCondition: z.enum(["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"]),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export const assetMaintenanceCreateSchema = z.object({
  maintenanceType: z.enum(["PREVENTIVE", "CORRECTIVE"]),
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(6000).optional().nullable(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  responsibleUserId: z.string().trim().min(1).optional().nullable(),
  supplierId: z.string().trim().min(1).optional().nullable(),
  plannedAt: z.coerce.date().optional().nullable(),
  dueAt: z.coerce.date().optional().nullable(),
  indicativeCost: z.coerce.number().nonnegative().max(1_000_000_000_000).optional().nullable(),
  currency: z.string().trim().toUpperCase().length(3).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export const assetMaintenanceTransitionSchema = z.object({
  action: z.enum(["START", "COMPLETE", "CANCEL"]),
  revision: z.coerce.number().int().positive(),
  comment: z.string().trim().max(4000).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.action === "CANCEL" && (!value.comment || value.comment.trim().length < 3)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["comment"], message: "Un motif d’annulation est requis." });
  }
});

export const assetIncidentCreateSchema = z.object({
  incidentType: z.enum(["DAMAGE"]).default("DAMAGE"),
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().min(2).max(6000),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  responsibleUserId: z.string().trim().min(1).optional().nullable(),
  occurredAt: z.coerce.date().optional().nullable(),
});

export const assetIncidentResolveSchema = z.object({
  revision: z.coerce.number().int().positive(),
  resolution: z.string().trim().min(3).max(6000),
});
