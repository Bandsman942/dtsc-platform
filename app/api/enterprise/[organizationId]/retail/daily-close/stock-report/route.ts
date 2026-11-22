import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { civilMidnightUtc, followingCivilDate, isCivilDate } from "@/lib/enterprise/retail/civil-date";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { readRetailOperatingSettings } from "@/lib/enterprise/retail/operating-settings";
import { retailInventoryVisibleSites } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
type Row = {
  code: string; name: string; opening: string; entries: string; sold: string;
  otherOut: string; closing: string; reserved: string | null; available: string | null;
  lots: { number: string; expiry: string | null }[];
};
const decimal = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const escapeHtml = (v: unknown) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const quoteCsv = (v: unknown) => {
  const raw = String(v ?? "");
  // Protect spreadsheet viewers against formula injection in catalog descriptions.
  const safe = /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
};
const jsonHeaders = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_DAILY_CLOSE", "read");
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const siteId = (url.searchParams.get("siteId") || "").trim();
    const date = (url.searchParams.get("date") || "").trim();
    const format = url.searchParams.get("format") || "json";
    const search = (url.searchParams.get("search") || "").trim().slice(0, 100);
    const page = Math.max(1, Math.min(10000, Number(url.searchParams.get("page") || 1) || 1));
    const pageSize = Math.max(10, Math.min(100, Number(url.searchParams.get("pageSize") || 50) || 50));
    if (!siteId || siteId.length > 191 || !isCivilDate(date) || !["json", "csv", "xlsx", "print"].includes(format)) {
      return NextResponse.json({ error: "INVALID_STOCK_REPORT_FILTER", message: "Sélectionnez une boutique, une date valide et un format pris en charge." }, { status: 400 });
    }
    const scope = await retailInventoryVisibleSites(organizationId, auth.session.userId);
    if (scope.isolationEnabled && !scope.siteIds.includes(siteId)) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
    const [site, organization, config] = await Promise.all([
      prisma.enterpriseSite.findFirst({ where: { organizationId, id: siteId, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, code: true, timezone: true } }),
      prisma.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", deletedAt: null }, select: { name: true, timezone: true } }),
      prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } }),
    ]);
    if (!site || !organization || !config) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 404);
    const settings = readRetailOperatingSettings(config.settingsJson, siteId);
    if (!settings.stockReportEnabled) return NextResponse.json({ error: "STOCK_REPORT_DISABLED", message: "Le rapport journalier des stocks est désactivé dans les paramètres RETAIL." }, { status: 403 });
    const timezone = site.timezone || organization.timezone || "Africa/Kinshasa";
    const from = civilMidnightUtc(date, timezone);
    const to = civilMidnightUtc(followingCivilDate(date), timezone);
    const warehouses = await prisma.enterpriseWarehouse.findMany({ where: { organizationId, siteId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
    const warehouseIds = warehouses.map((w) => w.id);
    const currentParts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const today = ["year","month","day"].map((part) => currentParts.find((x) => x.type === part)?.value || "").join("-");
    const currentDay = date === today;
    const baseWhere: Prisma.EnterpriseInventoryItemWhereInput = {
      organizationId, status: "ACTIVE", archivedAt: null,
      OR: [
        { balances: { some: { warehouseId: { in: warehouseIds } } } },
        { stockMovements: { some: { warehouseId: { in: warehouseIds }, occurredAt: { lt: to } } } },
      ],
      AND: [
        ...(!settings.stockReportIncludeZeroMovement ? [{ stockMovements: { some: { warehouseId: { in: warehouseIds }, occurredAt: { gte: from, lt: to } } } }] : []),
        ...(search ? [{ OR: [
          { catalogItem: { name: { contains: search, mode: "insensitive" as const } } },
          { catalogItem: { code: { contains: search, mode: "insensitive" as const } } },
        ] }] : []),
      ],
    };
    // Exports must cover the full selected site, not just the visible page.
    const exportMode = format !== "json";
    const total = await prisma.enterpriseInventoryItem.count({ where: baseWhere });
    if (exportMode && total > 5000) {
      return NextResponse.json({ error: "STOCK_REPORT_TOO_LARGE", message: "Le rapport dépasse 5 000 articles. Réduisez la sélection ou contactez le support pour un export volumineux." }, { status: 422 });
    }
    const items = await prisma.enterpriseInventoryItem.findMany({
      where: baseWhere, include: { catalogItem: { select: { code: true, name: true } } },
      orderBy: [{ catalogItem: { name: "asc" } }, { id: "asc" }],
      skip: exportMode ? 0 : (page - 1) * pageSize, take: exportMode ? Math.max(1, total) : pageSize,
    });
    const ids = items.map((item) => item.id);
    const movementWhere = { organizationId, warehouseId: { in: warehouseIds }, inventoryItemId: { in: ids } };
    const [openingTotals, dayTotals, balances, lots] = await Promise.all([
      ids.length ? prisma.enterpriseStockMovement.groupBy({ by: ["inventoryItemId", "direction"], where: { ...movementWhere, occurredAt: { lt: from } }, _sum: { quantity: true } }) : Promise.resolve([]),
      ids.length ? prisma.enterpriseStockMovement.groupBy({ by: ["inventoryItemId", "direction", "movementType"], where: { ...movementWhere, occurredAt: { gte: from, lt: to } }, _sum: { quantity: true } }) : Promise.resolve([]),
      currentDay && settings.stockReportIncludeReserved && ids.length
        ? prisma.enterpriseInventoryBalance.findMany({ where: movementWhere, select: { inventoryItemId: true, quantityReserved: true } }) : Promise.resolve([]),
      (settings.stockReportIncludeLots || settings.stockReportIncludeExpiry) && ids.length
        ? prisma.enterpriseStockLot.findMany({ where: { organizationId, warehouseId: { in: warehouseIds }, inventoryItemId: { in: ids }, archivedAt: null },
          select: { inventoryItemId: true, lotNumber: true, expiryDate: true }, take: 5000, orderBy: { lotNumber: "asc" } }) : Promise.resolve([]),
    ]);
    const rows: Row[] = items.map((item) => {
      const opening = openingTotals.filter((m) => m.inventoryItemId === item.id).reduce((sum, m) =>
        sum.plus(decimal(m._sum.quantity || 0).times(m.direction === "IN" ? 1 : -1)), decimal(0));
      const day = dayTotals.filter((m) => m.inventoryItemId === item.id);
      const entries = day.filter((m) => m.direction === "IN").reduce((sum, m) => sum.plus(m._sum.quantity || 0), decimal(0));
      const sold = day.filter((m) => m.direction === "OUT" && m.movementType === "SALE_FULFILLMENT")
        .reduce((sum, m) => sum.plus(m._sum.quantity || 0), decimal(0));
      const otherOut = day.filter((m) => m.direction === "OUT" && m.movementType !== "SALE_FULFILLMENT")
        .reduce((sum, m) => sum.plus(m._sum.quantity || 0), decimal(0));
      const closing = opening.plus(entries).minus(sold).minus(otherOut);
      const reserved = currentDay && settings.stockReportIncludeReserved
        ? balances.filter((b) => b.inventoryItemId === item.id).reduce((sum, b) => sum.plus(b.quantityReserved), decimal(0)) : null;
      return {
        code: item.catalogItem.code, name: item.catalogItem.name,
        opening: opening.toFixed(3), entries: entries.toFixed(3), sold: sold.toFixed(3),
        otherOut: otherOut.toFixed(3), closing: closing.toFixed(3),
        reserved: reserved?.toFixed(3) || null,
        available: reserved ? closing.minus(reserved).toFixed(3) : null,
        lots: lots.filter((lot) => lot.inventoryItemId === item.id).map((lot) => ({
          number: lot.lotNumber, expiry: settings.stockReportIncludeExpiry ? lot.expiryDate?.toISOString().slice(0, 10) || null : null,
        })),
      };
    });
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId,
      metadata: { organizationId, domain: "retail-daily-stock-report", siteId, date, format, page, total } });
    const meta = { date, site: { id: site.id, name: site.name, code: site.code }, company: organization.name,
      timezone, generatedAt: new Date().toISOString(), currentReservations: currentDay && settings.stockReportIncludeReserved,
      page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)), rows };
    if (format === "json") return NextResponse.json(meta, { headers: jsonHeaders });
    const columns = ["SKU", "Article", "Stock initial", "Entrées", "Vendues", "Autres sorties", "Stock final", "Réservé", "Disponible", "Lots / péremptions"];
    const cells = (r: Row) => [r.code, r.name, r.opening, r.entries, r.sold, r.otherOut, r.closing,
      r.reserved ?? "—", r.available ?? "—", r.lots.map((l) => l.number + (l.expiry ? " (" + l.expiry + ")" : "")).join("; ")];
    const stem = "rapport-stocks-" + site.code.replace(/[^a-zA-Z0-9_-]/g, "-") + "-" + date;
    if (format === "csv") {
      const csv = "\uFEFF" + [columns, ...rows.map(cells)].map((row) => row.map(quoteCsv).join(";")).join("\r\n");
      return new NextResponse(csv, { headers: { ...jsonHeaders, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${stem}.csv"` } });
    }
    if (format === "xlsx") {
      const wb = new ExcelJS.Workbook(); wb.creator = "DTSC Platform"; wb.created = new Date();
      const sheet = wb.addWorksheet("Stocks journaliers", { views: [{ state: "frozen", ySplit: 5 }] });
      sheet.mergeCells("A1:J1"); sheet.getCell("A1").value = organization.name + " — " + site.name;
      sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF145A86" } };
      sheet.mergeCells("A2:J2"); sheet.getCell("A2").value = "Rapport journalier du " + date + " · " + timezone;
      sheet.mergeCells("A3:J3"); sheet.getCell("A3").value = "Généré le " + new Date().toISOString();
      sheet.addRow([]);
      const header = sheet.addRow(columns); header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1769A1" } }; });
      for (const row of rows) sheet.addRow(cells(row));
      sheet.columns = columns.map((_, i) => ({ width: i === 1 ? 40 : i === 9 ? 34 : 18 }));
      sheet.autoFilter = { from: "A5", to: "J" + Math.max(5, rows.length + 5) };
      sheet.pageSetup.orientation = "landscape";
      const buffer = await wb.xlsx.writeBuffer();
      return new NextResponse(new Uint8Array(buffer), { headers: { ...jsonHeaders, "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${stem}.xlsx"` } });
    }
    const th = columns.map((x) => `<th>${escapeHtml(x)}</th>`).join("");
    const body = rows.map((row) => `<tr>${cells(row).map((v) => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("");
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(stem)}</title><style>
      body{font:12px system-ui,Arial,sans-serif;color:#17304b;margin:24px;background:white}h1{font-size:22px;color:#125f96}
      .muted{color:#657787}.toolbar{margin:14px 0;padding:10px;border-radius:8px;background:#e9f4fc}
      table{width:100%;border-collapse:collapse}th{background:#185f91;color:white;text-align:left}
      td,th{padding:6px;border:1px solid #d0dae5;overflow-wrap:anywhere}tr{break-inside:avoid}
      @page{size:A4 landscape;margin:11mm}@media print{.toolbar{display:none}body{margin:0}}
      </style></head><body><h1>${escapeHtml(organization.name)} · ${escapeHtml(site.name)}</h1>
      <h2>Rapport journalier des stocks — ${escapeHtml(date)}</h2>
      <p class="muted">Boutique : ${escapeHtml(site.code)} · Fuseau : ${escapeHtml(timezone)} · Généré : ${escapeHtml(meta.generatedAt)}</p>
      <p class="muted">Stock initial + entrées − vendues − autres sorties = stock final. Les réservations sont affichées uniquement pour la journée actuelle.</p>
      <div class="toolbar"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
      <table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>
      <p class="muted">Document généré depuis le registre canonique Inventaire & Logistique. Les quantités sont exprimées dans l'unité de l'article.</p></body></html>`;
    return new NextResponse(html, { headers: { ...jsonHeaders, "content-type": "text/html; charset=utf-8", "content-disposition": `inline; filename="${stem}.html"` } });
  } catch (error) { return retailErrorResponse(error, "RETAIL_DAILY_STOCK_REPORT_FAILED"); }
}
