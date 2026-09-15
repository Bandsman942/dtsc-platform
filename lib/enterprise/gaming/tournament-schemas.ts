import { z } from "zod";
import { GAMING_TOURNAMENT_ACTIONS, GAMING_TOURNAMENT_FORMATS, GAMING_TOURNAMENT_REGISTRATION_ACTIONS } from "@/lib/enterprise/gaming/domain";

const optionalText = (max = 3000) => z.string().trim().max(max).optional().or(z.literal(""));
const optionalId = z.string().trim().max(180).optional().or(z.literal(""));
const revision = z.coerce.number().int().min(1);

const tournamentBase = z.object({
  title: z.string().trim().min(2).max(240),
  description: optionalText(8000),
  siteId: optionalId,
  entryCatalogItemId: optionalId,
  tournamentFormat: z.enum(GAMING_TOURNAMENT_FORMATS).default("SINGLE_ELIMINATION"),
  registrationOpensAt: z.coerce.date().optional().nullable(),
  registrationClosesAt: z.coerce.date().optional().nullable(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  maxParticipants: z.coerce.number().int().min(2).max(10000).optional().nullable(),
  notes: optionalText(5000),
});

function validateDates(data: { startsAt: Date; endsAt: Date; registrationOpensAt?: Date | null; registrationClosesAt?: Date | null }, ctx: z.RefinementCtx) {
  if (data.endsAt <= data.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "La fin doit être postérieure au début du tournoi." });
  if (data.registrationClosesAt && data.registrationClosesAt > data.startsAt) ctx.addIssue({ code: "custom", path: ["registrationClosesAt"], message: "Les inscriptions doivent fermer avant le début du tournoi." });
  if (data.registrationOpensAt && data.registrationClosesAt && data.registrationOpensAt >= data.registrationClosesAt) ctx.addIssue({ code: "custom", path: ["registrationOpensAt"], message: "L’ouverture des inscriptions doit précéder leur fermeture." });
}

export const gamingTournamentCreateSchema = tournamentBase.extend({ idempotencyKey: z.string().trim().min(8).max(240) }).superRefine(validateDates);
export const gamingTournamentUpdateSchema = tournamentBase.partial().extend({ revision }).superRefine((data, ctx) => {
  if (data.startsAt && data.endsAt) validateDates({ startsAt: data.startsAt, endsAt: data.endsAt, registrationOpensAt: data.registrationOpensAt, registrationClosesAt: data.registrationClosesAt }, ctx);
});
export const gamingTournamentCommandSchema = z.object({ revision, action: z.enum(GAMING_TOURNAMENT_ACTIONS), reason: optionalText(3000) });
export const gamingTournamentRegistrationSchema = z.object({
  businessPartyId: z.string().trim().min(1).max(180),
  seedNumber: z.coerce.number().int().min(1).max(10000).optional().nullable(),
  invoiceApproverUserId: optionalId,
  idempotencyKey: z.string().trim().min(8).max(240),
});
export const gamingTournamentRegistrationCommandSchema = z.object({
  revision,
  action: z.enum(GAMING_TOURNAMENT_REGISTRATION_ACTIONS),
  resultRank: z.coerce.number().int().min(1).max(10000).optional().nullable(),
  resultLabel: optionalText(500),
  reason: optionalText(3000),
}).superRefine((data, ctx) => {
  if (data.action === "SET_RESULT" && !data.resultRank && !data.resultLabel) ctx.addIssue({ code: "custom", path: ["resultRank"], message: "Un classement ou un résultat est requis." });
});
export const gamingTournamentStationSchema = z.object({
  stationId: z.string().trim().min(1).max(180),
  slotStartAt: z.coerce.date(),
  slotEndAt: z.coerce.date(),
  label: optionalText(160),
}).superRefine((data, ctx) => {
  if (data.slotEndAt <= data.slotStartAt) ctx.addIssue({ code: "custom", path: ["slotEndAt"], message: "La fin du créneau doit être postérieure au début." });
});
export const gamingTournamentStationReleaseSchema = z.object({ revision, action: z.literal("RELEASE") });
