import { z } from "zod";

const optionalId = z.union([z.literal(""), z.string().min(1).max(120)]).optional();
const optionalText = z.union([z.literal(""), z.string().max(5000)]).optional();

export const enterpriseCoreCreateSchema = z.object({
  moduleCode: z.string().min(1).max(80),
  recordType: z.string().min(1).max(80),
  title: z.string().trim().min(3).max(180),
  description: optionalText,
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  assignedToUserId: optionalId,
  validatorUserId: optionalId,
  departmentId: optionalId,
  dueAt: z.union([z.literal(""), z.coerce.date()]).optional(),
  amount: z.union([z.literal(""), z.coerce.number().min(0).max(999999999999)]).optional(),
  currency: z.union([z.literal(""), z.string().trim().min(3).max(3)]).optional(),
});

export const enterpriseCoreUpdateSchema = z.object({
  action: z.enum(["START", "SUBMIT", "REQUEST_VALIDATION", "APPROVE", "REJECT", "COMPLETE", "CANCEL", "ARCHIVE", "COMMENT"]),
  comment: z.string().trim().min(2).max(3000).optional(),
});
