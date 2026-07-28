import { NextResponse } from "next/server";
import { z } from "zod";
import { clearSessionCookie, getSession } from "@/lib/auth";
import { getSignInUrl } from "@/lib/domains";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

const signOutSchema = z.object({
  reason: z.enum(["manual", "expired"]).default("manual"),
  pushEndpoint: z.string().url().max(2000).optional().or(z.literal("")),
}).strict();

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  const session = await getSession();
  const parsed = signOutSchema.safeParse(await req.json().catch(() => ({})));
  const reason = parsed.success ? parsed.data.reason : "manual";
  const pushEndpoint = parsed.success ? parsed.data.pushEndpoint : "";

  if (reason === "manual" && session && pushEndpoint) {
    await prisma.pushSubscription.deleteMany({
      where: { userId: session.userId, endpoint: pushEndpoint },
    });
    const remaining = await prisma.pushSubscription.count({ where: { userId: session.userId } });
    if (remaining === 0) {
      await prisma.user.update({
        where: { id: session.userId },
        data: { pushNotificationsEnabled: false },
      }).catch(() => undefined);
    }
  }

  await clearSessionCookie();
  return NextResponse.json({ ok: true, redirectTo: getSignInUrl() });
}
