import Link from "next/link";
import { FileText, LockKeyhole } from "lucide-react";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { StatusBadge } from "@/components/workspace/status-badge";
import { formatEnumLabel } from "@/lib/labels";

type HrcfoInvoiceItem = {
  id: string;
  number: string;
  planName: string;
  amount: number;
  currency: string;
  status: string;
  issuedAt: string;
  beneficiary: string;
  transactionReference: string | null;
};

export function HrcfoInvoiceList({ invoices, canRead }: { invoices: HrcfoInvoiceItem[]; canRead: boolean }) {
  if (!canRead) {
    return (
      <section className="dtsc-card min-w-0 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <h2 className="font-black text-dtsc-ink">Factures des transactions HR/CFO</h2>
            <p className="mt-1 text-sm leading-6 text-dtsc-muted">Une permission nominative de lecture des factures HR/CFO est requise dans Administration DTSC.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="dtsc-card min-w-0 p-4 sm:p-6">
      <div className="mb-4 flex min-w-0 items-start gap-3">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" />
        <div className="min-w-0">
          <h2 className="font-black text-dtsc-ink">Factures des transactions HR/CFO</h2>
          <p className="mt-1 text-sm leading-6 text-dtsc-muted">Ces documents sont séparés des factures d’abonnement personnel et entreprise. L’accès est gouverné par la permission Console HR/CFO.</p>
        </div>
      </div>
      {invoices.length ? (
        <BusinessList ariaLabel="Factures HR/CFO autorisées">
          {invoices.map((invoice) => (
            <BusinessListItem
              key={invoice.id}
              title={invoice.number}
              description={`${invoice.planName} · ${invoice.amount.toFixed(2)} ${invoice.currency}`}
              meta={`${invoice.beneficiary} · ${new Date(invoice.issuedAt).toLocaleDateString("fr-FR")}${invoice.transactionReference ? ` · ${invoice.transactionReference}` : ""}`}
              status={<StatusBadge>{formatEnumLabel(invoice.status)}</StatusBadge>}
              actions={<Link href={`/api/invoices/${invoice.id}/pdf`} target="_blank" className="inline-flex min-h-11 items-center rounded-xl bg-[#002b5b] px-3 text-xs font-black text-white hover:bg-[#001736]">Ouvrir</Link>}
            />
          ))}
        </BusinessList>
      ) : <EmptyState compact title="Aucune facture HR/CFO" description="Les factures seront générées par le moteur financier au fil des transactions éligibles." />}
    </section>
  );
}
