import { Prisma } from "@prisma/client";
import { z } from "zod";
import { normalizePositionCode } from "@/lib/business-roles";
import { notifyUser, notifyUsers } from "@/lib/notifications";
import { DTSC_INTERNAL_ORGANIZATION_ID } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { resolveDtscEffectiveAvailability } from "@/lib/work-schedule";

export const workEntryTypes = [
  "NORMAL_WORK",
  "MEETING",
  "MISSION",
  "PROJECT_WORK",
  "SUPPORT",
  "TRAINING",
  "ADMINISTRATIVE",
  "OTHER",
] as const;

export const workLocationModes = ["Site DTSC", "Télétravail", "Hybride", "Externe", "Mission", "Non défini"] as const;
export const workSourceTypes = ["COO_TASK", "COO_OPERATION", "COO_MEETING", "MPO_PROJECT", "COLLAB_REQUEST"] as const;
export const workSubmissionStatuses = ["DRAFT", "SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const workReviewActions = ["SUBMITTED", "RESUBMITTED", "APPROVED", "CHANGES_REQUESTED", "REJECTED"] as const;

export type WorkSubmissionStatus = (typeof workSubmissionStatuses)[number];
export type WorkReviewAction = (typeof workReviewActions)[number];

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const workEntryBaseSchema = z.object({
  employeeId: z.string().max(160).optional(),
  workDate: dateOnlySchema,
  startTime: timeSchema,
  endTime: timeSchema,
  breakMinutes: z.coerce.number().int().min(0).max(720).default(0),
  locationMode: z.enum(workLocationModes).default("Non défini"),
  workType: z.enum(workEntryTypes).default("NORMAL_WORK"),
  summary: z.string().trim().min(3).max(240),
  details: z.string().trim().max(2500).optional().or(z.literal("")),
  sourceType: z.enum(workSourceTypes).optional(),
  sourceId: z.string().trim().max(180).optional().or(z.literal("")),
}).strict();

export const workEntryCreateSchema = workEntryBaseSchema.superRefine((data, ctx) => {
  validateEntryTimes(data, ctx);
  if (Boolean(data.sourceType) !== Boolean(data.sourceId)) {
    ctx.addIssue({ code: "custom", path: ["sourceId"], message: "La source liée doit préciser à la fois son type et son identifiant." });
  }
});

export const workEntryUpdateSchema = z.object({
  employeeId: z.string().max(160).optional(),
  workDate: dateOnlySchema.optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  breakMinutes: z.coerce.number().int().min(0).max(720).optional(),
  locationMode: z.enum(workLocationModes).optional(),
  workType: z.enum(workEntryTypes).optional(),
  summary: z.string().trim().min(3).max(240).optional(),
  details: z.string().trim().max(2500).optional().or(z.literal("")),
  sourceType: z.enum(workSourceTypes).optional().nullable(),
  sourceId: z.string().trim().max(180).optional().or(z.literal("")).nullable(),
}).strict();

export const workSubmissionCreateSchema = z.object({
  periodDate: dateOnlySchema,
}).strict();

export const workSubmissionSubmitSchema = z.object({
  confirmScheduleConflicts: z.boolean().optional().default(false),
}).strict();

export const workReviewSchema = z.object({
  action: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  comment: z.string().trim().max(1200).optional().or(z.literal("")),
}).strict().superRefine((data, ctx) => {
  if ((data.action === "CHANGES_REQUESTED" || data.action === "REJECTED") && !data.comment?.trim()) {
    ctx.addIssue({ code: "custom", path: ["comment"], message: "Un motif est obligatoire pour cette décision." });
  }
});

export type WorkActor = NonNullable<Awaited<ReturnType<typeof getWorkActor>>>;

type EntryLike = {
  workDate: Date;
  startTime: string;
  endTime: string;
  breakMinutes: number;
};

export async function getWorkActor(userId: string) {
  return prisma.hrcfoEmployee.findFirst({
    where: { userId, status: { not: "EXITED" } },
    include: { position: true, user: { select: { id: true, timezone: true, locale: true } } },
  });
}

export function getEmployeePositionCode(employee: { position?: { code: string } | null; positionCode?: string | null; jobTitle?: string | null }) {
  return normalizePositionCode(employee.position?.code || employee.positionCode || employee.jobTitle || "");
}

export function calculateWorkedMinutes(startTime: string, endTime: string, breakMinutes: number) {
  const rawMinutes = timeToMinutes(endTime) - timeToMinutes(startTime);
  if (rawMinutes <= 0) throw new WorkPrestationError("INVALID_TIME_RANGE", "L’heure de fin doit être après l’heure de début.", 400);
  if (breakMinutes < 0 || breakMinutes >= rawMinutes) throw new WorkPrestationError("INVALID_BREAK", "La pause doit être positive et inférieure à la durée brute.", 400);
  return rawMinutes - breakMinutes;
}

export function weekPeriodForDate(dateKey: string) {
  const value = new Date(`${dateKey}T00:00:00.000Z`);
  const offsetFromMonday = (value.getUTCDay() + 6) % 7;
  const start = new Date(value);
  start.setUTCDate(start.getUTCDate() - offsetFromMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { periodStart: dateKeyFromUtcDate(start), periodEnd: dateKeyFromUtcDate(end) };
}

export function currentDateKey(timezone: string) {
  return dateKeyForInstant(new Date(), timezone);
}

export async function ensureDraftSubmissionForDate(actor: WorkActor, dateKey: string) {
  const { periodStart, periodEnd } = weekPeriodForDate(dateKey);
  const periodStartDate = dateOnlyToUtc(periodStart);
  const periodEndDate = dateOnlyToUtc(periodEnd);
  const existing = await prisma.dtscWorkSubmission.findUnique({
    where: { employeeId_periodStart_periodEnd: { employeeId: actor.id, periodStart: periodStartDate, periodEnd: periodEndDate } },
    include: { entries: { where: { deletedAt: null }, orderBy: [{ workDate: "asc" }, { startTime: "asc" }] }, reviews: { orderBy: { createdAt: "asc" } } },
  });
  if (existing) return existing;
  return prisma.dtscWorkSubmission.create({
    data: {
      employeeId: actor.id,
      periodStart: periodStartDate,
      periodEnd: periodEndDate,
      status: "DRAFT",
      declaredMinutes: 0,
      createdById: actor.userId || actor.user?.id || "unknown",
    },
    include: { entries: true, reviews: true },
  });
}

export async function createWorkEntry(actor: WorkActor, input: z.infer<typeof workEntryCreateSchema>) {
  rejectCrossEmployeeWrite(actor, input.employeeId);
  const workedMinutes = calculateWorkedMinutes(input.startTime, input.endTime, input.breakMinutes);
  const submission = await ensureDraftSubmissionForDate(actor, input.workDate);
  assertSubmissionEditable(submission.status);
  await ensureNoWorkOverlap({ employeeId: actor.id, workDate: input.workDate, startTime: input.startTime, endTime: input.endTime });
  await validateWorkSourceAccess(actor, input.sourceType, input.sourceId || undefined);
  const indicators = await evaluateSchedule(actor, input.workDate, input.startTime, input.endTime);

  return prisma.$transaction(async (tx) => {
    const entry = await tx.dtscWorkEntry.create({
      data: {
        employeeId: actor.id,
        submissionId: submission.id,
        workDate: dateOnlyToUtc(input.workDate),
        startTime: input.startTime,
        endTime: input.endTime,
        breakMinutes: input.breakMinutes,
        workedMinutes,
        locationMode: input.locationMode,
        workType: input.workType,
        summary: input.summary,
        details: input.details || null,
        sourceType: input.sourceType || null,
        sourceId: input.sourceId || null,
        scheduleOutsideAvailability: indicators.outsideAvailability,
        scheduleBlockingCount: indicators.blocking.length,
        scheduleWarningCount: indicators.warnings.length,
        createdById: actor.userId || actor.user?.id || "unknown",
      },
    });
    await refreshSubmissionTotal(tx, submission.id);
    return entry;
  });
}

export async function updateWorkEntry(actor: WorkActor, entryId: string, input: z.infer<typeof workEntryUpdateSchema>) {
  rejectCrossEmployeeWrite(actor, input.employeeId);
  const current = await prisma.dtscWorkEntry.findFirst({
    where: { id: entryId, employeeId: actor.id, deletedAt: null },
    include: { submission: true },
  });
  if (!current) throw new WorkPrestationError("NOT_FOUND", "Prestation introuvable.", 404);
  assertSubmissionEditable(current.submission?.status || "DRAFT");

  const workDate = input.workDate || dateKeyFromUtcDate(current.workDate);
  const startTime = input.startTime || current.startTime;
  const endTime = input.endTime || current.endTime;
  const breakMinutes = input.breakMinutes ?? current.breakMinutes;
  const workedMinutes = calculateWorkedMinutes(startTime, endTime, breakMinutes);
  await ensureNoWorkOverlap({ employeeId: actor.id, workDate, startTime, endTime, excludeId: current.id });

  const sourceType = input.sourceType === undefined ? current.sourceType : input.sourceType || null;
  const sourceId = input.sourceId === undefined ? current.sourceId : input.sourceId || null;
  if (Boolean(sourceType) !== Boolean(sourceId)) throw new WorkPrestationError("INVALID_SOURCE", "La source liée est incomplète.", 400);
  await validateWorkSourceAccess(actor, sourceType as (typeof workSourceTypes)[number] | null, sourceId || undefined);
  const indicators = await evaluateSchedule(actor, workDate, startTime, endTime);

  const targetPeriod = weekPeriodForDate(workDate);
  const currentPeriodStart = dateKeyFromUtcDate(current.submission?.periodStart || current.workDate);
  if (current.submission && targetPeriod.periodStart !== currentPeriodStart) {
    throw new WorkPrestationError("PERIOD_CHANGE_NOT_ALLOWED", "Une prestation déjà rattachée à une semaine ne peut pas être déplacée vers une autre semaine. Créez une nouvelle prestation.", 409);
  }

  return prisma.$transaction(async (tx) => {
    const entry = await tx.dtscWorkEntry.update({
      where: { id: current.id },
      data: {
        workDate: dateOnlyToUtc(workDate),
        startTime,
        endTime,
        breakMinutes,
        workedMinutes,
        locationMode: input.locationMode ?? current.locationMode,
        workType: input.workType ?? current.workType,
        summary: input.summary ?? current.summary,
        details: input.details === undefined ? current.details : input.details || null,
        sourceType,
        sourceId,
        scheduleOutsideAvailability: indicators.outsideAvailability,
        scheduleBlockingCount: indicators.blocking.length,
        scheduleWarningCount: indicators.warnings.length,
      },
    });
    if (current.submissionId) await refreshSubmissionTotal(tx, current.submissionId);
    return entry;
  });
}

export async function deleteWorkEntry(actor: WorkActor, entryId: string) {
  const current = await prisma.dtscWorkEntry.findFirst({ where: { id: entryId, employeeId: actor.id, deletedAt: null }, include: { submission: true } });
  if (!current) throw new WorkPrestationError("NOT_FOUND", "Prestation introuvable.", 404);
  assertSubmissionEditable(current.submission?.status || "DRAFT");
  return prisma.$transaction(async (tx) => {
    const entry = await tx.dtscWorkEntry.update({ where: { id: current.id }, data: { deletedAt: new Date() } });
    if (current.submissionId) await refreshSubmissionTotal(tx, current.submissionId);
    return entry;
  });
}

export async function getOwnWorkState(actor: WorkActor, limit = 12) {
  const timezone = actor.user?.timezone || "Africa/Kinshasa";
  const today = currentDateKey(timezone);
  const currentPeriod = weekPeriodForDate(today);
  const submissions = await prisma.dtscWorkSubmission.findMany({
    where: { employeeId: actor.id },
    include: {
      entries: { where: { deletedAt: null }, orderBy: [{ workDate: "asc" }, { startTime: "asc" }] },
      reviews: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { periodStart: "desc" },
    take: Math.min(Math.max(limit, 1), 30),
  });
  const currentSubmission = submissions.find((item) => dateKeyFromUtcDate(item.periodStart) === currentPeriod.periodStart)
    || await ensureDraftSubmissionForDate(actor, today);
  const all = submissions.some((item) => item.id === currentSubmission.id) ? submissions : [currentSubmission, ...submissions];
  return {
    timezone,
    today,
    currentPeriod,
    currentSubmission: serializeSubmission(currentSubmission),
    submissions: all.map(serializeSubmission),
  };
}

export async function listOwnEntries(actor: WorkActor, periodDate?: string) {
  const dateKey = periodDate || currentDateKey(actor.user?.timezone || "Africa/Kinshasa");
  const period = weekPeriodForDate(dateKey);
  const entries = await prisma.dtscWorkEntry.findMany({
    where: {
      employeeId: actor.id,
      deletedAt: null,
      workDate: { gte: dateOnlyToUtc(period.periodStart), lte: dateOnlyToUtc(period.periodEnd) },
    },
    orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
    take: 200,
  });
  return { period, entries: entries.map(serializeWorkEntry) };
}

export async function submitWorkSubmission(actor: WorkActor, submissionId: string, confirmScheduleConflicts = false) {
  const submission = await prisma.dtscWorkSubmission.findFirst({
    where: { id: submissionId, employeeId: actor.id },
    include: { entries: { where: { deletedAt: null }, orderBy: [{ workDate: "asc" }, { startTime: "asc" }] } },
  });
  if (!submission) throw new WorkPrestationError("NOT_FOUND", "Période de prestations introuvable.", 404);
  if (submission.status !== "DRAFT" && submission.status !== "CHANGES_REQUESTED") {
    throw new WorkPrestationError("INVALID_TRANSITION", "Cette période n’est pas dans un état permettant la soumission.", 409);
  }
  if (!submission.entries.length) throw new WorkPrestationError("EMPTY_SUBMISSION", "Ajoutez au moins une prestation avant de soumettre la période.", 409);

  const recalculatedEntries = [] as Array<{ id: string; workedMinutes: number; indicators: Awaited<ReturnType<typeof evaluateSchedule>> }>;
  for (const entry of submission.entries) {
    const workedMinutes = calculateWorkedMinutes(entry.startTime, entry.endTime, entry.breakMinutes);
    const workDate = dateKeyFromUtcDate(entry.workDate);
    await ensureNoWorkOverlap({ employeeId: actor.id, workDate, startTime: entry.startTime, endTime: entry.endTime, excludeId: entry.id });
    const indicators = await evaluateSchedule(actor, workDate, entry.startTime, entry.endTime);
    recalculatedEntries.push({ id: entry.id, workedMinutes, indicators });
  }

  const hasBlockingScheduleConflict = recalculatedEntries.some((item) => item.indicators.blocking.length > 0);
  if (hasBlockingScheduleConflict && !confirmScheduleConflicts) {
    throw new WorkPrestationError("SCHEDULE_CONFLICT_CONFIRMATION_REQUIRED", "Au moins une prestation chevauche une absence ou une indisponibilité déclarée. Vérifiez la période puis confirmez explicitement la soumission si la déclaration reste correcte.", 409);
  }

  const declaredMinutes = recalculatedEntries.reduce((sum, item) => sum + item.workedMinutes, 0);
  const previousStatus = submission.status;
  const reviewers = await resolveEligibleReviewers(actor);
  if (!reviewers.length) throw new WorkPrestationError("NO_REVIEWER_CONFIGURED", "Aucun validateur opérationnel n’est actuellement configuré pour cette soumission.", 409);

  const updated = await prisma.$transaction(async (tx) => {
    for (const item of recalculatedEntries) {
      await tx.dtscWorkEntry.update({
        where: { id: item.id },
        data: {
          workedMinutes: item.workedMinutes,
          scheduleOutsideAvailability: item.indicators.outsideAvailability,
          scheduleBlockingCount: item.indicators.blocking.length,
          scheduleWarningCount: item.indicators.warnings.length,
        },
      });
    }
    const next = await tx.dtscWorkSubmission.update({
      where: { id: submission.id },
      data: {
        status: "SUBMITTED",
        declaredMinutes,
        validatedMinutes: null,
        submittedAt: new Date(),
        reviewerEmployeeId: null,
        reviewedAt: null,
        reviewComment: null,
        revision: previousStatus === "CHANGES_REQUESTED" ? { increment: 1 } : submission.revision,
      },
      include: { entries: { where: { deletedAt: null }, orderBy: [{ workDate: "asc" }, { startTime: "asc" }] }, reviews: { orderBy: { createdAt: "asc" } } },
    });
    await tx.dtscWorkSubmissionReview.create({
      data: {
        submissionId: submission.id,
        actorEmployeeId: actor.id,
        action: previousStatus === "CHANGES_REQUESTED" ? "RESUBMITTED" : "SUBMITTED",
        comment: null,
      },
    });
    return next;
  });

  const reviewerUserIds = reviewers.map((item) => item.userId).filter((value): value is string => Boolean(value));
  await notifyUsers({
    userIds: reviewerUserIds,
    title: previousStatus === "CHANGES_REQUESTED" ? "Prestations resoumises" : "Prestations à valider",
    body: `${actor.fullName} a soumis ses prestations du ${dateKeyFromUtcDate(submission.periodStart)} au ${dateKeyFromUtcDate(submission.periodEnd)}.`,
    type: "WORK_SUBMISSION",
    targetUrl: getReviewerTargetUrl(actor),
    organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
  });
  return serializeSubmission(updated);
}

export async function getReviewerQueue(actor: WorkActor, expectedReviewerCode: "COO" | "CEO") {
  const actorPosition = getEmployeePositionCode(actor);
  if (actorPosition !== expectedReviewerCode) throw new WorkPrestationError("FORBIDDEN", "Votre poste actuel ne permet pas d’examiner cette file de prestations.", 403);

  const submissions = await prisma.dtscWorkSubmission.findMany({
    where: { status: { in: ["SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "REJECTED"] } },
    include: { entries: { where: { deletedAt: null }, orderBy: [{ workDate: "asc" }, { startTime: "asc" }] }, reviews: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ submittedAt: "desc" }, { periodStart: "desc" }],
    take: 200,
  });
  const employeeIds = [...new Set(submissions.map((item) => item.employeeId))];
  const employees = await prisma.hrcfoEmployee.findMany({
    where: { id: { in: employeeIds }, status: { not: "EXITED" } },
    include: { position: true },
  });
  const employeesById = new Map(employees.map((item) => [item.id, item]));
  return submissions
    .filter((submission) => {
      const employee = employeesById.get(submission.employeeId);
      return Boolean(employee && submission.employeeId !== actor.id && requiredReviewerCode(employee) === actorPosition);
    })
    .map((submission) => {
      const employee = employeesById.get(submission.employeeId)!;
      return serializeSubmission(submission, {
        employee: {
          id: employee.id,
          fullName: employee.fullName,
          jobTitle: employee.position?.title || employee.positionTitle || employee.jobTitle,
          positionCode: getEmployeePositionCode(employee),
          department: employee.department,
        },
      });
    });
}

export async function reviewWorkSubmission({
  actor,
  submissionId,
  action,
  comment,
  expectedReviewerCode,
}: {
  actor: WorkActor;
  submissionId: string;
  action: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
  comment?: string;
  expectedReviewerCode: "COO" | "CEO";
}) {
  if (getEmployeePositionCode(actor) !== expectedReviewerCode) throw new WorkPrestationError("FORBIDDEN", "Votre poste actuel ne permet pas cette validation.", 403);
  const submission = await prisma.dtscWorkSubmission.findUnique({
    where: { id: submissionId },
    include: { entries: { where: { deletedAt: null } } },
  });
  if (!submission) throw new WorkPrestationError("NOT_FOUND", "Soumission introuvable.", 404);
  if (submission.employeeId === actor.id) throw new WorkPrestationError("SELF_REVIEW_FORBIDDEN", "Aucun collaborateur ne peut valider sa propre soumission.", 403);
  if (submission.status !== "SUBMITTED") throw new WorkPrestationError("INVALID_TRANSITION", "Seule une soumission en attente peut être examinée.", 409);
  const submitter = await prisma.hrcfoEmployee.findFirst({ where: { id: submission.employeeId, status: { not: "EXITED" } }, include: { position: true } });
  if (!submitter) throw new WorkPrestationError("SUBMITTER_NOT_FOUND", "Le collaborateur associé n’est plus disponible.", 409);
  if (requiredReviewerCode(submitter) !== expectedReviewerCode) throw new WorkPrestationError("WRONG_REVIEWER", "Cette soumission doit être traitée par un autre niveau de validation.", 403);
  if ((action === "CHANGES_REQUESTED" || action === "REJECTED") && !comment?.trim()) throw new WorkPrestationError("COMMENT_REQUIRED", "Un motif est obligatoire.", 400);

  const declaredMinutes = submission.entries.reduce((sum, entry) => sum + calculateWorkedMinutes(entry.startTime, entry.endTime, entry.breakMinutes), 0);
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.dtscWorkSubmission.update({
      where: { id: submission.id },
      data: {
        status: action,
        declaredMinutes,
        validatedMinutes: action === "APPROVED" ? declaredMinutes : null,
        reviewerEmployeeId: actor.id,
        reviewedAt: new Date(),
        reviewComment: comment?.trim() || null,
      },
      include: { entries: { where: { deletedAt: null }, orderBy: [{ workDate: "asc" }, { startTime: "asc" }] }, reviews: { orderBy: { createdAt: "asc" } } },
    });
    await tx.dtscWorkSubmissionReview.create({ data: { submissionId: submission.id, actorEmployeeId: actor.id, action, comment: comment?.trim() || null } });
    return next;
  });

  if (submitter.userId) {
    const period = `${dateKeyFromUtcDate(submission.periodStart)} au ${dateKeyFromUtcDate(submission.periodEnd)}`;
    const message = action === "APPROVED"
      ? `Votre déclaration de prestations du ${period} a été validée.`
      : action === "CHANGES_REQUESTED"
        ? `Une correction est demandée pour votre déclaration de prestations du ${period}.`
        : `Votre déclaration de prestations du ${period} a été refusée.`;
    await notifyUser({ userId: submitter.userId, title: "Prestations DTSC", body: message, type: "WORK_SUBMISSION", targetUrl: "/activities", organizationId: DTSC_INTERNAL_ORGANIZATION_ID });
  }
  return serializeSubmission(updated);
}

export async function getApprovedWorkForPayroll({ employeeId, periodStart, periodEnd }: { employeeId: string; periodStart: Date; periodEnd: Date }) {
  return prisma.dtscWorkSubmission.findMany({
    where: { employeeId, status: "APPROVED", periodStart: { gte: periodStart }, periodEnd: { lte: periodEnd } },
    include: { entries: { where: { deletedAt: null }, orderBy: [{ workDate: "asc" }, { startTime: "asc" }] }, reviews: { orderBy: { createdAt: "asc" } } },
    orderBy: { periodStart: "asc" },
  });
}

export function serializeWorkEntry(entry: {
  id: string;
  employeeId: string;
  submissionId: string | null;
  workDate: Date;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workedMinutes: number;
  locationMode: string | null;
  workType: string;
  summary: string;
  details: string | null;
  sourceType: string | null;
  sourceId: string | null;
  scheduleOutsideAvailability: boolean;
  scheduleBlockingCount: number;
  scheduleWarningCount: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...entry,
    workDate: dateKeyFromUtcDate(entry.workDate),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function serializeSubmission(submission: {
  id: string;
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  declaredMinutes: number;
  validatedMinutes: number | null;
  submittedAt: Date | null;
  reviewerEmployeeId: string | null;
  reviewedAt: Date | null;
  reviewComment: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  entries?: Array<Parameters<typeof serializeWorkEntry>[0]>;
  reviews?: Array<{ id: string; submissionId: string; actorEmployeeId: string; action: string; comment: string | null; createdAt: Date }>;
}, extra: Record<string, unknown> = {}) {
  return {
    id: submission.id,
    employeeId: submission.employeeId,
    periodStart: dateKeyFromUtcDate(submission.periodStart),
    periodEnd: dateKeyFromUtcDate(submission.periodEnd),
    status: submission.status,
    declaredMinutes: submission.declaredMinutes,
    validatedMinutes: submission.validatedMinutes,
    submittedAt: submission.submittedAt?.toISOString() || null,
    reviewerEmployeeId: submission.reviewerEmployeeId,
    reviewedAt: submission.reviewedAt?.toISOString() || null,
    reviewComment: submission.reviewComment,
    revision: submission.revision,
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
    entries: submission.entries?.map(serializeWorkEntry) || [],
    reviews: submission.reviews?.map((review) => ({ ...review, createdAt: review.createdAt.toISOString() })) || [],
    ...extra,
  };
}

export class WorkPrestationError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export function isWorkPrestationError(error: unknown): error is WorkPrestationError {
  return error instanceof WorkPrestationError;
}

function validateEntryTimes(data: { startTime: string; endTime: string; breakMinutes: number }, ctx: z.RefinementCtx) {
  const gross = timeToMinutes(data.endTime) - timeToMinutes(data.startTime);
  if (gross <= 0) ctx.addIssue({ code: "custom", path: ["endTime"], message: "L’heure de fin doit être après l’heure de début." });
  if (data.breakMinutes >= gross && gross > 0) ctx.addIssue({ code: "custom", path: ["breakMinutes"], message: "La pause doit être inférieure à la durée brute." });
}

function rejectCrossEmployeeWrite(actor: WorkActor, requestedEmployeeId?: string | null) {
  if (requestedEmployeeId && requestedEmployeeId !== actor.id) throw new WorkPrestationError("CROSS_EMPLOYEE_WRITE_FORBIDDEN", "Vous pouvez uniquement déclarer votre propre travail.", 403);
}

function assertSubmissionEditable(status: string) {
  if (status !== "DRAFT" && status !== "CHANGES_REQUESTED") throw new WorkPrestationError("SUBMISSION_LOCKED", "Les prestations d’une période soumise, validée ou refusée sont verrouillées.", 409);
}

async function ensureNoWorkOverlap({ employeeId, workDate, startTime, endTime, excludeId }: { employeeId: string; workDate: string; startTime: string; endTime: string; excludeId?: string }) {
  const candidates = await prisma.dtscWorkEntry.findMany({
    where: { employeeId, workDate: dateOnlyToUtc(workDate), deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, startTime: true, endTime: true },
    take: 100,
  });
  const overlap = candidates.find((item) => timeToMinutes(item.startTime) < timeToMinutes(endTime) && timeToMinutes(item.endTime) > timeToMinutes(startTime));
  if (overlap) throw new WorkPrestationError("WORK_ENTRY_OVERLAP", `Cette prestation chevauche déjà une plage de ${overlap.startTime} à ${overlap.endTime}.`, 409);
}

async function validateWorkSourceAccess(actor: WorkActor, sourceType?: (typeof workSourceTypes)[number] | null, sourceId?: string) {
  if (!sourceType && !sourceId) return;
  if (!sourceType || !sourceId) throw new WorkPrestationError("INVALID_SOURCE", "La source liée est incomplète.", 400);
  const employeeId = actor.id;
  const employeeName = actor.fullName;
  let allowed = false;
  if (sourceType === "COO_TASK") {
    allowed = Boolean(await prisma.cooTask.findFirst({ where: { id: sourceId, OR: [{ assigneeEmployeeId: employeeId }, { responsibleEmployeeId: employeeId }] }, select: { id: true } }));
  } else if (sourceType === "COO_OPERATION") {
    allowed = Boolean(await prisma.cooOperation.findFirst({ where: { id: sourceId, OR: [{ leadEmployeeId: employeeId }, { collaborators: { contains: employeeId } }, { collaborators: { contains: employeeName, mode: "insensitive" } }] }, select: { id: true } }));
  } else if (sourceType === "COO_MEETING") {
    allowed = Boolean(await prisma.cooMeeting.findFirst({ where: { id: sourceId, OR: [{ reportOwnerEmployeeId: employeeId }, { participants: { contains: employeeId } }, { participants: { contains: employeeName, mode: "insensitive" } }] }, select: { id: true } }));
  } else if (sourceType === "MPO_PROJECT") {
    allowed = Boolean(await prisma.mpoProject.findFirst({ where: { id: sourceId, OR: [{ responsibleMpoId: employeeId }, { ctoEmployeeId: employeeId }, { cooEmployeeId: employeeId }, { hrCfoEmployeeId: employeeId }, { scoEmployeeId: employeeId }, { ceoEmployeeId: employeeId }, { collaborators: { contains: employeeId } }, { collaborators: { contains: employeeName, mode: "insensitive" } }] }, select: { id: true } }));
  } else if (sourceType === "COLLAB_REQUEST") {
    allowed = Boolean(await prisma.collaboratorRequest.findFirst({ where: { id: sourceId, OR: [{ requesterEmployeeId: employeeId }, { targetEmployeeId: employeeId }] }, select: { id: true } }));
  }
  if (!allowed) throw new WorkPrestationError("SOURCE_FORBIDDEN", "L’objet opérationnel lié n’est pas accessible par ce collaborateur.", 403);
}

async function evaluateSchedule(actor: WorkActor, workDate: string, startTime: string, endTime: string) {
  const timezone = actor.user?.timezone || "Africa/Kinshasa";
  const startDateTime = zonedDateTimeToUtc(workDate, startTime, timezone);
  const endDateTime = zonedDateTimeToUtc(workDate, endTime, timezone);
  return resolveDtscEffectiveAvailability({ collaboratorId: actor.id, startDateTime, endDateTime });
}

async function resolveEligibleReviewers(submitter: WorkActor) {
  const required = requiredReviewerCode(submitter);
  const candidates = await prisma.hrcfoEmployee.findMany({
    where: { status: { not: "EXITED" }, userId: { not: null }, id: { not: submitter.id } },
    include: { position: true },
    take: 100,
  });
  return candidates.filter((candidate) => getEmployeePositionCode(candidate) === required);
}

function requiredReviewerCode(employee: { position?: { code: string } | null; positionCode?: string | null; jobTitle?: string | null }) {
  return getEmployeePositionCode(employee) === "COO" ? "CEO" : "COO";
}

function getReviewerTargetUrl(submitter: WorkActor) {
  return getEmployeePositionCode(submitter) === "COO" ? "/admin?section=ceo" : "/admin?section=coo";
}

async function refreshSubmissionTotal(tx: Prisma.TransactionClient, submissionId: string) {
  const aggregate = await tx.dtscWorkEntry.aggregate({ where: { submissionId, deletedAt: null }, _sum: { workedMinutes: true } });
  await tx.dtscWorkSubmission.update({ where: { id: submissionId }, data: { declaredMinutes: aggregate._sum.workedMinutes || 0 } });
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function dateOnlyToUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateKeyFromUtcDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function dateKeyForInstant(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function zonedDateTimeToUtc(dateKey: string, time: string, timezone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = wallClockUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value || 0);
    const represented = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"));
    candidate -= represented - wallClockUtc;
  }
  return new Date(candidate);
}
