import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { resolveOrganizationLogoStoragePath } from "@/lib/enterprise/organization-logo-storage";
import { prisma } from "@/lib/prisma";

type DocumentKind = "quote" | "order";
type Locale = "fr" | "en";
type Line = {
  description: string;
  quantity: unknown;
  unitPrice: unknown;
  discountAmount: unknown;
  taxAmount: unknown;
  lineTotal: unknown;
  quantityFulfilled?: unknown;
};
type PrintData = {
  kind: DocumentKind;
  reference: string;
  title: string;
  description: string | null;
  status: string;
  currency: string;
  createdAt: Date;
  validUntil?: Date | null;
  expectedFulfillmentAt?: Date | null;
  terms?: string | null;
  sourceReference?: string | null;
  relatedReference?: string | null;
  subtotal: unknown;
  discounts: unknown;
  taxes: unknown;
  total: unknown;
  lines: Line[];
  deliveries?: Array<{ reference: string; status: string; createdAt: Date }>;
};

const safe = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const STATUS: Record<string, [string, string]> = {
  DRAFT: ["Brouillon", "Draft"],
  SENT: ["Envoyé", "Sent"],
  ACCEPTED: ["Accepté", "Accepted"],
  REJECTED: ["Refusé", "Rejected"],
  EXPIRED: ["Expiré", "Expired"],
  CONVERTED: ["Converti en commande", "Converted to order"],
  CANCELLED: ["Annulé", "Cancelled"],
  PENDING_APPROVAL: ["En attente de validation", "Pending approval"],
  CONFIRMED: ["À préparer", "Confirmed / to prepare"],
  IN_FULFILLMENT: ["En cours de livraison", "Delivery in progress"],
  PARTIALLY_FULFILLED: ["Partiellement livré", "Partially fulfilled"],
  FULFILLED: ["Livré", "Fulfilled"],
  CLOSED: ["Clôturé", "Closed"],
};

const copy = {
  fr: {
    quote: "DEVIS COMMERCIAL", order: "BON DE COMMANDE CLIENT",
    issuer: "ÉMETTEUR", customer: "DESTINATAIRE", reference: "Référence",
    date: "Date du document", validity: "Validité du devis", expected: "Livraison prévue",
    status: "État du document", source: "Devis d’origine", related: "Commande issue du devis",
    designation: "Désignation", qty: "Qté", fulfilled: "Livrée", unit: "P.U.",
    discount: "Remise", tax: "TVA / taxe", amount: "Total",
    subtotal: "Sous-total HT", discounts: "Remises", taxes: "Taxes", total: "TOTAL DU DOCUMENT",
    print: "Imprimer / Enregistrer en PDF", terms: "Conditions commerciales",
    deliveries: "Livraisons enregistrées", note: "Notes de l’opération",
    provisional: "BROUILLON — DOCUMENT NON VALIDÉ", pending: "EN ATTENTE DE VALIDATION",
    invalid: "DOCUMENT ANNULÉ, REFUSÉ OU EXPIRÉ — NON VALABLE",
    disclaimer: "Document commercial issu de DTSC Platform. Ce document ne constitue pas une facture fiscale, un reçu, une preuve de paiement ou une écriture comptable. Facturation et encaissement sont effectués séparément dans les modules Finance autorisés.",
    customerMissing: "Client historique indisponible — vérifiez le référentiel des tiers.",
    original: "Copie du document commercial courant",
  },
  en: {
    quote: "COMMERCIAL QUOTATION", order: "CUSTOMER PURCHASE ORDER",
    issuer: "ISSUED BY", customer: "CUSTOMER", reference: "Reference",
    date: "Document date", validity: "Quote valid until", expected: "Expected delivery",
    status: "Document status", source: "Originating quote", related: "Resulting order",
    designation: "Description", qty: "Qty", fulfilled: "Delivered", unit: "Unit price",
    discount: "Discount", tax: "Tax", amount: "Total",
    subtotal: "Subtotal before tax", discounts: "Discounts", taxes: "Taxes", total: "DOCUMENT TOTAL",
    print: "Print / Save as PDF", terms: "Commercial terms",
    deliveries: "Recorded deliveries", note: "Operation notes",
    provisional: "DRAFT — NOT APPROVED", pending: "AWAITING APPROVAL",
    invalid: "CANCELLED, REJECTED OR EXPIRED — NOT VALID",
    disclaimer: "Business document generated from DTSC Platform. This is not a tax invoice, receipt, proof of payment or accounting entry. Billing and collections occur separately in authorized Finance modules.",
    customerMissing: "Historical customer unavailable — verify the customer register.",
    original: "Current commercial document copy",
  },
} as const;

