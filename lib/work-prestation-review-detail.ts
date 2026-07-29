import { resolveDtscEffectiveAvailability } from "@/lib/work-schedule";
import { prisma } from "@/lib/prisma";
import { getReviewerQueue, type WorkActor, WorkPrestationError } from "@/lib/work-prestations";

export async function getWorkSubmissionReviewDetail(
  actor: WorkActor,
  submissionId: string,
  expectedReviewerCode: "COO" | "CEO",
) {
  const queue = await getReviewerQueue(actor, expectedReviewerCode);
  const submission = queue.find((item) => item.id === submissionId);
  if (!submission) {
    throw new WorkPrestationError(
      "REVIEW_DETAIL_FORBIDDEN",
      "Cette soumission n’est pas accessible dans votre file de validation.",
      403,
    );
  }

  const employee = await prisma.hrcfoEmployee.findUnique({
    where: { id: submission.employeeId },
    select: { user: { select: { timezone: true } } },
  });
  const timezone = employee?.user?.timezone || "Africa/Kinshasa";

  const entries = [] as Array<(typeof submission.entries)[number] & {
    scheduleContext: Awaited<ReturnType<typeof resolveDtscEffectiveAvailability>>;
  }>;

  for (const entry of submission.entries) {
    const scheduleContext = await resolveDtscEffectiveAvailability({
      collaboratorId: submission.employeeId,
      startDateTime: zonedDateTimeToUtc(entry.workDate, entry.startTime, timezone),
      endDateTime: zonedDateTimeToUtc(entry.workDate, entry.endTime, timezone),
    });
    entries.push({ ...entry, scheduleContext });
  }

  const blockingConflicts = entries.flatMap((entry) =>
    entry.scheduleContext.blocking.map((conflict) => ({ workEntryId: entry.id, workDate: entry.workDate, ...conflict })),
  );
  const warningConflicts = entries.flatMap((entry) =>
    entry.scheduleContext.warnings.map((conflict) => ({ workEntryId: entry.id, workDate: entry.workDate, ...conflict })),
  );

  return {
    ...submission,
    entries,
    planning: {
      timezone,
      entriesWithDeclaredAvailability: entries.filter((entry) => entry.scheduleContext.hasDeclaredAvailability).length,
      entriesOutsideAvailability: entries.filter((entry) => entry.scheduleContext.outsideAvailability).length,
      blockingConflicts,
      warningConflicts,
    },
  };
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
