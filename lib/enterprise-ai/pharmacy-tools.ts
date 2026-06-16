import { prisma } from "@/lib/prisma";

export type EnterpriseAiToolResult = {
  toolName: string;
  label: string;
  summary: string;
  data: Record<string, unknown>;
};

const CLOSED_STATUSES = ["CLOSED", "CANCELLED", "CANCELED", "ARCHIVED", "RESOLVED"];

function numberValue(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value) || 0;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function futureDate(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function getPharmacyDashboardSummary(organizationId: string): Promise<EnterpriseAiToolResult> {
  const [products, activeBatches, openAlerts, openQualityIncidents, documents] = await Promise.all([
    prisma.pharmacyProduct.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.pharmacyBatch.count({ where: { organizationId, status: "ACTIVE", quarantine: false, recall: false } }),
    prisma.pharmacyAlert.count({ where: { organizationId, status: { notIn: CLOSED_STATUSES } } }),
    prisma.pharmacyQualityIncident.count({ where: { organizationId, status: { notIn: CLOSED_STATUSES } } }),
    prisma.pharmacyDocument.count({ where: { organizationId, status: { notIn: ["ARCHIVED", "REJECTED"] } } }),
  ]);
  return {
    toolName: "pharmacy.dashboard.summary",
    label: "Synthèse pharmacie",
    summary: `${products} produits actifs, ${activeBatches} lots vendables, ${openAlerts} alertes ouvertes, ${openQualityIncidents} incidents qualité ouverts.`,
    data: { products, activeBatches, openAlerts, openQualityIncidents, documents },
  };
}

async function getLowStock(organizationId: string): Promise<EnterpriseAiToolResult> {
  const products = await prisma.pharmacyProduct.findMany({
    where: { organizationId, status: "ACTIVE", stockTrackingEnabled: true },
    take: 500,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      internalCode: true,
      minStock: true,
      saleUnit: true,
      batches: {
        where: { status: "ACTIVE", quarantine: false, recall: false, expiryDate: { gt: new Date() } },
        select: { availableQuantity: true },
      },
    },
  });
  const lowStock = products
    .map((product) => {
      const available = product.batches.reduce((sum, batch) => sum + numberValue(batch.availableQuantity), 0);
      const minimum = numberValue(product.minStock);
      return { id: product.id, name: product.name, internalCode: product.internalCode, available, minimum, unit: product.saleUnit };
    })
    .filter((product) => product.minimum > 0 && product.available <= product.minimum)
    .slice(0, 20);
  return {
    toolName: "pharmacy.stock.low",
    label: "Stocks bas",
    summary: `${lowStock.length} produit(s) sous ou au seuil minimal dans l'échantillon contrôlé.`,
    data: { items: lowStock },
  };
}

async function getExpiringBatches(organizationId: string): Promise<EnterpriseAiToolResult> {
  const batches = await prisma.pharmacyBatch.findMany({
    where: { organizationId, status: "ACTIVE", quarantine: false, recall: false, expiryDate: { lte: futureDate(90), gt: new Date() } },
    orderBy: { expiryDate: "asc" },
    take: 20,
    select: {
      id: true,
      batchNumber: true,
      expiryDate: true,
      availableQuantity: true,
      product: { select: { name: true, internalCode: true } },
    },
  });
  return {
    toolName: "pharmacy.batches.expiring",
    label: "Lots proches péremption",
    summary: `${batches.length} lot(s) arrivent à péremption dans les 90 prochains jours.`,
    data: {
      items: batches.map((batch) => ({
        id: batch.id,
        batchNumber: batch.batchNumber,
        product: batch.product.name,
        internalCode: batch.product.internalCode,
        expiryDate: batch.expiryDate.toISOString(),
        availableQuantity: numberValue(batch.availableQuantity),
      })),
    },
  };
}

async function getOpenAlerts(organizationId: string): Promise<EnterpriseAiToolResult> {
  const alerts = await prisma.pharmacyAlert.findMany({
    where: { organizationId, status: { notIn: CLOSED_STATUSES } },
    orderBy: [{ criticality: "asc" }, { lastDetectedAt: "desc" }],
    take: 12,
    select: { id: true, alertNumber: true, title: true, category: true, alertType: true, criticality: true, recommendedAction: true, dueAt: true },
  });
  return {
    toolName: "pharmacy.alerts.open",
    label: "Alertes ouvertes",
    summary: `${alerts.length} alerte(s) ouvertes remontées pour priorisation.`,
    data: { items: alerts.map((alert) => ({ ...alert, dueAt: alert.dueAt?.toISOString() || null })) },
  };
}

async function getTodaySales(organizationId: string): Promise<EnterpriseAiToolResult> {
  const sales = await prisma.pharmacySale.aggregate({
    where: { organizationId, saleDate: { gte: startOfToday() }, status: { notIn: ["CANCELLED", "CANCELED", "DRAFT"] } },
    _count: { _all: true },
    _sum: { totalAmount: true, paidAmount: true, remainingAmount: true },
  });
  return {
    toolName: "pharmacy.sales.today",
    label: "Ventes du jour",
    summary: `${sales._count._all} vente(s) enregistrées aujourd'hui pour un total de ${numberValue(sales._sum.totalAmount).toFixed(2)}.`,
    data: {
      count: sales._count._all,
      totalAmount: numberValue(sales._sum.totalAmount),
      paidAmount: numberValue(sales._sum.paidAmount),
      remainingAmount: numberValue(sales._sum.remainingAmount),
    },
  };
}

