import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { env } from "@/lib/env";
import { enqueueFinanceReportGeneration, type FinanceReportGenerationJobPayload } from "@/lib/enterprise/bulk-jobs/queue";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { enterpriseBudgetVisibilityWhere } from "@/lib/enterprise/finance/access";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";
import { sendZohoOutboundMail } from "@/lib/zoho-mail";
import type { reportScheduleCreateSchema, reportScheduleFiltersSchema, reportScheduleUpdateSchema } from "@/lib/enterprise/reporting/schedule-validators";

type ScheduleCreateInput = z.infer<typeof reportScheduleCreateSchema>;
type ScheduleFilters = z.infer<typeof reportScheduleFiltersSchema>;
type ScheduleUpdateInput = z.infer<typeof reportScheduleUpdateSchema>;
type ScheduleRunWithSchedule = Prisma.EnterpriseReportScheduleRunGetPayload<{ include: { schedule: true } }>;
type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const REPORT_DELIVERY_LEASE_MS = 10 * 60 * 1000;

function asObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function assertTimeZone(timeZone: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date()); }
  catch { throw new EnterpriseCoreV2Error("Le fuseau horaire sélectionné n’est pas valide.", 400, "REPORT_SCHEDULE_TIMEZONE_INVALID"); }
}

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function zoneOffsetMs(date: Date, timeZone: string) {
  const parts = localParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function zonedDateToUtc(parts: Omit<LocalParts, "second"> & { second?: number }, timeZone: string) {
  const guessed = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
  let candidate = new Date(guessed - zoneOffsetMs(new Date(guessed), timeZone));
  const secondOffset = zoneOffsetMs(candidate, timeZone);
  candidate = new Date(guessed - secondOffset);
  return candidate;
}

function daysInMonth(year: number, month: number) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function plusLocalDays(parts: LocalParts, days: number) { const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days)); return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }; }

function nextRunAtFor(input: Pick<ScheduleCreateInput, "frequency" | "timeZone" | "hour" | "minute" | "dayOfWeek" | "dayOfMonth">, after = new Date()) {
  assertTimeZone(input.timeZone);
  const current = localParts(after, input.timeZone);
  if (input.frequency === "DAILY") {
    let date = { year: current.year, month: current.month, day: current.day };
    let candidate = zonedDateToUtc({ ...date, hour: input.hour, minute: input.minute }, input.timeZone);
    if (candidate.getTime() <= after.getTime()) { date = plusLocalDays(current, 1); candidate = zonedDateToUtc({ ...date, hour: input.hour, minute: input.minute }, input.timeZone); }
    return candidate;
  }
  if (input.frequency === "WEEKLY") {
    const target = input.dayOfWeek ?? 1;
    const currentDay = new Date(Date.UTC(current.year, current.month - 1, current.day)).getUTCDay();
    let delta = (target - currentDay + 7) % 7;
    let date = plusLocalDays(current, delta);
    let candidate = zonedDateToUtc({ ...date, hour: input.hour, minute: input.minute }, input.timeZone);
    if (candidate.getTime() <= after.getTime()) { delta += 7; date = plusLocalDays(current, delta); candidate = zonedDateToUtc({ ...date, hour: input.hour, minute: input.minute }, input.timeZone); }
    return candidate;
  }
  const targetDay = input.dayOfMonth ?? 1;
  let year = current.year; let month = current.month; let day = Math.min(targetDay, daysInMonth(year, month));
  let candidate = zonedDateToUtc({ year, month, day, hour: input.hour, minute: input.minute }, input.timeZone);
  if (candidate.getTime() <= after.getTime()) { month += 1; if (month > 12) { month = 1; year += 1; } day = Math.min(targetDay, daysInMonth(year, month)); candidate = zonedDateToUtc({ year, month, day, hour: input.hour, minute: input.minute }, input.timeZone); }
  return candidate;
}

