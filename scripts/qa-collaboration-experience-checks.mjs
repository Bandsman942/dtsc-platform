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
const voiceSettingsMigration = read("prisma/migrations/20260730103000_add_collaboration_voice_settings/migration.sql");
const media = read("lib/collaboration-media.ts");
const voiceSettingsService = read("lib/collaboration-voice-settings.ts");
const voiceSettingsRoute = read("app/api/collaborators/voice-settings/route.ts");
const adminVoiceSettingsRoute = read("app/api/admin/collaboration-voice-settings/route.ts");
const experienceRoute = read("app/api/collaborators/groups/experience/route.ts");
const photoRoute = read("app/api/collaborators/groups/[id]/profile-photo/route.ts");
const storyRoute = read("app/api/collaborators/groups/[id]/stories/route.ts");
const voiceRoute = read("app/api/collaborators/groups/[id]/voice/route.ts");
const preferenceRoute = read("app/api/collaborators/groups/[id]/preferences/route.ts");
const messagesRoute = read("app/api/collaborators/groups/[id]/messages/route.ts");
const workspace = read("components/collaborators/collaborators-conversation-workspace.tsx");
const immersiveShell = read("components/collaborators/collaborators-immersive-conversation-shell.tsx");
const immersiveViewport = read("components/chat/use-immersive-conversation-viewport.ts");
const participantColors = read("lib/participant-colors.ts");
const composer = read("components/chat/VoiceConversationComposer.tsx");
const page = read("app/collaborators/page.tsx");
const vercel = read("vercel.json");

for (const model of ["CollaborationGroupExperience", "CollaborationGroupStory", "CollaborationVoiceMessage", "CollaborationGroupPreference"]) {
  assert(schema.includes(`model ${model}`), `Missing dedicated model ${model}`);
  assert(migration.includes(`CREATE TABLE \"${model}\"`), `Missing migration table ${model}`);
}
assert(schema.includes("model CollaborationVoiceSetting"), "Voice settings must be persisted server-side");
assert(voiceSettingsMigration.includes('CREATE TABLE "CollaborationVoiceSetting"'), "Missing additive voice settings migration");
assert(!/DROP TABLE|DROP COLUMN/i.test(migration), "Collaboration migration must remain additive");
assert(!/DROP TABLE|DROP COLUMN/i.test(voiceSettingsMigration), "Voice settings migration must remain additive");
assert(migration.includes("CollaborationVoiceMessage_messageId_key"), "Voice messages need one metadata row per message");
assert(migration.includes("CollaborationGroupPreference_groupId_userId_key"), "Group preferences must be unique per user/group");

assert(media.includes("SUPABASE_STORAGE_SERVICE_ROLE_KEY"), "Collaboration media must use server-side storage credentials");
assert(media.includes("collaboration/${groupId}/"), "Collaboration media needs a group-scoped private path");
assert(media.includes("createSignedUrl"), "Collaboration media must use temporary signed URLs");
assert(!media.includes("getPublicUrl"), "Collaboration media must never expose public URLs");
assert(media.includes('split(";", 1)'), "Parameterized MediaRecorder MIME types must be normalized before backend validation");
assert(media.includes("maxBytes = DEFAULT_AUDIO_MAX_BYTES"), "Audio size validation must accept a backend-configured limit");

for (const [name, source] of [["photo", photoRoute], ["story", storyRoute], ["voice", voiceRoute], ["preference", preferenceRoute]]) {
  assert(source.includes("assertGroupMemberForSession"), `${name} route must verify active group membership`);
  assert(source.includes("isSameOriginRequest"), `${name} mutation route must enforce same-origin`);
  assert(source.includes("await rateLimit"), `${name} mutation route must be rate limited`);
}
assert(photoRoute.includes("canManageGroup"), "Only group managers may change the group photo");
assert(storyRoute.includes("24 * 60 * 60 * 1000"), "Group statuses must expire after 24 hours");
assert(voiceRoute.includes('messageType: "VOICE"'), "Voice uploads must create a real group message");
assert(voiceRoute.includes("durationMs"), "Voice metadata must persist duration");
assert(voiceRoute.includes("getCollaborationVoiceSettings"), "Voice uploads must load backend-authoritative settings");
assert(voiceRoute.includes("VOICE_DISABLED"), "Backend must be able to disable voice messages");
assert(voiceRoute.includes("voiceSettings.maxFileSizeBytes"), "Backend must enforce configured voice file size");
assert(voiceRoute.includes("voiceSettings.maxDurationSeconds"), "Backend must enforce configured voice duration");
assert(voiceRoute.includes("voiceSettings.rateLimitPerHour"), "Backend must enforce configured voice rate limit");
assert(voiceSettingsService.includes("collaborationVoiceSetting.upsert"), "Voice settings service must persist defaults");
assert(voiceSettingsRoute.includes("getCollaborationVoiceSettings"), "Authenticated clients must receive voice capabilities from backend");
assert(adminVoiceSettingsRoute.includes("UserRole.ADMIN"), "Voice settings mutation must remain ADMIN-only");
assert(adminVoiceSettingsRoute.includes("isSameOriginRequest") && adminVoiceSettingsRoute.includes("await rateLimit"), "Voice settings admin mutation must be protected");
assert(messagesRoute.includes("CollaborationGroupPreference") || messagesRoute.includes("collaborationGroupPreference"), "Text notifications must respect group preferences");
assert(messagesRoute.includes("cross_group_reply"), "Reply targets must be validated inside the same group");

