import { NextResponse } from "next/server";
import { getSession, setSessionCookie } from "@/lib/auth";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  await setSessionCookie({
    id: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
  });

  return NextResponse.json({ ok: true });
}