function dateString(year: number, month: number, day: number) { return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
function dateOnlyShift(year: number, month: number, day: number, delta: number) { const date = new Date(Date.UTC(year, month - 1, day + delta)); return dateString(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()); }

function resolvePeriod(filters: ScheduleFilters, dueAt: Date, timeZone: string) {
  if (filters.periodMode === "ALL_AVAILABLE") return { periodStart: "", periodEnd: "" };
  if (filters.periodMode === "CUSTOM") return { periodStart: filters.periodStart || "", periodEnd: filters.periodEnd || "" };
  const due = localParts(dueAt, timeZone); const dueDate = dateString(due.year, due.month, due.day);
  if (filters.periodMode === "CURRENT_MONTH") return { periodStart: dateString(due.year, due.month, 1), periodEnd: dueDate };
  if (filters.periodMode === "LAST_7_DAYS") return { periodStart: dateOnlyShift(due.year, due.month, due.day, -6), periodEnd: dueDate };
  if (filters.periodMode === "LAST_30_DAYS") return { periodStart: dateOnlyShift(due.year, due.month, due.day, -29), periodEnd: dueDate };
  let year = due.year; let month = due.month - 1; if (month < 1) { month = 12; year -= 1; }
  return { periodStart: dateString(year, month, 1), periodEnd: dateString(year, month, daysInMonth(year, month)) };
}

export function isReportEmailDeliveryConfigured() {
  const apiConfigured = Boolean(env.ZOHO_MAIL_ACCOUNT_ID && env.ZOHO_MAIL_CLIENT_ID && env.ZOHO_MAIL_CLIENT_SECRET && env.ZOHO_MAIL_REFRESH_TOKEN);
  return apiConfigured || Boolean(env.ZOHO_OUTBOUND_MAIL_WEBHOOK_URL);
}

async function validateScheduleSourceAccess(organizationId: string, userId: string, input: ScheduleCreateInput) {
  const needsFinance = ["BUDGET_VS_ACTUAL", "EXPENSE_SUMMARY", "FINANCE_OVERVIEW"].includes(input.reportType);
  const needsProcurement = ["PROCUREMENT_SUMMARY", "FINANCE_OVERVIEW"].includes(input.reportType);
  const [financeCapabilities, procurementCapabilities] = await Promise.all([
    resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: "FINANCE_BUDGETS" }),
    resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: "SUPPLIERS_PURCHASES" }),
  ]);
  if (needsFinance && !financeCapabilities.canRead) throw new EnterpriseCoreV2Error("Vous n’avez pas accès à la source financière nécessaire à cette planification.", 403, "REPORT_SCHEDULE_FINANCE_FORBIDDEN");
  if (needsProcurement && !procurementCapabilities.canRead) throw new EnterpriseCoreV2Error("Vous n’avez pas accès à la source achats nécessaire à cette planification.", 403, "REPORT_SCHEDULE_PROCUREMENT_FORBIDDEN");
  const filters = input.filters;
  const budgetVisibility = enterpriseBudgetVisibilityWhere({ organizationId, userId, canSeeAll: financeCapabilities.canApprove || financeCapabilities.canManage });
  const [department, supplier, budget] = await Promise.all([
    filters.departmentId ? prisma.enterpriseDepartment.findFirst({ where: { id: filters.departmentId, organizationId, isActive: true }, select: { id: true } }) : Promise.resolve(null),
    filters.supplierId ? prisma.enterpriseSupplier.findFirst({ where: { id: filters.supplierId, organizationId, archivedAt: null, status: { not: "ARCHIVED" } }, select: { id: true } }) : Promise.resolve(null),
    filters.budgetId ? prisma.enterpriseBudget.findFirst({ where: { ...budgetVisibility, id: filters.budgetId }, select: { id: true, currency: true } }) : Promise.resolve(null),
  ]);
  if (filters.departmentId && !department) throw new EnterpriseCoreV2Error("Le département de la planification n’est pas valide.", 400, "REPORT_SCHEDULE_DEPARTMENT_INVALID");
  if (filters.supplierId && !supplier) throw new EnterpriseCoreV2Error("Le fournisseur de la planification n’est pas valide.", 400, "REPORT_SCHEDULE_SUPPLIER_INVALID");
  if (filters.budgetId && !budget) throw new EnterpriseCoreV2Error("Le budget de la planification n’est pas accessible.", 400, "REPORT_SCHEDULE_BUDGET_INVALID");
  if (budget && filters.currency && budget.currency !== filters.currency) throw new EnterpriseCoreV2Error("La devise ne correspond pas au budget planifié.", 400, "REPORT_SCHEDULE_CURRENCY_MISMATCH");
}

