"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, RotateCcw } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Dialog } from "@/components/ui/dialog";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";

type PaymentAuditItem = { id: string; reference: string; userEmail: string; status: string; amount: number; currency: string; planName: string | null; createdAt: string };
type LogAuditItem = { id: string; source: "API" | "Webhook" | "Audit"; title: string; detail: string; status: string; createdAt: string; requestId?: string | null; metadata?: unknown };

function formatDateTime(value: string) { return new Date(value).toLocaleString("fr-FR"); }

export function AdminAuditTables({ payments, logs, canRetryWebhooks = false }: { payments: PaymentAuditItem[]; logs: LogAuditItem[]; canRetryWebhooks?: boolean }) {
  const router = useRouter();
  const [selectedLog, setSelectedLog] = useState<LogAuditItem | null>(null);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const paymentList = useSmartList({ items: payments, pageSize: 6, getSearchText: (payment) => `${payment.reference} ${payment.userEmail} ${payment.status} ${payment.amount} ${payment.planName || ""}` });
  const logList = useSmartList({ items: logs, pageSize: 8, getSearchText: (log) => `${log.source} ${log.title} ${log.detail} ${log.status} ${log.createdAt}` });

  async function retryWebhook(event: LogAuditItem) {
    const reason = window.prompt("Motif de la relance contrôlée");
    if (!reason || reason.trim().length < 3 || !window.confirm("Relancer cet événement webhook ? Une double application sera bloquée côté serveur.")) return;
    setBusyId(event.id); setMessage("");
    const response = await fetch(`/api/admin/webhooks/${event.id}/retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const body = await response.json().catch(() => null);
    setBusyId(null); setMessage(response.ok ? "Webhook retraité et audité." : body?.reasonCode || body?.error || "Relance impossible.");
    if (response.ok) router.refresh();
  }

  return <section className="grid min-w-0 gap-6 lg:grid-cols-2">
    <div className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6"><h2 className="font-black text-dtsc-ink">Audit des paiements</h2><div className="mt-4"><ListControls query={paymentList.query} onQueryChange={paymentList.setQuery} page={paymentList.page} pageCount={paymentList.pageCount} totalCount={paymentList.totalCount} filteredCount={paymentList.filteredCount} placeholder="Rechercher référence, client, statut ou plan..." onPageChange={paymentList.setPage} /></div><div className="mt-4 min-w-0 divide-y divide-dtsc-border text-sm">{paymentList.paginatedItems.map((payment) => <div key={payment.id} className="min-w-0 py-3"><p className="break-all font-bold text-dtsc-ink">{payment.reference}</p><p className="break-all text-dtsc-muted">{payment.userEmail} · {formatEnumLabel(payment.status)} · {payment.amount.toFixed(2)} {payment.currency}</p>{payment.planName && <p className="mt-1 text-xs font-semibold text-dtsc-blue">{payment.planName}</p>}<p className="mt-1 text-xs text-dtsc-muted">{formatDateTime(payment.createdAt)}</p></div>)}{!paymentList.filteredCount && <p className="py-4 text-sm text-dtsc-muted">Aucun paiement audité.</p>}</div></div>
    <div className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-black text-dtsc-ink">Journaux d&apos;audit, API et webhooks</h2>{message ? <p role="status" className="rounded-lg bg-dtsc-soft px-2 py-1 text-xs font-bold text-dtsc-blue">{message}</p> : null}</div><div className="mt-4"><ListControls query={logList.query} onQueryChange={logList.setQuery} page={logList.page} pageCount={logList.pageCount} totalCount={logList.totalCount} filteredCount={logList.filteredCount} placeholder="Rechercher route, webhook, statut ou détail..." onPageChange={logList.setPage} /></div><div className="mt-4 min-w-0 divide-y divide-dtsc-border text-sm">{logList.paginatedItems.map((event) => {
      const retryable = event.source === "Webhook" && /FAILED|ERROR|RETRY_REQUIRED|UNMATCHED/i.test(event.status);
      const items = [{ key: "details", label: "Voir détails", icon: Eye, onSelect: () => setSelectedLog(event) }, ...(retryable && canRetryWebhooks ? [{ key: "retry", label: busyId === event.id ? "Relance…" : "Relancer", icon: RotateCcw, disabled: busyId === event.id, onSelect: () => retryWebhook(event) }] : [])];
      return <div key={event.id} className="min-w-0 py-3"><p className="break-all font-bold text-dtsc-ink">{event.title}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-dtsc-muted"><span>{event.source}</span><span className={`rounded-full px-2.5 py-1 text-[0.68rem] font-black ${severityClassName(event.status)}`}>{formatEnumLabel(event.status)}</span><span>{formatDateTime(event.createdAt)}</span><ActionMenu items={items} /></div><p className="mt-1 break-all text-xs text-dtsc-muted">{event.detail}</p></div>;
    })}{!logList.filteredCount && <p className="py-4 text-sm text-dtsc-muted">Aucun journal récent.</p>}</div></div>
    <Dialog open={Boolean(selectedLog)} title="Détail du journal" onClose={() => setSelectedLog(null)}>{selectedLog && <div className="space-y-3 text-sm"><AuditInfoLine label="Source" value={selectedLog.source} /><AuditInfoLine label="Action" value={selectedLog.title} /><AuditInfoLine label="Sévérité / statut" value={selectedLog.status} /><AuditInfoLine label="Date" value={formatDateTime(selectedLog.createdAt)} />{selectedLog.requestId ? <AuditInfoLine label="Request ID" value={selectedLog.requestId} /> : null}<AuditInfoLine label="Détail" value={selectedLog.detail} />{selectedLog.metadata !== undefined ? <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-dtsc-muted">Métadonnées redacted</p><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs text-dtsc-ink">{JSON.stringify(selectedLog.metadata, null, 2)}</pre></div> : null}</div>}</Dialog>
  </section>;
}

function severityClassName(status: string) { if (/CRITICAL|5\d\d|DELETE|DELETED/i.test(status)) return "bg-red-900 text-white"; if (/ERROR|4\d\d|FAILED|REJECT/i.test(status)) return "bg-red-100 text-red-700"; if (/WARNING|ARCHIVE|UPDATE|CHANGE/i.test(status)) return "bg-amber-100 text-amber-800"; if (/SUCCESS|2\d\d|ACCEPT|VALID|PROCESSED/i.test(status)) return "bg-emerald-100 text-emerald-700"; return "bg-slate-100 text-slate-700"; }
function AuditInfoLine({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-dtsc-muted">{label}</p><p className="mt-1 break-words font-bold text-dtsc-ink">{value}</p></div>; }
