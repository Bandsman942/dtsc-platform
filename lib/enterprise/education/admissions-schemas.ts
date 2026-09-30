import { z } from "zod";

const requiredId = z.string().trim().min(1).max(191);
const optionalId = z.string().trim().min(1).max(191).optional().nullable();
const optionalShort = z.string().trim().max(240).optional().nullable();
const optionalLong = z.string().trim().max(4000).optional().nullable();
const revision = z.coerce.number().int().positive();
const date = z.coerce.date();

export const educationCandidateCreateSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  middleName: optionalShort,
  preferredName: optionalShort,
  birthDate: date.optional().nullable(),
  sex: z.enum(["FEMALE", "MALE", "OTHER", "UNSPECIFIED"]).optional().nullable(),
  nationalityCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().nullable(),
  email: z.string().trim().email().max(240).optional().nullable(),
  phone: z.string().trim().max(80).optional().nullable(),
  addressJson: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const educationAdmissionCreateSchema = z.object({
  candidate: educationCandidateCreateSchema,
  academicYearId: requiredId,
  campusId: requiredId,
  programId: optionalId,
  levelId: optionalId,
  classGroupId: optionalId,
  applicantNotes: optionalLong,
  internalNotes: optionalLong,
});

export const educationAdmissionUpdateSchema = z.object({
  academicYearId: requiredId,
  campusId: requiredId,
  programId: optionalId,
  levelId: optionalId,
  classGroupId: optionalId,
  applicantNotes: optionalLong,
  internalNotes: optionalLong,
  revision,
});

export const educationAdmissionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision }),
  z.object({ action: z.literal("START_REVIEW"), revision }),
  z.object({
    action: z.literal("DECIDE"),
    revision,
    decision: z.enum(["ACCEPTED", "REJECTED", "WAITLISTED"]),
    reason: z.string().trim().max(2000).optional().nullable(),
  }),
  z.object({
    action: z.literal("ENROLL"),
    revision,
    campusId: requiredId,
    programId: optionalId,
    levelId: requiredId,
    classGroupId: optionalId,
    enrolledAt: date.optional(),
  }),
  z.object({ action: z.literal("WITHDRAW"), revision, reason: z.string().trim().min(1).max(2000) }),
]);

export const educationGuardianCreateSchema = z.object({
  businessPartyId: optionalId,
  userId: optionalId,
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(240).optional().nullable(),
  phone: z.string().trim().max(80).optional().nullable(),
  preferredLanguage: z.enum(["fr", "en"]).optional().nullable(),
});

export const educationStudentGuardianLinkSchema = z.object({
  guardianId: requiredId,
  relationshipType: z.enum(["PARENT", "MOTHER", "FATHER", "LEGAL_GUARDIAN", "SPONSOR", "OTHER"]),
  isPrimary: z.boolean().default(false),
  isLegalGuardian: z.boolean().default(false),
  isBillingContact: z.boolean().default(false),
  isNotificationContact: z.boolean().default(true),
});

export const educationStudentUpdateSchema = z.object({
  revision,
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  middleName: optionalShort,
  preferredName: optionalShort,
  birthDate: date.optional().nullable(),
  sex: z.enum(["FEMALE", "MALE", "OTHER", "UNSPECIFIED"]).optional().nullable(),
  nationalityCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().nullable(),
  email: z.string().trim().email().max(240).optional().nullable(),
  phone: z.string().trim().max(80).optional().nullable(),
  userId: optionalId,
  businessPartyId: optionalId,
});

export const educationEnrollmentActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("TRANSFER"),
    revision,
    campusId: requiredId,
    programId: optionalId,
    levelId: requiredId,
    classGroupId: optionalId,
    effectiveAt: date.optional(),
    reason: z.string().trim().min(1).max(2000),
  }),
  z.object({
    action: z.literal("WITHDRAW"),
    revision,
    effectiveAt: date.optional(),
    reason: z.string().trim().min(1).max(2000),
  }),
  z.object({
    action: z.literal("COMPLETE"),
    revision,
    effectiveAt: date.optional(),
    reason: z.string().trim().max(2000).optional().nullable(),
  }),
  z.object({
    action: z.literal("REACTIVATE"),
    revision,
    campusId: requiredId,
    programId: optionalId,
    levelId: requiredId,
    classGroupId: optionalId,
    effectiveAt: date.optional(),
    reason: z.string().trim().min(1).max(2000),
  }),
]);

export type EducationAdmissionCreateInput = z.infer<typeof educationAdmissionCreateSchema>;
export type EducationAdmissionUpdateInput = z.infer<typeof educationAdmissionUpdateSchema>;
export type EducationAdmissionActionInput = z.infer<typeof educationAdmissionActionSchema>;
export type EducationGuardianCreateInput = z.infer<typeof educationGuardianCreateSchema>;
export type EducationStudentGuardianLinkInput = z.infer<typeof educationStudentGuardianLinkSchema>;
export type EducationStudentUpdateInput = z.infer<typeof educationStudentUpdateSchema>;
export type EducationEnrollmentActionInput = z.infer<typeof educationEnrollmentActionSchema>;