export async function createEnterpriseReportSchedule(organizationId: string, userId: string, input: ScheduleCreateInput) {
  assertTimeZone(input.timeZone); await validateScheduleSourceAccess(organizationId, userId, input);
  if (input.deliveryChannels.includes("EMAIL") && !isReportEmailDeliveryConfigured()) throw new EnterpriseCoreV2Error("La livraison des rapports par e-mail n’est pas configurée. Utilisez l’archivage interne ou configurez la messagerie DTSC.", 409, "REPORT_EMAIL_DELIVERY_UNAVAILABLE");
  const nextRunAt = nextRunAtFor(input);
  return prisma.enterpriseReportSchedule.create({ data: { organizationId, createdByUserId: userId, name: input.name, reportType: input.reportType, reportTitle: input.reportTitle, reportDescription: input.reportDescription || null, frequency: input.frequency, timeZone: input.timeZone, hour: input.hour, minute: input.minute, dayOfWeek: input.frequency === "WEEKLY" ? input.dayOfWeek : null, dayOfMonth: input.frequency === "MONTHLY" ? input.dayOfMonth : null, filtersJson: input.filters as unknown as Prisma.InputJsonValue, deliveryChannelsJson: input.deliveryChannels as unknown as Prisma.InputJsonValue, recipientEmailsJson: input.recipientEmails as unknown as Prisma.InputJsonValue, nextRunAt } });
}

export async function updateEnterpriseReportSchedule(organizationId: string, scheduleId: string, input: ScheduleUpdateInput) {
  const schedule = await prisma.enterpriseReportSchedule.findFirst({ where: { id: scheduleId, organizationId, archivedAt: null } });
  if (!schedule) throw new EnterpriseCoreV2Error("Planification introuvable.", 404, "REPORT_SCHEDULE_NOT_FOUND");
  if (schedule.revision !== input.revision) throw new EnterpriseCoreV2Error("La planification a été modifiée simultanément.", 409, "REPORT_SCHEDULE_REVISION_CONFLICT");
  const nextEnabled = input.action === "ENABLE";
  const nextRunAt = input.action === "ENABLE" ? nextRunAtFor({ frequency: schedule.frequency as ScheduleCreateInput["frequency"], timeZone: schedule.timeZone, hour: schedule.hour, minute: schedule.minute, dayOfWeek: schedule.dayOfWeek, dayOfMonth: schedule.dayOfMonth }) : schedule.nextRunAt;
  const updated = await prisma.enterpriseReportSchedule.updateMany({ where: { id: scheduleId, organizationId, revision: input.revision, archivedAt: null }, data: input.action === "ARCHIVE" ? { isEnabled: false, archivedAt: new Date(), revision: { increment: 1 } } : { isEnabled: nextEnabled, nextRunAt, revision: { increment: 1 } } });
  if (updated.count !== 1) throw new EnterpriseCoreV2Error("La planification a été modifiée simultanément.", 409, "REPORT_SCHEDULE_REVISION_CONFLICT");
  return prisma.enterpriseReportSchedule.findFirst({ where: { id: scheduleId, organizationId } });
}

export async function listEnterpriseReportSchedules(organizationId: string) {
  return prisma.enterpriseReportSchedule.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ isEnabled: "desc" }, { nextRunAt: "asc" }], take: 200, include: { runs: { orderBy: { createdAt: "desc" }, take: 5 } } });
}

