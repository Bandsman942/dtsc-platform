import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

const schema = z.object({
  status: z.enum(["OPEN", "INVESTIGATING", "MONITORING", "RESOLVED", "CLOSED"]).optional(),
  ownerUserId: z.string().max(120).nullable().optional(),
  impact: z.string().trim().max(2000).nullable().optional(),
  cause: z.string().trim().max(5000).nullable().optional(),
  correctiveActions: z.string().trim().max(5000).nullable().optional(),
  logReference: z.string().trim().max(500).nullable().optional(),
  note: z.string().trim().min(3).max(2000),
});

type Params = { params: Promise<{ id: string }> };

function updateList(value: Prisma.JsonValue | null, update: Prisma.InputJsonObject): Prisma.InputJsonArray {
  const current = Array.isArray(value) ? value.filter((item): item is Prisma.JsonObject => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
  return [...current.slice(-99), update] as Prisma.InputJsonArray;
}

export async function PATCH(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden", reasonCode: "ORIGIN_FORBIDDEN" }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_MANAGE);
  if (access.response) return access.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid incident update", reasonCode: "VALIDATION_ERROR" }, { status: 400 });
  const { id } = await params;
  const before = await prisma.platformIncident.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found", reasonCode: "NOT_FOUND" }, { status: 404 });
  const nextStatus = parsed.data.status || before.status;
  if (nextStatus === "CLOSED" && !parsed.data.cause && !before.cause) return NextResponse.json({ error: "Root cause required", reasonCode: "VALIDATION_ERROR" }, { status: 400 });
  const incident = await prisma.platformIncident.update({ where: { id }, data: { ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}), ...(parsed.data.ownerUserId !== undefined ? { ownerUserId: parsed.data.ownerUserId } : {}), ...(parsed.data.impact !== undefined ? { impact: parsed.data.impact } : {}), ...(parsed.data.cause !== undefined ? { cause: parsed.data.cause } : {}), ...(parsed.data.correctiveActions !== undefined ? { correctiveActions: parsed.data.correctiveActions } : {}), ...(parsed.data.logReference !== undefined ? { logReference: parsed.data.logReference } : {}), resolvedAt: ["RESOLVED", "CLOSED"].includes(nextStatus) ? before.resolvedAt || new Date() : null, updatesJson: updateList(before.updatesJson, { at: new Date().toISOString(), actorUserId: access.session.userId, status: nextStatus, note: parsed.data.note }) } });
  await writeAuditLog({ userId: access.session.userId, action: "CONSOLE_PLATFORM_INCIDENT_UPDATED", entity: "PlatformIncident", entityId: id, before: { status: before.status, ownerUserId: before.ownerUserId, impact: before.impact }, after: { status: incident.status, ownerUserId: incident.ownerUserId, impact: incident.impact }, reasonCode: access.reasonCode, riskLevel: incident.severity === "CRITICAL" ? "CRITICAL" : "HIGH", metadata: { note: parsed.data.note, reference: incident.reference }, request: req });
  return NextResponse.json({ ok: true, incident, reasonCode: access.reasonCode });
}
