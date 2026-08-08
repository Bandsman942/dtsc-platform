import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; saleId: string }> };

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00";
}

async function customerReceiptIdentityConsent(organizationId: string, businessPartyId: string) {
  const reference = await prisma.enterprisePersonBusinessReference.findFirst({
    where: { organizationId, businessPartyId, status: "ACTIVE", archivedAt: null },
    select: { personIdentityId: true },
  });
  if (!reference) return false;
  const link = await prisma.enterpriseIdentityLink.findFirst({
    where: {
      organizationId,
      personIdentityId: reference.personIdentityId,
      status: "ACTIVE",
      purpose: "RETAIL_RECEIPT_CONTACT",
    },
    select: { id: true },
  });
  return Boolean(link);
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, saleId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;

  try {
    const sale = await prisma.enterpriseRetailSale.findFirst({
      where: { id: saleId, organizationId },
      include: {
        lines: true,
        tenders: true,
        promotionRedemptions: { select: { promotionId: true, couponCode: true, discountAmount: true, currencyCode: true } },
        returns: { select: { id: true, number: true, status: true, grandTotal: true, completedAt: true } },
      },
    });
    if (!sale) return NextResponse.json({ error: "RETAIL_SALE_NOT_FOUND" }, { status: 404 });

    const [organization, customer, profile, loyaltyEntries, storedValueEntries] = await Promise.all([
      prisma.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", deletedAt: null }, select: { name: true, logoUrl: true } }),
      sale.customerBusinessPartyId
        ? prisma.enterpriseBusinessParty.findFirst({ where: { id: sale.customerBusinessPartyId, organizationId, archivedAt: null }, select: { id: true, code: true, legalName: true, displayName: true, primaryEmail: true, primaryPhone: true } })
        : null,
      sale.customerBusinessPartyId
        ? prisma.enterpriseRetailCustomerProfile.findFirst({ where: { organizationId, businessPartyId: sale.customerBusinessPartyId, archivedAt: null }, select: { customerNumber: true, preferredLocale: true } })
        : null,
      prisma.enterpriseRetailLoyaltyEntry.findMany({ where: { organizationId, saleId }, orderBy: { createdAt: "asc" }, select: { entryType: true, points: true, monetaryAmount: true, currencyCode: true, createdAt: true } }),
      prisma.enterpriseRetailStoredValueEntry.findMany({ where: { organizationId, saleId }, orderBy: { createdAt: "asc" }, select: { entryType: true, amount: true, account: { select: { accountType: true, displayCode: true, currencyCode: true } }, createdAt: true } }),
    ]);

    const contactConsent = customer && sale.customerBusinessPartyId
      ? await customerReceiptIdentityConsent(organizationId, sale.customerBusinessPartyId)
      : false;
    const requestedLocale = new URL(req.url).searchParams.get("lang");
    const locale = requestedLocale === "en" || requestedLocale === "fr" ? requestedLocale : profile?.preferredLocale === "en" ? "en" : "fr";
    const format = new URL(req.url).searchParams.get("format") || "json";
    const customerIdentity = customer
      ? {
          id: customer.id,
          code: profile?.customerNumber || customer.code,
          name: customer.displayName || customer.legalName,
          email: contactConsent ? customer.primaryEmail : null,
          phone: contactConsent ? customer.primaryPhone : null,
          contactConsent,
        }
      : null;

    const receipt = {
      receiptVersion: 1,
      organization: { name: organization?.name || "DTSC Shop", logoUrl: organization?.logoUrl || null },
      ticket: { id: sale.id, number: sale.number, status: sale.status, soldAt: sale.soldAt, currencyCode: sale.currencyCode },
      customer: customerIdentity,
      lines: sale.lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, discountAmount: line.discountAmount, taxAmount: line.taxAmount, lineTotal: line.lineTotal })),
      totals: { subtotal: sale.subtotal, discountTotal: sale.discountTotal, taxTotal: sale.taxTotal, grandTotal: sale.grandTotal },
      tenders: sale.tenders.map((tender) => ({ methodType: tender.methodType, currencyCode: tender.currencyCode, amount: tender.amount, status: tender.status })),
      promotions: sale.promotionRedemptions,
      loyalty: loyaltyEntries,
      storedValue: storedValueEntries,
      returns: sale.returns,
      privacy: { customerContactDisclosed: contactConsent, providerSecretsDisclosed: false },
    };

    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-receipt", action: "read", saleId, format, locale, customerContactDisclosed: contactConsent } });

    if (format !== "html") return NextResponse.json(receipt);

    const title = locale === "en" ? "Sales receipt" : "Reçu de vente";
    const customerLabel = locale === "en" ? "Customer" : "Client";
    const totalLabel = locale === "en" ? "Total" : "Total";
    const taxLabel = locale === "en" ? "Tax" : "Taxes";
    const discountLabel = locale === "en" ? "Discount" : "Remise";
    const paymentLabel = locale === "en" ? "Payments" : "Paiements";
    const loyaltyLabel = locale === "en" ? "Loyalty" : "Fidélité";
    const valueLabel = locale === "en" ? "Gift cards / store credit" : "Cartes-cadeaux / avoirs";
    const printLabel = locale === "en" ? "Print" : "Imprimer";

    const linesHtml = sale.lines.map((line) => `<tr><td>${escapeHtml(line.description)}</td><td class="num">${escapeHtml(line.quantity.toString())}</td><td class="num">${money(line.unitPrice)}</td><td class="num">${money(line.lineTotal)}</td></tr>`).join("");
    const tendersHtml = sale.tenders.map((tender) => `<li>${escapeHtml(tender.methodType)} — ${money(tender.amount)} ${escapeHtml(tender.currencyCode)}</li>`).join("");
    const loyaltyHtml = loyaltyEntries.length ? loyaltyEntries.map((entry) => `<li>${escapeHtml(entry.entryType)}: ${escapeHtml(entry.points.toString())} pts</li>`).join("") : `<li>—</li>`;
    const storedHtml = storedValueEntries.length ? storedValueEntries.map((entry) => `<li>${escapeHtml(entry.account.accountType)} ${escapeHtml(entry.account.displayCode)}: ${money(entry.amount)} ${escapeHtml(entry.account.currencyCode)}</li>`).join("") : `<li>—</li>`;
    const customerHtml = customerIdentity
      ? `<p><strong>${customerLabel}:</strong> ${escapeHtml(customerIdentity.name)} <span class="muted">${escapeHtml(customerIdentity.code)}</span>${customerIdentity.email ? `<br>${escapeHtml(customerIdentity.email)}` : ""}${customerIdentity.phone ? `<br>${escapeHtml(customerIdentity.phone)}` : ""}</p>`
      : "";

    const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} ${escapeHtml(sale.number)}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#111;background:#fff}.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.muted{color:#666;font-size:.9em}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:8px 4px;border-bottom:1px solid #ddd;text-align:left}.num{text-align:right}.totals{margin-left:auto;max-width:320px}.totals div{display:flex;justify-content:space-between;padding:4px 0}.grand{font-weight:700;font-size:1.15rem;border-top:1px solid #222;margin-top:6px;padding-top:8px!important}.section{margin-top:20px}button{border:0;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer}@media print{button{display:none}body{padding:0}}</style></head><body><div class="top"><div><h1>${escapeHtml(organization?.name || "DTSC Shop")}</h1><div class="muted">${escapeHtml(title)} · ${escapeHtml(sale.number)}</div><div class="muted">${escapeHtml(sale.soldAt.toISOString())}</div></div><button onclick="window.print()">${escapeHtml(printLabel)}</button></div>${customerHtml}<table><thead><tr><th>${locale === "en" ? "Item" : "Article"}</th><th class="num">Qté</th><th class="num">PU</th><th class="num">${totalLabel}</th></tr></thead><tbody>${linesHtml}</tbody></table><div class="totals"><div><span>${discountLabel}</span><span>${money(sale.discountTotal)} ${escapeHtml(sale.currencyCode)}</span></div><div><span>${taxLabel}</span><span>${money(sale.taxTotal)} ${escapeHtml(sale.currencyCode)}</span></div><div class="grand"><span>${totalLabel}</span><span>${money(sale.grandTotal)} ${escapeHtml(sale.currencyCode)}</span></div></div><div class="section"><strong>${paymentLabel}</strong><ul>${tendersHtml}</ul></div><div class="section"><strong>${loyaltyLabel}</strong><ul>${loyaltyHtml}</ul></div><div class="section"><strong>${valueLabel}</strong><ul>${storedHtml}</ul></div><p class="muted">${locale === "en" ? "Provider credentials and secrets are never included in this receipt." : "Les identifiants et secrets des providers ne sont jamais inclus dans ce reçu."}</p></body></html>`;
    return new NextResponse(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_RECEIPT_LOAD_FAILED");
  }
}