function parseScheduleFilters(value: Prisma.JsonValue | null): ScheduleFilters {
  const row = asObject(value);
  return { periodMode: ["ALL_AVAILABLE", "CURRENT_MONTH", "PREVIOUS_MONTH", "LAST_7_DAYS", "LAST_30_DAYS", "CUSTOM"].includes(String(row.periodMode)) ? row.periodMode as ScheduleFilters["periodMode"] : "PREVIOUS_MONTH", periodStart: typeof row.periodStart === "string" ? row.periodStart : "", periodEnd: typeof row.periodEnd === "string" ? row.periodEnd : "", currency: typeof row.currency === "string" ? row.currency : "", departmentId: typeof row.departmentId === "string" ? row.departmentId : "", supplierId: typeof row.supplierId === "string" ? row.supplierId : "", budgetId: typeof row.budgetId === "string" ? row.budgetId : "", category: typeof row.category === "string" ? row.category : "" };
}

function reportInputForSchedule(schedule: Awaited<ReturnType<typeof listEnterpriseReportSchedules>>[number], dueAt: Date) {
  const filters = parseScheduleFilters(schedule.filtersJson); const period = resolvePeriod(filters, dueAt, schedule.timeZone);
  return { reportType: schedule.reportType as ScheduleCreateInput["reportType"], title: schedule.reportTitle, description: schedule.reportDescription || "", periodStart: period.periodStart, periodEnd: period.periodEnd, currency: filters.currency || "", departmentId: filters.departmentId || "", supplierId: filters.supplierId || "", budgetId: filters.budgetId || "", category: filters.category || "", sourceModule: "", sourceEntityType: "", sourceEntityId: "" };
}

async function enqueueDueSchedule(schedule: Awaited<ReturnType<typeof listEnterpriseReportSchedules>>[number]) {
  const dueAt = schedule.nextRunAt;
  const run = await prisma.enterpriseReportScheduleRun.create({ data: { organizationId: schedule.organizationId, scheduleId: schedule.id, dueAt, status: "QUEUED", deliveryStatus: "ARCHIVE_PENDING" } }).catch((error) => { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null; throw error; });
  if (!run) return false;
  try {
    const job = await enqueueFinanceReportGeneration(schedule.organizationId, schedule.createdByUserId, reportInputForSchedule(schedule, dueAt));
    const nextRunAt = nextRunAtFor({ frequency: schedule.frequency as ScheduleCreateInput["frequency"], timeZone: schedule.timeZone, hour: schedule.hour, minute: schedule.minute, dayOfWeek: schedule.dayOfWeek, dayOfMonth: schedule.dayOfMonth }, dueAt);
    await prisma.$transaction([
      prisma.enterpriseReportScheduleRun.update({ where: { id: run.id }, data: { generationEventId: job.id } }),
      prisma.enterpriseReportSchedule.updateMany({ where: { id: schedule.id, organizationId: schedule.organizationId, revision: schedule.revision, nextRunAt: dueAt }, data: { nextRunAt, lastEnqueuedAt: new Date(), revision: { increment: 1 } } }),
    ]);
    return true;
  } catch {
    await prisma.enterpriseReportScheduleRun.update({ where: { id: run.id }, data: { status: "FAILED", deliveryStatus: "FAILED", errorCode: "REPORT_SCHEDULE_ENQUEUE_FAILED", completedAt: new Date() } });
    return false;
  }
}

function generationPayload(value: Prisma.JsonValue | null) {
  const payload = asObject(value) as unknown as Partial<FinanceReportGenerationJobPayload>;
  return payload.kind === "FINANCE_REPORT_GENERATION" && payload.version === 1 ? payload : null;
}

async function recoverStaleDeliveries() {
  const staleBefore = new Date(Date.now() - REPORT_DELIVERY_LEASE_MS);
  return prisma.enterpriseReportScheduleRun.updateMany({
    where: { status: "DELIVERING", updatedAt: { lt: staleBefore } },
    data: { status: "QUEUED", errorCode: "REPORT_DELIVERY_STALE_LEASE_RECOVERED" },
  });
}

async function failQueuedRun(run: ScheduleRunWithSchedule, errorCode: string) {
  await prisma.enterpriseReportScheduleRun.updateMany({
    where: { id: run.id, organizationId: run.organizationId, status: "QUEUED" },
    data: { status: "FAILED", deliveryStatus: "FAILED", errorCode, completedAt: new Date() },
  });
}

