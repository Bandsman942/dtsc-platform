import { NextResponse } from "next/server";
import { z } from "zod";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

const schema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(10).max(5000),
  service: z.string().trim().min(2).max(100),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  status: z.enum(["OPEN", "INVESTIGATING", "MONITORING", "RESOLVED", "CLOSED"]).default("OPEN"),
  startedAt: z.string().datetime(),
  impact: z.string().trim().max(2000).optional().or(z.literal("")),
  ownerUserId: z.string().max(120).optional().or(z.literal("")),
  logReference: z.string().trim().max(500).optional().or(z.literal("")),
});

function reference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `INC-${date}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function GET() {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_READ);
  if (access.response) return access.response;
  const incidents = await prisma.platformIncident.findMany({ orderBy: [{ status: "asc" }, { startedAt: "desc" }], take: 200 });
  return NextResponse.json({ incidents, reasonCode: access.reasonCode });
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden", reasonCode: "ORIGIN_FORBIDDEN" }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_MANAGE);
  if (access.response) return access.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid incident", reasonCode: "VALIDATION_ERROR" }, { status: 400 });
  const incident = await prisma.platformIncident.create({ data: { reference: reference(), title: parsed.data.title, description: parsed.data.description, service: parsed.data.service, severity: parsed.data.severity, status: parsed.data.status, ownerUserId: parsed.data.ownerUserId || access.session.userId, startedAt: new Date(parsed.data.startedAt), impact: parsed.data.impact || null, logReference: parsed.data.logReference || null, updatesJson: [{ at: new Date().toISOString(), actorUserId: access.session.userId, status: parsed.data.status, note: "Incident created" }] } });
  await writeAuditLog({ userId: access.session.userId, action: "CONSOLE_PLATFORM_INCIDENT_CREATED", entity: "PlatformIncident", entityId: incident.id, after: { reference: incident.reference, service: incident.service, severity: incident.severity, status: incident.status }, reasonCode: access.reasonCode, riskLevel: incident.severity === "CRITICAL" ? "CRITICAL" : "HIGH", request: req });
  return NextResponse.json({ ok: true, incident, reasonCode: access.reasonCode }, { status: 201 });
}
