import { z } from "zod";

const initialAdminInvitationSchema = z.object({
  adminUserId: z.string().max(160).optional().or(z.literal("")),
  adminReason: z.string().trim().max(500).optional().or(z.literal("")),
}).superRefine((value, ctx) => {
  if (value.adminUserId?.trim() && !value.adminReason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["adminReason"],
      message: "La raison de la désignation administrateur est obligatoire.",
    });
  }
});

export type InitialAdminInvitationInput = z.infer<typeof initialAdminInvitationSchema>;

export function parseInitialAdminInvitation(input: unknown) {
  return initialAdminInvitationSchema.safeParse(input);
}
