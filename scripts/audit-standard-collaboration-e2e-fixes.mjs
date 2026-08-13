import fs from "node:fs";

const tempMarker = ".tmp-277-canonicalized";
const tempCodemod = "scripts/__temp-apply-collaborator-i18n-277.mjs";
if (fs.existsSync(tempCodemod) && !fs.existsSync(tempMarker)) {
  await import("./__temp-apply-collaborator-i18n-277.mjs");
  fs.writeFileSync(tempMarker, "applied\n");
}

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => { if (!condition) failures.push(message); };

const collaboration = read("components/collaborators/collaborators-conversation-workspace.tsx");
const directApi = read("app/api/collaborators/direct/route.ts");
const announcements = read("components/announcements/announcement-wall.tsx");
const richEditor = read("components/ui/rich-text-editor.tsx");
const richContent = read("lib/rich-content.ts");

expect(collaboration.includes("JSON.stringify({ targetUserId })"), "Conversation directe: contrat client targetUserId absent");
expect(directApi.includes("parsed.data.targetUserId"), "Conversation directe: contrat API targetUserId absent");
expect(collaboration.includes("startingDirectUserId"), "Conversation directe: protection contre double appui absente");
expect(collaboration.includes("summary?.readCount || 0") && collaboration.includes("<CheckCheck"), "Lecture: double confirmation fondée sur readCount absente");
expect(collaboration.includes("onJumpToMessage") && collaboration.includes("focusMessageById") && collaboration.includes("focusedMessageId"), "Réponse: navigation vers le message original absente");
expect(announcements.includes("data-dtsc-hashtag") && announcements.includes("announcementList.setQuery(normalized)"), "Annonces: filtrage par hashtag absent");
expect(richContent.includes("AUTO_LINK_PATTERN") && richContent.includes("dtsc-external-link"), "Annonces: détection des sites web absente");
expect(announcements.includes("navigator.share") && announcements.includes("Share2"), "Annonces: partage natif/fallback absent");
for (const capability of ["allowVideoEmbed", "insertTable", "insertLink", 'command("undo")', 'formatBlock", "blockquote"', "insertEmoji"]) {
  expect(richEditor.includes(capability), `Éditeur riche partagé: capacité absente ${capability}`);
}

if (failures.length) {
  console.error(`Standard collaboration E2E fixes audit failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Standard collaboration E2E fixes audit passed.");
