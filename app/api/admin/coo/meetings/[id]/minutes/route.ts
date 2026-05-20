import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const minutesSchema = z.object({
  content: z.string().min(5).max(8000),
  status: z.enum(["DRAFT", "PUBLISHED", "VALIDATED", "ARCHIVED"]).default("PUBLISHED"),
});

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("coo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès refusé." }, { status: 403 });
  }
  const { id } = await params;
  const meeting = await prisma.cooMeeting.findUnique({ where: { id } });
  if (!meeting) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Réunion introuvable." }, { status: 404 });
  }
  const parsed = minutesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Compte rendu invalide." }, { status: 400 });
  }

  const minutes = await prisma.cooMeetingMinutes.create({
    data: {
      meetingId: meeting.id,
      content: parsed.data.content,
      status: parsed.data.status,
      createdById: session.userId,
    },
  });
  await prisma.cooMeeting.update({
    where: { id: meeting.id },
    data: { minutes: parsed.data.content, status: parsed.data.status === "PUBLISHED" ? "MINUTES_PUBLISHED" : meeting.status },
  });
  const users = await participantUsers(meeting.participants, meeting.reportOwnerEmployeeId);
  await notifyUsers({
    userIds: users.filter((userId) => userId !== session.userId),
    title: "Compte rendu COO publié",
    body: `Le compte rendu de la réunion ${meeting.title} est disponible.`,
    type: "COO_MEETING",
    targetUrl: "/activities",
  });
  await writeAuditLog({ userId: session.userId, action: "COO_MEETING_MINUTES_PUBLISHED", entity: "CooMeetingMinutes", entityId: minutes.id, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, minutes }, { status: 201 });
}

async function participantUsers(participants: string | null, ownerEmployeeId: string | null) {
  const employeeIds = [...String(participants || "").split(",").map((id) => id.trim()).filter(Boolean), ownerEmployeeId || ""].filter(Boolean);
  if (!employeeIds.length) {
    return [];
  }
  const employees = await prisma.hrcfoEmployee.findMany({
    where: { id: { in: employeeIds }, userId: { not: null } },
    select: { userId: true },
  });
  return employees.map((employee) => employee.userId).filter((userId): userId is string => Boolean(userId));
}
