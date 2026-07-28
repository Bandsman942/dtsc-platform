import {
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
  SESSION_DEFAULT_IDLE_TIMEOUT_MINUTES,
  SESSION_WARNING_MAX_SECONDS,
  SESSION_WARNING_MIN_SECONDS,
  isAllowedSessionIdleTimeoutMinutes,
  type SessionIdleTimeoutMinutes,
} from "@/lib/session-config";

export type SessionPolicyWindow = {
  authTime: number;
  issuedAt: number;
  idleTimeoutMinutes: SessionIdleTimeoutMinutes;
  absoluteExp: number;
  exp: number;
};

export function resolveSessionIdleTimeoutMinutes(value: unknown): SessionIdleTimeoutMinutes {
  return isAllowedSessionIdleTimeoutMinutes(value) ? value : SESSION_DEFAULT_IDLE_TIMEOUT_MINUTES;
}

export function createInitialSessionWindow(
  idleTimeoutMinutes: unknown,
  nowSeconds = Math.floor(Date.now() / 1000)
): SessionPolicyWindow {
  const idleTimeout = resolveSessionIdleTimeoutMinutes(idleTimeoutMinutes);
  const absoluteExp = nowSeconds + SESSION_ABSOLUTE_MAX_AGE_SECONDS;
  const exp = Math.min(nowSeconds + idleTimeout * 60, absoluteExp);
  return {
    authTime: nowSeconds,
    issuedAt: nowSeconds,
    idleTimeoutMinutes: idleTimeout,
    absoluteExp,
    exp,
  };
}

export function renewSessionWindow({
  authTime,
  absoluteExp,
  idleTimeoutMinutes,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  authTime: number;
  absoluteExp?: number | null;
  idleTimeoutMinutes: unknown;
  nowSeconds?: number;
}): SessionPolicyWindow | null {
  const idleTimeout = resolveSessionIdleTimeoutMinutes(idleTimeoutMinutes);
  const trustedAuthTime = Number.isFinite(authTime) && authTime > 0 ? Math.floor(authTime) : nowSeconds;
  const maximumAbsoluteExp = trustedAuthTime + SESSION_ABSOLUTE_MAX_AGE_SECONDS;
  const trustedAbsoluteExp = Number.isFinite(absoluteExp) && Number(absoluteExp) > trustedAuthTime
    ? Math.min(Math.floor(Number(absoluteExp)), maximumAbsoluteExp)
    : maximumAbsoluteExp;

  if (nowSeconds >= trustedAbsoluteExp) {
    return null;
  }

  return {
    authTime: trustedAuthTime,
    issuedAt: nowSeconds,
    idleTimeoutMinutes: idleTimeout,
    absoluteExp: trustedAbsoluteExp,
    exp: Math.min(nowSeconds + idleTimeout * 60, trustedAbsoluteExp),
  };
}

export function sessionCookieMaxAgeSeconds(exp: number, nowSeconds = Math.floor(Date.now() / 1000)) {
  return Math.max(0, Math.floor(exp - nowSeconds));
}

export function sessionWarningSeconds(idleTimeoutMinutes: unknown) {
  const idleTimeoutSeconds = resolveSessionIdleTimeoutMinutes(idleTimeoutMinutes) * 60;
  return Math.max(
    SESSION_WARNING_MIN_SECONDS,
    Math.min(SESSION_WARNING_MAX_SECONDS, Math.floor(idleTimeoutSeconds * 0.2))
  );
}

export function isSessionAbsolutelyExpired(absoluteExp: number | undefined, nowSeconds = Math.floor(Date.now() / 1000)) {
  return typeof absoluteExp === "number" && nowSeconds >= absoluteExp;
}
