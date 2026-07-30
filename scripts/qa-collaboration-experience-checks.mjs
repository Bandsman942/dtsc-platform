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
const presenceMeetingMigration = read("prisma/migrations/20260730131500_add_collaboration_presence_meeting_workflow/migration.sql");
const media = read("lib/collaboration-media.ts");
const voiceSettingsService = read("lib/collaboration-voice-settings.ts");
const presenceService = read("lib/collaboration-presence-sessions.ts");
const meetingLinks = read("lib/collaboration-meeting-links.ts");
const voiceSettingsRoute = read("app/api/collaborators/voice-settings/route.ts");
const adminVoiceSettingsRoute = read("app/api/admin/collaboration-voice-settings/route.ts");
const presenceRoute = read("app/api/collaborators/presence/route.ts");
const presenceJournalRoute = read("app/api/collaborators/groups/[id]/presence-journal/route.ts");
const meetingJoinRoute = read("app/api/collaborators/meeting-links/[id]/join/route.ts");
const meetingMinutesRoute = read("app/api/collaborators/calls/[id]/minutes/route.ts");
const callEndRoute = read("app/api/collaborators/calls/[id]/end/route.ts");
const readInfoRoute = read("app/api/collaborators/messages/[id]/reads/route.ts");
const experienceRoute = read("app/api/collaborators/groups/experience/route.ts");
const photoRoute = read("app/api/collaborators/groups/[id]/profile-photo/route.ts");
const storyRoute = read("app/api/collaborators/groups/[id]/stories/route.ts");
const voiceRoute = read("app/api/collaborators/groups/[id]/voice/route.ts");
const preferenceRoute = read("app/api/collaborators/groups/[id]/preferences/route.ts");
const messagesRoute = read("app/api/collaborators/groups/[id]/messages/route.ts");
const workspace = read("components/collaborators/collaborators-conversation-workspace.tsx");
const presenceJournal = read("components/collaborators/group-presence-journal-dialog.tsx");
const meetingMessageContent = read("components/collaborators/collaboration-meeting-message-content.tsx");
const immersiveShell = read("components/collaborators/collaborators-immersive-conversation-shell.tsx");
const immersiveViewport = read("components/chat/use-immersive-conversation-viewport.ts");
const mobileChrome = read("components/layout/private-mobile-chrome-controller.tsx");
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
for (const model of ["CollaborationPresenceSession", "CollaborationMeetingLink", "CollaborationMeetingMinutesPublication"]) {
  assert(schema.includes(`model ${model}`), `Missing collaboration workflow model ${model}`);
  assert(presenceMeetingMigration.includes(`CREATE TABLE IF NOT EXISTS \"${model}\"`), `Missing additive migration table ${model}`);
}
assert(!/DROP TABLE|DROP COLUMN/i.test(migration), "Collaboration migration must remain additive");
assert(!/DROP TABLE|DROP COLUMN/i.test(voiceSettingsMigration), "Voice settings migration must remain additive");
assert(!/DROP TABLE|DROP COLUMN/i.test(presenceMeetingMigration), "Presence/meeting migration must remain additive");
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

// Presence history: heartbeat coalescing, manager-only visibility and membership-window isolation.
assert(presenceService.includes("lastHeartbeatAt") && presenceService.includes("HEARTBEAT_TIMEOUT"), "Presence sessions must coalesce heartbeats and close stale sessions");
assert(presenceRoute.includes("markCollaborationPresenceOnline") && presenceRoute.includes("markCollaborationPresenceOffline"), "Presence route must use persisted session service");
assert(presenceRoute.includes("isSameOriginRequest") && presenceRoute.includes("await rateLimit"), "Presence mutation must remain protected");
assert(presenceJournalRoute.includes("assertGroupMemberForSession") && presenceJournalRoute.includes("canManageGroup"), "Presence journal must be OWNER/ADMIN gated after membership check");
assert(presenceJournalRoute.includes("member.joinedAt") && presenceJournalRoute.includes("member.leftAt"), "Presence journal must restrict records to membership windows");
assert(presenceJournalRoute.includes("take: 1000"), "Presence journal server query must remain bounded");
assert(presenceJournal.includes("clientType") && presenceJournal.includes("duration") && presenceJournal.includes("sort"), "Presence journal UI must expose smart filters");
assert(workspace.includes("presenceJournalOpen") && workspace.includes("presenceJournal"), "Conversation menu must expose the manager presence journal");

