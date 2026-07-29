import fs from "node:fs";

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const schema = read("prisma/collaboration-experience.prisma");
const migration = read("prisma/migrations/20260729221000_add_collaboration_conversation_experience/migration.sql");
const media = read("lib/collaboration-media.ts");
const experienceRoute = read("app/api/collaborators/groups/experience/route.ts");
const photoRoute = read("app/api/collaborators/groups/[id]/profile-photo/route.ts");
const storyRoute = read("app/api/collaborators/groups/[id]/stories/route.ts");
const voiceRoute = read("app/api/collaborators/groups/[id]/voice/route.ts");
const preferenceRoute = read("app/api/collaborators/groups/[id]/preferences/route.ts");
const messagesRoute = read("app/api/collaborators/groups/[id]/messages/route.ts");
const workspace = read("components/collaborators/collaborators-conversation-workspace.tsx");
const composer = read("components/chat/VoiceConversationComposer.tsx");
const page = read("app/collaborators/page.tsx");
const vercel = read("vercel.json");

for (const model of ["CollaborationGroupExperience", "CollaborationGroupStory", "CollaborationVoiceMessage", "CollaborationGroupPreference"]) {
  assert(schema.includes(`model ${model}`), `Missing dedicated model ${model}`);
  assert(migration.includes(`CREATE TABLE \"${model}\"`), `Missing migration table ${model}`);
}
assert(!/DROP TABLE|DROP COLUMN/i.test(migration), "Collaboration migration must remain additive");
assert(migration.includes("CollaborationVoiceMessage_messageId_key"), "Voice messages need one metadata row per message");
assert(migration.includes("CollaborationGroupPreference_groupId_userId_key"), "Group preferences must be unique per user/group");

assert(media.includes("SUPABASE_STORAGE_SERVICE_ROLE_KEY"), "Collaboration media must use server-side storage credentials");
assert(media.includes("collaboration/${groupId}/"), "Collaboration media needs a group-scoped private path");
assert(media.includes("createSignedUrl"), "Collaboration media must use temporary signed URLs");
assert(!media.includes("getPublicUrl"), "Collaboration media must never expose public URLs");

for (const [name, source] of [["photo", photoRoute], ["story", storyRoute], ["voice", voiceRoute], ["preference", preferenceRoute]]) {
  assert(source.includes("assertGroupMemberForSession"), `${name} route must verify active group membership`);
  assert(source.includes("isSameOriginRequest"), `${name} mutation route must enforce same-origin`);
  assert(source.includes("await rateLimit"), `${name} mutation route must be rate limited`);
}
assert(photoRoute.includes("canManageGroup"), "Only group managers may change the group photo");
assert(storyRoute.includes("24 * 60 * 60 * 1000"), "Group statuses must expire after 24 hours");
assert(voiceRoute.includes('messageType: "VOICE"'), "Voice uploads must create a real group message");
assert(voiceRoute.includes("durationMs"), "Voice metadata must persist duration");
assert(messagesRoute.includes("CollaborationGroupPreference") || messagesRoute.includes("collaborationGroupPreference"), "Text notifications must respect group preferences");
assert(messagesRoute.includes("cross_group_reply"), "Reply targets must be validated inside the same group");

assert(composer.includes("MediaRecorder"), "Voice composer must use browser MediaRecorder");
assert(composer.includes("getUserMedia"), "Voice composer must request microphone access explicitly");
assert(workspace.includes('"UNREAD"') && workspace.includes('"FAVORITES"') && workspace.includes('"GROUPS"'), "Workspace must expose WhatsApp-style filters");
assert(workspace.includes("ActionMenu"), "Workspace contextual actions must use reusable ActionMenu");
assert(workspace.includes("ConversationListItem") && workspace.includes("ConversationHeader"), "Workspace must reuse professional conversation components");
assert(workspace.includes("CollaboratorsWorkspace"), "Existing LiveKit/call experience must remain reachable");
assert(workspace.includes("profile-photo") && workspace.includes("stories") && workspace.includes("voice"), "Workspace must expose photo, status and voice flows");
assert(page.includes("CollaboratorsConversationWorkspace"), "Collaborators page must use the new conversation workspace");
assert(experienceRoute.includes("collaborationGroupScopeWhere"), "Experience state must preserve current tenant/context scope");

assert(vercel.includes('"main": true'), "Vercel production-only main deployment must remain enabled");
assert(vercel.includes('"*": false'), "Feature branch Vercel deployments must stay disabled");
assert(vercel.includes("ignoreCommand"), "Vercel preview ignoreCommand must remain configured");

console.log("Collaboration conversation experience QA passed.");
