import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

const optionalText = (max = 1200) => z.string().max(max).optional().or(z.literal(""));
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(""));

const workflowSchema = z.discriminatedUnion("workflowType", [
  z.object({
    workflowType: z.literal("COO_MEETING"),
    title: z.string().min(2).max(180),
    meetingType: z.enum(["COORDINATION", "STRATEGIC", "OPERATIONAL", "FOLLOW_UP", "TECHNICAL", "FINANCIAL", "HR", "CLIENT", "OTHER"]).default("COORDINATION"),
    meetingDate: optionalDate,
    meetingTime: optionalText(20),
    duration: optionalText(80),
    participantIds: z.array(z.string().min(5)).default([]),
    operationId: optionalText(120),
    confidentialityLevel: z.enum(["INTERNAL", "CONFIDENTIAL", "STRATEGIC"]).default("INTERNAL"),
    agenda: optionalText(1800),
    minutes: optionalText(2400),
    decisions: optionalText(1800),
    generatedTasks: optionalText(1600),
    comments: optionalText(1800),
  }),
  z.object({
    workflowType: z.literal("LEGAL_CASE"),
    title: z.string().min(2).max(180),
    caseType: z.enum(["CLIENT_CONTRACT", "SUPPLIER_CONTRACT", "ADMINISTRATIVE_DOCUMENT", "DISPUTE", "COMPLIANCE", "SENSITIVE_DATA", "PARTNERSHIP", "EMPLOYMENT_CONTRACT", "OTHER"]).default("OTHER"),
    departmentId: optionalText(120),
    description: z.string().min(5).max(2400),
    reason: optionalText(1600),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    attachmentUrl: optionalText(600),
    linkedEntityType: optionalText(120),
    linkedEntityId: optionalText(120),
    comments: optionalText(1800),
  }),
  z.object({
    workflowType: z.literal("LEGAL_CONTRACT"),
    title: z.string().min(2).max(180),
    contractType: z.enum(["CLIENT_CONTRACT", "SUPPLIER_CONTRACT", "CONSULTING_CONTRACT", "SERVICE_CONTRACT", "PARTNERSHIP_AGREEMENT", "NDA", "MOU", "TECHNICAL_CONTRACT", "OTHER"]).default("SERVICE_CONTRACT"),
    counterparty: optionalText(180),
    departmentId: optionalText(120),
    subject: z.string().min(5).max(1800),
    desiredValidationDate: optionalDate,
    documentUrl: optionalText(600),
    linkedEntityType: optionalText(120),
    linkedEntityId: optionalText(120),
    comments: optionalText(1800),
    strategic: z.coerce.boolean().default(false),
  }),
  z.object({
    workflowType: z.literal("LEGAL_RISK"),
    title: z.string().min(2).max(180),
    source: z.enum(["CONTRACT", "CLIENT", "SUPPLIER", "EMPLOYEE", "PROJECT", "SENSITIVE_DATA", "MEDICAL_DATA", "FINANCE", "OPERATION", "TECHNICAL", "OTHER"]).default("OTHER"),
    departmentId: optionalText(120),
    description: z.string().min(5).max(2400),
    potentialImpact: optionalText(1800),
    urgency: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    linkedEntityType: optionalText(120),
    linkedEntityId: optionalText(120),
    attachmentUrl: optionalText(600),
    comments: optionalText(1800),
  }),
  z.object({
    workflowType: z.literal("LEGAL_DISPUTE"),
    title: z.string().min(2).max(180),
    disputeType: z.enum(["CLIENT", "SUPPLIER", "EMPLOYEE", "PARTNER", "ADMINISTRATION", "TECHNICAL", "FINANCIAL", "OPERATIONAL", "PROJECT", "OTHER"]).default("OTHER"),
    counterparty: optionalText(180),
    departmentId: optionalText(120),
    description: z.string().min(5).max(2400),
    occurredAt: optionalDate,
    potentialImpact: optionalText(1200),
    documentUrl: optionalText(600),
    comments: optionalText(1800),
  }),
  z.object({
    workflowType: z.literal("LEGAL_REQUEST"),
    subject: z.string().min(2).max(180),
    requestType: z.enum(["HR_CONTRACT", "PROJECT_CONTRACT", "SUPPLIER_CONTRACT", "CLIENT_CONTRACT", "OFFICIAL_NOTE", "NDA", "IP_DATA", "DISPUTE", "CONFIDENTIALITY", "SENSITIVE_DATA", "OTHER"]).default("OTHER"),
    description: z.string().min(5).max(2400),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    desiredDueDate: optionalDate,
    documentUrl: optionalText(600),
    linkedEntityType: optionalText(120),
    linkedEntityId: optionalText(120),
    comments: optionalText(1800),
  }),
]);

