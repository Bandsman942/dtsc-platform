import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createCustomChildAccount } from "@/lib/enterprise/accounting/chart-lifecycle-service";
import { createLedgerAccount } from "@/lib/enterprise/accounting/master-service";
import { ledgerAccountCreateSchema } from "@/lib/enterprise/accounting/schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
export async function GET(req: Request, { params }: Params) { const startedAt = Date.now(); const { organizationId } = await params; const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view"); if (!auth.ok) return auth.response; const { page, pageSize, search } = financeListParams(req); const where = { organizationId, archivedAt: null, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" as const } }, { nameFr: { contains: search, mode: "insensitive" as const } }, { nameEn: { contains: search, mode: "insensitive" as const } }] } : {}) }; const [items, total] = await Promise.all([prisma.enterpriseLedgerAccount.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * pageSize, take: pageSize, include: { chart: true, parent: true } }), prisma.enterpriseLedgerAccount.count({ where })]); await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "ledger-accounts", page } }); return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } }); }
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "create", { mutation: true });
  if (!auth.ok) return auth.response;
  const parsed = ledgerAccountCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const chart = await prisma.enterpriseChartOfAccounts.findFirst({ where: { id: parsed.data.chartId, organizationId } });
    if (!chart) return NextResponse.json({ error: "CHART_OF_ACCOUNTS_INVALID", message: "Plan comptable introuvable." }, { status: 409 });
    if (parsed.data.isSystemAccount) return NextResponse.json({ error: "SYSTEM_ACCOUNT_REQUIRES_REINFORCED_PERMISSION", message: "Un compte système ne peut pas être créé depuis ce formulaire." }, { status: 403 });
    const account = chart.templateCode
      ? parsed.data.parentId
        ? await createCustomChildAccount(organizationId, chart.id, auth.session.userId, {
            parentId: parsed.data.parentId,
            code: parsed.data.code,
            nameFr: parsed.data.nameFr,
            nameEn: parsed.data.nameEn,
            currencyCode: parsed.data.currencyCode,
          })
        : null
      : await createLedgerAccount(organizationId, auth.session.userId, parsed.data);
    if (!account) return NextResponse.json({ error: "CUSTOM_ACCOUNT_PARENT_REQUIRED", message: "Un sous-compte personnalisé doit être rattaché à un compte parent du template." }, { status: 409 });
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_LEDGER_ACCOUNT_CREATED", entity: "EnterpriseLedgerAccount", entityId: account.id, request: req, metadata: { organizationId, code: account.code, templateReference: chart.templateCode } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "ledger-accounts" } });
    return NextResponse.json({ ok: true, account }, { status: 201 });
  } catch (error) { return financeErrorResponse(error, "LEDGER_ACCOUNT_CREATE_FAILED"); }
}
