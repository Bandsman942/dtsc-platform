import { z } from "zod";
import { cashCloseSchema } from "@/lib/enterprise/accounting/treasury-schemas";

const revision = z.coerce.number().int().positive();
const id = z.string().cuid();
const reason = z.string().trim().min(4).max(1000).optional();
const requiredReason = z.string().trim().min(4).max(1000);

export const assignedJournalTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: id, reason }),
  z.object({ action: z.literal("APPROVE"), revision, reason }),
  z.object({ action: z.literal("REJECT"), revision, reason: requiredReason }),
  z.object({ action: z.literal("POST"), revision, reason }),
  z.object({ action: z.literal("CANCEL"), revision, reason }),
]);

export const assignedPaymentTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: id, reason }),
  z.object({ action: z.literal("APPROVE"), revision, reason }),
  z.object({ action: z.literal("CONFIRM"), revision, reason }),
  z.object({ action: z.literal("RECONCILE"), revision, reason }),
  z.object({ action: z.literal("CANCEL"), revision, reason }),
  z.object({ action: z.literal("REVERSE"), revision, reason }),
]);

export const assignedSalesInvoiceTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: id, reason }),
  z.object({ action: z.literal("APPROVE"), revision, reason }),
  z.object({ action: z.literal("ISSUE"), revision, reason }),
  z.object({ action: z.literal("CANCEL"), revision, reason }),
  z.object({ action: z.literal("VOID"), revision, reason }),
]);

export const assignedSupplierInvoiceTransitionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("SUBMIT"),
    revision,
    reviewerUserId: id,
    approverUserId: id,
    reason,
  }),
  z.object({ action: z.literal("REVIEW"), revision, reason }),
  z.object({ action: z.literal("APPROVE"), revision, reason }),
  z.object({ action: z.literal("POST"), revision, reason }),
  z.object({ action: z.literal("REJECT"), revision, reason: requiredReason }),
  z.object({ action: z.literal("CANCEL"), revision, reason }),
]).superRefine((value, ctx) => {
  if (value.action === "SUBMIT" && value.reviewerUserId === value.approverUserId) {
    ctx.addIssue({ code: "custom", path: ["approverUserId"], message: "Reviewer and approver must be different" });
  }
});

export const assignedFinancialCloseTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: id, reason }),
  z.object({ action: z.literal("APPROVE"), revision, reason }),
  z.object({ action: z.literal("CLOSE"), revision, reason }),
  z.object({ action: z.literal("REOPEN"), revision, reason: requiredReason }),
]);

export const assignedCashCloseSchema = cashCloseSchema.extend({ approverUserId: id });

export const assignedReconciliationTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: id, reason }),
  z.object({ action: z.literal("APPROVE"), revision, reason }),
  z.object({ action: z.literal("REJECT"), revision, reason: requiredReason }),
]);