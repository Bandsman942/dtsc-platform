import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const fail = (message) => {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
};

const fr = JSON.parse(read("locales/calendar-schedule.fr.json"));
const en = JSON.parse(read("locales/calendar-schedule.en.json"));
try {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort(), "calendar-schedule FR/EN dictionaries must have strict key parity");
} catch (error) {
  fail(error.message);
}

const i18n = read("lib/i18n.ts");
for (const expected of ["calendar-schedule.fr.json", "calendar-schedule.en.json", "calendarScheduleDictionaries", "export type CalendarScheduleKey", "export function translateCalendarSchedule"]) {
  if (!i18n.includes(expected)) fail(`lib/i18n.ts missing canonical schedule contract: ${expected}`);
}

const entrypoint = read("components/calendar/dtsc-work-schedule-panel.tsx");
if (!entrypoint.includes("dtsc-work-schedule/panel")) fail("legacy schedule entrypoint must delegate to the modular panel");
for (const forbidden of ["const copy =", "weekdaysFr", "weekdaysEn"]) {
  if (entrypoint.includes(forbidden)) fail(`legacy local i18n pattern returned: ${forbidden}`);
}

const moduleFiles = [
  "components/calendar/dtsc-work-schedule/model.ts",
  "components/calendar/dtsc-work-schedule/lists.tsx",
  "components/calendar/dtsc-work-schedule/dialogs.tsx",
  "components/calendar/dtsc-work-schedule/panel.tsx",
];
const moduleSource = moduleFiles.map(read).join("\n");
for (const forbidden of ["const copy =", "weekdaysFr", "weekdaysEn", 'locale === "en"', "locale === 'en'"]) {
  if (moduleSource.includes(forbidden)) fail(`local schedule i18n pattern is forbidden: ${forbidden}`);
}
if (!moduleSource.includes("translateCalendarSchedule")) fail("schedule module must consume the canonical translator");
if (!moduleSource.includes("Intl.DateTimeFormat(userLocale(locale)")) fail("weekdays must use the active user locale");

const dialogs = read("components/calendar/dtsc-work-schedule/dialogs.tsx");
for (const persisted of ["Non défini", "Site DTSC", "Télétravail", "Hybride", "Externe", "Mission"]) {
  if (!dialogs.includes(`"${persisted}"`)) fail(`persisted schedule value must stay unchanged: ${persisted}`);
}
for (const code of ["ABSENCE", "ADMINISTRATIVE_ABSENCE", "OTHER_ABSENCE", "LEAVE", "SICKNESS", "MISSION", "TRAINING", "REMOTE_WORK", "EXTRA_AVAILABILITY", "UNAVAILABLE", "OTHER"]) {
  if (!moduleSource.includes(`"${code}"`)) fail(`schedule exception code must stay unchanged: ${code}`);
}
for (const endpoint of ["/api/calendar/availabilities", "/api/calendar/exceptions"]) {
  if (!dialogs.includes(endpoint)) fail(`schedule endpoint must remain wired: ${endpoint}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Calendar work schedule i18n #275 QA passed.");
