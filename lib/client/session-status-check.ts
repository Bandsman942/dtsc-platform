/**
 * A logout event from another tab is advisory: it may have been emitted by an
 * older request while this browser has already established a new session.
 * Only a fresh authoritative 401 can expire the current tab. Other responses
 * and network failures leave the server's normal auth guards in control.
 */
export async function isCurrentSessionRejected(request: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await request("/api/auth/heartbeat", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });
    return response.status === 401;
  } catch {
    return false;
  }
}
