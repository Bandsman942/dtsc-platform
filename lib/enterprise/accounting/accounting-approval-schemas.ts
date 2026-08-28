import { z } from "zod";

const revision = z.coerce.number().int().positive();
const reason = z.string().trim().min(4).max(1000).optional();

export const assignedJournalTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: z.string().min(1), reason }),
  z.object({ action: z.literal("APPROVE"), revision, reason }),
  z.object({ action: z.literal("REJECT"), revision, reason: z.string().trim().min(4).max(1000) }),
  z.object({ action: z.literal("POST"), revision, reason }),
  z.object({ action: z.literal("CANCEL"), revision, reason }),
]);

export const assignedPaymentTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: z.string().min(1), reason }),
  z.object({ action: z.literal("APPROVE"), revision, reason }),
  z.object({ action: z.literal("CONFIRM"), revision, reason }),
  z.object({ action: z.literal("RECONCILE"), revision, reason }),
  z.object({ action: z.literal("CANCEL"), revision, reason }),
  z.object({ action: z.literal("REVERSE"), revision, reason }),
]);