export async function POST(req: Request) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `activities-workflows:${user.id}`), 40, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: user.id, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de formulaires envoyés. Réessayez plus tard." }, { status: 429 });
  }

  const employee = await prisma.hrcfoEmployee.findFirst({
    where: { userId: user.id, status: { not: "EXITED" } },
    include: { departmentRef: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Forbidden", message: "Aucun dossier collaborateur actif." }, { status: 403 });
  }

  const parsed = workflowSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: user.id, startedAt, metadata: { issues: parsed.error.issues.map((issue) => issue.path.join(".")) } });
    return NextResponse.json({ error: "Invalid payload", message: "Le formulaire est invalide." }, { status: 400 });
  }

  const record = await createWorkflowRecord(parsed.data, employee, user.id);
  const entityType = record.entityType;
  const entityId = record.id;
  if (record.initialComment) {
    await prisma.cooComment.create({
      data: { entityType, entityId, authorId: user.id, content: record.initialComment },
    });
  }
  await notifyWorkflowRecipients(user.id, entityType, entityId, record.notificationTitle, record.notificationBody, record.extraUserIds);
  await writeAuditLog({ userId: user.id, action: `${entityType}_CREATED_FROM_ACTIVITIES`, entity: entityType, entityId, request: req, metadata: { sourceModule: "ACTIVITES_DTSC" } });
  await writeApiLog({ request: req, statusCode: 201, userId: user.id, startedAt, metadata: { entityType, entityId } });
  return NextResponse.json({ ok: true, entityType, entityId, message: "Formulaire transmis." }, { status: 201 });
}

async function createWorkflowRecord(data: z.infer<typeof workflowSchema>, employee: Awaited<ReturnType<typeof prisma.hrcfoEmployee.findFirst>> & { departmentRef?: { name: string } | null }, userId: string) {
  if (!employee) {
    throw new Error("Missing employee");
  }
  const departmentId = "departmentId" in data && data.departmentId ? data.departmentId : employee.departmentId;
  const department = departmentId ? await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true } }) : null;
  const departmentName = department?.name || employee.department || employee.departmentRef?.name || null;
  const common = {
    sourceModule: "ACTIVITES_DTSC",
    targetSection: data.workflowType === "COO_MEETING" ? "COO" : "LA",
    createdById: userId,
  };

  if (data.workflowType === "COO_MEETING") {
    const participants = uniqueValues([employee.id, ...data.participantIds]).join(",");
    const record = await prisma.cooMeeting.create({
      data: {
        title: data.title,
        meetingType: data.meetingType,
        meetingDate: data.meetingDate ? new Date(data.meetingDate) : null,
        meetingTime: data.duration ? `${data.meetingTime || ""}${data.meetingTime ? " · " : ""}${data.duration}` : data.meetingTime || null,
        departmentId: employee.departmentId,
        departmentName,
        participants,
        agenda: data.agenda,
        decisions: data.decisions,
        generatedTasks: data.generatedTasks,
        reportOwnerEmployeeId: employee.id,
        reportOwnerName: employee.fullName,
        status: data.minutes ? "MINUTES_PUBLISHED" : "PLANNED",
        minutes: data.minutes,
        confidentialityLevel: data.confidentialityLevel,
        ...common,
      },
    });
    return {
      entityType: "MEETING",
      id: record.id,
      extraUserIds: await employeesToUserIds(data.participantIds),
      notificationTitle: "Nouvelle réunion DTSC",
      notificationBody: `${employee.fullName} a créé la réunion ${data.title}.`,
      initialComment: data.comments,
    };
  }

  if (data.workflowType === "LEGAL_CASE") {
    const record = await prisma.legalCase.create({
      data: {
        title: data.title,
        caseType: data.caseType,
        requesterDepartmentId: departmentId || null,
        requesterDepartmentName: departmentName,
        requesterEmployeeId: employee.id,
        requesterName: employee.fullName,
        subject: data.reason || data.title,
        description: data.description,
        priority: data.priority,
        status: "SUBMITTED",
        linkedEntityType: data.linkedEntityType || null,
        linkedEntityId: data.linkedEntityId || null,
        attachmentUrl: data.attachmentUrl || null,
        comments: data.comments,
        ...common,
      },
    });
    return legalResult("LEGAL_CASE", record.id, "Nouveau dossier juridique soumis", `${employee.fullName} a soumis le dossier ${data.title}.`, data.comments);
  }

  if (data.workflowType === "LEGAL_CONTRACT") {
    const record = await prisma.legalContract.create({
      data: {
        title: data.title,
        contractType: data.contractType,
        counterparty: data.counterparty || null,
        requesterDepartmentId: departmentId || null,
        requesterDepartmentName: departmentName,
        internalResponsibleId: employee.id,
        internalResponsibleName: employee.fullName,
        endDate: data.desiredValidationDate ? new Date(data.desiredValidationDate) : null,
        status: "LEGAL_REVIEW",
        documentUrl: data.documentUrl || null,
        legalValidation: null,
        ceoValidationRequired: data.strategic,
        comments: [data.subject, data.comments].filter(Boolean).join("\n\n"),
        ...common,
      },
    });
    return legalResult("LEGAL_CONTRACT", record.id, "Nouveau contrat soumis au LA", `${employee.fullName} a soumis ${data.title}.`, data.comments);
  }

  if (data.workflowType === "LEGAL_RISK") {
    const record = await prisma.legalRisk.create({
      data: {
        title: data.title,
        source: data.source,
        departmentId: departmentId || null,
        departmentName,
        linkedEntityType: data.linkedEntityType || null,
        linkedEntityId: data.linkedEntityId || null,
        description: data.description,
        potentialImpact: data.potentialImpact,
        riskLevel: data.urgency === "CRITICAL" ? "HIGH" : "MEDIUM",
        status: "OPEN",
        comments: [data.attachmentUrl ? `Document: ${data.attachmentUrl}` : "", data.comments].filter(Boolean).join("\n\n"),
        ...common,
      },
    });
    return legalResult("LEGAL_RISK", record.id, "Nouveau risque juridique signalé", `${employee.fullName} a signalé le risque ${data.title}.`, data.comments);
  }

  if (data.workflowType === "LEGAL_DISPUTE") {
    const record = await prisma.legalDispute.create({
      data: {
        title: data.title,
        counterparty: data.counterparty || null,
        disputeType: data.disputeType,
        departmentId: departmentId || null,
        departmentName,
        description: [data.occurredAt ? `Date de survenue: ${data.occurredAt}` : "", data.description].filter(Boolean).join("\n\n"),
        nextAction: data.potentialImpact || null,
        status: "OPEN",
        documentUrl: data.documentUrl || null,
        comments: data.comments,
        ...common,
      },
    });
    return legalResult("LEGAL_DISPUTE", record.id, "Nouveau litige soumis", `${employee.fullName} a soumis le litige ${data.title}.`, data.comments);
  }

  const record = await prisma.legalRequest.create({
    data: {
      subject: data.subject,
      requesterDepartmentId: departmentId || null,
      requesterDepartmentName: departmentName,
      requesterEmployeeId: employee.id,
      requesterName: employee.fullName,
      requestType: data.requestType,
      description: data.description,
      priority: data.priority,
      desiredDueDate: data.desiredDueDate ? new Date(data.desiredDueDate) : null,
      documentUrl: data.documentUrl || null,
      linkedEntityType: data.linkedEntityType || null,
      linkedEntityId: data.linkedEntityId || null,
      status: "SUBMITTED",
      comments: data.comments,
      ...common,
    },
  });
  return legalResult("LEGAL_REQUEST", record.id, "Nouvelle demande juridique interne", `${employee.fullName} a envoyé la demande ${data.subject}.`, data.comments);
}

