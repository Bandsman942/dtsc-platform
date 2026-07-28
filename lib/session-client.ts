const SESSION_CHANNEL = "dtsc-session";
const SESSION_STORAGE_EVENT_KEY = "dtsc-session-sync";

export function broadcastBrowserSessionLogout() {
  if (typeof window === "undefined") return;
  const message = { type: "logout", at: Date.now() } as const;
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage(message);
    channel.close();
  }
  try {
    window.localStorage.setItem(
      SESSION_STORAGE_EVENT_KEY,
      JSON.stringify({ ...message, nonce: crypto.randomUUID?.() || String(Math.random()) })
    );
  } catch {
    // Shared-cookie logout remains authoritative even if local tab signaling is unavailable.
  }
}
