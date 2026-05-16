import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { laSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string }> };
type LaEntity = keyof typeof laSchemas;

function isLaEntity(value: string): value is LaEntity {
  return value === "cases" || value === "contracts" || value === "templates" || value === "risks" || value === "documents" || value === "disputes" || value === "requests" || value === "reports";
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("la");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès LA refusé." }, { status: 403 });
  }

  const { entity } = await params;
  if (!isLaEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown LA entity", message: "Module LA introuvable." }, { status: 404 });
  }

  const parsed = laSchemas[entity].safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity } });
    return NextResponse.json({ error: "Invalid LA payload", message: "Les données juridiques sont invalides." }, { status: 400 });
  }

  try {
    const record = await createRecord(entity, { ...parsed.data, createdById: session.userId });
    await notifyLaRecipients(entity, record.id, session.userId);
    await writeAuditLog({ userId: session.userId, action: `LA_${entity.toUpperCase()}_CREATED`, entity, entityId: record.id, request: req });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { entity } });
    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Création LA impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, message } });
    return NextResponse.json({ error: "LA_RULE_FAILED", message }, { status: 400 });
  }
}

async function createRecord(entity: LaEntity, data: Record<string, unknown>) {
  const enriched = await enrichLegalData(data);
  if (entity === "cases") {
    return prisma.legalCase.create({ data: enriched as never });
  }
  if (entity === "contracts") {
    return prisma.legalContract.create({ data: enriched as never });
  }
  if (entity === "templates") {
    return prisma.legalTemplate.create({ data: enriched as never });
  }
  if (entity === "risks") {
    return prisma.legalRisk.create({ data: enriched as never });
  }
  if (entity === "documents") {
    return prisma.legalDocument.create({ data: enriched as never });
  }
  if (entity === "disputes") {
    return prisma.legalDispute.create({ data: enriched as never });
  }
  if (entity === "requests") {
    return prisma.legalRequest.create({ data: enriched as never });
  }
  return prisma.legalReport.create({ data: enriched as never });
}

async function enrichLegalData(data: Record<string, unknown>) {
  const enriched = normalizeEmptyStrings(data);
  for (const [field, nameField] of [
    ["requesterEmployeeId", "requesterName"],
    ["responsibleLegalId", "responsibleLegalName"],
    ["internalResponsibleId", "internalResponsibleName"],
    ["authorId", "authorName"],
    ["responsibleEmployeeId", "responsibleName"],
    ["followUpResponsibleId", "followUpResponsibleName"],
  ] as const) {
    if (field in enriched) {
      enriched[nameField] = await employeeName(enriched[field]);
    }
  }
  for (const [field, nameField] of [
    ["requesterDepartmentId", "requesterDepartmentName"],
    ["departmentId", "departmentName"],
  ] as const) {
    if (field in enriched) {
      enriched[nameField] = await departmentName(enriched[field]);
    }
  }
  return enriched;
}

async function employeeName(id: unknown) {
  const value = typeof id === "string" ? id.trim() : "";
  if (!value) {
    return null;
  }
  const employee = await prisma.hrcfoEmployee.findFirst({ where: { id: value, status: { not: "EXITED" } }, select: { fullName: true } });
  if (!employee) {
    throw new Error("Le collaborateur sélectionné est introuvable ou sorti.");
  }
  return employee.fullName;
}

async function departmentName(id: unknown) {
  const value = typeof id === "string" ? id.trim() : "";
  if (!value) {
    return null;
  }
  const department = await prisma.department.findUnique({ where: { id: value }, select: { name: true, status: true } });
  if (!department || department.status !== "ACTIVE") {
    throw new Error("Le département sélectionné est inactif ou introuvable.");
  }
  return department.name;
}

function normalizeEmptyStrings(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === "" ? null : value]));
}

async function notifyLaRecipients(entity: LaEntity, recordId: string, senderId: string) {
  const payload = await notificationPayload(entity, recordId);
  await notifyPosition("LA", senderId, "LA: nouvel élément juridique", `${payload.title} · ${payload.status || ""}`, "LA_LEGAL");
  await notifyEmployees(payload.employeeIds, senderId, "Suivi juridique DTSC", `${payload.title} · ${payload.status || ""}`, `LA_${entity.toUpperCase()}`);
  if (payload.critical || payload.ceoRequired) {
    await notifyPosition("CEO", senderId, "Alerte juridique critique", payload.title, "LA_CRITICAL");
  }
}

