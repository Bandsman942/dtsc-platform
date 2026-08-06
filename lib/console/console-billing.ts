import { PaymentStatus, Prisma } from "@prisma/client";
import { getPlanUsageLimits } from "@/lib/billing/plan-limits";
import { getPlanCommercialLabel, getPlanModuleCatalog, PLAN_COMMERCIAL_PROFILES } from "@/lib/billing/plan-catalog";
import { resolveSaasPlanCode } from "@/lib/billing/plans";
import { buildConsolePagination, normalizeConsoleSearch, parseConsolePagination } from "@/lib/console/console-pagination";
import { prisma } from "@/lib/prisma";

export async function getConsoleBillingDataset(input: {
  page?: string | number | null;
  pageSize?: string | number | null;
  paymentPage?: string | number | null;
  search?: string | null;
  status?: string | null;
  planId?: string | null;
  paymentStatus?: PaymentStatus;
} = {}) {
  const paging = parseConsolePagination({ page: input.page, pageSize: input.pageSize, defaultPageSize: 20, maxPageSize: 100 });
  const paymentPaging = parseConsolePagination({ page: input.paymentPage, pageSize: input.pageSize, defaultPageSize: 20, maxPageSize: 100 });
  const search = normalizeConsoleSearch(input.search);
  const organizationWhere: Prisma.OrganizationWhereInput = {
    organizationType: "CLIENT",
    deletedAt: null,
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { slug: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {}),
    ...(input.status || input.planId
      ? { subscriptions: { some: { ...(input.status ? { status: input.status } : {}), ...(input.planId ? { planId: input.planId } : {}) } } }
      : {}),
  };
  const paymentWhere: Prisma.PaymentWhereInput = {
    ...(input.paymentStatus ? { status: input.paymentStatus } : {}),
    ...(search ? { OR: [{ reference: { contains: search, mode: "insensitive" } }, { providerReference: { contains: search, mode: "insensitive" } }, { user: { OR: [{ email: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } }] } : {}),
  };

  const [payments, paymentTotal, organizations, organizationTotal, plans, revenueAggregate, failedPayments, invoiceCount] = await Promise.all([
    prisma.payment.findMany({
      where: paymentWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { user: { select: { id: true, name: true, email: true } }, subscription: { include: { plan: true } }, invoice: { select: { id: true, number: true, status: true } } },
      skip: paymentPaging.skip,
      take: paymentPaging.take,
    }),
    prisma.payment.count({ where: paymentWhere }),
    prisma.organization.findMany({
      where: organizationWhere,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      include: {
        members: { where: { status: "ACTIVE", removedAt: null }, select: { id: true } },
        enterpriseModules: { select: { id: true, isEnabled: true } },
        billingRecords: { orderBy: { createdAt: "desc" }, take: 3 },
        subscriptions: {
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          include: { plan: { select: { id: true, name: true, slug: true, priceUsd: true } }, billingRecords: { orderBy: { createdAt: "desc" }, take: 1 } },
          take: 20,
        },
      },
      skip: paging.skip,
      take: paging.take,
    }),
    prisma.organization.count({ where: organizationWhere }),
    prisma.billingPlan.findMany({
      orderBy: [{ sortOrder: "asc" }, { priceUsd: "asc" }],
      select: {
        id: true, name: true, slug: true, description: true, audience: true, priceUsd: true, dailyMessageLimit: true, dailyTokenLimit: true,
        maxDocuments: true, isActive: true, sortOrder: true, updatedAt: true,
        _count: { select: { subscriptions: true, organizationSubscriptions: true, versions: true } },
        versions: { orderBy: { version: "desc" }, take: 5 },
      },
    }),
    prisma.payment.aggregate({ where: { status: { in: [PaymentStatus.ACCEPTED, PaymentStatus.PAID] } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.count({ where: { status: PaymentStatus.FAILED } }),
    prisma.invoice.count(),
  ]);

  const activePlanIds = new Set(plans.filter((plan) => plan.isActive).map((plan) => plan.id));
  const billingPlans = plans.map((plan) => {
    const planCode = resolveSaasPlanCode(plan);
    return {
      id: plan.id,
      name: getPlanCommercialLabel(planCode),
      configuredName: plan.name,
      slug: plan.slug,
      description: PLAN_COMMERCIAL_PROFILES[planCode].promiseFr,
      audience: PLAN_COMMERCIAL_PROFILES[planCode].audienceFr,
      audienceCode: plan.audience === "PERSONAL" || plan.audience === "ORGANIZATION" ? plan.audience : "BOTH",
      priceUsd: Number(plan.priceUsd),
      dailyMessageLimit: plan.dailyMessageLimit,
      dailyTokenLimit: plan.dailyTokenLimit,
      maxDocuments: plan.maxDocuments,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
      updatedAt: plan.updatedAt.toISOString(),
      userSubscriptionCount: plan._count.subscriptions,
      organizationSubscriptionCount: plan._count.organizationSubscriptions,
      versionCount: plan._count.versions,
      versions: plan.versions.map((version) => ({ ...version, priceUsd: Number(version.priceUsd), effectiveAt: version.effectiveAt.toISOString(), retiredAt: version.retiredAt?.toISOString() || null, createdAt: version.createdAt.toISOString() })),
      planCode,
      limits: getPlanUsageLimits(planCode),
      moduleCatalog: getPlanModuleCatalog(planCode),
    };
  });

  const organizationSubscriptionItems = organizations.map((organization) => {
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
      enabledModules: organization.enterpriseModules.filter((module) => module.isEnabled).length,
      totalModules: organization.enterpriseModules.length,
      subscription: subscription ? {
        id: subscription.id, planId: subscription.planId, planName: getPlanCommercialLabel(planCode || "STARTER"), planCode: planCode || "STARTER",
        priceUsd: Number(subscription.plan.priceUsd), status: subscription.status, startedAt: subscription.startedAt?.toISOString() || null,
        trialEndsAt: subscription.trialEndsAt?.toISOString() || null, expiresAt: subscription.expiresAt?.toISOString() || null,
        createdAt: subscription.createdAt.toISOString(), updatedAt: subscription.updatedAt.toISOString(), limits: limits || getPlanUsageLimits("STARTER"),
      } : null,
      history: organization.subscriptions.map((item) => {
        const historyPlanCode = resolveSaasPlanCode(item.plan);
        return { id: item.id, planName: getPlanCommercialLabel(historyPlanCode), planCode: historyPlanCode, priceUsd: Number(item.plan.priceUsd), status: item.status, startedAt: item.startedAt?.toISOString() || null, trialEndsAt: item.trialEndsAt?.toISOString() || null, expiresAt: item.expiresAt?.toISOString() || null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
      }),
      latestBillingRecord: latestBillingRecord ? { id: latestBillingRecord.id, amount: Number(latestBillingRecord.amount), currency: latestBillingRecord.currency, status: latestBillingRecord.status, reference: latestBillingRecord.reference, createdAt: latestBillingRecord.createdAt.toISOString() } : null,
    };
  });

  const paymentAuditItems = payments.map((payment) => ({
    id: payment.id, reference: payment.reference, userEmail: payment.user.email, status: payment.status, amount: Number(payment.amount), currency: payment.currency,
    planName: payment.subscription ? getPlanCommercialLabel(resolveSaasPlanCode(payment.subscription.plan)) : null,
    provider: payment.provider, providerReference: payment.providerReference, invoiceNumber: payment.invoice?.number || null,
    createdAt: payment.createdAt.toISOString(), paidAt: payment.paidAt?.toISOString() || null,
  }));

  return {
    payments,
    billingPlans,
    billingPlanOptions: billingPlans.filter((plan) => activePlanIds.has(plan.id) && (plan.audienceCode === "ORGANIZATION" || plan.audienceCode === "BOTH")).map(({ id, name, slug, priceUsd, planCode, limits, moduleCatalog }) => ({ id, name, slug, priceUsd, planCode, limits, moduleCatalog })),
    organizationSubscriptionItems,
    billingSummary: {
      organizations: organizationTotal,
      active: organizationSubscriptionItems.filter((item) => item.subscription?.status === "ACTIVE").length,
      trial: organizationSubscriptionItems.filter((item) => item.subscription?.status === "TRIAL").length,
      attention: organizationSubscriptionItems.filter((item) => ["PAST_DUE", "PENDING_PAYMENT", "SUSPENDED"].includes(item.subscription?.status || "")).length,
      withoutSubscription: organizationSubscriptionItems.filter((item) => !item.subscription).length,
      monthlyRecurringRevenueUsd: organizationSubscriptionItems.reduce((total, item) => item.subscription?.status === "ACTIVE" ? total + item.subscription.priceUsd : total, 0),
      validatedRevenue: Number(revenueAggregate._sum.amount || 0),
      validatedPaymentCount: revenueAggregate._count._all,
      failedPayments,
      invoices: invoiceCount,
    },
    paymentAuditItems,
    organizationPagination: buildConsolePagination(organizationTotal, paging.page, paging.pageSize),
    paymentPagination: buildConsolePagination(paymentTotal, paymentPaging.page, paymentPaging.pageSize),
    filters: { search, status: input.status || null, planId: input.planId || null, paymentStatus: input.paymentStatus || null },
    freshness: new Date().toISOString(),
  };
}
