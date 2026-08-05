import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildPaymentReference, ensureBillingPlans } from "@/lib/billing";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { initiateMaishaPayPayment, getMaishaPayProviderReference, isMaishaPayConfigured } from "@/lib/maishapay";
import { canAccessOrganizationAdministration, getActiveOrganizationId, requireActiveOrganizationMembership } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { checkoutSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  const organizationId = getActiveOrganizationId(session);
  if (!session || !organizationId) return NextResponse.json({ error: "Organization context required" }, { status: 401 });
  const membership = await requireActiveOrganizationMembership(session, organizationId);
  if (!membership || !canAccessOrganizationAdministration(membership.role)) return NextResponse.json({ error: "Organization administrator required" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `organization-checkout:${organizationId}:${session.userId}`), 20, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many checkout attempts" }, { status: 429 });
  const parsed = checkoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid checkout request" }, { status: 400 });

  await ensureBillingPlans();
  const [user, organization, plan] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId } }),
    prisma.organization.findFirst({ where: { id: organizationId, organizationType: "CLIENT", deletedAt: null } }),
    prisma.billingPlan.findFirst({ where: { id: parsed.data.planId, isActive: true, audience: { in: ["ENTERPRISE", "BOTH"] } } }),
  ]);
  if (!user || !organization || !plan) return NextResponse.json({ error: "Enterprise plan unavailable" }, { status: 404 });
  if (!isMaishaPayConfigured()) return NextResponse.json({ error: "Paid subscriptions are temporarily in maintenance", code: "MAISHAPAY_MAINTENANCE" }, { status: 503 });
  if (!parsed.data.walletId?.trim()) return NextResponse.json({ error: "Wallet number is required" }, { status: 400 });

  const reference = buildPaymentReference(organization.id, plan.id);
  const subscription = await prisma.organizationSubscription.create({
    data: { organizationId: organization.id, planId: plan.id, status: "PENDING_PAYMENT", createdByDtscUserId: session.userId, updatedByDtscUserId: session.userId },
  });
  const record = await prisma.billingRecord.create({
    data: { organizationId: organization.id, subscriptionId: subscription.id, amount: plan.priceUsd, currency: "USD", status: "PENDING", paymentMethod: "MAISHAPAY", reference, createdByUserId: session.userId },
  });

  try {
    const result = await initiateMaishaPayPayment({
      transactionReference: reference,
      amount: Number(plan.priceUsd),
      currency: "USD",
      customerFullName: organization.name,
      customerPhoneNumber: user.phone,
      customerEmailAddress: organization.email || user.email,
      provider: parsed.data.provider,
      walletId: parsed.data.walletId,
    });
    const providerReference = getMaishaPayProviderReference(result.data);
    await prisma.billingRecord.update({ where: { id: record.id }, data: { status: "ACCEPTED", invoiceUrl: providerReference ? `maishapay:${providerReference}` : null } });
    await writeAuditLog({ userId: session.userId, action: "ORGANIZATION_MAISHAPAY_CHECKOUT_CREATED", entity: "BillingRecord", entityId: record.id, metadata: { organizationId, planId: plan.id, reference, providerReference }, request: req });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, reference } });
    return NextResponse.json({ ok: true, paymentReference: reference, providerReference, status: "ACCEPTED" });
  } catch (error) {
    await prisma.billingRecord.update({ where: { id: record.id }, data: { status: "FAILED", invoiceUrl: error instanceof Error ? `error:${error.message.slice(0, 400)}` : "error:unknown" } });
    return NextResponse.json({ error: "Unable to initiate online payment" }, { status: 502 });
  }
}
