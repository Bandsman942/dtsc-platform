import assert from "node:assert/strict";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";
const { workflowDailyWeeklyScheduleSchema, getNextWorkflowOccurrence } =
  workflowTestLoader({})("@/lib/enterprise/workflows/advanced-schedule");

const scope = { organizationId: "tenant-a", scheduleId: "schedule-a", versionId: "v1" };
const daily = (timeZone, hour, minute) => ({ frequency: "DAILY", timeZone, hour, minute });
const weekly = (timeZone, hour, minute, dayOfWeek) => ({ frequency: "WEEKLY", timeZone, hour, minute, dayOfWeek });
const next = (schedule, after, sc = scope) => getNextWorkflowOccurrence(schedule, new Date(after), sc);
const iso = (occurrence) => occurrence?.scheduledAt.toISOString();

assert.equal(iso(next(daily("UTC", 9, 15), "2026-10-16T09:14:59Z")), "2026-10-16T09:15:00.000Z");
assert.equal(iso(next(daily("UTC", 9, 15), "2026-10-16T09:15:00Z")), "2026-10-17T09:15:00.000Z", "strictly exclusive after instant");
assert.equal(iso(next(daily("Africa/Kinshasa", 9, 0), "2026-10-16T07:59:00Z")), "2026-10-16T08:00:00.000Z");
assert.equal(iso(next(weekly("UTC", 8, 30, 1), "2026-10-16T00:00:00Z")), "2026-10-19T08:30:00.000Z");
assert.equal(iso(next(daily("Asia/Kathmandu", 9, 0), "2026-10-16T00:00:00Z")), "2026-10-16T03:15:00.000Z", "45-minute IANA offset must be respected");
assert.equal(iso(next(weekly("America/New_York", 2, 30, 0), "2026-03-08T00:00:00Z")), "2026-03-15T06:30:00.000Z", "Missing weekly DST hour must skip only the missing week");

assert.equal(iso(next(weekly("UTC", 8, 30, 1), "2026-10-19T08:30:00Z")), "2026-10-26T08:30:00.000Z");

// New York 2026 spring-forward on March 8 skips 02:00–02:59 LOCAL.
const ny = daily("America/New_York", 2, 30);
const afterNy = "2026-03-08T00:00:00Z";
const nySpring = next(ny, afterNy);
assert.equal(nySpring.localDate, "2026-03-09");
assert.equal(iso(nySpring), "2026-03-09T06:30:00.000Z", "spring gap must not silently shift time");
// Fall-back on Nov 1: 01:30 happens twice (05:30Z then 06:30Z). Pick first.
const nyFall = next(daily("America/New_York", 1, 30), "2026-11-01T05:00:00Z");
assert.equal(iso(nyFall), "2026-11-01T05:30:00.000Z");
const nyRepeated = next(daily("America/New_York", 1, 30), "2026-11-01T05:45:00Z");
assert.equal(iso(nyRepeated), "2026-11-02T06:30:00.000Z", "fall duplicate must not be treated as a second trigger");
assert.equal(nyFall.localDate, "2026-11-01");
assert.equal(nyRepeated.localDate, "2026-11-02");

// Paris 2026 spring gap 02:30 March 29, repeated 02:30 Oct 25.
assert.equal(iso(next(daily("Europe/Paris", 2, 30), "2026-03-29T00:00:00Z")), "2026-03-30T00:30:00.000Z");
assert.equal(iso(next(daily("Europe/Paris", 2, 30), "2026-10-25T00:00:00Z")), "2026-10-25T00:30:00.000Z");
assert.equal(iso(next(daily("Europe/Paris", 2, 30), "2026-10-25T00:45:00Z")), "2026-10-26T01:30:00.000Z");

// UTC day rollover, year rollover, and schedule identity.
const dec = next(daily("UTC", 9, 0), "2026-12-31T10:00:00Z");
assert.equal(dec.localDate, "2027-01-01");
assert.equal(iso(dec), "2027-01-01T09:00:00.000Z");
assert.match(dec.occurrenceKey, /^[a-f0-9]{64}$/);
const same = next(daily("UTC", 9, 0), "2026-12-31T10:00:00Z");
assert.equal(dec.occurrenceKey, same.occurrenceKey);
const differentTenant = next(daily("UTC", 9, 0), "2026-12-31T10:00:00Z", { ...scope, organizationId: "tenant-b" });
const differentVersion = next(daily("UTC", 9, 0), "2026-12-31T10:00:00Z", { ...scope, versionId: "v2" });
assert.notEqual(dec.occurrenceKey, differentTenant.occurrenceKey);
assert.notEqual(dec.occurrenceKey, differentVersion.occurrenceKey);
assert.equal(workflowDailyWeeklyScheduleSchema.safeParse(daily("Mars/Olympus_Mons", 9, 0)).success, false);
for (const invalid of [
  { frequency: "MONTHLY", timeZone: "UTC", hour: 9, minute: 0 },
  { ...daily("UTC", 9, 0), cron: "* * * * *" },
  daily("UTC", 24, 0), daily("UTC", 1, 60),
  weekly("UTC", 12, 0, -1), { frequency: "WEEKLY", timeZone: "UTC", hour: 9, minute: 0 },
  { ...daily("UTC", 9, 0), dayOfWeek: 1 },
]) assert.equal(workflowDailyWeeklyScheduleSchema.safeParse(invalid).success, false, JSON.stringify(invalid));
assert.throws(() => getNextWorkflowOccurrence(daily("UTC", 9, 0), new Date("invalid"), scope));
assert.throws(() => next(daily("UTC", 9, 0), "2026-01-01T00:00:00Z", { ...scope, versionId: "" }));

console.log("PASS WF-06A: strict DAILY/WEEKLY, IANA zones, DST spring skip/fall first, UTC/Paris/New York/Kinshasa, scoped idempotency keys and bounded scheduling.");
