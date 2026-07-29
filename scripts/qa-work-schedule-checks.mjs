import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!existsSync(absolute)) {
    failures.push(`Fichier introuvable: ${relativePath}`);
    return "";
  }
  return readFileSync(absolute, "utf8").replace(/\r\n/g, "\n");
}
function check(label, condition, hint = "") {
  if (condition) console.log(`PASS ${label}`);
  else {
    failures.push(`${label}${hint ? `\n  ${hint}` : ""}`);
    console.error(`FAIL ${label}`);
  }
}

const schedule = read("lib/work-schedule.ts");
const validators = read("lib/work-schedule-validators.ts");
const availabilityRoute = read("app/api/calendar/availabilities/route.ts");
const availabilityRecordRoute = read("app/api/calendar/availabilities/[id]/route.ts");
const exceptionRoute = read("app/api/calendar/exceptions/route.ts");
const exceptionRecordRoute = read("app/api/calendar/exceptions/[id]/route.ts");
const calendarRoute = read("app/api/calendar/route.ts");
const calendarEventRoute = read("app/api/calendar/events/[id]/route.ts");
const calendarPage = read("app/calendar/page.tsx");
const scheduleUi = read("components/calendar/dtsc-work-schedule-module.tsx");
const migration = read("prisma/migrations/20260729090000_dtsc_work_schedule_semantics/migration.sql");

check("DTSC schedule writes are owner-bound", availabilityRoute.includes("context.calendarCollaboratorId") && availabilityRoute.includes("canManageOwnWorkSchedule"));
check("Cross-user PATCH/DELETE is denied and audited", availabilityRecordRoute.includes("WORK_SCHEDULE_CROSS_USER_WRITE_DENIED") && exceptionRecordRoute.includes("WORK_SCHEDULE_CROSS_USER_WRITE_DENIED"));
check("Weekly availability is distinct from dated exceptions", schedule.includes("isDtscWeeklyAvailability") && schedule.includes("isDtscScheduleException"));
check("Weekly overlap detection is server-side", schedule.includes("assertNoWeeklyOverlap") && availabilityRoute.includes("OVERLAPPING_AVAILABILITY"));
check("Past schedule history is protected", availabilityRecordRoute.includes("PAST_SCHEDULE_LOCKED") && exceptionRecordRoute.includes("PAST_SCHEDULE_LOCKED"));
check("Partial and multi-day exceptions have a real date-time range", validators.includes("startDateTime") && validators.includes("endDateTime") && exceptionRoute.includes("recurrenceStart") && exceptionRoute.includes("recurrenceUntil"));
check("Effective availability resolver uses weekly + exceptions", schedule.includes("detectEffectiveWorkScheduleConflicts") && schedule.includes("weeklyCovers") && schedule.includes("blocking"));
check("Calendar create/update use effective DTSC conflicts", calendarRoute.includes("detectEffectiveWorkScheduleConflicts") && calendarEventRoute.includes("detectEffectiveWorkScheduleConflicts"));
check("Timezone-aware day resolution uses Intl timeZone", schedule.includes("Intl.DateTimeFormat") && schedule.includes("timeZone: timezone"));
check("Team visibility is read-only in the work-schedule UI", scheduleUi.includes("Disponibilités de l'équipe") && scheduleUi.includes("Vue opérationnelle en lecture seule"));
check("Mon planning separates weekly, exceptions and absences", scheduleUi.includes("Disponibilités habituelles") && scheduleUi.includes("Exceptions") && scheduleUi.includes("Absences"));
check("Availability is explicitly not worked time", scheduleUi.includes("Disponibilité ≠ temps réellement travaillé"));
check("Calendar page mounts the DTSC work-schedule workspace", calendarPage.includes("DtscWorkScheduleModule") && calendarPage.includes("listDtscWorkSchedule"));
check("Migration is scoped to DTSC internal and preserves ambiguous legacy rows", migration.includes("dtsc-internal") && migration.includes("Ambiguous historical recurring"));
check("Mutating schedule APIs keep same-origin and rate-limit guards", availabilityRoute.includes("isSameOriginRequest") && exceptionRoute.includes("isSameOriginRequest") && availabilityRoute.includes("await rateLimit") && exceptionRoute.includes("await rateLimit"));

if (failures.length) {
  console.error(`\n${failures.length} contrôle(s) work schedule en échec:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("\nPASS Sprint 3 work schedule source-level QA");
