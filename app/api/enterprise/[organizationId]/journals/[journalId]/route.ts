import { z } from "zod";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { JOURNAL_TYPES } from "@/lib/enterprise/accounting/constants";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  code: z.string().trim().min(2).max(30),
  nameFr: z.string().trim().min(2).max(160),
  nameEn: z.string().trim().min(2).max(160),
  journalType: z.enum(JOURNAL_TYPES),
  sequencePrefix: z.string().trim().max(20).nullish(),
  requiresApproval: z.boolean(),
  isActive: z.boolean(),
  revision: z.coerce.number().int().positive(),
});
const deleteSchema = z.object({ revision: z.coerce.number().int().positive() });

type Params = { params: Promise<{ organizationId: string; journalId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, journalId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;
  const item = await prisma.enterpriseJournal.findFirst({ where: { id: journalId, organizationId }, include: { _count: { select: { entries: true } } } });
  if (!item) return NextResponse.json({ error: "JOURNAL_NOT_FOUND", message: "Ce journal n’existe pas dans votre entreprise." }, { status: 404 });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, journalId, domain: "journal-detail" } });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, journalId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_JOURNAL", message: parsed.error.issues[0]?.message || "Vérifiez les informations du journal." }, { status: 400 });
  try {
    const current = await prisma.enterpriseJournal.findFirst({ where: { id: journalId, organizationId } });
    if (!current) return NextResponse.json({ error: "JOURNAL_NOT_FOUND", message: "Ce journal n’existe pas dans votre entreprise." }, { status: 404 });
    if (current.revision !== parsed.data.revision) return NextResponse.json({ error: "JOURNAL_REVISION_CONFLICT", message: "Ce journal a été modifié. Actualisez les données avant de réessayer." }, { status: 409 });
    const item = await prisma.enterpriseJournal.update({ where: { id: current.id }, data: { code: parsed.data.code, nameFr: parsed.data.nameFr, nameEn: parsed.data.nameEn, journalType: parsed.data.journalType, sequencePrefix: parsed.data.sequencePrefix || null, requiresApproval: parsed.data.requiresApproval, isActive: parsed.data.isActive, revision: { increment: 1 } } });
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_JOURNAL_UPDATED", entity: "EnterpriseJournal", entityId: item.id, request: req, metadata: { organizationId, code: item.code, active: item.isActive } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, journalId, domain: "journal-detail" } });
    return NextResponse.json({ ok: true, item });
  } catch (error) { return financeErrorResponse(error, "JOURNAL_UPDATE_FAILED"); }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, journalId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REVISION", message: "Actualisez le journal avant de demander sa suppression." }, { status: 400 });
  try {
    const journal = await prisma.enterpriseJournal.findFirst({ where: { id: journalId, organizationId }, include: { _count: { select: { entries: true } } } });
    if (!journal) return NextResponse.json({ error: "JOURNAL_NOT_FOUND", message: "Ce journal n’existe pas dans votre entreprise." }, { status: 404 });
    if (journal.revision !== parsed.data.revision) return NextResponse.json({ error: "JOURNAL_REVISION_CONFLICT", message: "Ce journal a été modifié. Actualisez les données avant de réessayer." }, { status: 409 });
    if (journal._count.entries > 0) return NextResponse.json({ error: "JOURNAL_DELETE_BLOCKED", message: "Ce journal contient déjà des écritures et doit rester dans l’historique. Désactivez-le plutôt que de le supprimer." }, { status: 409 });
    await prisma.enterpriseJournal.delete({ where: { id: journal.id } });
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_JOURNAL_DELETED", entity: "EnterpriseJournal", entityId: journal.id, request: req, metadata: { organizationId, code: journal.code } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, journalId, domain: "journal-detail" } });
    return NextResponse.json({ ok: true });
  } catch (error) { return financeErrorResponse(error, "JOURNAL_DELETE_FAILED"); }
}
