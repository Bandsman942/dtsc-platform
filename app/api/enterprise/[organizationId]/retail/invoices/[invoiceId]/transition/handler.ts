import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { transitionSalesInvoice } from "@/lib/enterprise/accounting/receivables-service";
import { decideSalesInvoiceAssignedApproval, submitSalesInvoiceForAssignedApproval } from "@/lib/enterprise/accounting/accounting-invoice-approval-orchestration";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { retailFinanceReadSiteScope, siteStaffCapabilities } from "@/lib/enterprise/retail/site-access";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { requireRetailSiteCapability } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";

type Params = { params: Promise<{ organizationId: string; invoiceId: string }> };
const transitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CANCEL"), revision: z.number().int().positive(), reason: z.string().trim().min(4).max(1000) }).strict(),
  z.object({ action: z.literal("SUBMIT"), revision: z.number().int().positive(), approverUserId: z.string().trim().min(1).max(191), reason: z.string().trim().max(1000).optional() }).strict(),
  z.object({ action: z.literal("APPROVE"), revision: z.number().int().positive(), reason: z.string().trim().max(1000).optional() }).strict(),
  z.object({ action: z.literal("REJECT"), revision: z.number().int().positive(), reason: z.string().trim().min(4).max(1000) }).strict(),
  z.object({ action: z.literal("REQUEST_CORRECTION"), revision: z.number().int().positive(), reason: z.string().trim().min(4).max(1000) }).strict(),
  z.object({ action: z.literal("ISSUE"), revision: z.number().int().positive(), reason: z.string().trim().max(1000).optional() }).strict(),
]);

/** POS is a permissioned adapter to the same canonical Finance invoice state
 * machine; it never creates a parallel approval, receivable or journal. */
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = transitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_INVOICE_TRANSITION_INPUT_INVALID", req);
  try {
    const checkout = await prisma.enterpriseRetailInvoiceCheckout.findFirst({
      where: { organizationId, salesInvoiceId: invoiceId },
      select: { siteId: true, invoice: { select: { status: true, revision: true, createdByUserId: true, number: true } } },
    });
    if (!checkout) throw new EnterpriseRetailError("RETAIL_INVOICE_NOT_FOUND", 404);
    if (["SUBMIT", "CANCEL"].includes(parsed.data.action)) {
      await requireRetailSiteCapability(organizationId, auth.session.userId, checkout.siteId,
        parsed.data.action === "CANCEL" ? "CANCEL_UNPAID_INVOICE" : "PREPARE_INVOICE", prisma, { requireAssignment: true });
      if (!(["DRAFT", "REJECTED"].includes(checkout.invoice.status))) throw new EnterpriseRetailError("RETAIL_INVOICE_CANCELLATION_NOT_ALLOWED", 409);
    } else if (parsed.data.action === "ISSUE") {
      // Managers inherit emission within their own assigned store. A Finance
      // poster also qualifies, but must stay inside their Finance read scope.
      const assignment = await prisma.enterpriseRetailSiteAssignment.findFirst({
        where: { organizationId, siteId: checkout.siteId, userId: auth.session.userId, isActive: true }, select: { roleCode: true, permissionsJson: true },
      });
      const membership = await prisma.organizationMember.findFirst({ where: { organizationId, userId: auth.session.userId, status: "ACTIVE", removedAt: null }, select: { role: true } });
      const finance = await resolveEnterpriseModuleAccess({ userId: auth.session.userId, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "manage" });
      const scoped = await retailFinanceReadSiteScope(organizationId, auth.session.userId, "VIEW_SALES");
      const financeAllowed = finance.allowed && (scoped === null || scoped.includes(checkout.siteId));
      if (!assignment || !siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson).includes("ISSUE_INVOICE")) {
        if (!["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"].includes(membership?.role || "") && !financeAllowed) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
      }
    } else {
      // A designated Finance approver is mandatory even for a store manager.
      const finance = await resolveEnterpriseModuleAccess({ userId: auth.session.userId, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "approve" });
      const scoped = await retailFinanceReadSiteScope(organizationId, auth.session.userId, "VIEW_SALES");
      if (!finance.allowed || (scoped !== null && !scoped.includes(checkout.siteId))) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
    }
    if (checkout.invoice.revision !== parsed.data.revision) throw new EnterpriseRetailError("RETAIL_INVOICE_REVISION_CONFLICT", 409);

    // Finance checks status and revision again while holding the invoice row
    // lock in a serializable transaction; concurrent approval cannot be lost.
    const invoice = parsed.data.action === "SUBMIT"
      ? await submitSalesInvoiceForAssignedApproval(organizationId, invoiceId, auth.session.userId, parsed.data, { retailInvoiceSiteId: checkout.siteId })
      : ["APPROVE", "REJECT", "REQUEST_CORRECTION"].includes(parsed.data.action)
        ? await decideSalesInvoiceAssignedApproval(organizationId, invoiceId, auth.session.userId, parsed.data as { action: "APPROVE" | "REJECT" | "REQUEST_CORRECTION"; revision: number; reason?: string })
        : await transitionSalesInvoice(organizationId, invoiceId, auth.session.userId, parsed.data as { action: "CANCEL" | "ISSUE"; revision: number; reason?: string });
    await writeAuditLog({
      userId: auth.session.userId, action: `ENTERPRISE_RETAIL_INVOICE_${parsed.data.action}`,
      entity: "EnterpriseSalesInvoice", entityId: invoice.id, request: req,
      metadata: { organizationId, siteId: checkout.siteId, reason: parsed.data.reason, approverUserId: parsed.data.action === "SUBMIT" ? parsed.data.approverUserId : undefined },
    });
    if (["APPROVE", "REJECT", "REQUEST_CORRECTION", "ISSUE"].includes(parsed.data.action) && checkout.invoice.createdByUserId !== auth.session.userId) {
      const title = parsed.data.action === "ISSUE" ? "Facture émise" : parsed.data.action === "APPROVE" ? "Facture approuvée" : parsed.data.action === "REJECT" ? "Facture refusée" : "Correction de facture demandée";
      // Notification delivery is secondary to the committed Finance decision.
      await notifyUser({ userId: checkout.invoice.createdByUserId, organizationId, type: "ENTERPRISE_APPROVAL", title, body: `Facture ${checkout.invoice.number} : ${title.toLowerCase()}.`, targetUrl: `/enterprise-modules/RETAIL_POS?section=invoices&q=${encodeURIComponent(checkout.invoice.number)}` }).catch(() => {});
    }
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-checkout-invoices", action: parsed.data.action } });
    return NextResponse.json({ ok: true, invoice }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_TRANSITION_FAILED");
  }
}