async function deliverCompletedRun(run: ScheduleRunWithSchedule) {
  if (!run.generationEventId) return;
  const event = await prisma.enterpriseDomainEvent.findFirst({ where: { id: run.generationEventId, organizationId: run.organizationId }, select: { processingStatus: true, payloadJson: true } });
  if (!event) return;
  if (event.processingStatus === "DEAD") { await failQueuedRun(run, "REPORT_GENERATION_FAILED"); return; }
  if (event.processingStatus !== "PROCESSED") return;

  const payload = generationPayload(event.payloadJson);
  const reportId = payload?.resultReportId || null;
  if (!reportId) { await failQueuedRun(run, "REPORT_GENERATION_RESULT_MISSING"); return; }
  const report = await prisma.enterpriseReport.findFirst({ where: { id: reportId, organizationId: run.organizationId }, select: { id: true, reference: true, title: true, reportType: true, generatedAt: true } });
  if (!report) { await failQueuedRun(run, "REPORT_GENERATED_RECORD_MISSING"); return; }

  const claimed = await prisma.enterpriseReportScheduleRun.updateMany({
    where: { id: run.id, organizationId: run.organizationId, status: "QUEUED" },
    data: { status: "DELIVERING", errorCode: null },
  });
  if (claimed.count !== 1) return;

  const channels = asStringArray(run.schedule.deliveryChannelsJson);
  let deliveryStatus = "ARCHIVED"; let runStatus = "COMPLETED"; let errorCode: string | null = null;
  if (channels.includes("EMAIL")) {
    const recipients = asStringArray(run.schedule.recipientEmailsJson);
    if (!isReportEmailDeliveryConfigured() || recipients.length === 0) { deliveryStatus = "EMAIL_UNAVAILABLE"; runStatus = "DELIVERY_FAILED"; errorCode = "REPORT_EMAIL_DELIVERY_UNAVAILABLE"; }
    else {
      const result = await sendZohoOutboundMail({ to: recipients, subject: `${report.reference} · ${report.title}`, heading: "Rapport DTSC Platform", source: "REPORTS", deliveryMode: "direct", message: `Le rapport planifié « ${report.title} » (${report.reference}) a été généré et archivé dans le module Rapports de votre entreprise. Ouvrez DTSC Platform pour consulter le détail, les graphiques et les exports professionnels.` }).catch(() => ({ sent: false }));
      if (result.sent) deliveryStatus = "ARCHIVED_EMAIL_SENT";
      else { deliveryStatus = "EMAIL_FAILED"; runStatus = "DELIVERY_FAILED"; errorCode = "REPORT_EMAIL_DELIVERY_FAILED"; }
    }
  }

  const completedAt = new Date();
  await prisma.$transaction([
    prisma.enterpriseReportScheduleRun.updateMany({ where: { id: run.id, organizationId: run.organizationId, status: "DELIVERING" }, data: { reportId: report.id, status: runStatus, deliveryStatus, errorCode, completedAt } }),
    prisma.enterpriseReportSchedule.updateMany({ where: { id: run.schedule.id, organizationId: run.organizationId }, data: { lastCompletedAt: completedAt } }),
  ]);
}

export async function processEnterpriseReportSchedules({ batchSize = 20 }: { batchSize?: number } = {}) {
  const safeBatch = Math.max(1, Math.min(50, Math.trunc(batchSize)));
  const recoveredDeliveries = await recoverStaleDeliveries();
  const due = await prisma.enterpriseReportSchedule.findMany({ where: { isEnabled: true, archivedAt: null, nextRunAt: { lte: new Date() } }, orderBy: { nextRunAt: "asc" }, take: safeBatch, include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } } });
  let enqueued = 0; for (const schedule of due) if (await enqueueDueSchedule(schedule)) enqueued += 1;
  const pending = await prisma.enterpriseReportScheduleRun.findMany({ where: { status: "QUEUED", generationEventId: { not: null } }, orderBy: { createdAt: "asc" }, take: safeBatch * 2, include: { schedule: true } });
  for (const run of pending) await deliverCompletedRun(run);
  return { due: due.length, enqueued, reconciled: pending.length, recoveredDeliveries: recoveredDeliveries.count };
}
