import { getPlanUsageLimits } from "@/lib/billing/plan-limits";
import { resolveSaasPlanCode } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";

export async function getConsoleBillingDataset({ loadBillingDetails }: { loadBillingDetails: boolean }) {
  const payments = loadBillingDetails ? await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: true, subscription: { include: { plan: true } } },
    take: 200,
  }) : [];
  const subscriptions = loadBillingDetails ? await prisma.organizationSubscription.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      plan: { select: { id: true, name: true, slug: true } },
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          organizationType: true,
          members: { where: { status: "ACTIVE", removedAt: null }, select: { id: true } },
          enterpriseModules: { select: { id: true, isEnabled: true } },
          billingRecords: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
      billingRecords: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: 200,
  }) : [];

  return {
    payments,
    subscriptions,
    organizationSubscriptionItems: subscriptions.map((subscription) => {
      const planCode = resolveSaasPlanCode(subscription.plan);
      const limits = getPlanUsageLimits(planCode);
      const latestBillingRecord = subscription.billingRecords[0] || subscription.organization.billingRecords[0] || null;
      return {
        id: subscription.id,
        organizationId: subscription.organizationId,
        organizationName: subscription.organization.name,
        organizationSlug: subscription.organization.slug || subscription.organization.id,
        organizationStatus: subscription.organization.status,
        subscriptionStatus: subscription.status,
        planName: subscription.plan.name,
        planCode,
        startedAt: subscription.startedAt?.toISOString() || null,
        trialEndsAt: subscription.trialEndsAt?.toISOString() || null,
        expiresAt: subscription.expiresAt?.toISOString() || null,
        nextRenewalAt: subscription.expiresAt?.toISOString() || subscription.trialEndsAt?.toISOString() || null,
        activeUsers: subscription.organization.members.length,
        enabledModules: subscription.organization.enterpriseModules.filter((enterpriseModule) => enterpriseModule.isEnabled).length,
        totalModules: subscription.organization.enterpriseModules.length,
        limits,
        latestBillingRecord: latestBillingRecord ? {
          id: latestBillingRecord.id,
          amount: Number(latestBillingRecord.amount),
          currency: latestBillingRecord.currency,
          status: latestBillingRecord.status,
          reference: latestBillingRecord.reference,
          createdAt: latestBillingRecord.createdAt.toISOString(),
        } : null,
      };
    }),
    paymentAuditItems: payments.map((payment) => ({
      id: payment.id,
      reference: payment.reference,
      userEmail: payment.user.email,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      planName: payment.subscription?.plan.name || null,
      createdAt: payment.createdAt.toISOString(),
    })),
  };
}
