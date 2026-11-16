import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { enterprisePurchaseVisibilityWhere, getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; id: string }> };
function escape(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
const labels: Record<string, [string, string]> = {
  DRAFT: ["Brouillon", "Draft"], PENDING_APPROVAL: ["En attente de validation", "Awaiting approval"],
  APPROVED: ["Approuvée", "Approved"], REJECTED: ["Refusée", "Rejected"], ORDERED: ["Commandée", "Ordered"],
  PARTIALLY_RECEIVED: ["Partiellement réceptionnée", "Partially received"], RECEIVED: ["Réceptionnée", "Received"],
  CLOSED: ["Clôturée", "Closed"], CANCELLED: ["Annulée", "Cancelled"],
};
/** Printable read-only purchasing copy. Never issues an invoice or posts stock/financial entries. */
export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [organization, purchase] = await Promise.all([
    prisma.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", deletedAt: null }, select: { name: true } }),
    prisma.enterprisePurchase.findFirst({
      where: { ...enterprisePurchaseVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll }), id },
      include: {
        supplier: { select: { legalName: true, displayName: true, addressLine: true, city: true, country: true, email: true, phone: true, taxIdentifier: true } },
        items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        receipts: { orderBy: { receivedAt: "desc" }, include: { items: { select: { purchaseItemId: true, quantityReceived: true } } } },
      },
    }),
  ]);
  if (!organization || !purchase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const en = new URL(req.url).searchParams.get("lang") === "en", index = en ? 1 : 0;
  const txt = (fr: string, english: string) => en ? english : fr;
  const money = (value: unknown) => Number(value ?? 0).toLocaleString(en ? "en-GB" : "fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const number = (value: unknown) => Number(value ?? 0).toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 3 });
  const date = (value: Date | null) => value ? new Intl.DateTimeFormat(en ? "en-GB" : "fr-FR", { dateStyle: "medium", timeZone: "UTC" }).format(value) : "—";
  const voided = ["REJECTED", "CANCELLED"].includes(purchase.status);
  const pending = ["DRAFT", "PENDING_APPROVAL"].includes(purchase.status);
  const warning = voided ? txt("DOCUMENT ANNULÉ OU REFUSÉ — NE PAS EXÉCUTER", "CANCELLED OR REJECTED — DO NOT EXECUTE")
    : pending ? txt("DOCUMENT PROVISOIRE — NON VALIDÉ", "PROVISIONAL — NOT APPROVED") : "";
  const received = new Map<string, number>();
  for (const receipt of purchase.receipts) for (const line of receipt.items) {
    received.set(line.purchaseItemId, (received.get(line.purchaseItemId) || 0) + Number(line.quantityReceived));
  }
  const rows = purchase.items.map((line, i) => '<tr><td>' + (i + 1) + '</td><td>' + escape(line.description) +
    '</td><td class="num">' + number(line.quantity) + ' ' + escape(line.unit) + '</td><td class="num">' +
    number(received.get(line.id) || 0) + '</td><td class="num">' + money(line.unitPrice) +
    '</td><td class="num">' + money(line.taxAmount) + '</td><td class="num"><b>' + money(line.lineTotal) + '</b></td></tr>').join("");
  const supplier = purchase.supplier;
  const supplierName = supplier ? (supplier.displayName || supplier.legalName) : txt("Non renseigné", "Not specified");
  const supplierInfo = supplier ? [supplier.addressLine, supplier.city, supplier.country, supplier.phone, supplier.email, supplier.taxIdentifier].filter(Boolean).join(" · ") : "";
  const nonce = randomBytes(18).toString("base64");
  const css = [
    ':root{color-scheme:light}*{box-sizing:border-box}body{margin:0 auto;padding:15px;max-width:900px;background:#eaf3f8;color:#153750;font:12px system-ui,Arial,sans-serif}',
    '.toolbar{display:flex;justify-content:flex-end;margin-bottom:12px}button{background:#086994;color:white;border:0;border-radius:8px;padding:10px 16px;cursor:pointer}',
    '.paper{min-height:268mm;background:#fff;padding:28px 32px;box-shadow:0 9px 36px #143a582b}',
    'header{border-bottom:4px solid #0579a8;display:flex;justify-content:space-between;gap:16px;padding-bottom:18px}',
    '.brand{font-size:23px;font-weight:900;color:#006289}.muted{color:#5b7687;font-size:10px;line-height:1.7}',
    'h1{font-size:22px;margin:24px 0 10px}.status{padding:8px 13px;background:#e6f6fb;border-radius:40px;font-weight:800;display:inline-block}',
    '.warning{margin-top:12px;background:#fff1d1;border:1px solid #c39032;color:#754b08;padding:12px;text-align:center;font-weight:800}',
    '.warning.voided{background:#ffedf0;border-color:#bb4357;color:#9b2a3e}',
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:22px 0}.panel{border:1px solid #d8e9f1;background:#f5fafc;border-radius:9px;padding:15px;overflow-wrap:anywhere}',
    '.panel h2{font-size:10px;text-transform:uppercase;color:#37738f;margin:0 0 8px}.panel strong{display:block;font-size:15px;margin-bottom:6px}',
    '.details{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0;color:#5b7284}.details b{color:#173b54}',
    '.scroll{overflow-x:auto}table{width:100%;min-width:610px;border-collapse:collapse;margin-top:22px;font-size:10px}thead{background:#08618a;color:#fff}td,th{padding:10px 7px;text-align:left;border-bottom:1px solid #e2edf3}th{border:0}.num{text-align:right;white-space:nowrap}',
    '.totals{max-width:360px;margin:18px 0 24px auto}.totals div{display:flex;justify-content:space-between;gap:20px;padding:9px 0;border-bottom:1px solid #e2edf3}.totals .final{border-top:3px solid #037cac;font-weight:900;font-size:15px}',
    '.receipts{border:1px solid #deebf2;background:#f5fafc;padding:12px;margin-top:24px}.receipts h2{font-size:11px;margin:0 0 10px}.receipt{display:flex;justify-content:space-between;padding:5px 0}',
    'footer{border-top:1px solid #d4e6ed;color:#647a86;font-size:10px;line-height:1.6;padding-top:15px;margin-top:26px}',
    '@page{size:A4;margin:12mm}@media(max-width:600px){body{padding:5px}.paper{padding:15px;min-height:0}.grid,.details{grid-template-columns:1fr}}',
    '@media print{body{margin:0;padding:0;background:#fff;max-width:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{display:none}.paper{box-shadow:none;min-height:0;padding:0}.scroll{overflow:visible}table{min-width:0}thead{display:table-header-group}tr,header,.panel{break-inside:avoid}}',
  ].join("");
  const summary = [
    [txt("Créée le", "Created"), date(purchase.createdAt)],
    [txt("Date prévue", "Expected"), date(purchase.expectedAt)],
    [txt("Priorité", "Priority"), purchase.priority],
    [txt("Révision", "Revision"), String(purchase.revision)],
  ].map(([title, value]) => '<div>' + escape(title) + ': <b>' + escape(value) + '</b></div>').join("");
  const receiptRows = purchase.receipts.map((r) => '<div class="receipt"><b>' + escape(r.reference) + '</b><span>' + escape(date(r.receivedAt)) + '</span></div>').join("");
  const html = '<!doctype html><html lang="' + (en ? 'en' : 'fr') + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    escape(txt("Bon de commande", "Purchase order")) + ' ' + escape(purchase.reference) + '</title><style nonce="' + nonce + '">' + css +
    '</style></head><body><div class="toolbar"><button id="print" type="button">' + escape(txt("Imprimer / Enregistrer en PDF", "Print / Save as PDF")) +
    '</button></div><main class="paper"><header><div><div class="muted">DTSC PLATFORM · ERP</div><div class="brand">' +
    escape(organization.name) + '</div></div><div class="muted">' + escape(txt("Copie issue du registre achats", "Copy from procurement register")) +
    '<div>' + escape(date(new Date())) + '</div></div></header><h1>' + escape(txt("BON DE COMMANDE FOURNISSEUR", "SUPPLIER PURCHASE ORDER")) +
    '</h1><p class="muted">' + escape(txt("Référence", "Reference")) + ': <b>' + escape(purchase.reference) + '</b></p><div class="status">' +
    escape(labels[purchase.status]?.[index] || purchase.status) + '</div>' +
    (warning ? '<div class="warning ' + (voided ? 'voided' : '') + '">' + escape(warning) + '</div>' : '') +
    '<div class="grid"><div class="panel"><h2>' + escape(txt("Entreprise", "Company")) + '</h2><strong>' + escape(organization.name) +
    '</strong></div><div class="panel"><h2>' + escape(txt("Fournisseur", "Supplier")) + '</h2><strong>' + escape(supplierName) +
    '</strong><div class="muted">' + escape(supplierInfo) + '</div></div></div><div class="details">' + summary + '</div>' +
    '<div class="scroll"><table><thead><tr><th>#</th><th>' + escape(txt("Désignation", "Description")) + '</th><th class="num">' +
    escape(txt("Commandé", "Ordered")) + '</th><th class="num">' + escape(txt("Reçu", "Received")) + '</th><th class="num">' +
    escape(txt("Prix unité", "Unit price")) + '</th><th class="num">' + escape(txt("Taxe", "Tax")) + '</th><th class="num">' +
    escape(txt("Total", "Total")) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="totals"><div><span>' + escape(txt("Sous-total", "Subtotal")) + '</span><b>' + money(purchase.subtotalAmount) + ' ' +
    escape(purchase.currency) + '</b></div><div><span>' + escape(txt("Taxes", "Tax")) + '</span><b>' + money(purchase.taxAmount) + ' ' +
    escape(purchase.currency) + '</b></div><div class="final"><span>TOTAL</span><strong>' + money(purchase.totalAmount) + ' ' +
    escape(purchase.currency) + '</strong></div></div>' +
    (purchase.receipts.length ? '<section class="receipts"><h2>' + escape(txt("Réceptions enregistrées", "Recorded receipts")) +
    '</h2>' + receiptRows + '</section>' : '') +
    '<footer>' + escape(txt("Copie commerciale de l’état enregistré. Ne remplace ni facture fournisseur ni justificatif de paiement.", "Business copy of the recorded state. Not a supplier invoice or proof of payment.")) +
    '<div>DTSC Platform · ' + escape(purchase.reference) + '</div></footer></main>' +
    '<script nonce="' + nonce + '">document.getElementById("print").addEventListener("click",function(){window.print()});</script></body></html>';
  return new NextResponse(html, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'self'; style-src 'nonce-" + nonce + "'; script-src 'nonce-" + nonce + "'; form-action 'none'; connect-src 'none'",
  } });
}
