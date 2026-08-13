import fs from "node:fs";

const componentPath = "components/collaborators/collaborators-conversation-workspace.tsx";
const component = fs.readFileSync(componentPath, "utf8");
const helper = fs.readFileSync("lib/collaboration-experience-i18n.ts", "utf8");
const fr = JSON.parse(fs.readFileSync("locales/collaboration-experience.fr.json", "utf8"));
const en = JSON.parse(fs.readFileSync("locales/collaboration-experience.en.json", "utf8"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(!/\b(?:userPreferences|preferences)\.locale\s*===\s*["']en["']/.test(component), "#277: comparaison locale FR/EN résiduelle dans le workspace");
expect(!/\benglish\s*\?/.test(component), "#277: ternaire legacy english résiduel");
expect(!component.includes('const english = preferences.locale === "en"'), "#277: drapeau english local résiduel");
for (const forbidden of ["Téléversement impossible.", "Collaborateur bloqué.", "Collaborateur débloqué.", 'label="Actions du groupe"', ">Audio indisponible</p>", "Confidentialité de la conversation", "Impossible de modifier ce membre.", "Impossible de modifier le blocage."]) {
  expect(!component.includes(forbidden), `#277: copie UI locale résiduelle: ${forbidden}`);
}
expect(component.includes("collaborationExperienceT"), "#277: moteur canonique collaborationExperienceT absent");
expect(helper.includes("translateCollaborationExperience") && helper.includes("vars?: Record<string, string | number>"), "#277: helper canonique/interpolation absent");
const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();
expect(JSON.stringify(frKeys) === JSON.stringify(enKeys), "#277: parité de clés collaboration-experience FR/EN rompue");
for (const key of frKeys) expect(typeof fr[key] === "string" && fr[key].length > 0 && typeof en[key] === "string" && en[key].length > 0, `#277: traduction vide ou non textuelle: ${key}`);
for (const marker of [
  "JSON.stringify({ targetUserId })",
  "startingDirectUserId",
  "summary?.allRead",
  "onJumpToMessage",
  "focusMessageById",
  "containsMentionAllText",
  "selectedGroupIds",
  "/api/collaborators/messages/",
  "/api/collaborators/contact-requests",
  "/api/collaborators/calls/",
  "normalizeMessageExternalUrl",
]) expect(component.includes(marker), `#277: invariant Collaboration absent: ${marker}`);

if (failures.length) {
  console.error(`Collaborator dialog i18n #277 QA failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Collaborator dialog i18n #277 QA passed.");
