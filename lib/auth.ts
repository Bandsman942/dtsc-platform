import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthCookieDomain, getSignInUrl, getDashboardUrl } from "@/lib/domains";
import { requireEnv } from "@/lib/env";
import { getUserSessionIdleTimeoutMinutes } from "@/lib/session-preference";
import { sessionCookieMaxAgeSeconds } from "@/lib/session-policy";
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

  return verifySessionToken(token, secret);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
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
  });
  if (!user) return null;

  const sessionIdleTimeoutMinutes = await getUserSessionIdleTimeoutMinutes(user.id);
  return { ...user, sessionIdleTimeoutMinutes };
}

export async function requireUser() {
  const user = await getCurrentUser();
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

  const created = await createSessionToken(
    {
      userId: user.id,
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

  const cookieDomain = getAuthCookieDomain();
  cookieStore.set(SESSION_COOKIE, created.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
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
    secure: process.env.NODE_ENV === "production",
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
