"use client";

import { CreditCard } from "lucide-react";
import { AdminAuditTables } from "@/components/admin/admin-audit-tables";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";

type OrganizationSubscriptionItem = {
  id: string;
  organizationName: string;
  organizationSlug: string;
  organizationStatus: string;
  subscriptionStatus: string;
  planName: string;
  planCode: string;
  startedAt: string | null;
  trialEndsAt: string | null;
  expiresAt: string | null;
  nextRenewalAt: string | null;
  activeUsers: number;
  enabledModules: number;
  totalModules: number;
  limits: {
    maxUsers: number;
    maxStorageMb: number;
    maxMonthlyCallMinutes: number;
    maxActiveModules: number;
    maxDocuments: number;
    supportLevel: string;
  };
  latestBillingRecord: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    reference: string | null;
    createdAt: string;
  } | null;
};

type PaymentAuditItem = Parameters<typeof AdminAuditTables>[0]["payments"][number];

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("fr-FR") : "Non défini";
}

function statusClassName(status: string) {
  if (status === "ACTIVE" || status === "PAID" || status === "ACCEPTED") {
    return "bg-emerald-400/14 text-emerald-600";
  }
  if (status === "TRIAL" || status === "PENDING_PAYMENT" || status === "PENDING") {
    return "bg-amber-400/18 text-amber-700";
  }
  return "bg-red-500/12 text-red-700";
}

export function AdminBillingSubscriptions({
  subscriptions,
  payments,
}: {
  subscriptions: OrganizationSubscriptionItem[];
  payments: PaymentAuditItem[];
}) {
  const subscriptionList = useSmartList({
    items: subscriptions,
    pageSize: 8,
    getSearchText: (subscription) => `${subscription.organizationName} ${subscription.organizationSlug} ${subscription.planName} ${subscription.planCode} ${subscription.subscriptionStatus} ${subscription.organizationStatus}`,
  });

  return (
    <div className="space-y-6">
      <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">SaaS clients</p>
            <h2 className="mt-1 text-xl font-black text-dtsc-ink">Abonnements organisations</h2>
          </div>
          <CreditCard className="h-5 w-5 text-cyan-600" />
        </div>
        <div className="mt-4">
          <ListControls
            query={subscriptionList.query}
            onQueryChange={subscriptionList.setQuery}
            page={subscriptionList.page}
            pageCount={subscriptionList.pageCount}
            totalCount={subscriptionList.totalCount}
            filteredCount={subscriptionList.filteredCount}
            placeholder="Rechercher entreprise, plan, statut..."
            onPageChange={subscriptionList.setPage}
          />
        </div>
        <div className="mt-4 grid gap-3">
          {subscriptionList.paginatedItems.map((subscription) => (
            <article key={subscription.id} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{subscription.organizationSlug}</p>
                  <h3 className="mt-1 break-words font-black text-dtsc-ink">{subscription.organizationName}</h3>
                  <p className="mt-1 text-sm font-semibold text-dtsc-muted">{subscription.planName} · niveau {subscription.planCode}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClassName(subscription.subscriptionStatus)}`}>{formatEnumLabel(subscription.subscriptionStatus)}</span>
              </div>
              <div className="mt-4 grid gap-2 text-xs font-bold text-dtsc-muted sm:grid-cols-2 xl:grid-cols-4">
                <span>Début: {formatDate(subscription.startedAt)}</span>
                <span>Essai: {formatDate(subscription.trialEndsAt)}</span>
                <span>Fin / renouvellement: {formatDate(subscription.nextRenewalAt)}</span>
                <span>Organisation: {formatEnumLabel(subscription.organizationStatus)}</span>
                <span>Utilisateurs: {subscription.activeUsers}/{subscription.limits.maxUsers}</span>
                <span>Modules: {subscription.enabledModules}/{subscription.totalModules} activés, limite {subscription.limits.maxActiveModules}</span>
                <span>Stockage: {subscription.limits.maxStorageMb} Mo</span>
                <span>Appels: {subscription.limits.maxMonthlyCallMinutes} min/mois</span>
              </div>
              {subscription.latestBillingRecord && (
                <p className="mt-3 rounded-xl bg-dtsc-surface px-3 py-2 text-xs font-bold text-dtsc-muted">
                  Dernier paiement: {subscription.latestBillingRecord.amount.toFixed(2)} {subscription.latestBillingRecord.currency} · {formatEnumLabel(subscription.latestBillingRecord.status)} · {formatDate(subscription.latestBillingRecord.createdAt)}
                </p>
              )}
            </article>
          ))}
          {!subscriptionList.filteredCount && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm font-semibold text-dtsc-muted">Aucun abonnement organisation à afficher.</p>}
        </div>
      </section>
      <AdminAuditTables payments={payments} logs={[]} />
    </div>
  );
}
