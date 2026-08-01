import { z } from "zod";
import {
  ENTERPRISE_IDENTITY_CONSENT_VERSION,
  ENTERPRISE_IDENTITY_RELATION_TYPES,
} from "@/lib/enterprise/identity-links/contracts";

const relationTypeSchema = z.enum(ENTERPRISE_IDENTITY_RELATION_TYPES);
const optionalIdentifier = z.string().trim().min(1).max(191).optional();

function requireExactlyOneBusinessTarget(
  value: { businessPartyId?: string; businessPartyContactId?: string; employeeId?: string },
  context: z.RefinementCtx,
) {
  const targetCount = [value.businessPartyId, value.businessPartyContactId, value.employeeId].filter(Boolean).length;
  if (targetCount !== 1) {
    context.addIssue({
      code: "custom",
      path: ["businessTarget"],
      message: "Sélectionnez exactement une fiche métier à relier.",
    });
  }
}

export const enterpriseIdentityInvitationSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  displayName: z.string().trim().min(2).max(160),
  businessPartyId: optionalIdentifier,
  businessPartyContactId: optionalIdentifier,
  employeeId: optionalIdentifier,
  relationType: relationTypeSchema,
  roleCode: z.string().trim().max(80).optional(),
  purpose: z.string().trim().min(10).max(500),
  consentTextVersion: z.string().trim().min(1).max(80).default(ENTERPRISE_IDENTITY_CONSENT_VERSION),
}).superRefine(requireExactlyOneBusinessTarget);

export const enterpriseIdentityUserRequestSchema = z.object({
  relationType: relationTypeSchema,
  roleCode: z.string().trim().max(80).optional(),
  purpose: z.string().trim().min(10).max(500),
  consentTextVersion: z.string().trim().min(1).max(80).default(ENTERPRISE_IDENTITY_CONSENT_VERSION),
});

export const enterpriseIdentityApprovalSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  businessPartyId: optionalIdentifier,
  businessPartyContactId: optionalIdentifier,
  employeeId: optionalIdentifier,
  roleCode: z.string().trim().max(80).optional(),
  revision: z.number().int().positive(),
}).superRefine(requireExactlyOneBusinessTarget);

export const enterpriseIdentityDecisionSchema = z.object({
  revision: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500).optional(),
});

export const enterpriseIdentityTokenDecisionSchema = z.object({
  token: z.string().trim().min(32).max(512),
  reason: z.string().trim().min(3).max(500).optional(),
});

export type EnterpriseIdentityInvitationInput = z.infer<typeof enterpriseIdentityInvitationSchema>;
export type EnterpriseIdentityUserRequestInput = z.infer<typeof enterpriseIdentityUserRequestSchema>;
export type EnterpriseIdentityApprovalInput = z.infer<typeof enterpriseIdentityApprovalSchema>;
