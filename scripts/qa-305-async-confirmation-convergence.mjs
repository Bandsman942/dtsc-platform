import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
function walk(directory) {
  const absolute = path.join(root, directory);
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(relative) : entry.name.endsWith(".tsx") ? [relative] : [];
  });
}

const collaboration = read("components/collaborators/collaborators-conversation-workspace.tsx");
const calendar = read("components/calendar/internal-calendar/workspace.tsx");
const provider = read("components/ui/sensitive-action-confirmation-provider.tsx");
const frCollaboration = read("locales/collaboration-experience.fr.json");
const enCollaboration = read("locales/collaboration-experience.en.json");
const frCalendar = read("locales/calendar-workspace.fr.json");
const enCalendar = read("locales/calendar-workspace.en.json");
const runner = read("scripts/run-regression-qa-ci.mjs");

for (const file of walk("components")) expect(!/\bwindow\.confirm\s*\(/.test(read(file)), `window.confirm remains in ${file}`);
expect(collaboration.includes('import { confirmSensitiveAction } from "@/lib/client-confirmation";'), "Collaboration must import confirmSensitiveAction");
expect((collaboration.match(/confirmSensitiveAction\s*\(\{/g) || []).length >= 5, "All five audited Collaboration confirmations must use confirmSensitiveAction");
for (const key of ["conversationUiDeleteFilter", "conversationUiDeleteThisMessage", "conversationUiMemberRemoveConfirm", "conversationUiMemberTransferConfirm", "conversationUiBlockConfirm", "conversationUiDeleteThisGroup", "conversationUiLeaveThisGroup"]) {
  expect(frCollaboration.includes(`"${key}"`), `French Collaboration confirmation key missing: ${key}`);
  expect(enCollaboration.includes(`"${key}"`), `English Collaboration confirmation key missing: ${key}`);
}
expect(calendar.includes('import { confirmSensitiveAction } from "@/lib/client-confirmation";'), "Calendar must import confirmSensitiveAction");
expect(calendar.includes("if (hasBlocking)"), "Blocking calendar conflicts must stop before confirmation");
expect(calendar.includes("conflictDetails"), "Calendar confirmation must show conflict details");
expect(calendar.includes("confirmLabel: text.accept"), "Calendar confirmation must use localized accept label");
expect(calendar.includes("cancelLabel: text.cancel"), "Calendar confirmation must use localized cancel label");
for (const key of ["conflictsExist", "confirmAcceptance", "accept", "cancel", "blockingConflictAcceptance"]) {
  expect(frCalendar.includes(`"${key}"`), `French Calendar confirmation key missing: ${key}`);
  expect(enCalendar.includes(`"${key}"`), `English Calendar confirmation key missing: ${key}`);
}
for (const forbidden of ["window.confirm =", "origin.click()", "approvedReplay", "replaying = true"]) expect(!provider.includes(forbidden), `Confirmation provider must not reintroduce ${forbidden}`);
expect(runner.includes("qa-305-async-confirmation-convergence.mjs"), "Issue 305 QA must run in regression CI");

if (failures.length) {
  console.error("Issue 305 async confirmation convergence QA failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log("issue-305-async-confirmation-convergence: OK");
