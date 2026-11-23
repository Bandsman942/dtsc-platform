import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { readRetailInvoiceReturnPolicySnapshot } from "@/lib/enterprise/retail/invoice-return-policy";
import { retailInvoiceVisibleSites } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const OPEN = ["SUBMITTED", "INSPECTED", "APPROVED", "FINANCE_PENDING", "REFUND_PENDING"] as const;
const STATUS_OPTIONS = [...OPEN, "ALL"] as const;

/** Read-only recovery register: never migrates old policy snapshots, never
 * posts or creates financial/stock records. Real writes use the original,
 * independently authorized inspection, decision, Finance and settlement APIs.
 */
export async function GET(req: Request, { params }: Params) {
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  try {
    const visible = await retailInvoiceVisibleSites(organizationId, auth.session.userId);
    const url = new URL(req.url);
    const selectedStatus = (url.searchParams.get("status") || "ALL").trim().toUpperCase();
    const siteId = (url.searchParams.get("siteId") || "").trim();
    const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
    const rawPage = Number(url.searchParams.get("page") || 1);
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1;
    if (!STATUS_OPTIONS.some(status => status === selectedStatus)) {
      throw new EnterpriseRetailError("RETAIL_RETURN_RECOVERY_STATUS_INVALID", 400);
    }
    if (siteId && !visible.isOwner && !visible.siteIds.includes(siteId)) {
      throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
    }
    const where: Prisma.EnterpriseRetailInvoiceReturnRequestWhereInput = {
      organizationId,
      status: selectedStatus === "ALL" ? { in: [...OPEN] } : selectedStatus,
      checkout: {
        ...(visible.isOwner ? (siteId ? { siteId } : {}) :
          { siteId: siteId || { in: visible.siteIds } }),
      },
      ...(q ? { OR: [
        { number: { contains: q, mode: "insensitive" } },
        { checkout: { invoice: { number: { contains: q, mode: "insensitive" } } } },
        { salesCreditNote: { number: { contains: q, mode: "insensitive" } } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.enterpriseRetailInvoiceReturnRequest.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20,
        select: {
          id: true, number: true, status: true, revision: true, createdAt: true,
          refundAmount: true, refundPayoutAmount: true, requestedByUserId: true,
          approverUserId: true, inspectedAt: true, returnPolicySnapshot: true,
          preparedAt: true, salesCreditNoteId: true, refundPaymentId: true,
          salesCreditNote: { select: { number: true, status: true } },
          refundPayment: { select: { status: true, methodType: true } },
          refundLegs: { select: { refundPayment: { select: { status: true, methodType: true } } } },
          lines: { select: { stockDisposition: true, quantity: true, lotAllocations: true } },
          checkout: { select: {
            siteId: true, stockPostedAt: true,
            site: { select: { name: true } },
            invoice: { select: { id: true, number: true, status: true, currencyCode: true, amountPaid: true, outstandingAmount: true } },
          } },
        },
      }),
      prisma.enterpriseRetailInvoiceReturnRequest.count({ where }),
    ]);
    const result = items.map(item => {
      const original = readRetailInvoiceReturnPolicySnapshot(item.returnPolicySnapshot);
      const payoutPayments = item.refundLegs.length
        ? item.refundLegs.map(leg => leg.refundPayment)
        : item.refundPayment ? [item.refundPayment] : [];
      const approvedPayments = payoutPayments.every(payment => payment.status === "APPROVED");
      const creditReady = item.salesCreditNote?.status === "APPROVED";
      const undelivered = !item.checkout.stockPostedAt &&
        item.lines.every(line => line.stockDisposition === "UNDELIVERED_CREDIT" || line.stockDisposition === "SERVICE_CREDIT");
      const hasExternalPayout = payoutPayments.some(payment => payment.methodType !== "CASH");
      const stage = item.status === "SUBMITTED" ? "INSPECTION_REQUIRED"
        : item.status === "INSPECTED" ? "RETURN_APPROVAL_REQUIRED"
        : item.status === "APPROVED" ? (item.salesCreditNoteId || item.refundPaymentId ? "FINANCE_CONFLICT_REVIEW" : "FINANCE_PREPARATION_REQUIRED")
        : item.status === "FINANCE_PENDING" ? (creditReady && approvedPayments ? "INDEPENDENT_SETTLEMENT_REQUIRED" : "FINANCE_APPROVAL_REQUIRED")
        : "REFUND_CONFIRMATION_REQUIRED";
      return {
        id: item.id, number: item.number, status: item.status, stage,
        createdAt: item.createdAt, revision: item.revision,
        invoiceId: item.checkout.invoice.id, invoiceNumber: item.checkout.invoice.number,
        invoiceStatus: item.checkout.invoice.status, invoiceOutstanding: item.checkout.invoice.outstandingAmount.toFixed(2),
        invoiceAmountPaid: item.checkout.invoice.amountPaid.toFixed(2),
        siteId: item.checkout.siteId, siteName: item.checkout.site.name,
        currencyCode: item.checkout.invoice.currencyCode,
        creditAmount: item.refundAmount.toFixed(2),
        payoutAmount: item.refundPayoutAmount?.toFixed(2) ?? null,
        legacyStandard: original.mode !== "SIMPLIFIED",
        stockAlreadyPosted: Boolean(item.checkout.stockPostedAt),
        stockTreatment: undelivered ? "RELEASE_PROMISE_ON_COMPLETION" :
          item.lines.some(line => ["RESTOCK","QUARANTINE","DISPOSE"].includes(line.stockDisposition))
            ? "PHYSICAL_RETURN_ON_COMPLETION" : "NO_STOCK_MOVEMENT",
        hasExternalPayout, creditNoteNumber: item.salesCreditNote?.number || null,
        creditStatus: item.salesCreditNote?.status || null,
        paymentStatuses: payoutPayments.map(payment => payment.status),
      };
    });
    return NextResponse.json({
      items: result, pagination: { page, pageSize: 20, total, pageCount: Math.max(1, Math.ceil(total / 20)) },
      safeguard: "Original workflow approvals, site scopes and immutable policies are preserved. No automatic financial mutation.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_RETURN_HISTORICAL_RECOVERY_FAILED");
  }
}
