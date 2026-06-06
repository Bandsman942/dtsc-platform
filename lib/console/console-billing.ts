import { getPlanUsageLimits } from "@/lib/billing/plan-limits";
import { resolveSaasPlanCode } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";

export async function getConsoleBillingDataset({ loadBillingDetails }: { loadBillingDetails: boolean }) {
  const payments = loadBillingDetails ? await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: true, subscription: { include: { plan: true } } },
    take: 200,
  }) : [];
  const organizations = loadBillingDetails ? await prisma.organization.findMany({
    where: { organizationType: "CLIENT", deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      members: { where: { status: "ACTIVE", removedAt: null }, select: { id: true } },
      enterpriseModules: { select: { id: true, isEnabled: true } },
      billingRecords: { orderBy: { createdAt: "desc" }, take: 1 },
      subscriptions: {
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        include: {
          plan: { select: { id: true, name: true, slug: true, priceUsd: true } },
          billingRecords: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
    take: 200,
  }) : [];
  const plans = loadBillingDetails ? await prisma.billingPlan.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { priceUsd: "asc" }],
    select: { id: true, name: true, slug: true, priceUsd: true },
  }) : [];

  return {
    payments,
    billingPlanOptions: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      priceUsd: Number(plan.priceUsd),
      planCode: resolveSaasPlanCode(plan),
      limits: getPlanUsageLimits(resolveSaasPlanCode(plan)),
    })),
    organizationSubscriptionItems: organizations.map((organization) => {
      const subscription = organization.subscriptions[0] || null;
      const planCode = subscription ? resolveSaasPlanCode(subscription.plan) : null;
      const limits = planCode ? getPlanUsageLimits(planCode) : null;
      const latestBillingRecord = subscription?.billingRecords[0] || organization.billingRecords[0] || null;
      return {
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug || organization.id,
        organizationStatus: organization.status,
        activeUsers: organization.members.length,
        enabledModules: organization.enterpriseModules.filter((enterpriseModule) => enterpriseModule.isEnabled).length,
        totalModules: organization.enterpriseModules.length,
        subscription: subscription ? {
          id: subscription.id,
          planId: subscription.planId,
          planName: subscription.plan.name,
          planCode: planCode || "STARTER",
          priceUsd: Number(subscription.plan.priceUsd),
          status: subscription.status,
          startedAt: subscription.startedAt?.toISOString() || null,
          trialEndsAt: subscription.trialEndsAt?.toISOString() || null,
          expiresAt: subscription.expiresAt?.toISOString() || null,
          createdAt: subscription.createdAt.toISOString(),
          updatedAt: subscription.updatedAt.toISOString(),
          limits: limits || getPlanUsageLimits("STARTER"),
        } : null,
        history: organization.subscriptions.map((historyItem) => ({
          id: historyItem.id,
          planName: historyItem.plan.name,
          planCode: resolveSaasPlanCode(historyItem.plan),
          priceUsd: Number(historyItem.plan.priceUsd),
          status: historyItem.status,
          startedAt: historyItem.startedAt?.toISOString() || null,
          trialEndsAt: historyItem.trialEndsAt?.toISOString() || null,
          expiresAt: historyItem.expiresAt?.toISOString() || null,
          createdAt: historyItem.createdAt.toISOString(),
          updatedAt: historyItem.updatedAt.toISOString(),
        })),
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
    billingSummary: {
      organizations: organizations.length,
      active: organizations.filter((organization) => organization.subscriptions[0]?.status === "ACTIVE").length,
      trial: organizations.filter((organization) => organization.subscriptions[0]?.status === "TRIAL").length,
      attention: organizations.filter((organization) => {
        const status = organization.subscriptions[0]?.status;
        return status === "PAST_DUE" || status === "PENDING_PAYMENT" || status === "SUSPENDED";
      }).length,
      withoutSubscription: organizations.filter((organization) => !organization.subscriptions[0]).length,
      monthlyRecurringRevenueUsd: organizations.reduce((total, organization) => {
        const subscription = organization.subscriptions[0];
        return subscription?.status === "ACTIVE" ? total + Number(subscription.plan.priceUsd) : total;
      }, 0),
    },
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
