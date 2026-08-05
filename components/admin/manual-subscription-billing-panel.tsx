"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, FileText, ReceiptText, UserRound, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";

type Plan = { id: string; name: string; priceUsd: number; audience?: string };
type Target = { id: string; name: string; email?: string | null };
type PersonalSubscription = { id: string; userName: string; userEmail: string; planName: string; priceUsd: number; status: string; currentPeriodEnd: string | null };
type ManualPayment = { id: string; scope: string; targetName: string; planName: string; amount: number; currency: string; paymentMethod: string; paymentReference?: string | null; status: string; validationComment?: string | null; invoiceId?: string | null; revenueTransactionId?: string | null; createdAt: string };
type Invoice = { id: string; number: string; invoiceType: string; recipient: string; recipientEmail: string; planName: string; amount: number; currency: string; status: string; issuedAt: string; paidAt: string | null; emailSentAt: string | null; transactionTitle: string | null; transactionCategory: string | null };

export function ManualSubscriptionBillingPanel({
  canManage,
  canReadOperationalInvoices,
  plans,
  personalTargets,
  enterpriseTargets,
  personalSubscriptions,
  manualPayments,
  invoices,
}: {
  canManage: boolean;
  canReadOperationalInvoices: boolean;
  plans: Plan[];
  personalTargets: Target[];
  enterpriseTargets: Target[];
  personalSubscriptions: PersonalSubscription[];
  manualPayments: ManualPayment[];
  invoices: Invoice[];
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [scope, setScope] = useState<"PERSONAL" | "ENTERPRISE">("PERSONAL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const availablePlans = plans.filter((plan) => [scope, "BOTH"].includes(plan.audience || "PERSONAL"));
  const targets = scope === "PERSONAL" ? personalTargets : enterpriseTargets;
  const subscriptionInvoices = useMemo(() => invoices.filter((invoice) => invoice.invoiceType.startsWith("SUBSCRIPTION_")), [invoices]);
  const operationalInvoices = useMemo(() => invoices.filter((invoice) => invoice.invoiceType === "HRCFO_TRANSACTION"), [invoices]);

  async function submitManualPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusyId("new");
    const response = await fetch("/api/admin/manual-subscription-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, targetId: data.get("targetId"), planId: data.get("planId"), paymentMethod: data.get("paymentMethod"), paymentReference: data.get("paymentReference") }),
    });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setBusyId(null);
    setMessage(response.ok ? "Paiement manuel soumis au validateur requis." : body?.message || "Soumission impossible.");
    if (response.ok) { setFormOpen(false); router.refresh(); }
  }

  async function decide(id: string, action: "VALIDATE" | "REJECT") {
    const comment = window.prompt(action === "VALIDATE" ? "Commentaire de validation (optionnel)" : "Motif du rejet") || "";
    if (action === "REJECT" && !comment.trim()) return;
    setBusyId(id);
    const response = await fetch(`/api/admin/manual-subscription-payments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, comment }) });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setBusyId(null);
    setMessage(response.ok ? (action === "VALIDATE" ? "Paiement validé, abonnement activé, facture envoyée et chiffre d’affaires actualisé." : "Paiement rejeté.") : body?.message || "Décision impossible.");
    if (response.ok) router.refresh();
  }

  return (
    <div className="space-y-5">
      <section className="dtsc-panel min-w-0 p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-600">Deux circuits distincts</p><h3 className="mt-1 break-words text-xl font-black text-dtsc-ink">Abonnements personnels et d’entreprise</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">Les offres sont administrables par audience. Un paiement manuel reste en attente jusqu’à validation, puis active la cible, génère la facture, l’envoie aux bons destinataires et crée une recette DTSC idempotente.</p></div>
          {canManage ? <Button type="button" onClick={() => setFormOpen(true)} className="shrink-0 bg-[#002b5b] text-white"><ReceiptText className="h-4 w-4" />Enregistrer un paiement manuel</Button> : null}
        </div>
        <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
          <SummaryCard icon={UserRound} label="Abonnements personnels suivis" value={personalSubscriptions.length} />
          <SummaryCard icon={Building2} label="Demandes manuelles à valider" value={manualPayments.filter((item) => item.status === "PENDING_VALIDATION").length} />
        </div>
      </section>

      <section className="dtsc-panel min-w-0 p-4 sm:p-5">
        <h3 className="text-lg font-black text-dtsc-ink">Paiements manuels et validations</h3>
        <div className="mt-4 space-y-3">
          {manualPayments.map((item) => <article key={item.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><Badge>{item.scope === "ENTERPRISE" ? "Entreprise" : "Personnel"}</Badge><Badge>{item.status}</Badge></div><h4 className="mt-2 break-words font-black text-dtsc-ink">{item.targetName} · {item.planName}</h4><p className="mt-1 break-words text-xs text-dtsc-muted">{item.amount.toFixed(2)} {item.currency} · {item.paymentMethod} · {item.paymentReference || "Sans référence externe"} · {new Date(item.createdAt).toLocaleString("fr-FR")}</p>{item.validationComment ? <p className="mt-2 text-xs text-dtsc-muted">{item.validationComment}</p> : null}</div>{canManage && item.status === "PENDING_VALIDATION" ? <div data-responsive-actions className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={busyId === item.id} onClick={() => void decide(item.id, "VALIDATE")} className="bg-emerald-600 text-white"><CheckCircle2 className="h-4 w-4" />Valider</Button><Button type="button" size="sm" variant="outline" disabled={busyId === item.id} onClick={() => void decide(item.id, "REJECT")} className="border-red-400/40 text-red-700"><XCircle className="h-4 w-4" />Rejeter</Button></div> : null}</div></article>)}
          {!manualPayments.length ? <EmptyState text="Aucun paiement manuel enregistré." /> : null}
        </div>
      </section>

      <InvoiceSection title="Factures des abonnements" description="Factures personnelles et d’entreprise, séparées des factures opérationnelles HR & CFO." invoices={subscriptionInvoices} />
      {canReadOperationalInvoices ? <InvoiceSection title="Factures des transactions HR & CFO" description="Registre opérationnel protégé par la capacité Finance factures. Ces factures ne sont jamais mélangées avec les renouvellements d’abonnement." invoices={operationalInvoices} /> : null}

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} title="Paiement manuel d’abonnement" description="La demande doit être validée avant activation et comptabilisation." className="h-[92dvh] max-w-2xl">
        <form onSubmit={submitManualPayment} className="grid gap-4">
          <FormField label="Type d’abonnement"><select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-bold text-dtsc-ink"><option value="PERSONAL">Personnel</option><option value="ENTERPRISE">Entreprise</option></select></FormField>
          <FormField label={scope === "PERSONAL" ? "Utilisateur" : "Entreprise"}><select name="targetId" required className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-bold text-dtsc-ink"><option value="">Sélectionner</option>{targets.map((target) => <option key={target.id} value={target.id}>{target.name}{target.email ? ` · ${target.email}` : ""}</option>)}</select></FormField>
          <FormField label="Offre"><select name="planId" required className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-bold text-dtsc-ink"><option value="">Sélectionner</option>{availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.priceUsd.toFixed(2)} USD</option>)}</select></FormField>
          <FormField label="Mode de paiement"><Input name="paymentMethod" required placeholder="Virement, caisse, Mobile Money…" /></FormField>
          <FormField label="Référence externe"><Input name="paymentReference" placeholder="Référence banque ou reçu" /></FormField>
          <div data-responsive-actions className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Annuler</Button><Button disabled={busyId === "new"} className="bg-[#002b5b] text-white">Soumettre à validation</Button></div>
        </form>
      </Dialog>
    </div>
  );
}

export function OperationalInvoiceLedger({ invoices }: { invoices: Invoice[] }) {
  return <InvoiceSection title="Factures des transactions HR & CFO" description="Registre opérationnel protégé par la capacité Finance factures. Ces factures ne sont jamais mélangées avec les renouvellements d’abonnement." invoices={invoices.filter((invoice) => invoice.invoiceType === "HRCFO_TRANSACTION")} />;
}

function InvoiceSection({ title, description, invoices }: { title: string; description: string; invoices: Invoice[] }) {
  return <section className="dtsc-panel min-w-0 p-4 sm:p-5"><div className="flex items-start gap-3"><FileText className="mt-1 h-5 w-5 shrink-0 text-cyan-600" /><div className="min-w-0"><h3 className="text-lg font-black text-dtsc-ink">{title}</h3><p className="mt-1 text-sm leading-6 text-dtsc-muted">{description}</p></div></div><div className="mt-4 max-w-full overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead><tr className="border-b border-dtsc-border text-xs uppercase tracking-[0.08em] text-dtsc-muted"><th className="p-3">Facture</th><th className="p-3">Destinataire</th><th className="p-3">Objet</th><th className="p-3">Montant</th><th className="p-3">Statut</th><th className="p-3">Émission</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} className="border-b border-dtsc-border/70"><td className="p-3 font-black text-dtsc-ink">{invoice.number}</td><td className="p-3"><span className="block font-bold text-dtsc-ink">{invoice.recipient}</span><span className="text-xs text-dtsc-muted">{invoice.recipientEmail}</span></td><td className="p-3 text-dtsc-muted">{invoice.transactionTitle || invoice.planName}</td><td className="p-3 font-black text-dtsc-ink">{invoice.amount.toFixed(2)} {invoice.currency}</td><td className="p-3"><Badge>{invoice.status}</Badge></td><td className="p-3 text-dtsc-muted">{new Date(invoice.issuedAt).toLocaleDateString("fr-FR")}</td></tr>)}</tbody></table>{!invoices.length ? <EmptyState text="Aucune facture dans ce registre." /> : null}</div></section>;
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: number }) { return <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><Icon className="h-5 w-5 text-cyan-600" /><p className="mt-3 text-2xl font-black text-dtsc-ink">{value}</p><p className="mt-1 text-xs font-bold text-dtsc-muted">{label}</p></div>; }
function Badge({ children }: { children: string }) { return <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-[0.68rem] font-black text-cyan-700 dark:text-cyan-200">{children.replaceAll("_", " ")}</span>; }
function EmptyState({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-dtsc-border p-5 text-center text-sm text-dtsc-muted">{text}</p>; }