async function notificationPayload(entity: LaEntity, recordId: string) {
  if (entity === "cases") {
    const record = await prisma.legalCase.findUnique({ where: { id: recordId }, select: { title: true, status: true, priority: true, riskLevel: true, requesterEmployeeId: true, responsibleLegalId: true, ceoValidationRequired: true } });
    return { title: record?.title || "Dossier juridique", status: record?.status, employeeIds: [record?.requesterEmployeeId, record?.responsibleLegalId], critical: record?.priority === "CRITICAL" || record?.riskLevel === "CRITICAL", ceoRequired: Boolean(record?.ceoValidationRequired) };
  }
  if (entity === "contracts") {
    const record = await prisma.legalContract.findUnique({ where: { id: recordId }, select: { title: true, status: true, internalResponsibleId: true, ceoValidationRequired: true } });
    return { title: record?.title || "Contrat juridique", status: record?.status, employeeIds: [record?.internalResponsibleId], critical: false, ceoRequired: Boolean(record?.ceoValidationRequired) };
  }
  if (entity === "risks") {
    const record = await prisma.legalRisk.findUnique({ where: { id: recordId }, select: { title: true, status: true, riskLevel: true, responsibleEmployeeId: true, ceoEscalation: true } });
    return { title: record?.title || "Risque juridique", status: record?.status, employeeIds: [record?.responsibleEmployeeId], critical: record?.riskLevel === "CRITICAL", ceoRequired: Boolean(record?.ceoEscalation) };
  }
  if (entity === "disputes") {
    const record = await prisma.legalDispute.findUnique({ where: { id: recordId }, select: { title: true, status: true, riskLevel: true, followUpResponsibleId: true } });
    return { title: record?.title || "Litige", status: record?.status, employeeIds: [record?.followUpResponsibleId], critical: record?.riskLevel === "CRITICAL", ceoRequired: false };
  }
  if (entity === "requests") {
    const record = await prisma.legalRequest.findUnique({ where: { id: recordId }, select: { subject: true, status: true, priority: true, requesterEmployeeId: true } });
    return { title: record?.subject || "Demande juridique", status: record?.status, employeeIds: [record?.requesterEmployeeId], critical: record?.priority === "CRITICAL", ceoRequired: false };
  }
  if (entity === "reports") {
    const record = await prisma.legalReport.findUnique({ where: { id: recordId }, select: { title: true, status: true, priority: true, responsibleLegalId: true } });
    return { title: record?.title || "Rapport juridique", status: record?.status, employeeIds: [record?.responsibleLegalId], critical: record?.priority === "CRITICAL", ceoRequired: false };
  }
  if (entity === "templates") {
    const record = await prisma.legalTemplate.findUnique({ where: { id: recordId }, select: { name: true, status: true, authorId: true } });
    return { title: record?.name || "Modèle juridique", status: record?.status, employeeIds: [record?.authorId], critical: false, ceoRequired: false };
  }
  const record = await prisma.legalDocument.findUnique({ where: { id: recordId }, select: { title: true, status: true, confidentialityLevel: true } });
  return { title: record?.title || "Document juridique", status: record?.status, employeeIds: [], critical: record?.confidentialityLevel === "CEO_ONLY" || record?.confidentialityLevel === "LA_CEO_ONLY", ceoRequired: record?.confidentialityLevel === "CEO_ONLY" || record?.confidentialityLevel === "LA_CEO_ONLY" };
}

async function notifyEmployees(employeeIds: Array<string | null | undefined>, senderId: string, title: string, body: string, type: string) {
  const ids = employeeIds.filter((id): id is string => Boolean(id));
  if (!ids.length) {
    return;
  }
  const employees = await prisma.hrcfoEmployee.findMany({ where: { id: { in: ids } }, select: { userId: true } });
  await notifyUserIds(employees.map((employee) => employee.userId), senderId, title, body, type);
}

async function notifyPosition(positionCode: string, senderId: string, title: string, body: string, type: string) {
  const codes = positionCode === "LA" ? ["LA", "LEGAL_ADVISOR"] : [positionCode];
  const employees = await prisma.hrcfoEmployee.findMany({
    where: { status: { not: "EXITED" }, OR: [{ positionCode: { in: codes } }, { position: { is: { code: { in: codes } } } }] },
    select: { userId: true },
  });
  await notifyUserIds(employees.map((employee) => employee.userId), senderId, title, body, type);
}

async function notifyUserIds(userIds: Array<string | null>, senderId: string, title: string, body: string, type: string) {
  const recipients = [...new Set(userIds.filter((id): id is string => Boolean(id) && id !== senderId))];
  for (const userId of recipients) {
    await prisma.notification.create({ data: { userId, title, body: body.slice(0, 220), type, targetUrl: "/activities" } });
  }
}
