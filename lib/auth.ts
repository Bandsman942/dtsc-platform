import { cookies } from "next/headers";
import { isAuthSessionActive, newSessionId, registerAuthSession, touchRegisteredSession } from "@/lib/auth/session-registry";
import { isMfaRequiredForContext } from "@/lib/auth/mfa-policy";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthCookieDomain, getSignInUrl, getDashboardUrl } from "@/lib/domains";
import { requireEnv } from "@/lib/env";
import { getUserSessionIdleTimeoutMinutes } from "@/lib/session-preference";
import { sessionCookieMaxAgeSeconds } from "@/lib/session-policy";
import { shouldUseSecureSessionCookie } from "@/lib/session-cookie-security";
import {
  createSessionToken,
  SESSION_COOKIE,
  verifySessionToken,
  type SessionContext,
  type SessionPayload,
} from "@/lib/session";

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const secret = requireEnv("AUTH_SECRET");

  const signed = await verifySessionToken(token, secret);
  if (!signed) return null;
  // A valid signature alone does not authorize a revoked, suspended or
  // expired server-side session.
  if (!(await isAuthSessionActive(signed))) return null;
  const session = signed;
  // Recovery is account-wide; no signed legacy cookie or revoked device may
  // bypass a two-person administrative recovery or stale MFA proof.
  const identity = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { status: true, mfaRecoveryRequired: true, mfaRecoveryInvalidBefore: true },
  });
  if (!identity || identity.status !== "ACTIVE") return null;
  if (identity.mfaRecoveryInvalidBefore &&
      (!session.mfaVerifiedAt || session.mfaVerifiedAt <= identity.mfaRecoveryInvalidBefore.getTime())) return null;
  if (identity.mfaRecoveryRequired) return null;
  // MFA policy is evaluated only after revocation, account recovery and membership.
  const factor = await prisma.authTotpFactor.findUnique({
    where: { userId: session.userId }, select: { enabledAt: true },
  });
  const required = await isMfaRequiredForContext(session);
  if (required && !factor?.enabledAt) return null;
  if (factor?.enabledAt &&
      (!session.mfaVerifiedAt || session.mfaVerifiedAt < factor.enabledAt.getTime())) return null;
  return session;
}

export async function getCurrentUser(sessionOverride?: SessionPayload) {
  // Never allow a caller-supplied snapshot to bypass the authoritative
  // revocation, membership and active-account checks in getSession().
  const session = await getSession();
  if (sessionOverride && session?.userId !== sessionOverride.userId) return null;
  if (!session) {
    return null;
  }

  const sessionIdleTimeoutPromise = session.idleTimeoutMinutes !== undefined
    ? Promise.resolve(session.idleTimeoutMinutes)
    : getUserSessionIdleTimeoutMinutes(session.userId);
  const [user, sessionIdleTimeoutMinutes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyName: true,
        phone: true,
        jobTitle: true,
        bio: true,
        location: true,
        website: true,
        avatarUrl: true,
        avatarStoragePath: true,
        publicProfileConsent: true,
        preferredModel: true,
        notifySupportEnabled: true,
        notifyUsageEnabled: true,
        notifyBroadcastEnabled: true,
        pushNotificationsEnabled: true,
        interfaceDensity: true,
        startPage: true,
        locale: true,
        timezone: true,
        dateFormat: true,
        callSoundsEnabled: true,
        callNotificationsEnabled: true,
        floatingCallAlertsEnabled: true,
        participantEventAlertsEnabled: true,
        callAlertSoundEnabled: true,
        incomingCallBannerEnabled: true,
        connectionIssueSoundsEnabled: true,
        startMutedByDefault: true,
        startCameraOffByDefault: true,
        callSoundVolume: true,
        callAlertDisplayDuration: true,
        preferredAudioInputId: true,
        preferredVideoInputId: true,
        preferredAudioOutputId: true,
        emailDigestFrequency: true,
        chatResponseStyle: true,
        chatResponseLength: true,
        status: true,
        dailyMessageLimit: true,
        dailyTokenLimit: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    sessionIdleTimeoutPromise,
  ]);
  if (!user) return null;

  return { ...user, sessionIdleTimeoutMinutes };
}

export async function requireUser(sessionOverride?: SessionPayload) {
  const user = await getCurrentUser(sessionOverride);
  if (!user || user.status !== "ACTIVE") {
    redirect(getSignInUrl());
  }

  return user;
}

export async function requireRole(roles: UserRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect(getDashboardUrl());
  }

  return user;
}

type SessionCookieUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  sessionIdleTimeoutMinutes?: number | null;
  mfaVerifiedAt?: number;
  activeContext?: SessionContext;
  activeOrganizationId?: string | null;
  activeOrganizationName?: string | null;
  activeOrganizationRole?: string | null;
};

export async function setSessionCookie(
  user: SessionCookieUser,
  options: { previousSession?: SessionPayload | null } = {}
) {
  const cookieStore = await cookies();
  const storedIdleTimeout = user.sessionIdleTimeoutMinutes ?? await getUserSessionIdleTimeoutMinutes(user.id);

  const sessionId = options.previousSession?.sessionId || newSessionId();
  const created = await createSessionToken(
    {
      sessionId,
      userId: user.id,
      mfaVerifiedAt: user.mfaVerifiedAt ?? options.previousSession?.mfaVerifiedAt,
      email: user.email,
      name: user.name,
      role: user.role,
      activeContext: user.activeContext,
      activeOrganizationId: user.activeOrganizationId || null,
      activeOrganizationName: user.activeOrganizationName || null,
      activeOrganizationRole: user.activeOrganizationRole || null,
    },
    requireEnv("AUTH_SECRET"),
    {
      idleTimeoutMinutes: storedIdleTimeout,
      previous: options.previousSession
        ? { authTime: options.previousSession.authTime, absoluteExp: options.previousSession.absoluteExp }
        : null,
    }
  );

  if (!created) {
    await clearSessionCookie();
    return null;
  }

  if (options.previousSession?.sessionId) {
    const renewed = await touchRegisteredSession(created.session);
    if (!renewed) {
      await clearSessionCookie();
      return null;
    }
  } else {
    // From this release onward every new login (and legacy session migration)
    // is registered before the signed authentication cookie is delivered.
    await registerAuthSession(created.session);
  }

  const cookieDomain = getAuthCookieDomain();
  cookieStore.set(SESSION_COOKIE, created.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureSessionCookie(),
    path: "/",
    maxAge: sessionCookieMaxAgeSeconds(created.session.exp),
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });

  return created.session;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  const cookieDomain = getAuthCookieDomain();
  const baseOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureSessionCookie(),
    path: "/",
    maxAge: 0,
  } as const;

  cookieStore.set(SESSION_COOKIE, "", baseOptions);
  if (cookieDomain) {
    cookieStore.set(SESSION_COOKIE, "", {
      ...baseOptions,
      domain: cookieDomain,
    });
  } else {
    cookieStore.delete(SESSION_COOKIE);
  }
}