import { z } from "zod";

const optionalShortText = z.string().trim().max(240).optional().nullable();
const optionalNotes = z.string().trim().max(4000).optional().nullable();
const optionalEntityId = z.string().trim().min(1).max(191).optional().nullable();
const idempotencyKey = z.string().trim().min(8).max(160);
const maxBookingDurationMs = 24 * 60 * 60 * 1000;

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

export const gamingSessionStartSchema = z.object({
  stationId: z.string().trim().min(1).max(191),
  durationMinutes: z.coerce.number().int().min(1).max(24 * 60),
  idempotencyKey,
  businessPartyId: optionalEntityId,
  serviceCatalogItemId: optionalEntityId,
  pauseBillable: z.boolean().default(false),
});

export const gamingSessionTransitionSchema = z.object({
  action: z.enum(["PAUSE", "RESUME", "EXTEND", "TRANSFER", "END"]),
  revision: z.coerce.number().int().positive(),
  idempotencyKey,
  extensionMinutes: z.coerce.number().int().min(1).max(12 * 60).optional(),
  targetStationId: z.string().trim().min(1).max(191).optional(),
}).superRefine((value, ctx) => {
  if (value.action === "EXTEND" && value.extensionMinutes === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["extensionMinutes"], message: "La durée de prolongation est requise." });
  }
  if (value.action === "TRANSFER" && !value.targetStationId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetStationId"], message: "Le poste de destination est requis." });
  }
});

export const gamingBookingCreateSchema = z.object({
  stationId: z.string().trim().min(1).max(191),
  businessPartyId: optionalEntityId,
  scheduledStartAt: z.coerce.date(),
  scheduledEndAt: z.coerce.date(),
  playerCount: z.coerce.number().int().min(1).max(16).default(1),
  notes: optionalNotes,
  status: z.enum(["DRAFT", "CONFIRMED"]).default("CONFIRMED"),
  idempotencyKey,
}).superRefine((value, ctx) => {
  const durationMs = value.scheduledEndAt.getTime() - value.scheduledStartAt.getTime();
  if (durationMs <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduledEndAt"], message: "La fin du créneau doit être postérieure au début." });
  } else if (durationMs > maxBookingDurationMs) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduledEndAt"], message: "Une réservation ne peut pas dépasser 24 heures." });
  }
});

export const gamingBookingTransitionSchema = z.object({
  action: z.enum(["UPDATE", "CONFIRM", "CHECK_IN", "NO_SHOW", "CANCEL", "CONVERT"]),
  revision: z.coerce.number().int().positive(),
  idempotencyKey,
  stationId: z.string().trim().min(1).max(191).optional(),
  businessPartyId: optionalEntityId,
  scheduledStartAt: z.coerce.date().optional(),
  scheduledEndAt: z.coerce.date().optional(),
  playerCount: z.coerce.number().int().min(1).max(16).optional(),
  notes: optionalNotes,
}).superRefine((value, ctx) => {
  if (value.action !== "UPDATE") return;
  const hasEditableField = [
    value.stationId,
    value.businessPartyId,
    value.scheduledStartAt,
    value.scheduledEndAt,
    value.playerCount,
    value.notes,
  ].some((candidate) => candidate !== undefined);
  if (!hasEditableField) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["action"], message: "Au moins une information de la réservation doit être modifiée." });
  }
  if (value.scheduledStartAt && value.scheduledEndAt) {
    const durationMs = value.scheduledEndAt.getTime() - value.scheduledStartAt.getTime();
    if (durationMs <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduledEndAt"], message: "La fin du créneau doit être postérieure au début." });
    } else if (durationMs > maxBookingDurationMs) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduledEndAt"], message: "Une réservation ne peut pas dépasser 24 heures." });
    }
  }
});
