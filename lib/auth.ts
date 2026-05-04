import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireEnv } from "@/lib/env";
import {
  createSessionToken,
  SESSION_COOKIE,
  verifySessionToken,
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

  return prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      companyName: true,
      phone: true,
      status: true,
      dailyMessageLimit: true,
      dailyTokenLimit: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") {
    redirect("/auth/sign-in");
  }

  return user;
}

export async function requireRole(roles: UserRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/dashboard");
  }

  return user;
}

export async function setSessionCookie(user: {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}) {
  const cookieStore = await cookies();
  const token = await createSessionToken(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    requireEnv("AUTH_SECRET")
  );

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
