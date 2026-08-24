import { z } from "zod";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  fiscalYearId: z.string().min(1),
  code: z.string().trim().min(2).max(30),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  revision: z.coerce.number().int().positive(),
}).refine((value) => value.endDate > value.startDate, { message: "La date de fin doit être postérieure à la date de début." });
const deleteSchema = z.object({ revision: z.coerce.number().int().positive() });

type Params = { params: Promise<{ organizationId: string; fiscalPeriodId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, fiscalPeriodId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;
  const item = await prisma.enterpriseFiscalPeriod.findFirst({ where: { id: fiscalPeriodId, organizationId }, include: { fiscalYear: true, closes: { orderBy: { createdAt: "desc" } }, _count: { select: { journalEntries: true, openingBalanceImports: true } } } });
  if (!item) return NextResponse.json({ error: "FISCAL_PERIOD_NOT_FOUND", message: "Cette période n’existe pas dans votre entreprise." }, { status: 404 });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, fiscalPeriodId, domain: "fiscal-period-detail" } });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, fiscalPeriodId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_FISCAL_PERIOD", message: parsed.error.issues[0]?.message || "Vérifiez l’exercice et les dates de la période." }, { status: 400 });
  try {
    const item = await prisma.$transaction(async (tx) => {
      const period = await tx.enterpriseFiscalPeriod.findFirst({ where: { id: fiscalPeriodId, organizationId }, include: { _count: { select: { journalEntries: true, closes: true, openingBalanceImports: true } } } });
      if (!period) throw new Error("NOT_FOUND");
      if (period.status !== "OPEN" || period._count.journalEntries > 0 || period._count.closes > 0 || period._count.openingBalanceImports > 0) throw new Error("NOT_EDITABLE");
      if (period.revision !== parsed.data.revision) throw new Error("REVISION_CONFLICT");
      const year = await tx.enterpriseFiscalYear.findFirst({ where: { id: parsed.data.fiscalYearId, organizationId, status: { in: ["DRAFT", "OPEN"] } } });
      if (!year || parsed.data.startDate < year.startDate || parsed.data.endDate > year.endDate) throw new Error("OUTSIDE_YEAR");
      const overlap = await tx.enterpriseFiscalPeriod.findFirst({ where: { organizationId, id: { not: period.id }, startDate: { lte: parsed.data.endDate }, endDate: { gte: parsed.data.startDate } } });
      if (overlap) throw new Error("OVERLAP");
      return tx.enterpriseFiscalPeriod.update({ where: { id: period.id }, data: { fiscalYearId: year.id, code: parsed.data.code, startDate: parsed.data.startDate, endDate: parsed.data.endDate, updatedByUserId: auth.session.userId, revision: { increment: 1 } } });
    });
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_FISCAL_PERIOD_UPDATED", entity: "EnterpriseFiscalPeriod", entityId: item.id, request: req, metadata: { organizationId, code: item.code } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, fiscalPeriodId, domain: "fiscal-period-detail" } });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "FISCAL_PERIOD_NOT_FOUND", message: "Cette période n’existe pas dans votre entreprise." }, { status: 404 });
    if (code === "NOT_EDITABLE") return NextResponse.json({ error: "FISCAL_PERIOD_NOT_EDITABLE", message: "Cette période contient déjà des écritures, une clôture ou des soldes d’ouverture. Ses dates ne peuvent plus être modifiées ; utilisez les workflows de clôture ou réouverture prévus." }, { status: 409 });
    if (code === "REVISION_CONFLICT") return NextResponse.json({ error: "FISCAL_PERIOD_REVISION_CONFLICT", message: "Cette période a été modifiée. Actualisez les données avant de réessayer." }, { status: 409 });
    if (code === "OUTSIDE_YEAR") return NextResponse.json({ error: "FISCAL_PERIOD_OUTSIDE_YEAR", message: "La période doit rester entièrement comprise dans l’exercice sélectionné." }, { status: 409 });
    if (code === "OVERLAP") return NextResponse.json({ error: "FISCAL_PERIOD_OVERLAP", message: "Les dates choisies chevauchent une autre période comptable." }, { status: 409 });
    return financeErrorResponse(error, "FISCAL_PERIOD_UPDATE_FAILED");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, fiscalPeriodId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REVISION", message: "Actualisez la période avant de demander sa suppression." }, { status: 400 });
  try {
    const period = await prisma.enterpriseFiscalPeriod.findFirst({ where: { id: fiscalPeriodId, organizationId }, include: { _count: { select: { journalEntries: true, closes: true, openingBalanceImports: true } } } });
    if (!period) return NextResponse.json({ error: "FISCAL_PERIOD_NOT_FOUND", message: "Cette période n’existe pas dans votre entreprise." }, { status: 404 });
    if (period.revision !== parsed.data.revision) return NextResponse.json({ error: "FISCAL_PERIOD_REVISION_CONFLICT", message: "Cette période a été modifiée. Actualisez les données avant de réessayer." }, { status: 409 });
    if (period.status !== "OPEN" || period._count.journalEntries > 0 || period._count.closes > 0 || period._count.openingBalanceImports > 0) return NextResponse.json({ error: "FISCAL_PERIOD_DELETE_BLOCKED", message: "Une période déjà utilisée ou engagée dans une clôture doit rester dans l’historique. Seule une période ouverte et encore inutilisée peut être supprimée." }, { status: 409 });
    await prisma.enterpriseFiscalPeriod.delete({ where: { id: period.id } });
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_FISCAL_PERIOD_DELETED", entity: "EnterpriseFiscalPeriod", entityId: period.id, request: req, metadata: { organizationId, code: period.code } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, fiscalPeriodId, domain: "fiscal-period-detail" } });
    return NextResponse.json({ ok: true });
  } catch (error) { return financeErrorResponse(error, "FISCAL_PERIOD_DELETE_FAILED"); }
}
