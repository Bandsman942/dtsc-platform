import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import {
  approveSalesInvoiceAssignedApproval,
  decideSalesInvoiceAssignedApproval,
  submitSalesInvoiceForAssignedApproval,
} from "@/lib/enterprise/accounting/accounting-invoice-approval-orchestration";
import { assignedSalesInvoiceTransitionSchema } from "@/lib/enterprise/accounting/accounting-approval-schemas";
import { transitionSalesInvoice } from "@/lib/enterprise/accounting/receivables-service";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";

type Params = { params: Promise<{ organizationId: string; invoiceId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId } = await params;
  const parsed = assignedSalesInvoiceTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error);

  const action = ["APPROVE", "REJECT", "REQUEST_CORRECTION"].includes(parsed.data.action) ? "approve" : parsed.data.action === "ISSUE" ? "post" : "submit";
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECEIVABLES", action, { mutation: true, limit: 100 });
  if (!auth.ok) return auth.response;

  try {
    const retail = await prisma.enterpriseRetailInvoiceCheckout.findFirst({ where: { organizationId, salesInvoiceId: invoiceId }, select: { siteId: true } });
    if (retail) {
      const scopedSites = await retailFinanceReadSiteScope(organizationId, auth.session.userId, "VIEW_SALES");
      if (scopedSites !== null && !scopedSites.includes(retail.siteId)) throw new EnterpriseAccountingError("RETAIL_SITE_ACCESS_DENIED", 403);
    }
    const invoice = parsed.data.action === "SUBMIT"
      ? await submitSalesInvoiceForAssignedApproval(organizationId, invoiceId, auth.session.userId, parsed.data)
      : parsed.data.action === "APPROVE"
        ? await approveSalesInvoiceAssignedApproval(organizationId, invoiceId, auth.session.userId, parsed.data)
        : parsed.data.action === "REJECT" || parsed.data.action === "REQUEST_CORRECTION"
          ? await decideSalesInvoiceAssignedApproval(organizationId, invoiceId, auth.session.userId, parsed.data)
        : await transitionSalesInvoice(organizationId, invoiceId, auth.session.userId, parsed.data);

    await writeAuditLog({
      userId: auth.session.userId,
      action: `ENTERPRISE_SALES_INVOICE_${parsed.data.action}`,
      entity: "EnterpriseSalesInvoice",
      entityId: invoiceId,
      request: req,
      metadata: {
        organizationId,
        reason: parsed.data.reason,
        approverUserId: parsed.data.action === "SUBMIT" ? parsed.data.approverUserId : undefined,
      },
    });
    if (["APPROVE", "REJECT", "REQUEST_CORRECTION", "ISSUE"].includes(parsed.data.action) && invoice.createdByUserId !== auth.session.userId) {
      const title = parsed.data.action === "ISSUE" ? "Facture client émise" : parsed.data.action === "APPROVE" ? "Facture client approuvée" : parsed.data.action === "REJECT" ? "Facture client refusée" : "Correction de facture demandée";
      await notifyUser({
        userId: invoice.createdByUserId, organizationId, type: "ENTERPRISE_APPROVAL", title,
        body: `Facture ${invoice.number} : ${title.toLowerCase()}.`,
        targetUrl: retail ? `/enterprise-modules/RETAIL_POS?section=invoices&q=${encodeURIComponent(invoice.number)}` : `/enterprise-modules/FINANCE_RECEIVABLES?invoiceId=${encodeURIComponent(invoice.id)}`,
      }).catch(() => {});
    }
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "sales-invoices", action: parsed.data.action },
    });
    return NextResponse.json({ ok: true, invoice });
  } catch (error) {
    return financeErrorResponse(error, "SALES_INVOICE_TRANSITION_FAILED");
  }
}
