import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const json = (path) => JSON.parse(read(path));
const fail = (message) => {
  console.error(`FAIL shared work i18n: ${message}`);
  process.exitCode = 1;
};

function assertDictionaryPair(frPath, enPath, label) {
  const fr = json(frPath);
  const en = json(enPath);
  const frKeys = Object.keys(fr).sort();
  const enKeys = Object.keys(en).sort();
  if (JSON.stringify(frKeys) !== JSON.stringify(enKeys)) fail(`${label} FR/EN dictionaries must expose identical keys.`);
  for (const key of frKeys) {
    if (!String(fr[key] || "").trim()) fail(`missing FR value for ${label}:${key}`);
    if (!String(en[key] || "").trim()) fail(`missing EN value for ${label}:${key}`);
  }
}

assertDictionaryPair("locales/shared-work.fr.json", "locales/shared-work.en.json", "shared-work");
assertDictionaryPair("locales/collaboration-experience.fr.json", "locales/collaboration-experience.en.json", "collaboration-experience");
assertDictionaryPair("locales/activities.fr.json", "locales/activities.en.json", "activities");

const i18n = read("lib/i18n.ts");
for (const required of [
  "shared-work.fr.json",
  "shared-work.en.json",
  "collaboration-experience.fr.json",
  "collaboration-experience.en.json",
  "activities.fr.json",
  "activities.en.json",
  "export function translateSharedWork",
  "export function translateCollaborationExperience",
  "export function translateActivities",
]) {
  if (!i18n.includes(required)) fail(`canonical i18n module is missing: ${required}`);
}

const comments = read("components/activities/entity-comments-thread.tsx");
for (const forbidden of ["const english =", "locale === \"en\"", "toLocaleString(", "\"en-GB\"", "\"fr-FR\""]) {
  if (comments.includes(forbidden)) fail(`entity comments still contains local i18n pattern: ${forbidden}`);
}
if (!comments.includes("translateSharedWork") || !comments.includes("formatUserDateTime")) fail("entity comments must use canonical copy and date helpers");

const activitiesDashboard = read("components/activities/activities-dashboard-v3.tsx");
for (const forbidden of ["const english =", 'locale === "en"', '"en-GB"', '"fr-FR"']) {
  if (activitiesDashboard.includes(forbidden)) fail(`activities dashboard still contains local i18n pattern: ${forbidden}`);
}
if (!activitiesDashboard.includes("translateActivities") || !activitiesDashboard.includes("formatEnumLabelForLocale") || !activitiesDashboard.includes("userLocale")) fail("activities dashboard must use canonical activity copy, enum and locale helpers");

const prestations = read("components/activities/work-prestations-panel-v2.tsx");
for (const forbidden of ["const english =", 'locale === "en"', "english ?", '"en-GB"', '"fr-FR"']) {
  if (prestations.includes(forbidden)) fail(`work prestations still contains local i18n pattern: ${forbidden}`);
}
if (!prestations.includes("translateActivities") || !prestations.includes("formatEnumLabelForLocale") || !prestations.includes("userLocale")) fail("work prestations must use canonical activity copy, enum and locale helpers");
for (const persisted of ["Site DTSC", "Télétravail", "Hybride", "Externe", "Mission", "Non défini"]) {
  if (!prestations.includes(`\"${persisted}\"`)) fail(`work prestations must preserve persisted location mode value: ${persisted}`);
}

const immersive = read("components/collaborators/collaborators-immersive-conversation-shell.tsx");
if (immersive.includes("props.userPreferences.locale === \"en\"")) fail("collaborator immersive shell still contains a local FR/EN ternary");
if (!immersive.includes("translateSharedWork(props.userPreferences.locale, \"collaboration.addContact\")")) fail("collaborator floating action must use shared-work i18n");

const addContactPage = read("app/collaborators/contacts/new/page.tsx");
for (const forbidden of ["const english =", "user.locale === \"en\""]) {
  if (addContactPage.includes(forbidden)) fail(`add contact page still contains local i18n pattern: ${forbidden}`);
}
if (!addContactPage.includes("translateSharedWork")) fail("add contact page must use shared-work i18n");

const contactDiscovery = read("components/collaborators/contact-discovery-workspace.tsx");
for (const forbidden of ["const english =", "locale === \"en\""]) {
  if (contactDiscovery.includes(forbidden)) fail(`contact discovery still contains local i18n pattern: ${forbidden}`);
}
if (!contactDiscovery.includes("translateSharedWork")) fail("contact discovery must use shared-work i18n");

const meetingContent = read("components/collaborators/collaboration-meeting-message-content.tsx");
for (const forbidden of ["const english =", "preferences.locale === \"en\""]) {
  if (meetingContent.includes(forbidden)) fail(`meeting message content still contains local i18n pattern: ${forbidden}`);
}
if (!meetingContent.includes("translateSharedWork")) fail("meeting message content must use shared-work i18n");

const presenceJournal = read("components/collaborators/group-presence-journal-dialog.tsx");
for (const forbidden of ["const english =", "locale === \"en\"", "english ?"]) {
  if (presenceJournal.includes(forbidden)) fail(`presence journal still contains local i18n pattern: ${forbidden}`);
}
if (!presenceJournal.includes("translateSharedWork")) fail("presence journal must use shared-work i18n");

const collaborationAdapter = read("lib/collaboration-experience-i18n.ts");
if (collaborationAdapter.includes("const messages =")) fail("collaboration experience must not keep a parallel local dictionary");
if (!collaborationAdapter.includes("translateCollaborationExperience")) fail("collaboration experience adapter must delegate to lib/i18n.ts");

const conversationWorkspace = read("components/collaborators/collaborators-conversation-workspace.tsx");
if (!conversationWorkspace.includes("collaborationExperienceT")) fail("main collaborator workspace must use the canonical collaboration adapter");

const calendar = read("components/calendar/unified-work-calendar-panel.tsx");
for (const forbidden of ["const en =", "locale === \"en\"", "\"en-GB\"", "\"fr-FR\"", "const SOURCE_LABELS"]) {
  if (calendar.includes(forbidden)) fail(`unified calendar still contains local i18n pattern: ${forbidden}`);
}
if (!calendar.includes("translateSharedWork") || !calendar.includes("userLocale")) fail("unified calendar must use canonical copy and locale helpers");

await import("./qa-collaborator-dialog-i18n-277.mjs");

if (!process.exitCode) console.log("Shared work i18n convergence QA passed.");