function legalResult(entityType: string, id: string, notificationTitle: string, notificationBody: string, initialComment?: string) {
  return { entityType, id, extraUserIds: [] as string[], notificationTitle, notificationBody, initialComment };
}

async function notifyWorkflowRecipients(senderId: string, entityType: string, entityId: string, title: string, body: string, extraUserIds: string[]) {
  const position = entityType === "MEETING" ? "COO" : "LA";
  const recipients = uniqueValues([...(await employeesByPosition(position)), ...extraUserIds]).filter((userId) => userId !== senderId);
  for (const userId of recipients) {
    await prisma.notification.create({
      data: { userId, title, body: body.slice(0, 220), type: `ACTIVITY_${entityType}`, targetUrl: `/activities?entityType=${entityType}&entityId=${entityId}` },
    });
  }
}

async function employeesByPosition(positionCode: string) {
  const codes = positionCode === "LA" ? ["LA", "LEGAL_ADVISOR"] : [positionCode];
  const employees = await prisma.hrcfoEmployee.findMany({
    where: { status: { not: "EXITED" }, OR: [{ positionCode: { in: codes } }, { position: { is: { code: { in: codes } } } }] },
    select: { userId: true },
  });
  return employees.map((employee) => employee.userId).filter((id): id is string => Boolean(id));
}

async function employeesToUserIds(employeeIds: string[]) {
  if (employeeIds.length === 0) {
    return [];
  }
  const employees = await prisma.hrcfoEmployee.findMany({ where: { id: { in: employeeIds } }, select: { userId: true } });
  return employees.map((employee) => employee.userId).filter((id): id is string => Boolean(id));
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