// Message read info reuses the existing readAt source of truth and displays precise read time + presence.
assert(readInfoRoute.includes('orderBy: { readAt: "desc" }') && readInfoRoute.includes("readAt: read.readAt") && readInfoRoute.includes("lastSeenAt: true"), "Read info API must expose exact read time and presence data");
assert(workspace.includes("readAt: string") && workspace.includes("formatUserDateTime(item.readAt"), "Message info UI must preserve and render readAt instead of dropping it");
assert(workspace.includes("OnlineBadge") && workspace.includes("isOnline(item.user.lastSeenAt)"), "Message info UI must show online/offline state");

// Scheduled COO meeting links and minutes must reuse the existing meeting/call/minutes sources.
assert(meetingLinks.includes("CooMeetingLinkSource") && meetingLinks.includes('messageType: "MEETING_LINK"'), "Meeting helper must materialize a scheduled link as a real group message");
assert(meetingLinks.includes("availableFrom") && meetingLinks.includes("meetingLinkCanJoin"), "Scheduled meeting links must be time-gated server-side");
assert(messagesRoute.includes("syncCooMeetingLink") && messagesRoute.includes("meetingFollowUp"), "Conversation loading must self-heal scheduled meeting messages and expose follow-up metadata");
assert(meetingJoinRoute.includes("assertGroupMemberForSession") && meetingJoinRoute.includes("meetingLinkCanJoin"), "Meeting join route must verify member access and schedule gate");
assert(meetingJoinRoute.includes('status: { in: ["RINGING", "ACTIVE"] }'), "Scheduled meeting join must reuse an existing active room");
assert(meetingJoinRoute.includes("buildLiveKitRoomName") && meetingJoinRoute.includes("collaborationGroupCall.create"), "Scheduled meeting join must reuse the existing LiveKit call model");
assert(callEndRoute.includes('messageType: "MEETING_MINUTES_PROMPT"') && callEndRoute.includes("collaborationMeetingMinutesPublication"), "Ended meeting calls must create an idempotent minutes prompt");
assert(meetingMinutesRoute.includes("cooMeetingMinutes") && meetingMinutesRoute.includes('messageType: "MEETING_SUMMARY"'), "Meeting minutes must persist in COO and publish a group summary");
assert(meetingMinutesRoute.includes("reportOwnerEmployeeId") && meetingMinutesRoute.includes("canManageGroup"), "Minutes creation must be restricted to report owner or group managers");
assert(meetingMessageContent.includes("meeting-links/") && meetingMessageContent.includes("/minutes"), "Meeting message UI must expose real join and minutes actions");

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

// Definitive mobile scroll rule: viewport owns geometry, global chrome owns one tap-vs-drag gesture.
assert(immersiveViewport.includes("visualViewport"), "Immersive mobile conversations must follow VisualViewport changes");
assert(immersiveViewport.includes('overflow = "hidden"'), "Global page scrolling must be locked during immersive mobile conversations");
assert(immersiveViewport.includes('privateMainElement.style.transition = "none"'), "Conversation viewport geometry must not lag behind browser viewport motion");
assert(!immersiveViewport.includes('addEventListener("scroll", onNestedScroll'), "Immersive viewport must not run a second chrome engine from message scroll events");
assert(!immersiveViewport.includes("privateMobileNav"), "Immersive viewport must not decide mobile chrome visibility");
assert(!immersiveViewport.includes("getComputedStyle") && !immersiveViewport.includes("getBoundingClientRect"), "Conversation scroll path must not force style/layout measurements");
assert(mobileChrome.includes("IMMERSIVE_DRAG_THRESHOLD") && mobileChrome.includes("IMMERSIVE_TAP_THRESHOLD"), "Global mobile chrome must distinguish immersive drag from tap");
assert(mobileChrome.includes("onPointerMove") && mobileChrome.includes("onPointerUp") && mobileChrome.includes("gesture.decided"), "One gesture engine must make a single chrome decision per immersive drag");
assert(mobileChrome.includes("isImmersiveConversationTarget") && mobileChrome.includes("setNavigationHidden(dy < 0)"), "Immersive drag direction must be handled by the global chrome controller");

assert(participantColors.includes("bubbleClassName"), "Participant color helper must expose reusable bubble tones");
assert(page.includes("CollaboratorsImmersiveConversationShell"), "Collaborators page must use the immersive conversation shell");
assert(experienceRoute.includes("collaborationGroupScopeWhere"), "Experience state must preserve current tenant/context scope");

assert(vercel.includes('"main": true'), "Vercel production-only main deployment must remain enabled");
assert(vercel.includes('"*": false'), "Feature branch Vercel deployments must stay disabled");
assert(vercel.includes("ignoreCommand"), "Vercel preview ignoreCommand must remain configured");

console.log("Collaboration immersive scroll, presence journal, read info, meetings and voice QA passed.");
