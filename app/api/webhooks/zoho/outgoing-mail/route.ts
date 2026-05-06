import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!env.ZOHO_OUTGOING_WEBHOOK_SECRET || secret !== env.ZOHO_OUTGOING_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, webhook: "DTSC Zoho outgoing mail receiver" });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") || req.headers.get("x-dtsc-webhook-secret");

  if (!env.ZOHO_OUTGOING_WEBHOOK_SECRET || secret !== env.ZOHO_OUTGOING_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const event = await prisma.webhookEvent.create({
    data: {
      provider: "zoho",
      eventType: "outgoing-mail",
      payload,
      status: "RECEIVED",
      processedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    eventId: event.id,
    receivedAt: new Date().toISOString(),
    expectedAdminOutboundPayload: {
      to: "array<string>",
      cc: "array<string>",
      subject: "string",
      content: "string",
      html: "string",
      fromEmail: env.DTSC_CONTACT_EMAIL,
      replyTo: env.DTSC_CONTACT_EMAIL,
    },
  });
}
