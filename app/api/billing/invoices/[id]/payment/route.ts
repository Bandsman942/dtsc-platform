import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { PaymentDomainError } from "@/lib/payments/payment-errors";
import { getInvoicePaymentState } from "@/lib/payments/payment-service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

/** Tenant-scoped, non-mutating invoice payment state; no provider payload or bank proof. */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `billing-invoice-payment:${session.userId}`), 120, 60_000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { id } = await params;
  try {
    const result = await getInvoicePaymentState(session, id);
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { lookup: "invoice-payment" } });
    return NextResponse.json(result);
  } catch (error) {
    // Do not reveal whether another tenant's invoice ID exists.
    const status = error instanceof PaymentDomainError && error.code !== "PAYMENT_ACCESS_DENIED" ? error.status : error instanceof PaymentDomainError ? 404 : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { reasonCode: status === 404 ? "INVOICE_NOT_AVAILABLE" : "INVOICE_PAYMENT_READ_ERROR" } });
    return NextResponse.json({ error: status === 404 ? "INVOICE_NOT_AVAILABLE" : error instanceof PaymentDomainError ? error.code : "INVOICE_PAYMENT_READ_ERROR" }, { status });
  }
}
