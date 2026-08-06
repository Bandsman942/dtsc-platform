"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, CreditCard, RefreshCw, UserRound, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { formatEnumLabel } from "@/lib/labels";

type Option = { id: string; name: string; email?: string | null };
type Plan = { id: string; name: string; audience: string; priceUsd: number };
type RequestItem = {
  id: string;
  scope: "PERSONAL" | "ORGANIZATION";
  status: string;
  amount: number | string;
  currency: string;
  paymentMethod: string;
  externalReference?: string | null;
  reason: string;
  requestedAt: string;
  validatorUserId: string;
  user?: Option | null;
  organization?: Option | null;
  plan: { id: string; name: string; audience: string };
  requestedBy: { id: string; name: string };
  validator: { id: string; name: string };
  invoice?: { id: string; number: string; status: string; emailSentAt?: string | null } | null;
};
type Dataset = { requests: RequestItem[]; validators: Option[]; users: Option[]; organizations: Option[]; plans: Plan[] };

export function ManualSubscriptionPaymentsAdmin({ canManage, currentUserId }: { canManage: boolean; currentUserId: string }) {
  const [dataset, setDataset] = useState<Dataset>({ requests: [], validators: [], users: [], organizations: [], plans: [] });
  const [createOpen, setCreateOpen] = useState(false);
  const [decision, setDecision] = useState<{ request: RequestItem; action: "APPROVE" | "REJECT" } | null>(null);
  const [scope, setScope] = useState<"PERSONAL" | "ORGANIZATION">("PERSONAL");
  const [planId, setPlanId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const createRequestIdRef = useRef(crypto.randomUUID());
  useToastMessage(message);

  async function load() {
    const response = await fetch("/api/admin/manual-subscription-payments", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json() as Dataset;
    setDataset(body);
  }
  useEffect(() => { void load(); }, []);

  const plans = useMemo(() => dataset.plans.filter((plan) => plan.audience === scope || plan.audience === "BOTH"), [dataset.plans, scope]);
  const selectedPlan = plans.find((plan) => plan.id === planId) || plans[0];

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/admin/manual-subscription-payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, scope, requestId: createRequestIdRef.current }) });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setBusy(false);
    setMessage(response.ok ? "Paiement manuel soumis au validateur désigné." : body?.message || "Impossible de soumettre le paiement manuel.");
    if (response.ok) { createRequestIdRef.current = crypto.randomUUID(); setCreateOpen(false); await load(); }
  }

  async function applyDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision) return;
    setBusy(true);
    const validationComment = String(new FormData(event.currentTarget).get("validationComment") || "");
    const response = await fetch(`/api/admin/manual-subscription-payments/${decision.request.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: decision.action, validationComment }) });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setBusy(false);
    setMessage(response.ok ? (decision.action === "APPROVE" ? "Paiement validé, abonnement activé, revenu enregistré et facture envoyée." : "Paiement manuel rejeté.") : body?.message || "Décision impossible.");
    if (response.ok) { setDecision(null); await load(); }
  }

  return (
    <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">Double circuit de facturation</p><h2 className="mt-1 text-xl font-black text-dtsc-ink">Paiements manuels personnels et entreprises</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">Chaque demande désigne un validateur distinct. L’approbation active l’abonnement de manière idempotente, génère la facture, notifie les destinataires et alimente le chiffre d’affaires DTSC.</p></div>
        <div className="flex gap-2"><Button type="button" variant="outline" size="icon" onClick={() => void load()} aria-label="Actualiser"><RefreshCw className="h-4 w-4" /></Button>{canManage ? <Button type="button" onClick={() => { createRequestIdRef.current = crypto.randomUUID(); setScope("PERSONAL"); setPlanId(""); setCreateOpen(true); }}><CreditCard className="h-4 w-4" />Nouveau paiement manuel</Button> : null}</div>
      </div>
      <div className="mt-5 grid gap-3">
        {dataset.requests.map((item) => {
          const beneficiary = item.scope === "PERSONAL" ? item.user?.name : item.organization?.name;
          const canValidate = item.status === "PENDING_VALIDATION" && item.validatorUserId === currentUserId;
          return <article key={item.id} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><div className="flex flex-wrap items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/12 text-cyan-700">{item.scope === "PERSONAL" ? <UserRound className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-dtsc-ink">{beneficiary || "Bénéficiaire"}</h3><span className="rounded-full bg-dtsc-soft px-2 py-1 text-[0.65rem] font-black text-dtsc-muted">{item.scope === "PERSONAL" ? "PERSONNEL" : "ENTREPRISE"}</span><span className="rounded-full bg-cyan-500/12 px-2 py-1 text-[0.65rem] font-black text-cyan-700">{formatEnumLabel(item.status)}</span></div><p className="mt-1 text-sm text-dtsc-muted">{item.plan.name} · {Number(item.amount).toFixed(2)} {item.currency} · {item.paymentMethod}</p><p className="mt-1 text-xs text-dtsc-muted">Demandé par {item.requestedBy.name} · Validateur {item.validator.name} · {new Date(item.requestedAt).toLocaleString("fr-FR")}</p>{item.invoice ? <p className="mt-2 text-xs font-bold text-emerald-700">Facture {item.invoice.number} · {item.invoice.emailSentAt ? "e-mail envoyé" : "envoi e-mail à vérifier"}</p> : null}</div>{canValidate ? <div className="flex gap-2"><Button size="sm" onClick={() => setDecision({ request: item, action: "APPROVE" })}><CheckCircle2 className="h-4 w-4" />Valider</Button><Button size="sm" variant="outline" className="text-red-700" onClick={() => setDecision({ request: item, action: "REJECT" })}><XCircle className="h-4 w-4" />Refuser</Button></div> : null}</div></article>;
        })}
        {!dataset.requests.length ? <p className="rounded-2xl border border-dashed border-dtsc-border p-8 text-center text-sm text-dtsc-muted">Aucun paiement manuel enregistré.</p> : null}
      </div>

      <Dialog open={createOpen} title="Enregistrer un paiement manuel" onClose={() => setCreateOpen(false)} className="h-[92dvh] max-w-3xl">
        <form onSubmit={createPayment} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Type d’abonnement"><select value={scope} onChange={(event) => { setScope(event.target.value as typeof scope); setPlanId(""); }} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><option value="PERSONAL">Personnel</option><option value="ORGANIZATION">Entreprise</option></select></FormField>
          <FormField label="Bénéficiaire"><select name="targetId" required className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><option value="">Sélectionner…</option>{(scope === "PERSONAL" ? dataset.users : dataset.organizations).map((item) => <option key={item.id} value={item.id}>{item.name}{item.email ? ` · ${item.email}` : ""}</option>)}</select></FormField>
          <FormField label="Offre"><select name="planId" value={planId || selectedPlan?.id || ""} onChange={(event) => setPlanId(event.target.value)} required className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><option value="">Sélectionner…</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.priceUsd.toFixed(2)} USD</option>)}</select></FormField>
          <FormField label="Montant"><Input name="amount" type="number" min="0.01" step="0.01" defaultValue={selectedPlan?.priceUsd || ""} key={selectedPlan?.id || scope} required /></FormField>
          <FormField label="Devise"><Input name="currency" defaultValue="USD" minLength={3} maxLength={3} required /></FormField>
          <FormField label="Mode de paiement"><Input name="paymentMethod" placeholder="Virement, espèces, mobile money…" required /></FormField>
          <FormField label="Référence externe"><Input name="externalReference" placeholder="Référence du reçu ou du virement" /></FormField>
          <FormField label="Validateur requis"><select name="validatorUserId" required className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><option value="">Sélectionner…</option>{dataset.validators.filter((item) => item.id !== currentUserId).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select></FormField>
          <FormField label="Motif" className="sm:col-span-2"><Input name="reason" minLength={3} maxLength={500} required /></FormField>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button><Button disabled={busy}>Soumettre au validateur</Button></div>
        </form>
      </Dialog>
      <Dialog open={Boolean(decision)} title={decision?.action === "APPROVE" ? "Valider le paiement manuel" : "Refuser le paiement manuel"} onClose={() => setDecision(null)}>
        <form onSubmit={applyDecision} className="grid gap-4"><p className="text-sm leading-6 text-dtsc-muted">{decision?.action === "APPROVE" ? "Cette action activera l’abonnement, générera la facture, l’enverra aux destinataires et enregistrera le revenu DTSC. Elle est idempotente." : "Le paiement restera sans impact sur l’abonnement et le chiffre d’affaires."}</p><FormField label="Commentaire de validation"><Input name="validationComment" maxLength={500} /></FormField><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDecision(null)}>Annuler</Button><Button disabled={busy} className={decision?.action === "REJECT" ? "bg-red-700 text-white hover:bg-red-800" : ""}>{decision?.action === "APPROVE" ? "Confirmer la validation" : "Confirmer le refus"}</Button></div></form>
      </Dialog>
    </section>
  );
}
