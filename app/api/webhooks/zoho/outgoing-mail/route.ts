import { NextResponse } from "next/server";
import { env } from "@/lib/env";

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

  return NextResponse.json({
    ok: true,
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
