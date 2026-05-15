import { NextResponse } from "next/server";
import { UserRole, UserStatus } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const blockerSchema = z.object({
  title: z.string().min(2).max(180),
  description: z.string().min(5).max(1800),
  sourceType: z.enum(["TASK", "OPERATION", "DEPARTMENT_REQUEST", "HR", "FINANCE", "TECHNICAL", "INFORMATION", "VALIDATION_DELAY", "OTHER"]).default("OTHER"),
  taskId: z.string().max(120).optional().or(z.literal("")),
  operationId: z.string().max(120).optional().or(z.literal("")),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  impact: z.string().max(1200).optional().or(z.literal("")),
  correctiveAction: z.string().max(1200).optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  }
  const employee = await prisma.hrcfoEmployee.findFirst({ where: { userId: user.id, status: { not: "EXITED" } } });
  if (!employee || !employee.departmentId) {
    return NextResponse.json({ error: "Forbidden", message: "Aucun dossier collaborateur ou département actif." }, { status: 403 });
  }
  const parsed = blockerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", message: "Le blocage déclaré est invalide." }, { status: 400 });
  }
  const blocker = await prisma.cooBlocker.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      sourceType: parsed.data.sourceType,
      taskId: parsed.data.taskId || null,
      operationId: parsed.data.operationId || null,
      departmentId: employee.departmentId,
      departmentName: employee.department,
      responsibleEmployeeId: employee.id,
      responsibleName: employee.fullName,
      severity: parsed.data.severity,
      impact: parsed.data.impact || null,
      correctiveAction: parsed.data.correctiveAction || "Analyse COO demandée.",
      status: "OPEN",
      declaredAt: new Date(),
      createdById: user.id,
    },
  });
  const admins = await prisma.user.findMany({
    where: { role: { in: [UserRole.ADMIN, UserRole.MANAGER] }, status: UserStatus.ACTIVE },
    select: { id: true },
    take: 50,
  });
  for (const admin of admins) {
    if (admin.id !== user.id) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          title: "Nouveau blocage opérationnel",
          body: `${employee.fullName} a déclaré un blocage: ${parsed.data.title}.`,
          type: "COO_BLOCKER",
          targetUrl: "/admin?section=coo",
        },
      });
    }
  }
  await writeApiLog({ request: req, statusCode: 201, userId: user.id, startedAt, metadata: { blockerId: blocker.id } });
  return NextResponse.json({ ok: true, blocker }, { status: 201 });
}
