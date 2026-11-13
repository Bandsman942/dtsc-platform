import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { CatalogImportError, parseCatalogFile, prepareCatalogImport } from "@/lib/enterprise/master-data/catalog-import";
import { CATALOG_IMPORT_MAX_BYTES } from "@/lib/enterprise/master-data/catalog-template";
import { buildCatalogTemplateCsv, buildCatalogTemplateXlsx } from "@/lib/enterprise/master-data/catalog-download";
import { createEnterpriseCatalogItemTx } from "@/lib/enterprise/master-data/service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export const runtime = "nodejs";

/** Server-generated CSV/XLSX template with the exact round-trip import contract. */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CATALOG", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const format = new URL(req.url).searchParams.get("format");
  const locale = req.headers.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "fr";
  if (format !== "csv" && format !== "xlsx") return NextResponse.json({ error: "CATALOG_TEMPLATE_FORMAT_INVALID" }, { status: 400 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-catalog-template:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const [units, categories] = await Promise.all([
      prisma.enterpriseUnitOfMeasure.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
      prisma.enterpriseCatalogCategory.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    ]);
    if (!units.length) return NextResponse.json({ error: "CATALOG_TEMPLATE_UNIT_REQUIRED", message: locale === "fr" ? "Créez au moins une unité de mesure avant de télécharger le modèle." : "Create at least one unit of measure before downloading the template." }, { status: 422 });
    const body = format === "csv" ? buildCatalogTemplateCsv(locale) : new Uint8Array(await buildCatalogTemplateXlsx(locale, { units, categories }));
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "catalog-template", format } }).catch(() => null);
    return new NextResponse(body, {
      headers: {
        "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="dtsc-catalogue-modele-${organizationId.slice(0, 8)}.${format}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    await writeApiLog({ request: req, statusCode: 500, userId: session.userId, startedAt, metadata: { organizationId, domain: "catalog-template", failed: true } }).catch(() => null);
    return NextResponse.json({ error: "CATALOG_TEMPLATE_FAILED", message: locale === "fr" ? "Le modèle n'a pas pu être généré. Réessayez." : "The template could not be generated. Please retry." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-catalog-import:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CATALOG", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const locale = req.headers.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "fr";
  const tr = (fr: string, en: string) => locale === "en" ? en : fr;
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > CATALOG_IMPORT_MAX_BYTES + 100_000) {
    return NextResponse.json({ error: "CATALOG_IMPORT_FILE_TOO_LARGE", message: tr("Fichier trop volumineux (maximum 2 Mo).", "File too large (maximum 2 MB).") }, { status: 413 });
  }
  const form = await req.formData().catch(() => null);
  const mode = form?.get("mode");
  const file = form?.get("file");
  if ((mode !== "preview" && mode !== "commit") || !(file instanceof File)) {
    return NextResponse.json({ error: "CATALOG_IMPORT_INPUT_INVALID", message: tr("Choisissez un fichier CSV ou Excel et une opération valide.", "Select a CSV or Excel file and a valid operation.") }, { status: 400 });
  }

  try {
    const records = await parseCatalogFile(file, locale);
    const rows = await prepareCatalogImport(organizationId, records, locale);
    const invalid = rows.filter((row) => row.errors.length > 0);
    const preview = { count: rows.length, valid: rows.length - invalid.length, invalid: invalid.length, rows: rows.map(({ line, name, itemType, errors }, index) => ({
      line, name: name.slice(0, 240), itemType, errors,
      sku: (records[index]?.cells[2] || "").slice(0, 120),
      categoryCode: (records[index]?.cells[4] || "").slice(0, 40),
      unitCode: (records[index]?.cells[5] || "").slice(0, 40),
      salePrice: (records[index]?.cells[6] || "").slice(0, 40),
      currency: (records[index]?.cells[8] || "").slice(0, 8),
      trackInventory: (records[index]?.cells[11] || "").slice(0, 10),
    })) };
    if (mode === "preview" || invalid.length) {
      await writeApiLog({ request: req, statusCode: invalid.length && mode === "commit" ? 422 : 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "catalog-import", mode, count: rows.length, invalid: invalid.length } });
      return NextResponse.json({ ok: !invalid.length, preview, ...(mode === "commit" && invalid.length ? { error: "CATALOG_IMPORT_VALIDATION_FAILED", message: tr("Corrigez les lignes signalées et prévisualisez à nouveau le fichier.", "Correct the highlighted rows and preview the file again.") } : {}) }, { status: mode === "commit" && invalid.length ? 422 : 200 });
    }

    // A single serializable transaction avoids partially imported catalogues;
    // the canonical service writes prices, inventory tracking and event history.
    const createdIds = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const row of rows) {
        if (!row.data) throw new CatalogImportError("Invalid catalog import row.");
        const duplicate = await tx.enterpriseCatalogItem.findFirst({
          where: { organizationId, archivedAt: null, OR: [
            { normalizedName: row.name.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr"), itemType: row.itemType },
            ...(row.data.sku ? [{ sku: { equals: row.data.sku, mode: "insensitive" as const } }] : []),
          ] }, select: { id: true },
        });
        if (duplicate) throw new CatalogImportError(tr("Un ou plusieurs articles existent déjà. Actualisez votre fichier et réessayez.", "One or more items already exist. Refresh your file and retry."), 409);
        const item = await createEnterpriseCatalogItemTx(tx, organizationId, session.userId, row.data);
        ids.push(item.id);
      }
      return ids;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });

    await Promise.allSettled([
      writeAuditLog({ userId: session.userId, action: "ENTERPRISE_CATALOG_ITEMS_IMPORTED", entity: "EnterpriseCatalogItem", entityId: createdIds[0], request: req, metadata: { organizationId, count: createdIds.length } }),
      writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "catalog-import", mode: "commit", count: createdIds.length } }),
    ]);
    return NextResponse.json({ ok: true, imported: createdIds.length }, { status: 201 });
  } catch (error) {
    const known = error instanceof CatalogImportError;
    const race = error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code);
    const status = known ? error.status : race ? 409 : 422;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { organizationId, domain: "catalog-import", failed: true } }).catch(() => null);
    return NextResponse.json({ error: "CATALOG_IMPORT_FAILED", message: known ? error.message : race ? tr("Le catalogue a changé pendant l’import. Actualisez vos articles avant de réessayer.", "The catalog changed during import. Refresh your items before retrying.") : tr("L’import a échoué sans créer d’article. Vérifiez le modèle ou réessayez.", "The import failed without creating any item. Check the template or try again.") }, { status });
  }
}
