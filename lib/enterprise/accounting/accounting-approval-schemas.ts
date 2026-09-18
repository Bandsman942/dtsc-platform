import { z } from "zod";
import { cashCloseSchema } from "@/lib/enterprise/accounting/treasury-schemas";

const revision = z.coerce.number().int().positive();
// User ids are persisted as String @id values. Prisma generates CUIDs by default,
// but imported/seeded legacy identities may legitimately use stable non-CUID ids.
// Keep this aligned with the canonical EnterpriseApproval validator contract.
const id = z.string().trim().min(1).max(160);
const optionalComment = z.string().trim().min(1).max(1000).optional();
const requiredReason = z.string().trim().min(4, "Le motif doit contenir au moins 4 caractères.").max(1000);

export const assignedJournalTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: id, reason: optionalComment }),
  z.object({ action: z.literal("APPROVE"), revision, reason: optionalComment }),
  z.object({ action: z.literal("REJECT"), revision, reason: requiredReason }),
  z.object({ action: z.literal("POST"), revision, reason: optionalComment }),
  z.object({ action: z.literal("CANCEL"), revision, reason: optionalComment }),
]);

export const assignedPaymentTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: id, reason: optionalComment }),
  z.object({ action: z.literal("APPROVE"), revision, reason: optionalComment }),
  z.object({ action: z.literal("CONFIRM"), revision, reason: optionalComment }),
  z.object({ action: z.literal("RECONCILE"), revision, reason: optionalComment }),
  z.object({ action: z.literal("CANCEL"), revision, reason: optionalComment }),
  z.object({ action: z.literal("REVERSE"), revision, reason: optionalComment }),
]);

export const assignedSalesInvoiceTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: id, reason: optionalComment }),
  z.object({ action: z.literal("APPROVE"), revision, reason: optionalComment }),
  z.object({ action: z.literal("ISSUE"), revision, reason: optionalComment }),
  z.object({ action: z.literal("CANCEL"), revision, reason: optionalComment }),
  z.object({ action: z.literal("VOID"), revision, reason: optionalComment }),
]);

export const assignedSupplierInvoiceTransitionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("SUBMIT"),
    revision,
    reviewerUserId: id,
    approverUserId: id,
    reason,
  }),
  z.object({ action: z.literal("REVIEW"), revision, reason: optionalComment }),
  z.object({ action: z.literal("APPROVE"), revision, reason: optionalComment }),
  z.object({ action: z.literal("POST"), revision, reason: optionalComment }),
  z.object({ action: z.literal("REJECT"), revision, reason: requiredReason }),
  z.object({ action: z.literal("CANCEL"), revision, reason: optionalComment }),
]).superRefine((value, ctx) => {
  if (value.action === "SUBMIT" && value.reviewerUserId === value.approverUserId) {
    ctx.addIssue({ code: "custom", path: ["approverUserId"], message: "Reviewer and approver must be different" });
  }
});

export const assignedFinancialCloseTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: id, reason: optionalComment }),
  z.object({ action: z.literal("APPROVE"), revision, reason: optionalComment }),
  z.object({ action: z.literal("CLOSE"), revision, reason: optionalComment }),
  z.object({ action: z.literal("REOPEN"), revision, reason: requiredReason }),
]);

export const assignedCashCloseSchema = cashCloseSchema.extend({ approverUserId: id });
export const assignCashSessionApproverSchema = z.object({ revision, approverUserId: id });

export const assignedReconciliationTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: id, reason: optionalComment }),
  z.object({ action: z.literal("APPROVE"), revision, reason: optionalComment }),
  z.object({ action: z.literal("REJECT"), revision, reason: requiredReason }),
]);

export const assignedDocumentTransitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision, approverUserId: id, reason: optionalComment }),
  z.object({ action: z.literal("APPROVE"), revision, reason: optionalComment }),
  z.object({ action: z.literal("REJECT"), revision, reason: requiredReason }),
]);
