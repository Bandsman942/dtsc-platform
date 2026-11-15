import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function must(path, pattern, reason) {
  assert.match(read(path), pattern, `${path}: ${reason}`);
}

must("prisma/schema.prisma", /model SupportTicketAttachment \{/, "Private support photo model");
must("prisma/schema.prisma", /incomingCallRingtone\s+String\s+@default\("CLASSIC"\)/, "Persisted ringtone field");
must("prisma/migrations/20261115141000_support_ticket_media_ringtone/migration.sql", /ON DELETE CASCADE/, "Additive private photo FK");
must("lib/support-media.ts", /signatureIsValid\(bytes/, "Byte-signature verification");
must("lib/support-media.ts", /createSignedUrl\(path, 90\)/, "Short-lived signed URL");
must("app/api/support/tickets/[id]/attachments/route.ts", /ticket.userId !== session.userId/, "Ticket owner checked before upload");
must("app/api/support/tickets/[id]/attachments/[attachmentId]/route.ts", /canUserAccessSupportTicket\(photo.ticket, session\)/, "Scoped private image download");
must("components/support/ticket-board-implementation.tsx", /ticketVisuals\(ticket\)/, "Ticket age, deadline and overdue visuals");
must("components/support/support-form.tsx", /setAiSuggestion\(\{ action, content: body.content \}\)/, "AI suggestion is not automatically applied");
must("components/support/support-form.tsx", /onClick=\{\(\) => \{ if \(aiSuggestion.action === "TITLE"\)/, "User must approve AI draft");
must("app/api/support/ai/compose/route.ts", /prepareAiTurn\(/, "Shared AI policy runtime");
must("app/api/support/ai/compose/route.ts", /isSameOriginRequest\(req\)/, "AI route request security");
must("lib/ai/tool-registry.ts", /code: "SUPPORT_TICKET_CREATE"[\s\S]*?requiresConfirmation: true/, "Agent ticket creation requires explicit confirmation");
must("app/api/collaborators/groups/[id]/messages/route.ts", /firstUnreadMessageId/, "Focus first unread");
must("app/api/collaborators/groups/[id]/read/route.ts", /markGroupMessagesRead\(\{ groupId: id/, "Canonical read receipts for entire conversation");
must("components/collaborators/collaborators-conversation-workspace.tsx", /markConversationClosed\(activeGroup.id\)/, "Read badge removed on conversation exit");
must("components/calls/call-sounds.ts", /MELODIC: \[/, "Original melodic ringtone");
must("components/calls/call-sounds.ts", /ringingTimeout = window.setTimeout\(stopCallRingtone, 18_500\)/, "Long controlled ringtone");
must("components/settings/settings-panel.tsx", /data-account-preferences-workspace/, "DTSC 2.0 account preferences");
must("components/settings/settings-panel.tsx", /name="incomingCallRingtone"/, "User ringtone selector");
must("app/api/account/preferences/route.ts", /incomingCallRingtone: body.data.incomingCallRingtone/, "Ringtone persisted");
must("app/api/account/preferences/route.ts", /pushNotificationsEnabled: body.data.pushNotificationsEnabled/, "Notification preference persisted");
console.log("OK — 22 Support/Collaboration/Calls/Preferences hotfix contract checks");
