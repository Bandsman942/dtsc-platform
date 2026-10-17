import { timingSafeEqual } from "node:crypto";

/**
 * Shared Production CRON_SECRET also authorizes seven unrelated Vercel cron
 * routes. Restoring it must never bulk-dispatch their historical workloads.
 * Calls using a distinct per-worker secret keep their existing manual access.
 * Invoke ONLY after the route's existing authentication has succeeded.
 */
export function isSharedCronDispatchPaused(
  request: { headers: { get(name: string): string | null } },
  enabledFlag: string,
): boolean {
  if (process.env.VERCEL_ENV !== "production") return false;
  const sharedSecret = process.env.CRON_SECRET;
  if (!sharedSecret) return false;
  const authorization = request.headers.get("authorization") || "";
  const presented = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(sharedSecret);
  const scheduled = a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  return scheduled && process.env[enabledFlag] !== "true";
}
