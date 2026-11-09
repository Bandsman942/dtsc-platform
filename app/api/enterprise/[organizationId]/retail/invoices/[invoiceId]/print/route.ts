import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { retailInvoiceVisibleSites } from "@/lib/enterprise/retail/site-access";
import { resolveOrganizationLogoStoragePath } from "@/lib/enterprise/organization-logo-storage";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; invoiceId: string }> };

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function money(value: unknown, locale: "fr" | "en") {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
}

function localDate(value: Date, locale: "fr" | "en", timezone: string) {
  try {
    return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(value);
  } catch {
    return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }).format(value);
  }
}

/** Customer-facing invoice, never a second financial document or source of
 * truth. Draft / cancelled documents are clearly marked and cannot be
 * mistaken for an issued or paid invoice. */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  try {
    const visibility = await retailInvoiceVisibleSites(organizationId, auth.session.userId);
    const checkout = await prisma.enterpriseRetailInvoiceCheckout.findFirst({
      where: { organizationId, salesInvoiceId: invoiceId },
      include: {
        site: { select: { id: true, name: true, addressLine1: true, addressLine2: true, city: true, countryCode: true, timezone: true } },
        invoice: { include: { items: { orderBy: { createdAt: "asc" } } } },
      },
    });
    if (!checkout || (!visibility.isOwner && !visibility.siteIds.includes(checkout.siteId) && !visibility.collectibleSiteIds.includes(checkout.siteId))) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_NOT_FOUND", 404);
    }
    // A cashier assigned only collection rights may print the invoice being
    // paid, without inheriting stock or company-wide sales privileges.
    if (!visibility.isOwner && !visibility.siteIds.includes(checkout.siteId)) {
      // Collection-only staff can print issued/paid documents, never drafts.
      if (!visibility.collectibleSiteIds.includes(checkout.siteId) || !["ISSUED", "PARTIALLY_PAID", "OVERDUE", "PAID"].includes(checkout.invoice.status)) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_NOT_FOUND", 404);
      }
    }
    const [organization, customer, preparer] = await Promise.all([
      prisma.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", deletedAt: null }, select: { name: true, timezone: true, logoUrl: true } }),
      prisma.enterpriseBusinessParty.findFirst({ where: { organizationId, id: checkout.invoice.businessPartyId, archivedAt: null }, select: { displayName: true, legalName: true } }),
      prisma.user.findUnique({ where: { id: checkout.preparedByUserId }, select: { name: true } }),
    ]);
    if (!organization) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 404);

    const url = new URL(req.url);
    const locale: "fr" | "en" = url.searchParams.get("lang") === "en" ? "en" : "fr";
    const paper = url.searchParams.get("paper") === "thermal" ? "thermal" : "a4";
    const labels = locale === "fr" ? {
      title: "Facture de vente", draft: "BROUILLON — NE VAUT PAS FACTURE ÉMISE", cancelled: "ANNULÉE — DOCUMENT SANS VALEUR DE PAIEMENT", voided: "INVALIDÉE — DOCUMENT SANS VALEUR DE PAIEMENT",
      item: "Article", qty: "Qté", unit: "Prix unitaire", amount: "Montant", subtotal: "Sous-total", discount: "Réductions", tax: "Taxes", total: "Total", paid: "Déjà réglé", due: "Reste dû",
      customer: "Client", invoiceNumber: "N° de facture", preparer: "Facturier", status: "Statut", date: "Date", print: "Imprimer", site: "Boutique", note: "Document généré depuis DTSC Platform — les montants et statuts proviennent du registre Finance.",
    } : {
      title: "Sales invoice", draft: "DRAFT — NOT AN ISSUED INVOICE", cancelled: "CANCELLED — NOT VALID FOR PAYMENT", voided: "VOIDED — NOT VALID FOR PAYMENT",
      item: "Item", qty: "Qty", unit: "Unit price", amount: "Amount", subtotal: "Subtotal", discount: "Discounts", tax: "Tax", total: "Total", paid: "Paid", due: "Outstanding",
      customer: "Customer", invoiceNumber: "Invoice #", preparer: "Invoicer", status: "Status", date: "Date", print: "Print", site: "Store", note: "Generated by DTSC Platform — financial amounts and statuses come from the canonical Finance ledger.",
    };
    const invoice = checkout.invoice;
    const currency = escapeHtml(invoice.currencyCode);
    const statusNames = locale === "fr"
      ? { DRAFT: "Brouillon", PENDING_APPROVAL: "En validation", APPROVED: "Approuvée", ISSUED: "Émise", PARTIALLY_PAID: "Partiellement payée", PAID: "Payée", OVERDUE: "Échue", CANCELLED: "Annulée", VOIDED: "Invalidée" }
      : { DRAFT: "Draft", PENDING_APPROVAL: "Pending approval", APPROVED: "Approved", ISSUED: "Issued", PARTIALLY_PAID: "Partially paid", PAID: "Paid", OVERDUE: "Overdue", CANCELLED: "Cancelled", VOIDED: "Voided" };
    const localizedStatus = statusNames[invoice.status as keyof typeof statusNames] || invoice.status;
    const address = [checkout.site.addressLine1, checkout.site.addressLine2, checkout.site.city, checkout.site.countryCode].filter(Boolean).join(", ");
    const statusBanner = invoice.status === "DRAFT" || invoice.status === "PENDING_APPROVAL" || invoice.status === "APPROVED" ? labels.draft
      : invoice.status === "CANCELLED" ? labels.cancelled : invoice.status === "VOIDED" ? labels.voided : null;
    const tableRows = invoice.items.map((line) => `<tr><td>${escapeHtml(line.description)}</td><td class="numeric">${escapeHtml(line.quantity.toFixed())}</td><td class="numeric">${money(line.unitPrice, locale)}</td><td class="numeric">${money(line.totalAmount, locale)}</td></tr>`).join("");
    const timezone = checkout.site.timezone || organization.timezone || "Africa/Kinshasa";
    const logo = resolveOrganizationLogoStoragePath({ organizationId, logoUrl: organization.logoUrl })
      ? `<img class="company-logo" src="/api/enterprise/${encodeURIComponent(organizationId)}/logo" alt="${escapeHtml(organization.name)}" />` : "";
    const summaryRows = [
      [labels.subtotal, invoice.subtotal], [labels.discount, invoice.discountTotal], [labels.tax, invoice.taxTotal],
      [labels.total, invoice.grandTotal], [labels.paid, invoice.amountPaid], [labels.due, invoice.outstandingAmount],
    ].map(([label, value], i) => `<div class="total-row${i === 3 ? " emphasized" : ""}"><span>${escapeHtml(label)}</span><strong>${money(value, locale)} ${currency}</strong></div>`).join("");
    const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(labels.title)} ${escapeHtml(invoice.number)}</title><style>
      :root{color-scheme:light}*{box-sizing:border-box}body{font-family:system-ui,-apple-system,Arial,sans-serif;margin:0 auto;padding:24px;max-width:800px;background:#fff;color:#10253d}
      .head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:3px solid #147bcb;padding-bottom:16px}.identity{display:flex;align-items:center;gap:12px;min-width:0}.company-logo{display:block;width:64px;height:64px;object-fit:contain;flex-shrink:0}.brand{color:#12659b;font-size:20px;font-weight:850}.store{font-size:15px;font-weight:750;color:#127255}
      .muted{color:#516073;font-size:12px;overflow-wrap:anywhere}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;margin:18px 0}.meta>div{min-width:0;overflow-wrap:anywhere}
      .banner{padding:10px 12px;border:2px solid #b45309;border-radius:8px;margin:14px 0;color:#7c2d12;font-size:13px;font-weight:800;text-align:center}
      table{width:100%;border-collapse:collapse;margin-top:20px;font-size:13px}th{background:#e9f4ff;color:#16446c}th,td{padding:8px 5px;text-align:left;border-bottom:1px solid #dfe6ed;overflow-wrap:anywhere}
      .numeric{text-align:right;font-variant-numeric:tabular-nums}.totals{margin:16px 0 0 auto;max-width:380px}.total-row{display:flex;justify-content:space-between;gap:10px;padding:5px 0;font-size:13px}.emphasized{font-size:16px;color:#0b6aa6;border-top:2px solid #0b6aa6;padding-top:10px}
      .footer{margin-top:30px;padding-top:10px;border-top:1px solid #ddd;font-size:11px;color:#627086}.print-action{padding:9px 14px;border:0;border-radius:9px;background:#126ca8;color:white;font-weight:750;cursor:pointer}
      @page{size:${paper === "thermal" ? "80mm auto" : "A4"};margin:${paper === "thermal" ? "2mm" : "12mm"}}
      @media print{body{width:100%;max-width:none;padding:0}.print-action{display:none}}
      ${paper === "thermal" ? "body{max-width:76mm;padding:6px;font-size:10px}.head{display:block;padding-bottom:6px}.identity{gap:5px}.company-logo{width:34px;height:34px}.brand{font-size:13px}.store{font-size:12px}.meta{grid-template-columns:1fr;gap:3px;margin:8px 0}table{font-size:9px;margin-top:8px}th,td{padding:3px 1px}.totals{max-width:100%}.total-row{font-size:10px}.emphasized{font-size:12px}.footer{margin-top:12px}.banner{font-size:10px;padding:4px}" : ""}
      </style></head><body><div class="head"><div class="identity">${logo}<div><div class="brand">${escapeHtml(organization.name)}</div><div class="store">${escapeHtml(checkout.site.name)}</div><div class="muted">${escapeHtml(address)}</div></div></div><button type="button" class="print-action" onclick="window.print()">${escapeHtml(labels.print)}</button></div>
      ${statusBanner ? `<div class="banner">${escapeHtml(statusBanner)}</div>` : ""}
      <h1>${escapeHtml(labels.title)}</h1><div class="meta"><div><strong>${escapeHtml(labels.invoiceNumber)}:</strong> ${escapeHtml(invoice.number)}</div><div><strong>${escapeHtml(labels.date)}:</strong> ${escapeHtml(localDate(invoice.invoiceDate, locale, timezone))}</div><div><strong>${escapeHtml(labels.site)}:</strong> ${escapeHtml(checkout.site.name)}</div><div><strong>${escapeHtml(labels.status)}:</strong> ${escapeHtml(localizedStatus)}</div><div><strong>${escapeHtml(labels.customer)}:</strong> ${escapeHtml(customer?.displayName || customer?.legalName || "—")}</div><div><strong>${escapeHtml(labels.preparer)}:</strong> ${escapeHtml(preparer?.name || "—")}</div></div>
      <table><thead><tr><th>${escapeHtml(labels.item)}</th><th class="numeric">${escapeHtml(labels.qty)}</th><th class="numeric">${escapeHtml(labels.unit)}</th><th class="numeric">${escapeHtml(labels.amount)}</th></tr></thead><tbody>${tableRows}</tbody></table>
      <div class="totals">${summaryRows}</div><div class="footer">${escapeHtml(labels.note)}</div></body></html>`;
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-invoice-print", invoiceId, siteId: checkout.siteId, paper, locale } });
    return new NextResponse(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-disposition": `inline; filename="invoice-${invoice.id}.html"` } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_PRINT_FAILED");
  }
}
