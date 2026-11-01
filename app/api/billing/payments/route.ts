import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { PaymentDomainError } from "@/lib/payments/payment-errors";
import { getTenantPayments } from "@/lib/payments/payment-service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

const filtersSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["PENDING", "ACCEPTED", "PAID", "FAILED", "CANCELED"]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict().refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), {
  message: "Période invalide.",
});

/** Client-owned SaaS payment history; never exposes DTSC treasury or EnterprisePayment. */
export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `billing-payment-history:${session.userId}`), 120, 60_000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const search = new URL(req.url).searchParams;
  const parsed = filtersSchema.safeParse(Object.fromEntries(search));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_FILTERS", message: "Vérifiez les filtres et la période demandée." }, { status: 400 });

  const target = session.activeContext === "ORGANIZATION" && session.activeOrganizationId
    ? { scope: "ORGANIZATION" as const, organizationId: session.activeOrganizationId }
    : { scope: "PERSONAL" as const, userId: session.userId };
  try {
    const result = await getTenantPayments(session, target, {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      status: parsed.data.status,
      from: parsed.data.from ? new Date(parsed.data.from) : undefined,
      to: parsed.data.to ? new Date(parsed.data.to) : undefined,
    });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { scope: target.scope, count: result.items.length } });
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof PaymentDomainError ? error.status : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { reasonCode: error instanceof PaymentDomainError ? error.code : "PAYMENT_READ_ERROR" } });
    return NextResponse.json({ error: error instanceof PaymentDomainError ? error.code : "PAYMENT_READ_ERROR" }, { status });
  }
}
