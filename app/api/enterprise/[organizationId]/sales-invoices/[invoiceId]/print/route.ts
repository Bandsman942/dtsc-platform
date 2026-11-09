import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { retailFinanceReadSiteScope, requireRetailSiteCapability } from "@/lib/enterprise/retail/site-access";
import { authorizeRetailRequest } from "@/lib/enterprise/retail/http";
import { resolveOrganizationLogoStoragePath } from "@/lib/enterprise/organization-logo-storage";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; invoiceId: string }> };
const htmlSafe = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

/** Common invoice print view: all sectors use EnterpriseSalesInvoice, with no
 * retail-specific or clinical data projected into this document. */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId } = await params;
  const financeAuth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECEIVABLES", "view");
  // A store manager has a native right to issue, and therefore preview, the
  // canonical invoice of that store even without a separate Finance grant.
  // This alternative is RETAIL-ONLY and never grants access to other sectors.
  const retailAuth = !financeAuth.ok && financeAuth.response.status === 403
    ? await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read")
    : null;
  // FINANCE_PAYMENTS viewers may print ONLY an invoice structurally linked to
  // a payment they can see. This grants no general receivables read permission.
  const paymentId = new URL(req.url).searchParams.get("paymentId")?.trim() || null;
  const paymentAuth = !financeAuth.ok && financeAuth.response.status === 403 && paymentId
    ? await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYMENTS", "view")
    : null;
  if (!financeAuth.ok && !retailAuth?.ok && !paymentAuth?.ok) return financeAuth.response;
  const userId = financeAuth.ok ? financeAuth.session.userId
    : paymentAuth?.ok ? paymentAuth.session.userId
    : retailAuth?.ok ? retailAuth.session.userId : "";
  try {
    const invoice = await prisma.enterpriseSalesInvoice.findFirst({
      where: { organizationId, id: invoiceId, archivedAt: null },
      include: { items: { orderBy: { createdAt: "asc" } }, retailCheckout: { select: { siteId: true, site: { select: { name: true, timezone: true } } } } },
    });
    if (!invoice) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
    if (!financeAuth.ok && paymentAuth?.ok && paymentId) {
      const payment = await prisma.enterprisePayment.findFirst({
        where: { id: paymentId, organizationId },
        select: { financialAccountId: true, paymentType: true },
      });
      if (!payment || payment.paymentType !== "CUSTOMER_PAYMENT") throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
      const [intent, allocations] = await Promise.all([
        prisma.enterpriseRetailInvoicePaymentProposal.findFirst({
          where: { organizationId, paymentId, checkout: { salesInvoiceId: invoice.id } },
          select: { id: true },
        }),
        prisma.enterprisePaymentAllocation.findMany({
          where: { organizationId, paymentId, status: { in: ["CONFIRMED", "REVERSED"] }, receivableId: { not: null } },
          select: { receivableId: true },
        }),
      ]);
      const receivableIds = allocations.map((row) => row.receivableId).filter((id): id is string => Boolean(id));
      const linkedReceivable = receivableIds.length ? await prisma.enterpriseReceivable.findFirst({
        where: { organizationId, id: { in: receivableIds }, salesInvoiceId: invoice.id },
        select: { id: true },
      }) : null;
      if (!intent && !linkedReceivable) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
      const paymentSites = await retailFinanceReadSiteScope(organizationId, userId, "COLLECT_PAYMENT");
      if (paymentSites !== null) {
        const account = payment.financialAccountId ? await prisma.enterpriseFinancialAccount.findFirst({
          where: { id: payment.financialAccountId, organizationId, siteId: { in: paymentSites } },
          select: { id: true },
        }) : null;
        if (!account || (invoice.retailCheckout && !paymentSites.includes(invoice.retailCheckout.siteId))) {
          throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
        }
      }
    } else if (!financeAuth.ok) {
      if (!invoice.retailCheckout) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
      await requireRetailSiteCapability(organizationId, userId, invoice.retailCheckout.siteId, "ISSUE_INVOICE", prisma, { requireAssignment: true });
    } else {
      const siteScope = await retailFinanceReadSiteScope(organizationId, userId, "VIEW_SALES");
      if (invoice.retailCheckout && siteScope !== null && !siteScope.includes(invoice.retailCheckout.siteId)) {
        throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
      }
    }
    const [organization, customer] = await Promise.all([
      prisma.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", deletedAt: null }, select: { name: true, logoUrl: true, address: true, city: true, country: true, email: true, phone: true, timezone: true } }),
      prisma.enterpriseBusinessParty.findFirst({ where: { organizationId, id: invoice.businessPartyId, archivedAt: null }, select: { displayName: true, legalName: true, code: true, primaryEmail: true, taxIdentifier: true } }),
    ]);
    if (!organization) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
    const locale: "fr" | "en" = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "fr";
    const labels = locale === "fr" ? {
      title: "Facture client", proforma: "DOCUMENT NON ÉMIS — NE VAUT PAS FACTURE DÉFINITIVE", invalid: "DOCUMENT ANNULÉ — SANS VALEUR DE PAIEMENT", issuer: "Émetteur", customer: "Facturé à", date: "Date de facture", due: "Échéance", status: "Statut", invoice: "Facture n°", item: "Désignation", qty: "Quantité", price: "Prix unitaire", discount: "Remise", amount: "Montant", subtotal: "Sous-total", discounts: "Total remises", tax: "Taxes", total: "Montant total", paid: "Réglé", balance: "Reste dû", print: "Imprimer / PDF", note: "Document professionnel DTSC Platform. Référence financière unique et montants issus de la facture client canonique.",
    } : {
      title: "Customer invoice", proforma: "NOT ISSUED — NOT A FINAL INVOICE", invalid: "CANCELLED DOCUMENT — NOT VALID FOR PAYMENT", issuer: "Issued by", customer: "Bill to", date: "Invoice date", due: "Due date", status: "Status", invoice: "Invoice no.", item: "Description", qty: "Quantity", price: "Unit price", discount: "Discount", amount: "Amount", subtotal: "Subtotal", discounts: "Discounts", tax: "Taxes", total: "Total due", paid: "Paid", balance: "Outstanding", print: "Print / PDF", note: "DTSC Platform business document. Financial reference and amounts originate from the single canonical customer invoice.",
    };
    const n = (value: unknown) => Number(value || 0).toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const timezone = invoice.retailCheckout?.site.timezone || organization.timezone || "UTC";
    const d = (value: Date | null | undefined) => value ? new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { timeZone: timezone, dateStyle: "medium" }).format(value) : "—";
    const statusMap: Record<string, [string, string]> = {
      DRAFT: ["Brouillon", "Draft"], PENDING_APPROVAL: ["En attente de validation", "Awaiting approval"], APPROVED: ["Approuvée", "Approved"], REJECTED: ["Refusée", "Rejected"], ISSUED: ["Émise", "Issued"], PARTIALLY_PAID: ["Partiellement réglée", "Partially paid"], PAID: ["Réglée", "Paid"], OVERDUE: ["Échue", "Overdue"], CANCELLED: ["Annulée", "Cancelled"], VOIDED: ["Invalidée", "Voided"],
    };
    const displayStatus = statusMap[invoice.status]?.[locale === "fr" ? 0 : 1] || (locale === "fr" ? "Statut indisponible" : "Status unavailable");
    const banner = ["CANCELLED", "VOIDED", "REJECTED"].includes(invoice.status) ? labels.invalid : ["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(invoice.status) ? labels.proforma : null;
    const logo = resolveOrganizationLogoStoragePath({ organizationId, logoUrl: organization.logoUrl })
      ? `<img class="logo" src="/api/enterprise/${encodeURIComponent(organizationId)}/logo" alt="${htmlSafe(organization.name)}" />` : "";
    const rows = invoice.items.map((item, i) => `<tr><td class="position">${i + 1}</td><td>${htmlSafe(item.description)}</td><td class="num">${htmlSafe(item.quantity.toFixed())}</td><td class="num">${n(item.unitPrice)}</td><td class="num">${n(item.discountAmount)}</td><td class="num">${n(item.totalAmount)}</td></tr>`).join("");
    const totals = [
      [labels.subtotal, invoice.subtotal], [labels.discounts, invoice.discountTotal], [labels.tax, invoice.taxTotal], [labels.total, invoice.grandTotal], [labels.paid, invoice.amountPaid], [labels.balance, invoice.outstandingAmount],
    ].map(([label, value], index) => `<div class="total ${index === 3 ? "major" : ""}"><span>${htmlSafe(label)}</span><strong>${n(value)} ${htmlSafe(invoice.currencyCode)}</strong></div>`).join("");
    const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlSafe(labels.title)} ${htmlSafe(invoice.number)}</title><style>
      :root{color-scheme:light}*{box-sizing:border-box}body{max-width:850px;margin:0 auto;padding:30px;color:#10263f;background:white;font-family:Inter,system-ui,Arial,sans-serif}header{display:flex;gap:18px;align-items:flex-start;justify-content:space-between;border-bottom:4px solid #087fbb;padding-bottom:22px}.identity{display:flex;min-width:0;gap:15px;align-items:center}.logo{height:74px;width:74px;object-fit:contain;flex-shrink:0}.brand{font-size:22px;font-weight:900;letter-spacing:-.4px;color:#005d95}.muted{font-size:11px;color:#526478;overflow-wrap:anywhere;line-height:1.7}.print{padding:10px 15px;border:0;border-radius:8px;background:#087fbb;color:white;font-size:12px;font-weight:750;cursor:pointer}h1{font-size:26px;margin:26px 0 15px;letter-spacing:-.7px}.pill{display:inline-block;padding:5px 9px;background:#e5f5fa;border-radius:99px;font-size:11px;font-weight:800;color:#005d95}.banner{padding:12px;margin:18px 0;background:#fff4db;border:2px solid #d9992c;border-radius:6px;color:#814b06;font-weight:900;text-align:center;font-size:12px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:22px 0}.panel{padding:17px;background:#f2f7fb;border-radius:9px;min-width:0}.panel strong{display:block;font-size:11px;text-transform:uppercase;color:#597087;letter-spacing:.08em;margin-bottom:8px}.panel p{margin:4px 0;font-size:13px;line-height:1.6;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:24px}thead{background:#0c5283;color:white}th{padding:12px 6px;text-align:left}td{padding:12px 6px;border-bottom:1px solid #dfebf3;vertical-align:top;overflow-wrap:anywhere}.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.position{color:#7990a3}.totals{margin:25px 0 25px auto;max-width:405px}.total{display:flex;justify-content:space-between;gap:20px;padding:7px 0;border-bottom:1px solid #ecf1f5;font-size:12px}.major{font-size:15px;color:#0867a0;border-top:3px solid #0867a0;padding:13px 0;font-weight:900}.footer{padding-top:18px;border-top:1px solid #cad7e1;color:#637383;font-size:10px;line-height:1.6}@page{size:A4;margin:12mm}@media print{body{max-width:none;padding:0}.print{display:none}header{page-break-inside:avoid}tr{page-break-inside:avoid}}
      </style></head><body><header><div class="identity">${logo}<div><div class="brand">${htmlSafe(organization.name)}</div><div class="muted">${htmlSafe([organization.address, organization.city, organization.country].filter(Boolean).join(" · "))}</div><div class="muted">${htmlSafe([organization.phone, organization.email].filter(Boolean).join(" · "))}</div></div></div><button class="print" type="button" onclick="window.print()">${htmlSafe(labels.print)}</button></header>
      ${banner ? `<div class="banner">${htmlSafe(banner)}</div>` : ""}<h1>${htmlSafe(labels.title)}</h1><span class="pill">${htmlSafe(displayStatus)}</span><div class="meta"><div class="panel"><strong>${htmlSafe(labels.issuer)}</strong><p>${htmlSafe(organization.name)}</p>${invoice.retailCheckout ? `<p>${htmlSafe(invoice.retailCheckout.site.name)}</p>` : ""}<p>${htmlSafe(labels.invoice)} : ${htmlSafe(invoice.number)}</p><p>${htmlSafe(labels.date)} : ${htmlSafe(d(invoice.invoiceDate))}</p><p>${htmlSafe(labels.due)} : ${htmlSafe(d(invoice.dueDate))}</p></div><div class="panel"><strong>${htmlSafe(labels.customer)}</strong><p>${htmlSafe(customer?.displayName || customer?.legalName || "—")}</p><p>${htmlSafe(customer?.code || "")}</p><p>${htmlSafe(customer?.primaryEmail || "")}</p><p>${htmlSafe(customer?.taxIdentifier || "")}</p></div></div>
      <table><thead><tr><th>#</th><th>${htmlSafe(labels.item)}</th><th class="num">${htmlSafe(labels.qty)}</th><th class="num">${htmlSafe(labels.price)}</th><th class="num">${htmlSafe(labels.discount)}</th><th class="num">${htmlSafe(labels.amount)}</th></tr></thead><tbody>${rows}</tbody></table><div class="totals">${totals}</div><footer class="footer">${htmlSafe(labels.note)} · ${htmlSafe(labels.status)} : ${htmlSafe(displayStatus)} · ${htmlSafe(invoice.number)}</footer></body></html>`;
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId, metadata: { organizationId, domain: "sales-invoices-print", invoiceId, locale } });
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'", "content-disposition": `inline; filename="invoice-${invoice.id}.html"` } });
  } catch (error) {
    return financeErrorResponse(error, "SALES_INVOICE_PRINT_FAILED");
  }
}
