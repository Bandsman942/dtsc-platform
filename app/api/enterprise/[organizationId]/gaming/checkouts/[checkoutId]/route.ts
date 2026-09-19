import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingCheckoutAccess } from "@/lib/enterprise/gaming/access";
import { commandGamingCheckout, getGamingCheckout } from "@/lib/enterprise/gaming/checkout";
import { gamingCheckoutErrorResponse } from "@/lib/enterprise/gaming/checkout-http";
import { gamingCheckoutCommandSchema } from "@/lib/enterprise/gaming/checkout-schemas";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; checkoutId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, checkoutId } = await params;
  const [checkoutAccess, receivablesAccess, paymentsAccess] = await Promise.all([
    getEnterpriseGamingCheckoutAccess({ session, organizationId, action: "read" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "view" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_PAYMENTS", action: "view" }),
  ]);
  if (!checkoutAccess || !receivablesAccess || !paymentsAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await getGamingCheckout(organizationId, checkoutId);
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-checkout-detail", checkoutId } });
    return NextResponse.json({ ...result, canWrite: checkoutAccess.canWrite, canManage: checkoutAccess.canManage });
  } catch (error) {
    return gamingCheckoutErrorResponse(error, req);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-checkout-command:${session.userId}`), 180, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = gamingCheckoutCommandSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message }, { status: 400 });
  const { organizationId, checkoutId } = await params;
  const action = parsed.data.action;
  const gamingAction = ["APPROVE_INVOICE", "APPROVE_PAYMENT", "CANCEL", "REQUEST_REFUND", "APPROVE_REFUND"].includes(action) ? "manage" : "write";
  const checkoutAccess = await getEnterpriseGamingCheckoutAccess({ session, organizationId, action: gamingAction });
  if (!checkoutAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const financeChecks: Array<Promise<unknown>> = [];
  if (action === "APPROVE_INVOICE") {
    financeChecks.push(
      getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "approve" }),
      getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "post" }),
    );
  } else if (action === "ADD_PAYMENT") {
    financeChecks.push(
      getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_PAYMENTS", action: "create" }),
      getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_PAYMENTS", action: "submit" }),
    );
  } else if (action === "APPROVE_PAYMENT") {
    financeChecks.push(
      getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_PAYMENTS", action: "approve" }),
      getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_PAYMENTS", action: "pay" }),
    );
  } else if (action === "CANCEL") {
    financeChecks.push(getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "submit" }));
  } else if (action === "REQUEST_REFUND") {
    financeChecks.push(
      getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_PAYMENTS", action: "create" }),
      getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_PAYMENTS", action: "submit" }),
    );
  } else if (action === "APPROVE_REFUND") {
    financeChecks.push(
      getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_PAYMENTS", action: "approve" }),
      getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_PAYMENTS", action: "pay" }),
      getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "approve" }),
      getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "post" }),
    );
    const stockMovement = await prisma.enterpriseStockMovement.findFirst({
      where: { organizationId, sourceEntityType: "EnterpriseGamingCheckout", sourceEntityId: checkoutId, direction: "OUT" },
      select: { id: true },
    });
    if (stockMovement) {
      financeChecks.push(getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "write" }));
    }
  }
  const financeAccess = await Promise.all(financeChecks);
  if (financeAccess.some((access) => !access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await commandGamingCheckout(organizationId, checkoutId, session.userId, parsed.data);
    await Promise.allSettled([
      writeAuditLog({
        userId: session.userId,
        action: `ENTERPRISE_GAMING_CHECKOUT_${action}`,
        entity: "EnterpriseGamingCheckout",
        entityId: checkoutId,
        request: req,
        metadata: {
          organizationId,
          action,
          paymentId: action === "APPROVE_PAYMENT" ? parsed.data.paymentId : null,
          financialAccountId: action === "ADD_PAYMENT" || action === "REQUEST_REFUND" ? parsed.data.financialAccountId : null,
          amount: action === "ADD_PAYMENT" ? parsed.data.amount : null,
          reason: "reason" in parsed.data ? parsed.data.reason : null,
          idempotent: result.idempotent,
        },
      }),
      writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-checkout-command", checkoutId, action } }),
    ]);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return gamingCheckoutErrorResponse(error, req);
  }
}
