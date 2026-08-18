import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { redisRestCommand, redisRestPipeline, type RedisRestUnavailableReason } from "@/lib/redis-rest";

export const COLLABORATION_CALL_EVENT_INBOX_TTL_SECONDS = 15 * 60;
export const COLLABORATION_CALL_EVENT_INBOX_MAX_ITEMS = 100;
export const COLLABORATION_CALL_EVENT_DB_RECONCILE_SECONDS = 5 * 60;
export const COLLABORATION_CALL_SETTINGS_TTL_SECONDS = 5 * 60;

export type CollaborationCallToastSettings = {
  callSoundsEnabled: boolean;
  callNotificationsEnabled: boolean;
  floatingCallAlertsEnabled: boolean;
  participantEventAlertsEnabled: boolean;
  callAlertSoundEnabled: boolean;
  connectionIssueSoundsEnabled: boolean;
  callAlertDisplayDuration: number;
  callSoundVolume: number;
};

export type CollaborationCallInboxEvent = {
  id: string;
  callId: string;
  groupId: string;
  meetingId: string | null;
  groupName: string;
  callType: "AUDIO" | "VIDEO";
  eventType: string;
  actorName: null;
  message: string;
  createdAt: string;
  canJoin: boolean;
  actionUrl: string;
};

type RedisMode = { mode: "REDIS" } | { mode: "FALLBACK"; reason: RedisRestUnavailableReason };

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function inboxKey(userId: string) {
  return `dtsc:collab:call-events:${digest(userId)}`;
}

function settingsKey(userId: string) {
  return `dtsc:collab:call-settings:${digest(userId)}`;
}

function reconciliationKey(userId: string) {
  return `dtsc:collab:call-reconcile:${digest(userId)}`;
}

function normalizedSettings(user: Partial<CollaborationCallToastSettings> | null | undefined): CollaborationCallToastSettings {
  return {
    callSoundsEnabled: user?.callSoundsEnabled ?? true,
    callNotificationsEnabled: user?.callNotificationsEnabled ?? true,
    floatingCallAlertsEnabled: user?.floatingCallAlertsEnabled ?? true,
    participantEventAlertsEnabled: user?.participantEventAlertsEnabled ?? true,
    callAlertSoundEnabled: user?.callAlertSoundEnabled ?? true,
    connectionIssueSoundsEnabled: user?.connectionIssueSoundsEnabled ?? true,
    callAlertDisplayDuration: user?.callAlertDisplayDuration ?? 6000,
    callSoundVolume: user?.callSoundVolume ?? 45,
  };
}

export function humanCallEventMessage(eventType: string, storedMessage: string, callType: string) {
  if (eventType === "CALL_STARTED") return callType === "VIDEO" ? "Appel vidéo lancé" : "Appel audio lancé";
  if (eventType === "CALL_ENDED") return "L'appel est terminé";
  if (eventType === "CALL_MISSED") return "Appel manqué";
  if (eventType === "CALL_JOINED" || eventType === "USER_JOINED") return storedMessage || "Un collaborateur a rejoint l'appel";
  if (eventType === "CALL_LEFT" || eventType === "USER_LEFT") return storedMessage || "Un collaborateur a quitté l'appel";
  if (eventType === "CALL_INTERRUPTED") return "Connexion instable dans l'appel";
  if (eventType === "CALL_RECONNECTED") return "L'appel a repris";
  if (eventType === "PARTICIPANT_MUTED") return storedMessage || "Un collaborateur a coupé son micro";
  if (eventType === "PARTICIPANT_UNMUTED") return storedMessage || "Un collaborateur a réactivé son micro";
  return storedMessage || "Événement d'appel";
}

