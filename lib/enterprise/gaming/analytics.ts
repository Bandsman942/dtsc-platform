import { prisma } from "@/lib/prisma";

const DAY_MS = 86_400_000;

function clampPeriodDays(value: number | undefined) {
  return Math.min(366, Math.max(1, Math.trunc(value || 30)));
}

function decimalNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type GamingDashboardOptions = {
  periodDays?: number;
  includeAssets?: boolean;
  includeFinance?: boolean;
};

export async function getGamingDashboardSnapshot(organizationId: string, options: GamingDashboardOptions = {}) {
  const periodDays = clampPeriodDays(options.periodDays);
  const asOf = new Date();
  const periodStart = new Date(asOf.getTime() - periodDays * DAY_MS);

  const stations = await prisma.enterpriseGamingStationProfile.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { stationCode: "asc" }],
    select: { id: true, assetId: true, stationCode: true, displayName: true, status: true },
  });
  const stationIds = stations.map((station) => station.id);
  const assetIds = stations.map((station) => station.assetId);

  const [activeSessions, sessionAggregate, sessionsByStatus, bookingsByStatus, upcomingTournaments] = await Promise.all([
    prisma.enterpriseGamingSession.count({
      where: { organizationId, archivedAt: null, status: { in: ["ACTIVE", "PAUSED"] } },
    }),
    prisma.enterpriseGamingSession.aggregate({
      where: { organizationId, archivedAt: null, endedAt: { gte: periodStart, lte: asOf } },
      _count: { _all: true },
      _sum: { billableSeconds: true },
    }),
    prisma.enterpriseGamingSession.groupBy({
      by: ["status"],
      where: { organizationId, archivedAt: null, createdAt: { gte: periodStart, lte: asOf } },
      _count: { _all: true },
    }),
    prisma.enterpriseGamingBooking.groupBy({
      by: ["status"],
      where: { organizationId, archivedAt: null, scheduledStartAt: { gte: periodStart, lte: asOf } },
      _count: { _all: true },
    }),
    prisma.enterpriseGamingTournament.count({
      where: { organizationId, archivedAt: null, status: { in: ["REGISTRATION_OPEN", "REGISTRATION_CLOSED", "IN_PROGRESS"] }, endsAt: { gte: asOf } },
    }),
  ]);

  const stationStatus = Object.fromEntries(
    ["AVAILABLE", "IN_USE", "RESERVED", "MAINTENANCE", "OUT_OF_SERVICE"].map((status) => [
      status,
      stations.filter((station) => station.status === status).length,
    ]),
  );
  const sessionStatus = Object.fromEntries(sessionsByStatus.map((row) => [row.status, row._count._all]));
  const bookingStatus = Object.fromEntries(bookingsByStatus.map((row) => [row.status, row._count._all]));
  const completedBookings = Object.entries(bookingStatus)
    .filter(([status]) => ["CHECKED_IN", "CONVERTED", "NO_SHOW"].includes(status))
    .reduce((sum, [, count]) => sum + Number(count), 0);
  const noShowCount = Number(bookingStatus.NO_SHOW || 0);
  const noShowRate = completedBookings > 0 ? Math.round((noShowCount / completedBookings) * 10_000) / 100 : 0;
  const billableHours = Math.round((Number(sessionAggregate._sum.billableSeconds || 0) / 3600) * 100) / 100;
  const occupancyRate = stations.length > 0 ? Math.round((activeSessions / stations.length) * 10_000) / 100 : 0;

  let assetSignals: {
    incidentsOpen: number;
    maintenanceOpen: number;
    incidentsCritical: number;
    maintenanceOverdue: number;
  } | null = null;
  if (options.includeAssets && assetIds.length > 0) {
    const [incidentsOpen, maintenanceOpen, incidentsCritical, maintenanceOverdue] = await Promise.all([
      prisma.enterpriseAssetIncident.count({
        where: { organizationId, assetId: { in: assetIds }, archivedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] } },
      }),
      prisma.enterpriseAssetMaintenance.count({
        where: { organizationId, assetId: { in: assetIds }, archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      }),
      prisma.enterpriseAssetIncident.count({
        where: { organizationId, assetId: { in: assetIds }, archivedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] }, severity: { in: ["HIGH", "CRITICAL"] } },
      }),
      prisma.enterpriseAssetMaintenance.count({
        where: { organizationId, assetId: { in: assetIds }, archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] }, dueAt: { lt: asOf } },
      }),
    ]);
    assetSignals = { incidentsOpen, maintenanceOpen, incidentsCritical, maintenanceOverdue };
  }

  let financialByCurrency: Array<{
    currency: string;
    invoiceCount: number;
    billedAmount: number;
    outstandingAmount: number;
    averageBasket: number;
  }> | null = null;
  if (options.includeFinance) {
    const [checkoutLinks, tournamentLinks] = await Promise.all([
      prisma.enterpriseGamingCheckout.findMany({
        where: { organizationId, createdAt: { gte: periodStart, lte: asOf }, status: { not: "CANCELLED" } },
        select: { salesInvoiceId: true },
      }),
      prisma.enterpriseGamingTournamentRegistration.findMany({
        where: { organizationId, createdAt: { gte: periodStart, lte: asOf }, salesInvoiceId: { not: null } },
        select: { salesInvoiceId: true },
      }),
    ]);
    const invoiceIds = [...new Set([
      ...checkoutLinks.map((row) => row.salesInvoiceId),
      ...tournamentLinks.map((row) => row.salesInvoiceId).filter((id): id is string => Boolean(id)),
    ])];
    const invoices = invoiceIds.length
      ? await prisma.enterpriseSalesInvoice.findMany({
          where: {
            organizationId,
            id: { in: invoiceIds },
            status: { notIn: ["DRAFT", "CANCELLED", "VOIDED"] },
            archivedAt: null,
          },
          select: { currencyCode: true, grandTotal: true, outstandingAmount: true },
        })
      : [];
    const byCurrency = new Map<string, { invoiceCount: number; billedAmount: number; outstandingAmount: number }>();
    for (const invoice of invoices) {
      const current = byCurrency.get(invoice.currencyCode) || { invoiceCount: 0, billedAmount: 0, outstandingAmount: 0 };
      current.invoiceCount += 1;
      current.billedAmount += decimalNumber(invoice.grandTotal);
      current.outstandingAmount += decimalNumber(invoice.outstandingAmount);
      byCurrency.set(invoice.currencyCode, current);
    }
    financialByCurrency = [...byCurrency.entries()].map(([currency, value]) => ({
      currency,
      invoiceCount: value.invoiceCount,
      billedAmount: Math.round(value.billedAmount * 100) / 100,
      outstandingAmount: Math.round(value.outstandingAmount * 100) / 100,
      averageBasket: value.invoiceCount > 0 ? Math.round((value.billedAmount / value.invoiceCount) * 100) / 100 : 0,
    }));
  }

  return {
    asOf: asOf.toISOString(),
    periodStart: periodStart.toISOString(),
    periodDays,
    operational: {
      stationCount: stations.length,
      activeSessions,
      sessionsEnded: sessionAggregate._count._all,
      billableHours,
      occupancyRate,
      noShowCount,
      noShowRate,
      upcomingTournaments,
      stationStatus,
      sessionStatus,
      bookingStatus,
    },
    assetSignals,
    financialByCurrency,
    stations: stations.map((station) => ({ ...station, assetDeepLink: `/enterprise-modules/ASSETS_MAINTENANCE?assetId=${encodeURIComponent(station.assetId)}` })),
  };
}
