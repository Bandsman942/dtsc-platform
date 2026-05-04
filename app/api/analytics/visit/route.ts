import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { siteVisitSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const body = siteVisitSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await prisma.siteVisit.create({
    data: {
      path: body.data.path,
      referrer: body.data.referrer || null,
      userAgent: req.headers.get("user-agent"),
    },
  });

  return NextResponse.json({ ok: true });
}
