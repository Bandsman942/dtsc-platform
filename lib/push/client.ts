export type PushCapabilityState =
  | "unsupported"
  | "permission-default"
  | "permission-denied"
  | "permission-granted"
  | "subscribed"
  | "configuration-missing";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

export function supportsWebPush() {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

export function needsAppleHomeScreenGuidance() {
  if (typeof navigator === "undefined") return false;
  const appleNavigator = navigator as Navigator & { standalone?: boolean };
  return "standalone" in appleNavigator && appleNavigator.standalone !== true;
}

async function getExistingServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.getRegistration("/");
}

async function ensureServiceWorkerRegistration() {
  const existing = await getExistingServiceWorkerRegistration();
  return existing || navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function getCurrentPushSubscription() {
  if (!supportsWebPush()) return null;
  const registration = await getExistingServiceWorkerRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function getPushCapabilityState(): Promise<PushCapabilityState> {
  if (!supportsWebPush()) return "unsupported";
  if (Notification.permission === "denied") return "permission-denied";
  if (Notification.permission === "default") return "permission-default";

  const subscription = await getCurrentPushSubscription();
  if (!subscription) return "permission-granted";

  const serverResponse = await fetch("/api/push/subscriptions/current", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
    cache: "no-store",
  }).catch(() => null);
  if (!serverResponse?.ok) return "permission-granted";

  const server = await serverResponse.json() as { configured?: boolean; enabled?: boolean; registered?: boolean };
  if (!server.configured) return "configuration-missing";
  return server.enabled && server.registered ? "subscribed" : "permission-granted";
}

export async function enableCurrentDevicePush(deviceLabel?: string) {
  if (!supportsWebPush()) {
    return { ok: false as const, state: "unsupported" as PushCapabilityState };
  }

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false as const, state: permission === "denied" ? "permission-denied" as const : "permission-default" as const };
  }

  const configResponse = await fetch("/api/push/subscriptions", { cache: "no-store" });
  if (!configResponse.ok) {
    return { ok: false as const, state: "configuration-missing" as const };
  }
  const config = await configResponse.json() as { configured?: boolean; vapidPublicKey?: string | null };
  if (!config.configured || !config.vapidPublicKey) {
    return { ok: false as const, state: "configuration-missing" as const };
  }

  const registration = await ensureServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Subscription Web Push incomplète");
  }

  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      deviceLabel: deviceLabel || "",
    }),
  });
  if (!response.ok) {
    return { ok: false as const, state: "permission-granted" as const };
  }

  return { ok: true as const, state: "subscribed" as const };
}

export async function revokeCurrentDevicePush() {
  const subscription = await getCurrentPushSubscription().catch(() => null);
  if (!subscription) return { ok: true, endpoint: null as string | null };
  const endpoint = subscription.endpoint;
  await fetch("/api/push/subscriptions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => false);
  return { ok: true, endpoint };
}

export async function reconcileCurrentDevicePush(enabled: boolean) {
  if (!supportsWebPush() || Notification.permission !== "granted") return;
  const subscription = await getCurrentPushSubscription();
  if (enabled && subscription) {
    const json = subscription.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      }).catch(() => undefined);
    }
  }
}
