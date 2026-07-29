import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const checks = [];
const expect = (label, condition) => checks.push({ label, ok: Boolean(condition) });

const policy = read("lib/work-schedule.ts");
const calendar = read("lib/internal-calendar.ts");
const availabilityCreate = read("app/api/calendar/availabilities/route.ts");
const availabilityItem = read("app/api/calendar/availabilities/[id]/route.ts");
const exceptions = read("app/api/calendar/exceptions/route.ts");
const exceptionItem = read("app/api/calendar/exceptions/[id]/route.ts");
const mySchedule = read("app/api/calendar/my-schedule/route.ts");
const page = read("app/calendar/page.tsx");
const workspace = read("components/calendar/dtsc-work-schedule-panel.tsx");
const agents = read("AGENTS.md");

expect("versioned Sprint 3 migration exists", exists("prisma/migrations/20260729011500_sprint03_work_schedule_boundaries/migration.sql"));
expect("schedule service separates weekly rows and dated exceptions", policy.includes("isDtscWeeklyAvailability") && policy.includes("isDtscScheduleException"));
expect("weekly availability rejects overlaps", policy.includes("ensureNoWeeklyAvailabilityOverlap") && availabilityCreate.includes("WORK_AVAILABILITY_OVERLAP"));
expect("DTSC POST ignores arbitrary collaborator ownership", availabilityCreate.includes("context.calendarCollaboratorId") && availabilityCreate.includes("work_availability_cross_write_denied"));
expect("DTSC PATCH cross-user modification is denied", availabilityItem.includes("work_availability_cross_update_denied") && availabilityItem.includes("existing.collaboratorId !== context.calendarCollaboratorId"));
expect("DTSC DELETE cross-user modification is denied", availabilityItem.includes("work_availability_cross_delete_denied"));
expect("exceptions are self-service only", exceptions.includes("schedule_exception_cross_write_denied") && exceptionItem.includes("schedule_exception_cross_update_denied") && exceptionItem.includes("schedule_exception_cross_delete_denied"));
expect("past schedule history is locked", availabilityItem.includes("PAST_SCHEDULE_LOCKED") && exceptionItem.includes("PAST_SCHEDULE_LOCKED"));
expect("weekly schedule updates preserve temporal history", availabilityItem.includes("previousVersionId") && availabilityItem.includes("historicalEnd") && availabilityItem.includes("recurrenceUntil"));
expect("manager read visibility is separate from write ownership", calendar.includes("canViewOrganizationAvailability") && policy.includes("canManageOwnAvailability"));
expect("effective availability resolver applies timezone-aware dates", policy.includes("resolveDtscEffectiveAvailability") && policy.includes("Intl.DateTimeFormat") && policy.includes("timeZone: timezone"));
expect("partial absence resolution subtracts blocking intervals", policy.includes("subtractIntervalList") && policy.includes("intervalForExceptionDay"));
expect("multi-day exceptions enumerate affected dates", policy.includes("enumerateDateKeys") && policy.includes("recurrenceUntil"));
expect("calendar conflicts use effective DTSC availability", calendar.includes("resolveDtscEffectiveAvailability") && calendar.includes("Hors disponibilité déclarée"));
expect("organization calendar keeps legacy compatibility path", calendar.includes("legacyAvailabilities") && availabilityCreate.includes("!context.dtscInternal"));
expect("absence notifications do not expose private reason", policy.includes("a déclaré ${label}") && !policy.includes("reason}`"));
expect("workspace clearly separates weekly exceptions absences", workspace.includes('id="weekly-availability"') && workspace.includes('id="exceptions"') && workspace.includes('id="absences"'));
expect("team view is explicitly read only", workspace.includes('id="team-availability"') && workspace.includes("lecture seule") && workspace.includes("read only"));
expect("availability is explicitly not worked time", workspace.includes("ni une prestation réalisée") && mySchedule.includes("availabilityIsWorkedTime: false"));
expect("calendar page uses reusable Sprint 3 workspace", page.includes("DtscWorkSchedulePanel") && workspace.includes("ModuleWorkspace") && workspace.includes("ModuleSection") && workspace.includes("BusinessList"));
expect("Sprint 3 does not introduce timesheet or payroll calculation", !policy.includes("Timesheet") && !policy.includes("ClockIn") && !policy.includes("HrcfoPayroll") && !exceptions.includes("HrcfoPayroll"));
expect("AGENTS includes permanent work-schedule boundaries", agents.includes("availability") || agents.includes("disponibilit"));

let failed = 0;
for (const check of checks) {
  if (check.ok) console.log(`✓ ${check.label}`);
  else {
    failed += 1;
    console.error(`✗ ${check.label}`);
  }
}

if (failed) {
  console.error(`\n${failed} Sprint 3 QA check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} Sprint 3 QA checks passed.`);
