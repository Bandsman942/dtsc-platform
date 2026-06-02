import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { getSignInUrl } from "@/lib/domains";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true, redirectTo: getSignInUrl() });
}
