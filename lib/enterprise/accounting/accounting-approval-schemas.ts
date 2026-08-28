import { z } from "zod";

const revision = z.coerce.number().int().positive();
const reason = z.string().trim().min(4).max(1000).optional();
const requiredReason = z.string().trim().min(4).max(1000);

export const assignedJournalTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: z.string().min(1), reason }),
  z.object({ action: z.literal("APPROVE"), revision, reason }),
  z.object({ action: z.literal("REJECT"), revision, reason: requiredReason }),
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

export const assignedSalesInvoiceTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: z.string().min(1), reason }),
  z.object({ action: z.literal("APPROVE"), revision, reason }),
  z.object({ action: z.literal("ISSUE"), revision, reason }),
  z.object({ action: z.literal("CANCEL"), revision, reason }),
  z.object({ action: z.literal("VOID"), revision, reason }),
]);

export const assignedSupplierInvoiceTransitionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("SUBMIT"),
    revision,
    reviewerUserId: z.string().min(1),
    approverUserId: z.string().min(1),
    reason,
  }).refine((value) => value.reviewerUserId !== value.approverUserId, {
    message: "Reviewer and approver must be different",
    path: ["approverUserId"],
  }),
  z.object({ action: z.literal("REVIEW"), revision, reason }),
  z.object({ action: z.literal("APPROVE"), revision, reason }),
  z.object({ action: z.literal("POST"), revision, reason }),
  z.object({ action: z.literal("REJECT"), revision, reason: requiredReason }),
  z.object({ action: z.literal("CANCEL"), revision, reason }),
]);