function renderPrintHtml(args: {
  organizationId: string;
  organization: { name: string; address: string | null; city: string | null; country: string | null; phone: string | null; email: string | null; timezone: string | null; logoUrl: string | null };
  customer: { legalName: string; displayName: string | null; code: string; primaryEmail: string | null; primaryPhone: string | null; taxIdentifier: string | null; addresses: Array<{ line1: string; line2: string | null; city: string | null; countryCode: string | null }> } | null;
  document: PrintData;
  locale: Locale;
}) {
  const { organizationId, organization, customer, document, locale } = args;
  const tr = copy[locale];
  const fmt = (value: unknown, fraction = 2) => Number(value ?? 0).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { minimumFractionDigits: fraction, maximumFractionDigits: fraction });
  const timezone = organization.timezone || "UTC";
  const date = (value?: Date | null) => {
    if (!value) return "—";
    try { return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeZone: timezone }).format(value); }
    catch { return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(value); }
  };
  const label = (value: string) => STATUS[value]?.[locale === "fr" ? 0 : 1] || (locale === "fr" ? "Statut indisponible" : "Status unavailable");
  const invalid = ["REJECTED", "EXPIRED", "CANCELLED"].includes(document.status);
  const provisional = document.status === "DRAFT";
  const pending = document.status === "PENDING_APPROVAL";
  const banner = invalid ? tr.invalid : provisional ? tr.provisional : pending ? tr.pending : "";
  const amount = (value: unknown) => `${fmt(value)} <small>${safe(document.currency)}</small>`;
  const totalRows = [
    [tr.subtotal, document.subtotal, ""],
    [tr.discounts, document.discounts, ""],
    [tr.taxes, document.taxes, ""],
    [tr.total, document.total, "major"],
  ].map(([name, value, cls]) => `<div class="total ${cls}"><span>${safe(name)}</span><b>${amount(value)}</b></div>`).join("");
  const rows = document.lines.map((line, index) => `<tr>
    <td class="row-index">${index + 1}</td>
    <td>${safe(line.description)}</td>
    <td class="numeric">${fmt(line.quantity, 3)}</td>
    ${document.kind === "order" ? `<td class="numeric">${fmt(line.quantityFulfilled, 3)}</td>` : ""}
    <td class="numeric">${fmt(line.unitPrice)}</td>
    <td class="numeric">${fmt(line.discountAmount)}</td>
    <td class="numeric">${fmt(line.taxAmount)}</td>
    <td class="numeric strong">${fmt(line.lineTotal)}</td>
  </tr>`).join("");
  const logo = resolveOrganizationLogoStoragePath({ organizationId, logoUrl: organization.logoUrl })
    ? `<img class="logo" alt="" src="/api/enterprise/${encodeURIComponent(organizationId)}/logo">` : "";
  const address = customer?.addresses[0];
  const customerAddress = [address?.line1, address?.line2, address?.city, address?.countryCode].filter(Boolean).join(" · ");
  const customerDetails = customer
    ? [customer.displayName || customer.legalName, customerAddress, customer.primaryPhone, customer.primaryEmail, customer.taxIdentifier ? `ID fiscal : ${customer.taxIdentifier}` : null].filter(Boolean)
    : [tr.customerMissing];
  const companyDetails = [organization.address, organization.city, organization.country, organization.phone, organization.email].filter(Boolean);
  const deliveries = document.kind === "order" && document.deliveries?.length
    ? `<section class="delivery"><h2>${tr.deliveries}</h2><div class="delivery-list">${document.deliveries.map((row) => `<div><strong>${safe(row.reference)}</strong><span>${safe(label(row.status))} · ${safe(date(row.createdAt))}</span></div>`).join("")}</div></section>`
    : "";
  const crossReferences = [
    document.sourceReference ? `<p><span>${tr.source}</span><b>${safe(document.sourceReference)}</b></p>` : "",
    document.relatedReference ? `<p><span>${tr.related}</span><b>${safe(document.relatedReference)}</b></p>` : "",
  ].filter(Boolean).join("");
  const title = document.kind === "quote" ? tr.quote : tr.order;
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safe(title)} · ${safe(document.reference)}</title>
<style>
:root{color-scheme:light}*{box-sizing:border-box}html{font-family:Inter,system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
body{margin:0 auto;max-width:920px;background:#eaf0f5;color:#122a44;padding:18px 16px 36px}
.sheet{background:#fff;min-height:270mm;padding:26px 32px 34px;box-shadow:0 14px 40px #112b4522;border-radius:10px}
.toolbar{display:flex;justify-content:flex-end;margin-bottom:14px}.print{border:0;border-radius:10px;background:#086aaf;color:white;padding:12px 20px;font-weight:800;font-size:13px;cursor:pointer}
.header{display:flex;justify-content:space-between;gap:20px;align-items:start;border-bottom:4px solid #1684be;padding-bottom:20px}
.brand{display:flex;gap:14px;align-items:center;min-width:0}.logo{height:70px;width:70px;object-fit:contain}.company{font-size:21px;line-height:1.2;font-weight:900;color:#005888;overflow-wrap:anywhere}.details{font-size:10.5px;color:#54687d;line-height:1.7;overflow-wrap:anywhere}
.corner{align-self:start;text-align:right;font-size:10px;letter-spacing:.1em;font-weight:800;color:#2784b6;text-transform:uppercase}
h1{font-size:27px;letter-spacing:-.7px;margin:23px 0 5px;color:#0e3455}.subtitle{font-size:12px;color:#5d7285;margin-bottom:16px;overflow-wrap:anywhere}
.badge{display:inline-block;background:#e8f5fc;color:#006eaa;font-size:12px;font-weight:800;border-radius:999px;padding:7px 11px;margin-bottom:12px}
.banner{margin:13px 0 18px;padding:11px 15px;border:1px solid #d9a044;background:#fff3dc;color:#714300;font-weight:900;border-radius:8px;text-align:center;font-size:12px}
.banner.invalid{border-color:#bd4052;background:#ffe9ed;color:#a0283d}.meta{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:17px 0 22px}
.panel{background:#f3f8fc;border:1px solid #dae8f2;border-radius:10px;padding:15px;min-width:0}.panel h2{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#4484a7;margin:0 0 9px}
.panel p{margin:4px 0;font-size:11px;color:#344a60;line-height:1.5;overflow-wrap:anywhere}.panel .primary{font-size:14px;font-weight:850;color:#102b48}
.facts{border-top:1px solid #e4edf4;padding:12px 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 24px}
.facts p{display:flex;justify-content:space-between;gap:12px;margin:0;font-size:11px}.facts span{color:#667b8d}.facts b{color:#163b5c;text-align:right}
table{border-collapse:collapse;width:100%;font-size:10.5px;margin-top:22px}thead{background:#095984;color:white}th{text-align:left;padding:12px 7px}td{border-bottom:1px solid #dfebf2;padding:11px 7px;vertical-align:top;overflow-wrap:anywhere}
.numeric{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.strong{font-weight:850;color:#0b5788}.row-index{color:#7893a8}
.sum{margin:21px 0 18px auto;max-width:410px}.total{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:8px 0;border-bottom:1px solid #e0eaf1;font-size:12px}.total small{font-weight:650;color:#5b778f}
.major{padding:14px 0 12px;border-top:3px solid #1186bb;color:#06598f;font-size:17px;font-weight:900}.terms,.delivery{margin:21px 0;padding:14px 17px;border-radius:9px;background:#f4f8fb;border:1px solid #e1ebf3}
.terms h2,.delivery h2{font-size:12px;color:#0b6297;text-transform:uppercase;letter-spacing:.05em;margin:0 0 9px}.terms p{font-size:11px;line-height:1.7;white-space:pre-line;margin:0;overflow-wrap:anywhere}
.delivery-list{display:grid;gap:7px;font-size:11px}.delivery-list>div{display:flex;justify-content:space-between;gap:12px}
.footer{border-top:2px solid #d9e7f2;margin-top:28px;padding-top:14px;font-size:10px;color:#60758a;line-height:1.7}
@page{size:A4;margin:12mm}
@media(max-width:620px){body{padding:8px}.sheet{padding:16px;border-radius:0;min-height:auto}.header{flex-wrap:wrap}.meta{grid-template-columns:1fr}.facts{grid-template-columns:1fr}table{font-size:9px}th,td{padding:8px 4px}}
@media print{html,body{background:#fff!important;max-width:none;padding:0;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{display:none}.sheet{box-shadow:none;border:0;min-height:0;border-radius:0;padding:0}.header,.panel,.terms,.delivery,.sum{break-inside:avoid}thead{display:table-header-group}tr{break-inside:avoid}h1{break-after:avoid}}
</style></head>
<body><div class="toolbar"><button class="print" type="button" onclick="window.print()">${safe(tr.print)}</button></div>
<main class="sheet">
<header class="header"><div class="brand">${logo}<div><div class="company">${safe(organization.name)}</div><div class="details">${safe(companyDetails.join(" · "))}</div></div></div><div class="corner">${safe(tr.original)}<br>DTSC Platform</div></header>
<h1>${safe(title)}</h1><div class="subtitle">${safe(document.title)} · ${safe(tr.reference)} <strong>${safe(document.reference)}</strong></div>
<span class="badge">${safe(label(document.status))}</span>
${banner ? `<div class="banner ${invalid ? "invalid" : ""}">${safe(banner)}</div>` : ""}
<div class="meta">
<section class="panel"><h2>${tr.issuer}</h2><p class="primary">${safe(organization.name)}</p>${companyDetails.map(x => `<p>${safe(x)}</p>`).join("")}</section>
<section class="panel"><h2>${tr.customer}</h2>${customerDetails.map((x,i)=>`<p class="${i===0?"primary":""}">${safe(x)}</p>`).join("")}</section>
</div>
<div class="facts"><p><span>${tr.date}</span><b>${safe(date(document.createdAt))}</b></p><p><span>${tr.status}</span><b>${safe(label(document.status))}</b></p>
${document.validUntil ? `<p><span>${tr.validity}</span><b>${safe(date(document.validUntil))}</b></p>` : ""}
${document.expectedFulfillmentAt ? `<p><span>${tr.expected}</span><b>${safe(date(document.expectedFulfillmentAt))}</b></p>` : ""}${crossReferences}</div>
<table><thead><tr><th>#</th><th>${tr.designation}</th><th class="numeric">${tr.qty}</th>${document.kind === "order" ? `<th class="numeric">${tr.fulfilled}</th>` : ""}<th class="numeric">${tr.unit}</th><th class="numeric">${tr.discount}</th><th class="numeric">${tr.tax}</th><th class="numeric">${tr.amount}</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sum">${totalRows}</div>
${document.description ? `<section class="terms"><h2>${tr.note}</h2><p>${safe(document.description)}</p></section>` : ""}
${document.terms ? `<section class="terms"><h2>${tr.terms}</h2><p>${safe(document.terms)}</p></section>` : ""}
${deliveries}
<footer class="footer">${safe(tr.disclaimer)}<div>${safe(document.reference)} · ${safe(label(document.status))} · DTSC Platform</div></footer>
</main></body></html>`;
}

export async function printCommercialDocument(
  req: Request, organizationId: string, recordId: string, kind: DocumentKind,
) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await getEnterpriseCommonDomainAccess({
    session, organizationId, moduleCode: "SALES_QUOTES_ORDERS", action: "read",
  });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const locale: Locale = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "fr";

  // All reads are bound to the current organization. Do not load a document by id alone.
  const [organization, record] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null },
      select: { name: true, logoUrl: true, address: true, city: true, country: true, phone: true, email: true, timezone: true },
    }),
    kind === "quote"
      ? prisma.enterpriseQuote.findFirst({
        where: { id: recordId, organizationId, archivedAt: null },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      })
      : prisma.enterpriseSalesOrder.findFirst({
        where: { id: recordId, organizationId, archivedAt: null },
        include: { items: { orderBy: { sortOrder: "asc" } }, fulfillments: { orderBy: { createdAt: "desc" }, take: 30 } },
      }),
  ]);
  if (!organization || !record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const customer = await prisma.enterpriseBusinessParty.findFirst({
    where: { organizationId, id: record.businessPartyId, archivedAt: null },
    select: {
      legalName: true, displayName: true, code: true, primaryEmail: true, primaryPhone: true, taxIdentifier: true,
      addresses: { where: { status: "ACTIVE", archivedAt: null }, orderBy: [{ isPrimary: "desc" }], take: 1, select: { line1: true, line2: true, city: true, countryCode: true } },
    },
  });
  let printable: PrintData;
  if (kind === "quote") {
    const quote = record as Awaited<ReturnType<typeof prisma.enterpriseQuote.findFirst>> & {
      items: Array<{ description: string; quantity: unknown; unitPrice: unknown; discountAmount: unknown; taxAmount: unknown; lineTotal: unknown }>;
      convertedOrderId: string | null;
    };
    const order = quote.convertedOrderId
      ? await prisma.enterpriseSalesOrder.findFirst({
        where: { organizationId, id: quote.convertedOrderId, archivedAt: null }, select: { reference: true },
      }) : null;
    printable = {
      kind, reference: quote.reference, title: quote.title, description: quote.description,
      status: quote.status, currency: quote.currency, createdAt: quote.createdAt, validUntil: quote.validUntil,
      terms: quote.terms, relatedReference: order?.reference,
      subtotal: quote.subtotalAmount, discounts: quote.discountAmount, taxes: quote.taxAmount, total: quote.totalAmount,
      lines: quote.items,
    };
  } else {
    const order = record as Awaited<ReturnType<typeof prisma.enterpriseSalesOrder.findFirst>> & {
      items: Array<{ description: string; quantityOrdered: unknown; quantityFulfilled: unknown; unitPrice: unknown; discountAmount: unknown; taxAmount: unknown; lineTotal: unknown }>;
      fulfillments: Array<{ reference: string; status: string; createdAt: Date }>;
      quoteId: string | null;
    };
    const source = order.quoteId
      ? await prisma.enterpriseQuote.findFirst({
        where: { organizationId, id: order.quoteId, archivedAt: null }, select: { reference: true },
      }) : null;
    printable = {
      kind, reference: order.reference, title: order.title, description: order.description,
      status: order.status, currency: order.currency, createdAt: order.createdAt,
      expectedFulfillmentAt: order.expectedFulfillmentAt, sourceReference: source?.reference,
      subtotal: order.subtotalAmount, discounts: order.discountAmount, taxes: order.taxAmount, total: order.totalAmount,
      lines: order.items.map(({ description, quantityOrdered, quantityFulfilled, unitPrice, discountAmount, taxAmount, lineTotal }) =>
        ({ description, quantity: quantityOrdered, quantityFulfilled, unitPrice, discountAmount, taxAmount, lineTotal })),
      deliveries: order.fulfillments,
    };
  }
  const html = renderPrintHtml({ organizationId, organization, customer, document: printable, locale });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt,
    metadata: { organizationId, documentType: kind, domain: "sales-commercial-print", reference: printable.reference, status: printable.status },
  });
  const downloadName = recordId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "document";
  return new NextResponse(html, {
    status: 200, headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
      "content-disposition": `inline; filename="${kind}-${downloadName}.html"`,
    },
  });
}
