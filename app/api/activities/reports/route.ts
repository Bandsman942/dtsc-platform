import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const reportSchema = z.object({
  title: z.string().min(2).max(180),
  reportType: z.enum(["DAILY", "WEEKLY", "MONTHLY", "ACTIVITY", "INCIDENT", "BLOCKER", "MEETING", "MISSION", "OTHER"]).default("DAILY"),
  recipientEmployeeId: z.string().min(5),
  departmentId: z.string().max(120).optional().or(z.literal("")),
  operationId: z.string().max(120).optional().or(z.literal("")),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  periodStart: z.string().optional().or(z.literal("")),
  periodEnd: z.string().optional().or(z.literal("")),
  content: z.string().min(10).max(3000),
});

export async function POST(req: Request) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  }
  const employee = await prisma.hrcfoEmployee.findFirst({ where: { userId: user.id, status: { not: "EXITED" } } });
  if (!employee) {
    return NextResponse.json({ error: "Forbidden", message: "Aucun dossier collaborateur actif." }, { status: 403 });
  }
  const parsed = reportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", message: "Le rapport opérationnel est invalide." }, { status: 400 });
  }
  const recipient = await prisma.hrcfoEmployee.findFirst({
    where: { id: parsed.data.recipientEmployeeId, status: { not: "EXITED" } },
    select: { id: true, fullName: true, userId: true },
  });
  if (!recipient) {
    return NextResponse.json({ error: "Invalid recipient", message: "Destinataire collaborateur introuvable." }, { status: 400 });
  }
  const department = parsed.data.departmentId
    ? await prisma.department.findUnique({ where: { id: parsed.data.departmentId }, select: { name: true } })
    : null;
  const report = await prisma.cooOperationalReport.create({
    data: {
      title: parsed.data.title,
      reportType: parsed.data.reportType,
      periodStart: parsed.data.periodStart ? new Date(parsed.data.periodStart) : null,
      periodEnd: parsed.data.periodEnd ? new Date(parsed.data.periodEnd) : null,
      departmentId: parsed.data.departmentId || null,
      departmentName: department?.name || null,
      employeeId: employee.id,
      employeeName: employee.fullName,
      recipientEmployeeId: recipient.id,
      recipientName: recipient.fullName,
      operationId: parsed.data.operationId || null,
      priority: parsed.data.priority,
      content: parsed.data.content,
      status: "PUBLISHED",
      createdById: user.id,
    },
  });
  if (recipient.userId && recipient.userId !== user.id) {
    await prisma.notification.create({
      data: {
        userId: recipient.userId,
        title: "Nouveau rapport opérationnel",
        body: `${employee.fullName} vous a envoyé un rapport: ${parsed.data.title}.`,
        type: "COO_REPORT",
        targetUrl: "/activities",
      },
    });
  }
  await writeApiLog({ request: req, statusCode: 201, userId: user.id, startedAt, metadata: { reportId: report.id } });
  return NextResponse.json({ ok: true, report }, { status: 201 });
}
