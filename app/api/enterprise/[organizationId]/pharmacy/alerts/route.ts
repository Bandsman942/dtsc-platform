import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyAlerts } from "@/lib/pharmacy-alert-access";
import { detectAllPharmacyAlerts, getPharmacyAlertDataset } from "@/lib/pharmacy-alerts";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
export async function GET(request: Request, { params }: Params) { const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { organizationId } = await params; if (!(await canAccessPharmacyAlerts(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const data = await getPharmacyAlertDataset(organizationId, session.userId); await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt }); return NextResponse.json(data); }
export async function POST(request: Request, { params }: Params) { const startedAt = Date.now(); if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const limited = await rateLimit(getRateLimitKey(request, `pharmacy-alert-detect:${session.userId}`), 20, 3600000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 }); const { organizationId } = await params; if (!(await canAccessPharmacyAlerts(session.userId, organizationId, "detect"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const detected = await detectAllPharmacyAlerts(organizationId, session.userId); await writeAuditLog({ userId: session.userId, action: "PHARMACY_ALERTS_DETECTED", entity: "PharmacyAlert", request, metadata: { organizationId, detected } }); await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt }); return NextResponse.json({ ok: true, detected }); }
