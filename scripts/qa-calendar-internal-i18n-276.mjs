import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

const fr = JSON.parse(read("locales/calendar-workspace.fr.json"));
const en = JSON.parse(read("locales/calendar-workspace.en.json"));
try { assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort()); } catch { failures.push("calendar-workspace FR/EN dictionaries must have strict key parity"); }

const i18n = read("lib/i18n.ts");
for (const token of ["calendar-workspace.fr.json", "calendar-workspace.en.json", "calendarWorkspaceDictionaries", "CalendarWorkspaceKey", "translateCalendarWorkspace"]) expect(i18n.includes(token), `canonical i18n contract missing ${token}`);

const legacyWorkspace = read("components/calendar/internal-calendar-workspace-v2.tsx");
const legacyAdvanced = read("components/calendar/calendar-advanced-tools-panel.tsx");
expect(legacyWorkspace.includes("internal-calendar/workspace"), "internal calendar compatibility entrypoint must delegate to modular workspace");
expect(legacyAdvanced.includes("calendar-advanced-tools/panel"), "advanced calendar compatibility entrypoint must delegate to modular panel");

const files = [
  "components/calendar/internal-calendar/workspace.tsx",
  "components/calendar/internal-calendar/event-dialog.tsx",
  "components/calendar/internal-calendar/event-views.tsx",
  "components/calendar/internal-calendar/availability-view.tsx",
  "components/calendar/calendar-advanced-tools/panel.tsx",
  "components/calendar/calendar-advanced-tools-section.tsx",
];
const active = files.map(read).join("\n");
for (const token of ["const copy =", 'toLocaleString("fr-FR")', 'toLocaleTimeString("fr-FR")', 'new Intl.DateTimeFormat("fr-FR"']) expect(!active.includes(token), `active Calendar UI contains forbidden local locale pattern ${token}`);
for (const file of files) {
  const source = read(file);
  expect(!source.includes('locale === "en"') && !source.includes("locale === 'en'"), `active Calendar UI must not select FR/EN locally: ${file}`);
}

const text = read("components/calendar/internal-calendar/text.ts");
const format = read("components/calendar/internal-calendar/format.ts");
expect(text.includes("translateCalendarWorkspace"), "calendar text adapter must consume canonical translator");
expect(format.includes("userLocale") && format.includes("userTimeZone"), "calendar date/time formatting must use user locale and timezone");

for (const value of ["Tâche", "Réunion", "Mission", "Appel audio", "Appel vidéo", "Formation", "Blocage", "Deadline", "Autre", "Faible", "Normale", "Élevée", "Critique", "Participants", "Département", "Public interne", "Privé", "Non défini", "Site DTSC", "Télétravail", "Hybride", "Externe", "ROOM", "VEHICLE", "EQUIPMENT", "WORKSPACE", "OTHER"]) expect(text.includes(value), `persisted Calendar value missing: ${value}`);
for (const endpoint of ["/api/calendar", "/participants/respond", "/api/calendar/resources", "/api/calendar/resources/reservations", "/api/calendar/slot-suggestions", "/api/calendar/integrations"]) expect(active.includes(endpoint), `Calendar endpoint missing: ${endpoint}`);

const eventDialog = read("components/calendar/internal-calendar/event-dialog.tsx");
expect(eventDialog.includes('value={value}'), "translated event options must preserve explicit persisted values");
const advanced = read("components/calendar/calendar-advanced-tools/panel.tsx");
expect(advanced.includes("resourceTypeLabel"), "resource types must be projected through user-facing labels");
expect(!advanced.includes("{resource.resourceType}</"), "raw resource technical codes must not be rendered");

const page = read("app/calendar/page.tsx");
for (const token of ['translateCalendarWorkspace(user.locale, "unavailableTitle")', 'translateCalendarWorkspace(user.locale, "unavailableMessage")', "locale={user.locale}", "timezone={timezone}"]) expect(page.includes(token), `calendar page locale contract missing ${token}`);
const section = read("components/calendar/calendar-advanced-tools-section.tsx");
expect(section.includes("locale={locale}") && section.includes("timezone={timezone}"), "advanced tools section must forward locale/timezone");

if (failures.length) {
  console.error("Internal Calendar i18n #276 QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Internal Calendar i18n #276 QA passed.");
