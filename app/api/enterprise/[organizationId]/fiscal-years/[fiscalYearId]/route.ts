import { z } from "zod";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  code: z.string().trim().min(2).max(30),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  revision: z.coerce.number().int().positive(),
}).refine((value) => value.endDate > value.startDate, { message: "La date de fin doit être postérieure à la date de début." });
const deleteSchema = z.object({ revision: z.coerce.number().int().positive() });

type Params = { params: Promise<{ organizationId: string; fiscalYearId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, fiscalYearId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;
  const item = await prisma.enterpriseFiscalYear.findFirst({ where: { id: fiscalYearId, organizationId }, include: { periods: { orderBy: { startDate: "asc" } } } });
  if (!item) return NextResponse.json({ error: "FISCAL_YEAR_NOT_FOUND", message: "Cet exercice n’existe pas dans votre entreprise." }, { status: 404 });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, fiscalYearId, domain: "fiscal-year-detail" } });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, fiscalYearId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_FISCAL_YEAR", message: parsed.error.issues[0]?.message || "Vérifiez les dates et le code de l’exercice." }, { status: 400 });
  try {
    const item = await prisma.$transaction(async (tx) => {
      const year = await tx.enterpriseFiscalYear.findFirst({ where: { id: fiscalYearId, organizationId }, include: { periods: true } });
      if (!year) throw new Error("NOT_FOUND");
      if (year.status !== "DRAFT") throw new Error("NOT_EDITABLE");
      if (year.revision !== parsed.data.revision) throw new Error("REVISION_CONFLICT");
      const overlap = await tx.enterpriseFiscalYear.findFirst({ where: { organizationId, id: { not: year.id }, startDate: { lte: parsed.data.endDate }, endDate: { gte: parsed.data.startDate } } });
      if (overlap) throw new Error("OVERLAP");
      if (year.periods.some((period) => period.startDate < parsed.data.startDate || period.endDate > parsed.data.endDate)) throw new Error("PERIOD_OUTSIDE");
      return tx.enterpriseFiscalYear.update({ where: { id: year.id }, data: { code: parsed.data.code, startDate: parsed.data.startDate, endDate: parsed.data.endDate, revision: { increment: 1 } } });
    });
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_FISCAL_YEAR_UPDATED", entity: "EnterpriseFiscalYear", entityId: item.id, request: req, metadata: { organizationId, code: item.code } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, fiscalYearId, domain: "fiscal-year-detail" } });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "FISCAL_YEAR_NOT_FOUND", message: "Cet exercice n’existe pas dans votre entreprise." }, { status: 404 });
    if (code === "NOT_EDITABLE") return NextResponse.json({ error: "FISCAL_YEAR_NOT_EDITABLE", message: "Un exercice déjà ouvert ou clôturé ne peut plus être redaté. Créez un nouvel exercice ou utilisez le workflow de clôture approprié." }, { status: 409 });
    if (code === "REVISION_CONFLICT") return NextResponse.json({ error: "FISCAL_YEAR_REVISION_CONFLICT", message: "Cet exercice a été modifié depuis votre dernière lecture. Actualisez les données avant de réessayer." }, { status: 409 });
    if (code === "OVERLAP") return NextResponse.json({ error: "FISCAL_YEAR_OVERLAP", message: "Les dates choisies chevauchent un autre exercice de l’entreprise." }, { status: 409 });
    if (code === "PERIOD_OUTSIDE") return NextResponse.json({ error: "FISCAL_PERIOD_OUTSIDE_YEAR", message: "Une période existante se trouverait hors des nouvelles dates de l’exercice. Ajustez d’abord les périodes concernées." }, { status: 409 });
    return financeErrorResponse(error, "FISCAL_YEAR_UPDATE_FAILED");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, fiscalYearId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REVISION", message: "Actualisez l’exercice avant de demander sa suppression." }, { status: 400 });
  try {
    const year = await prisma.enterpriseFiscalYear.findFirst({ where: { id: fiscalYearId, organizationId }, include: { _count: { select: { periods: true } } } });
    if (!year) return NextResponse.json({ error: "FISCAL_YEAR_NOT_FOUND", message: "Cet exercice n’existe pas dans votre entreprise." }, { status: 404 });
    if (year.revision !== parsed.data.revision) return NextResponse.json({ error: "FISCAL_YEAR_REVISION_CONFLICT", message: "Cet exercice a été modifié. Actualisez les données avant de réessayer." }, { status: 409 });
    if (year.status !== "DRAFT" || year._count.periods > 0) return NextResponse.json({ error: "FISCAL_YEAR_DELETE_BLOCKED", message: "Seul un exercice encore en brouillon et sans période peut être supprimé. Les exercices utilisés doivent rester dans l’historique comptable." }, { status: 409 });
    await prisma.enterpriseFiscalYear.delete({ where: { id: year.id } });
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_FISCAL_YEAR_DELETED", entity: "EnterpriseFiscalYear", entityId: year.id, request: req, metadata: { organizationId, code: year.code } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, fiscalYearId, domain: "fiscal-year-detail" } });
    return NextResponse.json({ ok: true });
  } catch (error) { return financeErrorResponse(error, "FISCAL_YEAR_DELETE_FAILED"); }
}
