import { z } from "zod";

export const manualRelationshipCreditRequestSchema = z.object({
  benefitId: z.string().trim().min(1).max(191),
  identityLinkId: z.string().trim().min(1).max(191),
  businessPartyId: z.string().trim().min(1).max(191),
  documentId: z.string().trim().min(1).max(191),
  reason: z.string().trim().min(10).max(800),
  idempotencyKey: z.string().uuid(),
}).strict();

export const manualRelationshipCreditDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "REVERSE"]),
  revision: z.number().int().positive(),
  reason: z.string().trim().min(10).max(800),
}).strict();
