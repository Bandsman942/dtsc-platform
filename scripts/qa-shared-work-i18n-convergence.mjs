import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const json = (path) => JSON.parse(read(path));
const fail = (message) => {
  console.error(`FAIL shared work i18n: ${message}`);
  process.exitCode = 1;
};

const fr = json("locales/shared-work.fr.json");
const en = json("locales/shared-work.en.json");
const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();
if (JSON.stringify(frKeys) !== JSON.stringify(enKeys)) fail("FR/EN shared-work dictionaries must expose identical keys.");
for (const key of frKeys) {
  if (!String(fr[key] || "").trim()) fail(`missing FR value for ${key}`);
  if (!String(en[key] || "").trim()) fail(`missing EN value for ${key}`);
}

const i18n = read("lib/i18n.ts");
if (!i18n.includes("shared-work.fr.json") || !i18n.includes("shared-work.en.json")) fail("shared-work dictionaries are not registered in lib/i18n.ts");
if (!i18n.includes("export function translateSharedWork")) fail("translateSharedWork is missing from the canonical i18n module");

const comments = read("components/activities/entity-comments-thread.tsx");
for (const forbidden of ["const english =", "locale === \"en\"", "toLocaleString(", "\"en-GB\"", "\"fr-FR\""]) {
  if (comments.includes(forbidden)) fail(`entity comments still contains local i18n pattern: ${forbidden}`);
}
if (!comments.includes("translateSharedWork") || !comments.includes("formatUserDateTime")) fail("entity comments must use canonical copy and date helpers");

const immersive = read("components/collaborators/collaborators-immersive-conversation-shell.tsx");
if (immersive.includes("props.userPreferences.locale === \"en\"")) fail("collaborator immersive shell still contains a local FR/EN ternary");
if (!immersive.includes("translateSharedWork(props.userPreferences.locale, \"collaboration.addContact\")")) fail("collaborator floating action must use shared-work i18n");

const calendar = read("components/calendar/unified-work-calendar-panel.tsx");
for (const forbidden of ["const en =", "locale === \"en\"", "\"en-GB\"", "\"fr-FR\"", "const SOURCE_LABELS"]) {
  if (calendar.includes(forbidden)) fail(`unified calendar still contains local i18n pattern: ${forbidden}`);
}
if (!calendar.includes("translateSharedWork") || !calendar.includes("userLocale")) fail("unified calendar must use canonical copy and locale helpers");

if (!process.exitCode) console.log("Shared work i18n convergence QA passed.");