export async function publishCollaborationCallEvent(eventId: string): Promise<RedisMode & { recipientCount: number }> {
  const event = await prisma.collaborationGroupCallEvent.findUnique({
    where: { id: eventId },
    include: {
      call: {
        select: { id: true, groupId: true, meetingId: true, callType: true, status: true },
      },
    },
  });
  if (!event) return { mode: "REDIS", recipientCount: 0 };

  const [group, recipients] = await Promise.all([
    prisma.collaborationGroup.findUnique({ where: { id: event.groupId }, select: { name: true } }),
    prisma.collaborationGroupMember.findMany({
      where: {
        groupId: event.groupId,
        status: "ACTIVE",
        ...(event.userId ? { userId: { not: event.userId } } : {}),
      },
      select: { userId: true },
      take: 500,
    }),
  ]);

  const payload: CollaborationCallInboxEvent = {
    id: event.id,
    callId: event.callId,
    groupId: event.groupId,
    meetingId: event.meetingId,
    groupName: group?.name || "Groupe DTSC",
    callType: event.call.callType === "VIDEO" ? "VIDEO" : "AUDIO",
    eventType: event.eventType,
    actorName: null,
    message: humanCallEventMessage(event.eventType, event.message, event.call.callType),
    createdAt: event.createdAt.toISOString(),
    canJoin: event.call.status === "RINGING" || event.call.status === "ACTIVE",
    actionUrl: `/collaborators?groupId=${encodeURIComponent(event.groupId)}&joinCall=${encodeURIComponent(event.callId)}`,
  };
  const serialized = JSON.stringify(payload);

  const commands = recipients.flatMap(({ userId }) => {
    const key = inboxKey(userId);
    return [
      ["RPUSH", key, serialized],
      ["LTRIM", key, -COLLABORATION_CALL_EVENT_INBOX_MAX_ITEMS, -1],
      ["EXPIRE", key, COLLABORATION_CALL_EVENT_INBOX_TTL_SECONDS],
    ];
  });

  for (let index = 0; index < commands.length; index += 150) {
    const outcome = await redisRestPipeline(commands.slice(index, index + 150));
    if (!outcome.available) return { mode: "FALLBACK", reason: outcome.reason, recipientCount: recipients.length };
  }
  return { mode: "REDIS", recipientCount: recipients.length };
}

export async function readCollaborationCallEventInbox(userId: string, since: Date) {
  const outcome = await redisRestCommand<string[] | null>(["LRANGE", inboxKey(userId), 0, -1]);
  if (!outcome.available) return { mode: "FALLBACK" as const, reason: outcome.reason, events: [] as CollaborationCallInboxEvent[] };

  const seen = new Set<string>();
  const events = (outcome.result || [])
    .map((item) => {
      try {
        return JSON.parse(item) as CollaborationCallInboxEvent;
      } catch {
        return null;
      }
    })
    .filter((item): item is CollaborationCallInboxEvent => Boolean(item?.id && item.createdAt))
    .filter((item) => new Date(item.createdAt).getTime() > since.getTime())
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-20);
  return { mode: "REDIS" as const, events };
}

export async function getCollaborationCallToastSettings(userId: string) {
  const cached = await redisRestCommand<string | null>(["GET", settingsKey(userId)]);
  if (cached.available && cached.result) {
    try {
      return { settings: normalizedSettings(JSON.parse(cached.result) as CollaborationCallToastSettings), redisMode: "REDIS" as const };
    } catch {
      // Cache corrompu : recharger depuis PostgreSQL puis remplacer la valeur.
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      callSoundsEnabled: true,
      callNotificationsEnabled: true,
      floatingCallAlertsEnabled: true,
      participantEventAlertsEnabled: true,
      callAlertSoundEnabled: true,
      connectionIssueSoundsEnabled: true,
      callAlertDisplayDuration: true,
      callSoundVolume: true,
    },
  });
  const settings = normalizedSettings(user);
  if (cached.available) {
    await redisRestCommand(["SETEX", settingsKey(userId), COLLABORATION_CALL_SETTINGS_TTL_SECONDS, JSON.stringify(settings)]);
    return { settings, redisMode: "REDIS" as const };
  }
  return { settings, redisMode: "FALLBACK" as const, reason: cached.reason };
}

export async function invalidateCollaborationCallSettingsCache(userId: string) {
  return redisRestCommand<number>(["DEL", settingsKey(userId)]);
}

export async function claimCollaborationCallDbReconciliation(userId: string) {
  const outcome = await redisRestCommand<string | null>([
    "SET",
    reconciliationKey(userId),
    "1",
    "EX",
    COLLABORATION_CALL_EVENT_DB_RECONCILE_SECONDS,
    "NX",
  ]);
  if (!outcome.available) return { mode: "FALLBACK" as const, due: true, reason: outcome.reason };
  return { mode: "REDIS" as const, due: outcome.result === "OK" };
}
