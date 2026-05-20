import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const decisionSchema = z.object({
  decisionText: z.string().min(3).max(1800),
  responsibleUserId: z.string().max(120).optional().nullable().or(z.literal("")),
  dueDate: z.coerce.date().optional().nullable(),
  createTask: z.coerce.boolean().default(false),
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
  const parsed = decisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Décision invalide." }, { status: 400 });
  }

  const decision = await prisma.$transaction(async (tx) => {
    const createdDecision = await tx.cooMeetingDecision.create({
      data: {
        meetingId: meeting.id,
        decisionText: parsed.data.decisionText,
        responsibleUserId: parsed.data.responsibleUserId || null,
        dueDate: parsed.data.dueDate || null,
      },
    });
    if (parsed.data.createTask) {
      const task = await tx.cooTask.create({
        data: {
          title: `Suivi décision - ${meeting.title}`.slice(0, 180),
          description: parsed.data.decisionText,
          taskType: "MEETING",
          plannedDate: parsed.data.dueDate || meeting.meetingDate,
          priority: "NORMAL",
          status: "TODO",
          createdById: session.userId,
          sourceMeetingId: meeting.id,
          sourceDecisionId: createdDecision.id,
        },
      });
      await tx.cooMeetingDecision.update({ where: { id: createdDecision.id }, data: { linkedTaskId: task.id } });
      return { ...createdDecision, linkedTaskId: task.id };
    }
    return createdDecision;
  });

  if (parsed.data.responsibleUserId) {
    await notifyUser({
      userId: parsed.data.responsibleUserId,
      title: "Décision COO assignée",
      body: `Une décision de réunion vous a été assignée: ${meeting.title}.`,
      type: "COO_MEETING",
      targetUrl: "/activities",
    });
  }
  await writeAuditLog({ userId: session.userId, action: "COO_MEETING_DECISION_CREATED", entity: "CooMeetingDecision", entityId: decision.id, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, decision }, { status: 201 });
}
