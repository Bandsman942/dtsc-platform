import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { retailInvoiceVisibleSites } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

/** Read-only reconciliation of POS invoice collection proposals against
 * canonical EnterprisePayment. It never copies or posts another payment. */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  try {
    const configuration = await prisma.enterpriseRetailConfiguration.findUnique({
      where: { organizationId }, select: { settingsJson: true },
    });
    const settings = configuration?.settingsJson;
    if (!settings || typeof settings !== "object" || Array.isArray(settings) || settings.invoiceCheckoutEnabled !== true) {
      return NextResponse.json({ active: false, items: [], pagination: { page: 1, pageSize: 20, total: 0, pageCount: 1 } }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const visibility = await retailInvoiceVisibleSites(organizationId, auth.session.userId);
    const { page, pageSize, status } = retailListParams(req);
    const params = new URL(req.url).searchParams;
    const siteId = params.get("siteId") || undefined;
    const search = (params.get("search") || "").trim().slice(0, 120);
    const from = params.get("from") || "";
    const to = params.get("to") || "";
    const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!validDate(from) || !validDate(to) || (from && to && from > to)) {
      return NextResponse.json({ error: "RETAIL_DATE_RANGE_INVALID", message: "Vérifiez la période de recherche." }, { status: 400 });
    }
    if (siteId && !visibility.isOwner && !visibility.collectibleSiteIds.includes(siteId)) {
      return NextResponse.json({ error: "RETAIL_SITE_ACCESS_DENIED" }, { status: 403 });
    }
    const where: Prisma.EnterpriseRetailInvoicePaymentProposalWhereInput = {
      organizationId,
      checkout: { organizationId, ...(visibility.isOwner
        ? (siteId ? { siteId } : {})
        : { siteId: siteId || { in: visibility.collectibleSiteIds } }) },
      ...(status ? { payment: { status } } : {}),
      ...(search ? { OR: [
        { payment: { number: { contains: search, mode: "insensitive" } } },
        { checkout: { invoice: { number: { contains: search, mode: "insensitive" } } } },
        { checkout: { site: { name: { contains: search, mode: "insensitive" } } } },
      ] } : {}),
      ...(from || to ? { createdAt: {
        ...(from ? { gte: new Date(from + "T00:00:00.000Z") } : {}),
        ...(to ? { lt: new Date(new Date(to + "T00:00:00.000Z").getTime() + 86_400_000) } : {}),
      } } : {}),
    };
    const [proposals, total] = await Promise.all([
      prisma.enterpriseRetailInvoicePaymentProposal.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
        select: {
          id: true, createdAt: true,
          payment: { select: { id: true, number: true, status: true, amount: true, currencyCode: true, methodType: true, confirmedAt: true, reference: true } },
          checkout: { select: { site: { select: { name: true, code: true } }, invoice: { select: { id: true, number: true, status: true, outstandingAmount: true } } } },
        },
      }),
      prisma.enterpriseRetailInvoicePaymentProposal.count({ where }),
    ]);
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-invoice-payment-followup", page, status: status || null } });
    return NextResponse.json({ active: true, items: proposals.map((proposal) => ({
      id: proposal.payment.id, number: proposal.payment.number, status: proposal.payment.status,
      amount: proposal.payment.amount.toFixed(), currencyCode: proposal.payment.currencyCode,
      methodType: proposal.payment.methodType, confirmedAt: proposal.payment.confirmedAt,
      reference: proposal.payment.reference, createdAt: proposal.createdAt,
      invoice: proposal.checkout.invoice, site: proposal.checkout.site,
    })), pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_PAYMENT_FOLLOWUP_FAILED");
  }
}
