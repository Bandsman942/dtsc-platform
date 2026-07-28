import "server-only";
import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign as signBytes,
} from "node:crypto";
import type { WebPushConfig } from "@/lib/push/config";

export type WebPushSubscriptionData = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type WebPushSendResult = {
  ok: boolean;
  status: number;
};

function base64UrlDecode(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function base64UrlEncode(value: Buffer | string) {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function hmac(key: Buffer, value: Buffer) {
  return createHmac("sha256", key).update(value).digest();
}

function hkdfExtract(salt: Buffer, inputKeyMaterial: Buffer) {
  return hmac(salt, inputKeyMaterial);
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number) {
  if (length > 32) {
    throw new Error("DTSC Web Push HKDF output too large");
  }
  return hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
}

function createEncryptedBody(subscription: WebPushSubscriptionData, payload: string) {
  const userPublicKey = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);
  if (userPublicKey.length !== 65 || userPublicKey[0] !== 4 || authSecret.length < 16) {
    throw new Error("Invalid push subscription keys");
  }

  const applicationServerEcdh = createECDH("prime256v1");
  applicationServerEcdh.generateKeys();
  const applicationServerPublicKey = applicationServerEcdh.getPublicKey();
  const sharedSecret = applicationServerEcdh.computeSecret(userPublicKey);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    userPublicKey,
    applicationServerPublicKey,
  ]);
  const prkKey = hkdfExtract(authSecret, sharedSecret);
  const inputKeyMaterial = hkdfExpand(prkKey, keyInfo, 32);
  const salt = randomBytes(16);
  const prk = hkdfExtract(salt, inputKeyMaterial);
  const contentEncryptionKey = hkdfExpand(prk, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16);
  const nonce = hkdfExpand(prk, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12);

  const plaintext = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]);
  if (plaintext.length > 3993) {
    throw new Error("Push payload exceeds safe Web Push limit");
  }

  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);

  return Buffer.concat([
    salt,
    recordSize,
    Buffer.from([applicationServerPublicKey.length]),
    applicationServerPublicKey,
    ciphertext,
  ]);
}

function createVapidAuthorization(endpoint: string, config: WebPushConfig) {
  const publicKey = base64UrlDecode(config.publicKey);
  const privateKey = base64UrlDecode(config.privateKey);
  if (publicKey.length !== 65 || publicKey[0] !== 4 || privateKey.length !== 32) {
    throw new Error("Invalid VAPID key material");
  }

  const x = publicKey.subarray(1, 33);
  const y = publicKey.subarray(33, 65);
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(x),
      y: base64UrlEncode(y),
      d: base64UrlEncode(privateKey),
    },
    format: "jwk",
  });

  const header = base64UrlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const endpointUrl = new URL(endpoint);
  const body = base64UrlEncode(JSON.stringify({
    aud: endpointUrl.origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: config.subject,
  }));
  const unsignedToken = `${header}.${body}`;
  const signature = signBytes("sha256", Buffer.from(unsignedToken), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  const token = `${unsignedToken}.${base64UrlEncode(signature)}`;
  return `vapid t=${token}, k=${config.publicKey}`;
}

export async function sendEncryptedWebPush({
  subscription,
  payload,
  config,
  ttlSeconds = 60,
}: {
  subscription: WebPushSubscriptionData;
  payload: string;
  config: WebPushConfig;
  ttlSeconds?: number;
}): Promise<WebPushSendResult> {
  const encryptedBody = createEncryptedBody(subscription, payload);
  const authorization = createVapidAuthorization(subscription.endpoint, config);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(Math.max(0, Math.min(ttlSeconds, 24 * 60 * 60))),
      Urgency: "normal",
    },
    body: encryptedBody,
    redirect: "error",
    cache: "no-store",
  });

  return { ok: response.ok, status: response.status };
}
