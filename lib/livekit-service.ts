import { createHmac, randomUUID } from "node:crypto";

type LiveKitTokenInput = {
  roomName: string;
  identity: string;
  name: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  ttlSeconds?: number;
};

type LiveKitRoomInput = {
  groupId: string;
  meetingId?: string | null;
  callType: "AUDIO" | "VIDEO";
};

export function isLiveKitConfigured() {
  return Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL);
}

export function liveKitUrl() {
  return process.env.LIVEKIT_URL || "";
}

export function buildLiveKitRoomName({ groupId, meetingId, callType }: LiveKitRoomInput) {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  const meetingSegment = meetingId ? `meeting-${meetingId}` : "group";
  return `dtsc-${callType.toLowerCase()}-${groupId}-${meetingSegment}-${suffix}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 220);
}

export function generateLiveKitParticipantToken({
  roomName,
  identity,
  name,
  canPublish = true,
  canSubscribe = true,
  ttlSeconds = 60 * 60 * 2,
}: LiveKitTokenInput) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit n'est pas configuré pour DTSC Platform.");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: apiKey,
    sub: identity,
    name,
    iat: now,
    nbf: now,
    exp: now + ttlSeconds,
    video: {
      room: roomName,
      roomJoin: true,
      canPublish,
      canSubscribe,
      canPublishData: true,
    },
  };

  return signJwt(payload, apiSecret);
}

function signJwt(payload: Record<string, unknown>, secret: string) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(`${encodedHeader}.${encodedPayload}`).digest("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}
