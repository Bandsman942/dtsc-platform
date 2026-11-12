import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { evaluateDgiReadiness } from "@/lib/enterprise/accounting/dgi-fiscalization-readiness";
import { normalizeTaxCountryCode } from "@/lib/enterprise/accounting/tax-jurisdictions";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";
import { Prisma } from "@prisma/client";

type Params = { params: Promise<{ organizationId: string; invoiceId: string }> };
function declaredIdentity(json: Prisma.JsonValue | null | undefined) {
  const settings = json && typeof json === "object" && !Array.isArray(json) ? json : {};
  const registration = settings.fiscalRegistration;
  const declared = registration && typeof registration === "object" && !Array.isArray(registration) ? registration : {};
  return {
    nif: typeof declared.nif === "string" ? declared.nif : null,
    rccm: typeof declared.rccm === "string" ? declared.rccm : null,
  };
}
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECEIVABLES", "view");
  if (!auth.ok) return auth.response;
  try {
    const invoice = await prisma.enterpriseSalesInvoice.findFirst({
      where: { organizationId, id: invoiceId, archivedAt: null },
      include: { items: true, retailCheckout: { select: { siteId: true } } },
    });
    if (!invoice) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
    const siteScope = await retailFinanceReadSiteScope(organizationId, auth.session.userId, "VIEW_SALES");
    if (invoice.retailCheckout && siteScope !== null && !siteScope.includes(invoice.retailCheckout.siteId)) {
      throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
    }
    const [organization, customer] = await Promise.all([
      prisma.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", deletedAt: null }, select: { name: true, country: true, address: true, settingsJson: true } }),
      prisma.enterpriseBusinessParty.findFirst({ where: { organizationId, id: invoice.businessPartyId, archivedAt: null }, select: { legalName: true, taxIdentifier: true } }),
    ]);
    if (!organization || !customer) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
    const fiscal = declaredIdentity(organization.settingsJson);
    const report = evaluateDgiReadiness({
      companyCountry: normalizeTaxCountryCode(organization.country),
      seller: { legalName: organization.name, nif: fiscal.nif, rccm: fiscal.rccm, address: organization.address },
      buyer: { legalName: customer.legalName, nif: customer.taxIdentifier },
      invoice: {
        number: invoice.number, issueDate: invoice.issuedAt,
        status: invoice.status, currencyCode: invoice.currencyCode,
        subtotal: invoice.subtotal.toFixed(), taxTotal: invoice.taxTotal.toFixed(), grandTotal: invoice.grandTotal.toFixed(),
        lines: invoice.items.map((item) => ({
          description: item.description, quantity: item.quantity.toFixed(), unitPrice: item.unitPrice.toFixed(),
          taxAmount: item.taxAmount.toFixed(), taxCodeId: item.taxCodeId, taxBreakdownJson: item.taxBreakdownJson,
        })),
      },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt,
      metadata: { organizationId, domain: "fiscalization-readiness", invoiceId, readyForLegalReview: report.readyForLegalReview } });
    return NextResponse.json({ report, disclaimer: "Read-only pre-check. Not a DGI invoice; no DEF/e-DEF certificate, transmission, serial or QR is issued." });
  } catch (error) {
    return financeErrorResponse(error, "DGI_READINESS_CHECK_FAILED");
  }
}
