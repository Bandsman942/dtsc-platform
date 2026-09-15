import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { getEnterpriseGamingCheckoutAccess } from "@/lib/enterprise/gaming/access";
import { getGamingCheckoutReceipt } from "@/lib/enterprise/gaming/checkout";
import { gamingCheckoutErrorResponse } from "@/lib/enterprise/gaming/checkout-http";

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
    const receipt = await getGamingCheckoutReceipt(organizationId, checkoutId);
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-checkout-receipt", checkoutId } });
    return NextResponse.json({ receipt });
  } catch (error) {
    return gamingCheckoutErrorResponse(error, req);
  }
}
