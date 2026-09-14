import { z } from "zod";

const optionalShortText = z.string().trim().max(240).optional().nullable();
const optionalNotes = z.string().trim().max(4000).optional().nullable();

export const gamingStationCreateSchema = z.object({
  assetId: z.string().trim().min(1),
  stationCode: z.string().trim().min(1).max(40),
  displayName: optionalShortText,
  consoleFamily: z.string().trim().min(1).max(80),
  maxPlayers: z.coerce.number().int().min(1).max(16).default(2),
  sortOrder: z.coerce.number().int().min(0).max(1_000_000).default(0),
  notes: optionalNotes,
});

export const gamingStationUpdateSchema = z.object({
  action: z.enum(["UPDATE", "SET_AVAILABLE", "BLOCK", "ARCHIVE"]),
  revision: z.coerce.number().int().positive(),
  stationCode: z.string().trim().min(1).max(40).optional(),
  displayName: optionalShortText,
  consoleFamily: z.string().trim().min(1).max(80).optional(),
  maxPlayers: z.coerce.number().int().min(1).max(16).optional(),
  sortOrder: z.coerce.number().int().min(0).max(1_000_000).optional(),
  notes: optionalNotes,
}).superRefine((value, ctx) => {
  if (value.action !== "UPDATE") return;
  const hasEditableField = [
    value.stationCode,
    value.displayName,
    value.consoleFamily,
    value.maxPlayers,
    value.sortOrder,
    value.notes,
  ].some((candidate) => candidate !== undefined);
  if (!hasEditableField) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["action"],
      message: "Au moins une information du poste doit être modifiée.",
    });
  }
});
