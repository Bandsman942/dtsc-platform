import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { PaymentDomainError } from "@/lib/payments/payment-errors";
import { getPaymentFinanceSummary } from "@/lib/payments/payment-service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

const MAX_PERIOD_MS = 366 * 24 * 60 * 60 * 1000;
const filtersSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
}).strict().refine(({ from, to }) => {
  const periodMs = new Date(to).getTime() - new Date(from).getTime();
  return periodMs >= 0 && periodMs <= MAX_PERIOD_MS;
}, { message: "Période invalide ou supérieure à 366 jours." });

/**
 * Internal SaaS collection activity, not recognized revenue nor a General Ledger
 * balance. Only sums within a single currency and payment status are returned.
 */
export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `dtsc-payment-finance-summary:${session.userId}`), 60, 60_000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const filters = filtersSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!filters.success) return NextResponse.json({ error: "INVALID_FILTERS", message: "Période de consultation invalide." }, { status: 400 });

  try {
    const summary = await getPaymentFinanceSummary(session, { scope: "DTSC_INTERNAL" }, {
      from: new Date(filters.data.from), to: new Date(filters.data.to),
    });
    const groups = summary.map((group) => ({
      currency: group.currency,
      status: group.status,
      count: group._count._all,
      amount: group._sum.amount?.toString() ?? "0",
    }));
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { groupCount: groups.length, basis: "PAYMENT_CREATED_AT" } });
    return NextResponse.json({
      period: filters.data, basis: "PAYMENT_CREATED_AT", accountingBalance: false, groups,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof PaymentDomainError ? error.status : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { reasonCode: error instanceof PaymentDomainError ? error.code : "PAYMENT_FINANCE_SUMMARY_ERROR" } });
    return NextResponse.json({ error: error instanceof PaymentDomainError ? error.code : "PAYMENT_FINANCE_SUMMARY_ERROR" }, { status });
  }
}
