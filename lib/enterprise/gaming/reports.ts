import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { GamingReportType } from "@/lib/enterprise/gaming/report-schemas";
import { prisma } from "@/lib/prisma";

const DAY_MS = 86_400_000;

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function reportReference() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `GR-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

const LABELS: Record<GamingReportType, string> = {
  GAMING_STATION_UTILIZATION: "Utilisation des postes de jeu",
  GAMING_REVENUE: "Facturation Gaming par devise",
  GAMING_OFF_PEAK: "Périodes creuses Gaming",
  GAMING_INCIDENTS_MAINTENANCE: "Incidents & maintenance Gaming",
  GAMING_BOOKINGS_NO_SHOW: "Réservations & absences Gaming",
};

async function stationUtilization(organizationId: string, start: Date, end: Date) {
  const [stations, aggregates] = await Promise.all([
    prisma.enterpriseGamingStationProfile.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, stationCode: true, displayName: true, status: true, assetId: true },
      orderBy: [{ sortOrder: "asc" }, { stationCode: "asc" }],
    }),
    prisma.enterpriseGamingSession.groupBy({
      by: ["stationId"],
      where: { organizationId, archivedAt: null, endedAt: { gte: start, lte: end } },
      _count: { _all: true },
      _sum: { billableSeconds: true },
    }),
  ]);
  const byStation = new Map(aggregates.map((row) => [row.stationId, row]));
  return stations.map((station) => {
    const row = byStation.get(station.id);
    return {
      station: station.displayName || station.stationCode,
      status: station.status,
      sessions: row?._count._all || 0,
      billableHours: Math.round((Number(row?._sum.billableSeconds || 0) / 3600) * 100) / 100,
      asset: `/enterprise-modules/ASSETS_MAINTENANCE?assetId=${encodeURIComponent(station.assetId)}`,
    };
  });
}

async function gamingRevenue(organizationId: string, start: Date, end: Date) {
  const [checkoutLinks, tournamentLinks] = await Promise.all([
    prisma.enterpriseGamingCheckout.findMany({ where: { organizationId, createdAt: { gte: start, lte: end }, status: { not: "CANCELLED" } }, select: { salesInvoiceId: true } }),
    prisma.enterpriseGamingTournamentRegistration.findMany({ where: { organizationId, createdAt: { gte: start, lte: end }, salesInvoiceId: { not: null } }, select: { salesInvoiceId: true } }),
  ]);
  const invoiceIds = [...new Set([
    ...checkoutLinks.map((row) => row.salesInvoiceId),
    ...tournamentLinks.map((row) => row.salesInvoiceId).filter((id): id is string => Boolean(id)),
  ])];
  const invoices = invoiceIds.length ? await prisma.enterpriseSalesInvoice.findMany({
    where: { organizationId, id: { in: invoiceIds }, archivedAt: null, status: { notIn: ["DRAFT", "CANCELLED", "VOIDED"] } },
    select: { currencyCode: true, grandTotal: true, outstandingAmount: true, status: true },
  }) : [];
  const map = new Map<string, { invoiceCount: number; paidInvoiceCount: number; billedAmount: number; outstandingAmount: number }>();
  for (const invoice of invoices) {
    const current = map.get(invoice.currencyCode) || { invoiceCount: 0, paidInvoiceCount: 0, billedAmount: 0, outstandingAmount: 0 };
    current.invoiceCount += 1;
    current.paidInvoiceCount += invoice.status === "PAID" ? 1 : 0;
    current.billedAmount += amount(invoice.grandTotal);
    current.outstandingAmount += amount(invoice.outstandingAmount);
    map.set(invoice.currencyCode, current);
  }
  return [...map.entries()].map(([currency, row]) => ({
    currency,
    invoiceCount: row.invoiceCount,
    paidInvoiceCount: row.paidInvoiceCount,
    billedAmount: amount(row.billedAmount),
    outstandingAmount: amount(row.outstandingAmount),
    averageBasket: row.invoiceCount ? amount(row.billedAmount / row.invoiceCount) : 0,
  }));
}

async function offPeak(organizationId: string, start: Date, end: Date) {
  const rows = await prisma.$queryRaw<Array<{ hour: number; session_count: bigint; billable_seconds: bigint }>>(Prisma.sql`
    SELECT EXTRACT(HOUR FROM "startedAt")::int AS hour,
           COUNT(*)::bigint AS session_count,
           COALESCE(SUM(COALESCE("billableSeconds", 0)), 0)::bigint AS billable_seconds
    FROM "EnterpriseGamingSession"
    WHERE "organizationId" = ${organizationId}
      AND "archivedAt" IS NULL
      AND "startedAt" >= ${start}
      AND "startedAt" <= ${end}
    GROUP BY EXTRACT(HOUR FROM "startedAt")
    ORDER BY session_count ASC, hour ASC
  `);
  return rows.map((row) => ({ hour: `${String(Number(row.hour)).padStart(2, "0")}:00`, sessions: Number(row.session_count), billableHours: Math.round((Number(row.billable_seconds) / 3600) * 100) / 100 }));
}

async function incidentsMaintenance(organizationId: string, start: Date, end: Date) {
  const stations = await prisma.enterpriseGamingStationProfile.findMany({ where: { organizationId, archivedAt: null }, select: { assetId: true } });
  const assetIds = stations.map((station) => station.assetId);
  if (!assetIds.length) return [];
  const [incidents, maintenance] = await Promise.all([
    prisma.enterpriseAssetIncident.findMany({
      where: { organizationId, assetId: { in: assetIds }, archivedAt: null, reportedAt: { gte: start, lte: end } },
      orderBy: { reportedAt: "desc" },
      take: 250,
      select: { assetId: true, reference: true, title: true, severity: true, status: true, reportedAt: true },
    }),
    prisma.enterpriseAssetMaintenance.findMany({
      where: { organizationId, assetId: { in: assetIds }, archivedAt: null, createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: "desc" },
      take: 250,
      select: { assetId: true, reference: true, title: true, priority: true, status: true, dueAt: true, createdAt: true },
    }),
  ]);
  return [
    ...incidents.map((row) => ({ type: "INCIDENT", reference: row.reference, title: row.title, status: row.status, level: row.severity, date: row.reportedAt.toISOString(), asset: `/enterprise-modules/ASSETS_MAINTENANCE?assetId=${encodeURIComponent(row.assetId)}` })),
    ...maintenance.map((row) => ({ type: "MAINTENANCE", reference: row.reference, title: row.title, status: row.status, level: row.priority, date: (row.dueAt || row.createdAt).toISOString(), asset: `/enterprise-modules/ASSETS_MAINTENANCE?assetId=${encodeURIComponent(row.assetId)}` })),
  ];
}

async function bookingsNoShow(organizationId: string, start: Date, end: Date) {
  const groups = await prisma.enterpriseGamingBooking.groupBy({
    by: ["status"],
    where: { organizationId, archivedAt: null, scheduledStartAt: { gte: start, lte: end } },
    _count: { _all: true },
  });
  const total = groups.reduce((sum, row) => sum + row._count._all, 0);
  const noShows = groups.find((row) => row.status === "NO_SHOW")?._count._all || 0;
  return groups.map((row) => ({ status: row.status, bookings: row._count._all, sharePercent: total ? Math.round((row._count._all / total) * 10_000) / 100 : 0, noShowRate: row.status === "NO_SHOW" && total ? Math.round((noShows / total) * 10_000) / 100 : 0 }));
}

export async function generateGamingReport({ organizationId, userId, reportType, periodDays, idempotencyKey }: { organizationId: string; userId: string; reportType: GamingReportType; periodDays: number; idempotencyKey: string }) {
  const generationKey = `GAMING_REPORT:${idempotencyKey}`;
  const existing = await prisma.enterpriseReport.findFirst({ where: { organizationId, generationKey, archivedAt: null } });
  if (existing) return { report: existing, idempotent: true };
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - periodDays * DAY_MS);
  let rows: Array<Record<string, unknown>> = [];
  if (reportType === "GAMING_STATION_UTILIZATION") rows = await stationUtilization(organizationId, periodStart, periodEnd);
  if (reportType === "GAMING_REVENUE") rows = await gamingRevenue(organizationId, periodStart, periodEnd);
  if (reportType === "GAMING_OFF_PEAK") rows = await offPeak(organizationId, periodStart, periodEnd);
  if (reportType === "GAMING_INCIDENTS_MAINTENANCE") rows = await incidentsMaintenance(organizationId, periodStart, periodEnd);
  if (reportType === "GAMING_BOOKINGS_NO_SHOW") rows = await bookingsNoShow(organizationId, periodStart, periodEnd);
  const currencyValues = reportType === "GAMING_REVENUE" ? [...new Set(rows.map((row) => String(row.currency || "")).filter(Boolean))] : [];
  const snapshot = {
    data: {
      schema: `${reportType.toLowerCase()}-v1`,
      rows,
      rowCount: rows.length,
      separatedCurrencies: reportType === "GAMING_REVENUE",
    },
  } as unknown as Prisma.InputJsonValue;
  const report = await prisma.enterpriseReport.create({
    data: {
      organizationId,
      reference: reportReference(),
      title: LABELS[reportType],
      description: `Rapport Gaming généré à partir des sources canoniques pour les ${periodDays} derniers jours.`,
      reportType,
      status: "GENERATED",
      periodStart,
      periodEnd,
      currency: currencyValues.length === 1 ? currencyValues[0] : null,
      unitCode: reportType === "GAMING_OFF_PEAK" || reportType === "GAMING_STATION_UTILIZATION" ? "HOURS" : null,
      sourcePolicyCode: "GAMING_CANONICAL_V1",
      metricDefinitionCodesJson: [reportType],
      freshnessAt: periodEnd,
      generatedByUserId: userId,
      sourceModule: "GAMING_REPORTS",
      sourceEntityType: "GAMING_ANALYTICS",
      schemaVersion: 1,
      generationKey,
      calculationVersion: 1,
      filtersJson: { periodDays },
      snapshotJson: snapshot,
    },
  });
  return { report, idempotent: false };
}