async function getCashSessions(organizationId: string): Promise<EnterpriseAiToolResult> {
  const sessions = await prisma.pharmacyCashSession.findMany({
    where: { organizationId, status: { notIn: ["CLOSED", "VALIDATED", "CANCELLED", "CANCELED"] } },
    orderBy: { openedAt: "desc" },
    take: 10,
    select: { id: true, cashSessionNumber: true, cashPointName: true, status: true, openedAt: true, openingAmount: true, totalSales: true, varianceAmount: true },
  });
  return {
    toolName: "pharmacy.cash.sessions",
    label: "Sessions de caisse",
    summary: `${sessions.length} session(s) de caisse ouvertes ou en validation.`,
    data: {
      items: sessions.map((session) => ({
        ...session,
        openedAt: session.openedAt.toISOString(),
        openingAmount: numberValue(session.openingAmount),
        totalSales: numberValue(session.totalSales),
        varianceAmount: numberValue(session.varianceAmount),
      })),
    },
  };
}

async function getOpenPurchases(organizationId: string): Promise<EnterpriseAiToolResult> {
  const orders = await prisma.pharmacyPurchaseOrder.findMany({
    where: { organizationId, status: { notIn: ["CLOSED", "CANCELLED", "CANCELED", "RECEIVED"] } },
    orderBy: { updatedAt: "desc" },
    take: 12,
    select: { id: true, orderNumber: true, status: true, priority: true, expectedDeliveryDate: true, estimatedTotal: true, supplier: { select: { name: true } } },
  });
  return {
    toolName: "pharmacy.purchases.open",
    label: "Commandes ouvertes",
    summary: `${orders.length} commande(s) fournisseur à suivre.`,
    data: { items: orders.map((order) => ({ ...order, supplier: order.supplier?.name || null, expectedDeliveryDate: order.expectedDeliveryDate?.toISOString() || null, estimatedTotal: numberValue(order.estimatedTotal) })) },
  };
}

async function getQualityIncidents(organizationId: string): Promise<EnterpriseAiToolResult> {
  const incidents = await prisma.pharmacyQualityIncident.findMany({
    where: { organizationId, status: { notIn: CLOSED_STATUSES } },
    orderBy: [{ criticality: "asc" }, { incidentDate: "desc" }],
    take: 12,
    select: { id: true, incidentNumber: true, title: true, incidentType: true, criticality: true, status: true, dueAt: true },
  });
  return {
    toolName: "pharmacy.quality.open",
    label: "Incidents qualité",
    summary: `${incidents.length} incident(s) qualité ou pharmacovigilance ouverts.`,
    data: { items: incidents.map((incident) => ({ ...incident, dueAt: incident.dueAt?.toISOString() || null })) },
  };
}

async function getDocumentsSummary(organizationId: string): Promise<EnterpriseAiToolResult> {
  const [expired, expiringSoon, pendingVerification, critical] = await Promise.all([
    prisma.pharmacyDocument.count({ where: { organizationId, expiryDate: { lt: new Date() }, status: { not: "ARCHIVED" } } }),
    prisma.pharmacyDocument.count({ where: { organizationId, expiryDate: { gte: new Date(), lte: futureDate(45) }, status: { not: "ARCHIVED" } } }),
    prisma.pharmacyDocument.count({ where: { organizationId, verificationRequired: true, verifiedAt: null, status: { not: "ARCHIVED" } } }),
    prisma.pharmacyDocument.count({ where: { organizationId, importance: "CRITICAL", status: { not: "ARCHIVED" } } }),
  ]);
  return {
    toolName: "pharmacy.documents.summary",
    label: "Documents & conformité",
    summary: `${expired} document(s) expirés, ${expiringSoon} à renouveler bientôt, ${pendingVerification} en attente de vérification.`,
    data: { expired, expiringSoon, pendingVerification, critical },
  };
}

function shouldRun(content: string, keywords: string[]) {
  const normalized = content.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

export async function runPharmacyReadTools(organizationId: string, content: string) {
  const selected: Array<() => Promise<EnterpriseAiToolResult>> = [() => getPharmacyDashboardSummary(organizationId)];
  if (shouldRun(content, ["stock", "rupture", "seuil", "réappro", "reappro", "faible"])) selected.push(() => getLowStock(organizationId));
  if (shouldRun(content, ["pérem", "perem", "expiry", "expire", "lot", "fefo"])) selected.push(() => getExpiringBatches(organizationId));
  if (shouldRun(content, ["alerte", "urgent", "risque", "priorité", "priorite"])) selected.push(() => getOpenAlerts(organizationId));
  if (shouldRun(content, ["vente", "chiffre", "recette", "dispensation"])) selected.push(() => getTodaySales(organizationId));
  if (shouldRun(content, ["caisse", "paiement", "écart", "ecart"])) selected.push(() => getCashSessions(organizationId));
  if (shouldRun(content, ["commande", "achat", "fournisseur", "réception", "reception"])) selected.push(() => getOpenPurchases(organizationId));
  if (shouldRun(content, ["qualité", "qualite", "pharmacovigilance", "incident"])) selected.push(() => getQualityIncidents(organizationId));
  if (shouldRun(content, ["document", "conformité", "conformite", "certificat"])) selected.push(() => getDocumentsSummary(organizationId));

  const uniqueToolNames = new Set<string>();
  const results: EnterpriseAiToolResult[] = [];
  for (const loadTool of selected.slice(0, 6)) {
    const result = await loadTool();
    if (!uniqueToolNames.has(result.toolName)) {
      uniqueToolNames.add(result.toolName);
      results.push(result);
    }
  }
  return results;
}
