import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Reconnectez-vous pour continuer." }, { status: 401 });
  const factor = await prisma.authTotpFactor.findUnique({
    where: { userId: session.userId },
    select: { enabledAt: true, recoveryCodes: { where: { consumedAt: null }, select: { id: true } } },
  });
  return NextResponse.json({
    enabled: Boolean(factor?.enabledAt),
    enabledAt: factor?.enabledAt?.toISOString() || null,
    recoveryCodesRemaining: factor?.enabledAt ? factor.recoveryCodes.length : 0,
  }, { headers: { "Cache-Control": "no-store" } });
}
