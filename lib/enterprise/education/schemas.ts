import { z } from "zod";
import type { EducationResourceCode } from "@/lib/enterprise/education/constants";

const code = z.string().trim().min(1).max(60).transform((value) => value.toUpperCase());
const name = z.string().trim().min(1).max(180);
const optionalText = z.string().trim().max(2000).optional().nullable();
const optionalShortText = z.string().trim().max(240).optional().nullable();
const optionalId = z.string().trim().min(1).max(191).optional().nullable();
const requiredId = z.string().trim().min(1).max(191);
const revision = z.coerce.number().int().positive();

function endAfterStart<T extends { startDate?: Date; endDate?: Date }>(value: T, ctx: z.RefinementCtx) {
  if (value.startDate && value.endDate && value.endDate.getTime() <= value.startDate.getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "La date de fin doit être postérieure à la date de début." });
  }
}

export const educationSettingsSchema = z.object({
  institutionType: z.enum(["SCHOOL", "UNIVERSITY", "TRAINING_CENTER", "INSTITUTE", "OTHER"]).default("SCHOOL"),
  legalName: optionalShortText,
  registrationCode: z.string().trim().max(100).optional().nullable(),
  timezone: z.string().trim().min(1).max(100).default("Africa/Kinshasa"),
  weekStartsOn: z.coerce.number().int().min(0).max(6).default(1),
  defaultCampusId: optionalId,
  revision: z.coerce.number().int().positive().optional(),
});

export const educationCampusCreateSchema = z.object({
  code,
  name,
  shortName: z.string().trim().max(80).optional().nullable(),
  address: optionalShortText,
  city: z.string().trim().max(120).optional().nullable(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().nullable(),
  timezone: z.string().trim().max(100).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  sortOrder: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export const educationAcademicYearCreateSchema = z.object({
  code,
  label: name,
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z.enum(["DRAFT", "ACTIVE"]).default("DRAFT"),
}).superRefine(endAfterStart);

export const educationPeriodCreateSchema = z.object({
  academicYearId: requiredId,
  code,
  label: name,
  periodType: z.enum(["TERM", "SEMESTER", "TRIMESTER", "QUARTER", "SESSION", "OTHER"]).default("TERM"),
  sequence: z.coerce.number().int().min(1).max(100).default(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z.enum(["DRAFT", "ACTIVE"]).default("DRAFT"),
}).superRefine(endAfterStart);

export const educationLevelCreateSchema = z.object({
  code,
  label: name,
  levelType: z.enum(["GRADE", "YEAR", "CYCLE", "LEVEL", "OTHER"]).default("GRADE"),
  sequence: z.coerce.number().int().min(0).max(1000).default(0),
  description: optionalText,
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const educationDepartmentCreateSchema = z.object({
  campusId: optionalId,
  code,
  name,
  description: optionalText,
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  sortOrder: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export const educationProgramCreateSchema = z.object({
  departmentId: optionalId,
  code,
  name,
  description: optionalText,
  awardName: optionalShortText,
  durationPeriods: z.coerce.number().int().positive().max(100).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  sortOrder: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export const educationClassGroupCreateSchema = z.object({
  academicYearId: requiredId,
  campusId: requiredId,
  levelId: requiredId,
  programId: optionalId,
  code,
  name,
  capacity: z.coerce.number().int().positive().max(100_000).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  sortOrder: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export const educationSubjectCreateSchema = z.object({
  departmentId: optionalId,
  code,
  name,
  description: optionalText,
  creditHours: z.coerce.number().int().positive().max(1000).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  sortOrder: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export const educationCourseOfferingCreateSchema = z.object({
  academicYearId: requiredId,
  periodId: optionalId,
  campusId: requiredId,
  subjectId: requiredId,
  classGroupId: optionalId,
  programId: optionalId,
  levelId: optionalId,
  code,
  displayName: optionalShortText,
  deliveryMode: z.enum(["IN_PERSON", "ONLINE", "HYBRID"]).default("IN_PERSON"),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]).default("DRAFT"),
});

export const educationCalendarEventCreateSchema = z.object({
  academicYearId: requiredId,
  periodId: optionalId,
  campusId: optionalId,
  eventType: z.enum(["ACADEMIC", "EXAM", "HOLIDAY", "REGISTRATION", "DEADLINE", "CEREMONY", "OTHER"]).default("ACADEMIC"),
  title: name,
  description: optionalText,
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  allDay: z.boolean().default(false),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
}).superRefine((value, ctx) => {
  if (value.endsAt.getTime() <= value.startsAt.getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "La fin de l’événement doit être postérieure à son début." });
  }
});

const schemas = {
  SETTINGS: educationSettingsSchema,
  CAMPUS: educationCampusCreateSchema,
  ACADEMIC_YEAR: educationAcademicYearCreateSchema,
  PERIOD: educationPeriodCreateSchema,
  LEVEL: educationLevelCreateSchema,
  DEPARTMENT: educationDepartmentCreateSchema,
  PROGRAM: educationProgramCreateSchema,
  CLASS_GROUP: educationClassGroupCreateSchema,
  SUBJECT: educationSubjectCreateSchema,
  COURSE_OFFERING: educationCourseOfferingCreateSchema,
  CALENDAR_EVENT: educationCalendarEventCreateSchema,
} as const;

export function getEducationCreateSchema(resource: EducationResourceCode) {
  return schemas[resource];
}

export const educationCreateEnvelopeSchema = z.object({
  resource: z.enum(["SETTINGS", "CAMPUS", "ACADEMIC_YEAR", "PERIOD", "LEVEL", "DEPARTMENT", "PROGRAM", "CLASS_GROUP", "SUBJECT", "COURSE_OFFERING", "CALENDAR_EVENT"]),
  data: z.unknown(),
});

export const educationMutationSchema = z.object({
  resource: z.enum(["CAMPUS", "ACADEMIC_YEAR", "PERIOD", "LEVEL", "DEPARTMENT", "PROGRAM", "CLASS_GROUP", "SUBJECT", "COURSE_OFFERING", "CALENDAR_EVENT"]),
  action: z.enum(["UPDATE", "ARCHIVE", "ACTIVATE", "DEACTIVATE", "CLOSE"]),
  revision,
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export const educationSettingsMutationSchema = z.object({
  resource: z.literal("SETTINGS"),
  data: educationSettingsSchema,
});

export type EducationSettingsInput = z.infer<typeof educationSettingsSchema>;
export type EducationCampusInput = z.infer<typeof educationCampusCreateSchema>;
export type EducationAcademicYearInput = z.infer<typeof educationAcademicYearCreateSchema>;
export type EducationPeriodInput = z.infer<typeof educationPeriodCreateSchema>;
export type EducationLevelInput = z.infer<typeof educationLevelCreateSchema>;
export type EducationDepartmentInput = z.infer<typeof educationDepartmentCreateSchema>;
export type EducationProgramInput = z.infer<typeof educationProgramCreateSchema>;
export type EducationClassGroupInput = z.infer<typeof educationClassGroupCreateSchema>;
export type EducationSubjectInput = z.infer<typeof educationSubjectCreateSchema>;
export type EducationCourseOfferingInput = z.infer<typeof educationCourseOfferingCreateSchema>;
export type EducationCalendarEventInput = z.infer<typeof educationCalendarEventCreateSchema>;
