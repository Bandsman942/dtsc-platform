"use client";

import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";

type PaymentAuditItem = {
  id: string;
  reference: string;
  userEmail: string;
  status: string;
  amount: number;
  currency: string;
  planName: string | null;
  createdAt: string;
};

type LogAuditItem = {
  id: string;
  source: "API" | "Webhook";
  title: string;
  detail: string;
  status: string;
  createdAt: string;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("fr-FR");
}

export function AdminAuditTables({ payments, logs }: { payments: PaymentAuditItem[]; logs: LogAuditItem[] }) {
  const paymentList = useSmartList({
    items: payments,
    pageSize: 6,
    getSearchText: (payment) => `${payment.reference} ${payment.userEmail} ${payment.status} ${payment.amount} ${payment.planName || ""}`,
  });
  const logList = useSmartList({
    items: logs,
    pageSize: 8,
    getSearchText: (log) => `${log.source} ${log.title} ${log.detail} ${log.status} ${log.createdAt}`,
  });

  return (
    <section className="grid min-w-0 gap-6 lg:grid-cols-2">
      <div className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
        <h2 className="font-black text-dtsc-ink">Audit des paiements</h2>
        <div className="mt-4">
          <ListControls
            query={paymentList.query}
            onQueryChange={paymentList.setQuery}
            page={paymentList.page}
            pageCount={paymentList.pageCount}
            totalCount={paymentList.totalCount}
            filteredCount={paymentList.filteredCount}
            placeholder="Rechercher référence, client, statut ou plan..."
            onPageChange={paymentList.setPage}
          />
        </div>
        <div className="mt-4 min-w-0 divide-y divide-dtsc-border text-sm">
          {paymentList.paginatedItems.map((payment) => (
            <div key={payment.id} className="min-w-0 py-3">
              <p className="break-words font-bold text-dtsc-ink">{payment.reference}</p>
              <p className="break-words text-dtsc-muted">
                {payment.userEmail} · {formatEnumLabel(payment.status)} · {payment.amount.toFixed(2)} {payment.currency}
              </p>
              {payment.planName && <p className="mt-1 text-xs font-semibold text-dtsc-blue">{payment.planName}</p>}
              <p className="mt-1 text-xs text-dtsc-muted">{formatDateTime(payment.createdAt)}</p>
            </div>
          ))}
          {!paymentList.filteredCount && <p className="py-4 text-sm text-dtsc-muted">Aucun paiement audité.</p>}
        </div>
      </div>
      <div className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
        <h2 className="font-black text-dtsc-ink">Logs API et webhooks</h2>
        <div className="mt-4">
          <ListControls
            query={logList.query}
            onQueryChange={logList.setQuery}
            page={logList.page}
            pageCount={logList.pageCount}
            totalCount={logList.totalCount}
            filteredCount={logList.filteredCount}
            placeholder="Rechercher route, webhook, statut ou détail..."
            onPageChange={logList.setPage}
          />
        </div>
        <div className="mt-4 min-w-0 divide-y divide-dtsc-border text-sm">
          {logList.paginatedItems.map((event) => (
            <div key={event.id} className="min-w-0 py-3">
              <p className="break-words font-bold text-dtsc-ink">{event.title}</p>
              <p className="break-words text-dtsc-muted">
                {event.source} · {formatEnumLabel(event.status)} · {formatDateTime(event.createdAt)}
              </p>
              <p className="mt-1 break-words text-xs text-dtsc-muted">{event.detail}</p>
            </div>
          ))}
          {!logList.filteredCount && <p className="py-4 text-sm text-dtsc-muted">Aucun log API récent.</p>}
        </div>
      </div>
    </section>
  );
}
