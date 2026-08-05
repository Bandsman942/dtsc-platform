import { z } from "zod";

const permissionCode = z.string().trim().min(3).max(160).regex(/^[a-z0-9._:-]+$/i);
const moduleCode = z.string().trim().min(2).max(120).regex(/^[A-Z0-9_]+$/);

export const enterpriseOrganizationRoleSchema = z.object({
  code: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/),
  labelFr: z.string().trim().min(2).max(160),
  labelEn: z.string().trim().min(2).max(160),
  descriptionFr: z.string().trim().max(1200).optional().or(z.literal("")),
  descriptionEn: z.string().trim().max(1200).optional().or(z.literal("")),
  permissions: z.array(permissionCode).max(300).default([]),
  modules: z.array(moduleCode).max(200).default([]),
  isActive: z.boolean().default(true),
});

export const enterpriseOrganizationRoleUpdateSchema = enterpriseOrganizationRoleSchema.partial().extend({
  archived: z.boolean().optional(),
});

export const enterpriseOrganizationRoleAssignmentSchema = z.object({
  memberId: z.string().trim().min(1).max(180),
  roleId: z.string().trim().min(1).max(180),
  action: z.enum(["ASSIGN", "REVOKE"]),
  reason: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const enterpriseSecurityPolicySchema = z.object({
  sessionIdleMinutes: z.coerce.number().int().min(5).max(10080),
  invitationExpiryHours: z.coerce.number().int().min(1).max(2160),
  maxPendingInvitations: z.coerce.number().int().min(1).max(10000),
  requireApprovedDomains: z.boolean(),
  allowedEmailDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).max(100).default([]),
  defaultInvitationRole: z.enum(["MANAGER", "MEMBER", "GUEST"]),
  requireInvitationApproval: z.boolean(),
  requireMfa: z.boolean(),
  sensitiveExportApproval: z.boolean(),
  devicePolicy: z.record(z.string(), z.unknown()).optional(),
  dataExportPolicy: z.record(z.string(), z.unknown()).optional(),
}).superRefine((data, ctx) => {
  if (data.requireApprovedDomains && data.allowedEmailDomains.length === 0) ctx.addIssue({ code: "custom", path: ["allowedEmailDomains"], message: "Au moins un domaine autorisé est requis." });
});

export const enterprisePermissionSimulationSchema = z.object({
  userId: z.string().trim().min(1).max(180),
  moduleCode,
  action: z.enum(["read", "submit", "write", "manage"]),
});