assert(composer.includes("MediaRecorder"), "Voice composer must use browser MediaRecorder");
assert(composer.includes("getUserMedia"), "Voice composer must request microphone access explicitly");
assert(composer.includes("<textarea"), "Conversation composer must support multiline messages");
assert(composer.includes("/api/collaborators/voice-settings"), "Voice composer must load backend capabilities");
assert(composer.includes("maxDurationSeconds") && composer.includes("maxFileSizeBytes"), "Voice composer must surface backend voice limits");
assert(workspace.includes('"UNREAD"') && workspace.includes('"FAVORITES"') && workspace.includes('"GROUPS"'), "Workspace must expose WhatsApp-style filters");
assert(workspace.includes("ActionMenu"), "Workspace contextual actions must use reusable ActionMenu");
assert(workspace.includes("ConversationListItem") && workspace.includes("ConversationHeader"), "Workspace must reuse professional conversation components");
assert(workspace.includes("CollaboratorsWorkspace"), "Existing LiveKit/call experience must remain reachable");
assert(workspace.includes("profile-photo") && workspace.includes("stories") && workspace.includes("voice"), "Workspace must expose photo, status and voice flows");
assert(immersiveShell.includes("useImmersiveConversationViewport"), "Collaborators must use the reusable immersive viewport controller");
assert(immersiveShell.includes("getParticipantColor"), "Conversation bubbles must retain stable participant colors");
assert(immersiveViewport.includes("visualViewport"), "Immersive mobile conversations must follow VisualViewport changes");
assert(immersiveViewport.includes("overflow = \"hidden\""), "Global page scrolling must be locked during immersive mobile conversations");
assert(immersiveViewport.includes("privateMobileNav"), "Immersive conversation must preserve top/bottom mobile chrome behavior");
assert(immersiveViewport.includes("NAV_HIDE_DISTANCE") && immersiveViewport.includes("NAV_SHOW_DISTANCE"), "Mobile chrome changes must use scroll hysteresis");
assert(immersiveViewport.includes("requestAnimationFrame(processNestedScroll)"), "Nested conversation scroll handling must be frame-throttled");
assert(immersiveViewport.includes('if (root.dataset.privateMobileNav === nextState) return;'), "Repeated scroll events must not rewrite an unchanged chrome state");
assert(immersiveViewport.includes('privateMainElement.style.transition = "none"'), "Conversation viewport geometry must not lag behind browser viewport motion");
assert(!immersiveViewport.includes("getComputedStyle"), "Conversation scroll must not force style recalculation on every scroll event");
assert(!immersiveViewport.includes("topRect") && !immersiveViewport.includes("bottomRect"), "Mobile nav animation must not resize the conversation viewport");
assert(participantColors.includes("bubbleClassName"), "Participant color helper must expose reusable bubble tones");
assert(page.includes("CollaboratorsImmersiveConversationShell"), "Collaborators page must use the immersive conversation shell");
assert(experienceRoute.includes("collaborationGroupScopeWhere"), "Experience state must preserve current tenant/context scope");

assert(vercel.includes('"main": true'), "Vercel production-only main deployment must remain enabled");
assert(vercel.includes('"*": false'), "Feature branch Vercel deployments must stay disabled");
assert(vercel.includes("ignoreCommand"), "Vercel preview ignoreCommand must remain configured");

console.log("Collaboration immersive conversation, smooth scroll and voice settings QA passed.");
