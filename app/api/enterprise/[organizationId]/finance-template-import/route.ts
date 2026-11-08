import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { createCustomChildAccountTx } from "@/lib/enterprise/accounting/chart-lifecycle-service";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { FinanceImportError, parseFinanceImportFile, previewFinanceImport, type FinanceImportKind } from "@/lib/enterprise/accounting/finance-template-import";
import { createTaxCodeTx } from "@/lib/enterprise/accounting/master-service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
export const runtime = "nodejs";

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > 2 * 1024 * 1024 + 100_000) return NextResponse.json({ error: "FINANCE_IMPORT_TOO_LARGE", message: "Le modèle dépasse 2 Mo." }, { status: 413 });
  // Authorize the module BEFORE parsing attacker-controlled multipart content.
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "tax" && kind !== "accounts") return NextResponse.json({ error: "FINANCE_IMPORT_INVALID_KIND", message: "Choisissez un modèle de référentiel autorisé." }, { status: 400 });
  const importKind = kind as FinanceImportKind;
  const auth = await authorizeFinanceRequest(req, organizationId, importKind === "tax" ? "FINANCE_TAX" : "FINANCE_ACCOUNTING", "create", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  // No anonymous reads, cross-site mutations or bulk posting of immutable records.
  const form = await req.formData().catch(() => null);
  const mode = form?.get("mode");
  if (form?.get("kind") !== kind || (mode !== "preview" && mode !== "commit") || !(form?.get("file") instanceof File)) {
    return NextResponse.json({ error: "FINANCE_IMPORT_INVALID", message: "Choisissez un modèle CSV ou Excel et une opération valide." }, { status: 400 });
  }
  const locale = req.headers.get("accept-language")?.startsWith("en") ? "en" : "fr";
  const tr = (fr: string, en: string) => locale === "en" ? en : fr;
  try {
    const file = form.get("file") as File;
    const lines = await parseFinanceImportFile(file, importKind, locale);
    const rows = await previewFinanceImport(organizationId, importKind, lines, locale);
    const invalid = rows.filter((row) => row.errors.length);
    const preview = { count: rows.length, valid: rows.length - invalid.length, invalid: invalid.length, rows: rows.map(({ line, code, description, errors }) => ({ line, code, description, errors })) };
    if (mode === "preview" || invalid.length) {
      await writeApiLog({ request: req, statusCode: invalid.length && mode === "commit" ? 422 : 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "finance-template-import", kind, mode, count: rows.length, invalid: invalid.length } });
      return NextResponse.json({ preview, ...(mode === "commit" && invalid.length ? { error: "FINANCE_IMPORT_VALIDATION", message: tr("Corrigez toutes les lignes : aucun référentiel n’a été créé.", "Correct all lines: no reference data has been created.") } : {}) }, { status: mode === "commit" && invalid.length ? 422 : 200 });
    }
    // All-or-nothing: revalidate business scope and parent account inside the
    // same serializable transaction. Each domain service writes its finance event.
    const created = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const row of rows) {
        if (!row.valid) throw new FinanceImportError("Ligne non validée.");
        if (row.valid.kind === "tax") {
          if (await tx.enterpriseTaxCode.findFirst({ where: { organizationId, code: row.valid.data.code }, select: { id: true } })) throw new FinanceImportError(`Code taxe déjà créé : ${row.valid.data.code}`, 409);
          const tax = await createTaxCodeTx(tx, organizationId, auth.session.userId, {
            ...row.valid.data, roundingRule: "HALF_UP", effectiveFrom: new Date(`${row.valid.data.effectiveFrom}T00:00:00.000Z`),
          });
          ids.push(tax.id);
        } else {
          const chart = await tx.enterpriseChartOfAccounts.findFirst({ where: { id: row.valid.chartId, organizationId, code: row.valid.data.chartCode, templateCode: { not: null }, status: { in: ["DRAFT", "READY", "ACTIVE"] } }, select: { id: true } });
          const parent = chart ? await tx.enterpriseLedgerAccount.findFirst({ where: { id: row.valid.parentId, chartId: chart.id, organizationId, code: row.valid.data.parentCode, archivedAt: null, isActive: true }, select: { id: true } }) : null;
          if (!parent) throw new FinanceImportError(`Compte parent indisponible : ${row.valid.data.parentCode}`, 409);
          const account = await createCustomChildAccountTx(tx, organizationId, chart!.id, auth.session.userId, {
            parentId: parent.id, code: row.valid.data.code, nameFr: row.valid.data.nameFr, nameEn: row.valid.data.nameEn,
            currencyCode: row.valid.data.currencyCode || undefined,
          });
          ids.push(account.id);
        }
      }
      await tx.auditLog.create({ data: {
        organizationId, userId: auth.session.userId,
        action: importKind === "tax" ? "ENTERPRISE_TAX_CODES_BULK_IMPORTED" : "ENTERPRISE_LEDGER_CHILD_ACCOUNTS_BULK_IMPORTED",
        entity: importKind === "tax" ? "EnterpriseTaxCode" : "EnterpriseLedgerAccount", entityId: ids[0],
        riskLevel: "HIGH", metadata: { organizationId, count: ids.length, kind: importKind, codes: rows.map((row) => row.code) },
      } });
      return ids.length;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "finance-template-import", kind, count: created } });
    return NextResponse.json({ imported: created }, { status: 201 });
  } catch (error) {
    if (error instanceof FinanceImportError || error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      return NextResponse.json({ error: "FINANCE_IMPORT_FAILED", message: error instanceof FinanceImportError ? error.message : tr("Le référentiel a changé pendant l’import. Rechargez les données et réessayez.", "The reference data changed during import. Refresh and retry.") }, { status: error instanceof FinanceImportError ? error.status : 409 });
    }
    return financeErrorResponse(error, "FINANCE_TEMPLATE_IMPORT_FAILED");
  }
}
