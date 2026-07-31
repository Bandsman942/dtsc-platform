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
});

export const projectMilestoneCreateSchema = z.object({
  name: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  ownerUserId: z.string().trim().min(1).optional().nullable(),
  approvalRequired: z.boolean().default(false),
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

export const projectIssueCreateSchema = z.object({
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().min(2).max(6000),
  issueType: z.string().trim().max(120).optional().nullable(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  ownerUserId: z.string().trim().min(1).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
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
}).refine((value) => Boolean(value.employeeId || value.departmentId), { message: "Un employé ou un département est requis." });

export const assetReturnSchema = z.object({
  revision: z.coerce.number().int().positive(),
  returnedAt: z.coerce.date().default(() => new Date()),
  returnCondition: z.enum(["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"]),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export const assetMaintenanceCreateSchema = z.object({
  maintenanceType: z.string().trim().min(2).max(120),
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
});

export const assetIncidentCreateSchema = z.object({
  incidentType: z.string().trim().min(2).max(120),
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
