"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, CreditCard, Eye, RefreshCw, UserRound, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { BusinessDetail, BusinessDetailField, BusinessDetailGrid, BusinessDetailHeader, BusinessDetailSection } from "@/components/workspace/business-detail";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { FullscreenEntityDetail } from "@/components/workspace/fullscreen-entity-detail";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import { referenceChoiceLabel } from "@/lib/forms/reference-catalog";
import { PAYMENT_METHOD_CODES } from "@/lib/forms/reference-catalog";
import { formatEnumLabelForLocale } from "@/lib/labels-i18n";

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
type Dataset = {
  requests: RequestItem[]; validators: Option[]; users: Option[]; organizations: Option[]; plans: Plan[]; assignedOnly?: boolean;
  pagination: { page: number; pageSize: number; pageCount: number; total: number };
  statusCounts: { all: number; pending: number; approved: number; rejected: number };
};

const emptyDataset: Dataset = {
  requests: [], validators: [], users: [], organizations: [], plans: [],
  pagination: { page: 1, pageSize: 20, pageCount: 1, total: 0 },
  statusCounts: { all: 0, pending: 0, approved: 0, rejected: 0 },
};

function paymentStatusTone(status: string): StatusBadgeTone {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  return "warning";
}

export function ManualSubscriptionPaymentsAdmin({ canManage, currentUserId, focusId }: { canManage: boolean; currentUserId: string; focusId?: string }) {
  const [dataset, setDataset] = useState<Dataset>(emptyDataset);
  const [createOpen, setCreateOpen] = useState(false);
  const [decision, setDecision] = useState<{ request: RequestItem; action: "APPROVE" | "REJECT" } | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING_VALIDATION" | "APPROVED" | "REJECTED">("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState<"PERSONAL" | "ORGANIZATION">("PERSONAL");
  const [planId, setPlanId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const createRequestIdRef = useRef(crypto.randomUUID());
  const openedFocusRef = useRef<string | null>(null);
  const english = useAppLocale() === "en";
  useToastMessage(message);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (focusId) params.set("focusId", focusId);
    if (debouncedQuery) params.set("search", debouncedQuery);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const response = await fetch(`/api/admin/manual-subscription-payments?${params}`, { cache: "no-store", signal });
      if (!response.ok) { setMessage(english ? "Unable to load payment requests." : "Impossible de charger les paiements attribués."); return; }
      const body = await response.json() as Dataset;
      if (!signal?.aborted) { setDataset(body); setPage(body.pagination.page); }
    } catch (error) {
      if (!signal?.aborted && !(error instanceof DOMException && error.name === "AbortError")) setMessage(english ? "Unable to load payment requests." : "Impossible de charger les paiements attribués.");
    }
  }, [debouncedQuery, english, focusId, from, page, statusFilter, to]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => {
    if (!focusId || openedFocusRef.current === focusId) return;
    const focused = dataset.requests.find((item) => item.id === focusId);
    if (focused) { openedFocusRef.current = focusId; setSelectedRequest(focused); }
  }, [dataset.requests, focusId]);

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
    const body = await response.json().catch(() => null) as { message?: string; result?: { mail?: { sent: boolean } } } | null;
    setBusy(false);
    setMessage(response.ok ? (decision.action === "APPROVE" ? (body?.result?.mail?.sent ? "Paiement approuvé et comptabilisé. Facture envoyée." : "Paiement approuvé et comptabilisé. Facture créée ; envoi e-mail à vérifier.") : "Paiement manuel rejeté.") : body?.message || "Décision impossible.");
    if (response.ok) { setDecision(null); setSelectedRequest(null); await load(); }
  }

  const beneficiaryName = (item: RequestItem) => (item.scope === "PERSONAL" ? item.user?.name : item.organization?.name) || (english ? "Beneficiary" : "Bénéficiaire");
  const canValidate = (item: RequestItem) => item.status === "PENDING_VALIDATION" && item.validatorUserId === currentUserId;
  const dateLabel = (date: string) => new Date(date).toLocaleString(english ? "en-US" : "fr-FR");
  const actionsFor = (item: RequestItem): BusinessContextAction[] => [
    { id: "view", label: english ? "View details" : "Voir la fiche", icon: Eye, onSelect: () => setSelectedRequest(item) },
    ...(canValidate(item) ? [
      { id: "approve", label: english ? "Approve" : "Valider", icon: CheckCircle2, onSelect: () => setDecision({ request: item, action: "APPROVE" as const }) },
      { id: "reject", label: english ? "Reject" : "Refuser", icon: XCircle, destructive: true, onSelect: () => setDecision({ request: item, action: "REJECT" as const }) },
    ] : []),
  ];
  const statusFilters = [
    { value: "ALL" as const, label: english ? "All" : "Tous", count: dataset.statusCounts.all },
    { value: "PENDING_VALIDATION" as const, label: english ? "Pending" : "À valider", count: dataset.statusCounts.pending },
    { value: "APPROVED" as const, label: english ? "Approved" : "Approuvés", count: dataset.statusCounts.approved },
    { value: "REJECTED" as const, label: english ? "Rejected" : "Refusés", count: dataset.statusCounts.rejected },
  ];

  return (
    <section className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip" data-manual-payment-workspace>
      <header className="flex w-full min-w-0 flex-wrap items-start justify-between gap-3 border-b border-dtsc-border pb-4">
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-cyan-600">{english ? "Subscription billing" : "Facturation des abonnements"}</p>
          <h2 className="mt-1 break-words text-xl font-black leading-7 text-dtsc-ink sm:text-2xl">{dataset.assignedOnly ? (english ? "Payments to approve" : "Paiements à valider") : (english ? "Manual payments" : "Paiements manuels")}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-dtsc-muted sm:text-sm">{english ? "Review each request and its evidence before deciding." : "Consultez le détail et la référence du règlement avant toute décision."}</p>
        </div>
        <div className="flex min-w-0 shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" size="icon" onClick={() => void load()} aria-label={english ? "Refresh" : "Actualiser"}><RefreshCw className="h-4 w-4" /></Button>
          {canManage ? <Button type="button" size="sm" onClick={() => { createRequestIdRef.current = crypto.randomUUID(); setScope("PERSONAL"); setPlanId(""); setCreateOpen(true); }}><CreditCard className="h-4 w-4" />{english ? "New payment" : "Nouveau paiement"}</Button> : null}
        </div>
      </header>

      <nav aria-label={english ? "Filter by payment status" : "Filtrer par statut"} className="flex w-full min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {statusFilters.map((filter) => <button
          type="button"
          key={filter.value}
          aria-pressed={statusFilter === filter.value}
          onClick={() => { setStatusFilter(filter.value); setPage(1); }}
          className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${statusFilter === filter.value ? "border-cyan-500 bg-cyan-500/12 text-dtsc-ink" : "border-dtsc-border bg-dtsc-surface text-dtsc-muted hover:bg-dtsc-soft"}`}
        >{filter.label}<span className="tabular-nums text-[0.68rem] opacity-80">{filter.count}</span></button>)}
      </nav>
      <div className="grid w-full min-w-0 gap-2 sm:grid-cols-2">
        <label className="min-w-0 text-xs font-bold text-dtsc-muted">{english ? "From" : "Du"}<input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="mt-1 block h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink" /></label>
        <label className="min-w-0 text-xs font-bold text-dtsc-muted">{english ? "To" : "Au"}<input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="mt-1 block h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink" /></label>
      </div>
      <ListControls
        query={query}
        onQueryChange={(value) => { setQuery(value); setPage(1); }}
        page={dataset.pagination.page}
        pageCount={dataset.pagination.pageCount}
        totalCount={dataset.statusCounts.all}
        filteredCount={dataset.pagination.total}
        onPageChange={setPage}
        placeholder={english ? "Name, plan, reference..." : "Nom, offre, référence..."}
      />
      {dataset.requests.length ? <BusinessList ariaLabel={english ? "Manual payment requests" : "Demandes de paiement manuel"} className="px-2 sm:px-3">
        {dataset.requests.map((item) => <BusinessListItem
          key={item.id}
          className={item.id === focusId ? "rounded-xl bg-cyan-500/5 ring-1 ring-cyan-500/40" : undefined}
          leading={<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-700">{item.scope === "PERSONAL" ? <UserRound className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}</span>}
          title={beneficiaryName(item)}
          status={<div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-dtsc-soft px-2 py-1 text-[0.65rem] font-black text-dtsc-muted">{item.scope === "PERSONAL" ? (english ? "PERSONAL" : "PERSONNEL") : (english ? "BUSINESS" : "ENTREPRISE")}</span>
            <StatusBadge tone={paymentStatusTone(item.status)}>{formatEnumLabelForLocale(item.status, english ? "en" : "fr")}</StatusBadge>
          </div>}
          meta={<span>{item.plan.name} · {Number(item.amount).toFixed(2)} {item.currency} · {dateLabel(item.requestedAt)}</span>}
          description={`${referenceChoiceLabel("paymentMethod", item.paymentMethod, "fr")} · ${english ? "Reference" : "Référence"} : ${item.externalReference || "—"}`}
          onOpen={() => setSelectedRequest(item)}
          openLabel={`${english ? "View details" : "Voir la fiche"} : ${beneficiaryName(item)}`}
          actions={<ContextActions label={`${english ? "Actions for" : "Actions pour"} ${beneficiaryName(item)}`} actions={actionsFor(item)} />}
        />)}
      </BusinessList> : <p className="rounded-xl border border-dashed border-dtsc-border p-6 text-center text-sm text-dtsc-muted">{english ? "No matching payment requests." : "Aucune demande ne correspond aux filtres."}</p>}

      <FullscreenEntityDetail
        open={Boolean(selectedRequest)}
        onClose={() => setSelectedRequest(null)}
        title={selectedRequest ? beneficiaryName(selectedRequest) : (english ? "Payment details" : "Détail du paiement")}
        description={english ? "Manual subscription payment request" : "Demande de paiement manuel d’abonnement"}
        actionLabel={english ? "Payment actions" : "Actions du paiement"}
        actions={selectedRequest && canValidate(selectedRequest) ? actionsFor(selectedRequest).filter((action) => action.id !== "view") : []}
      >
        {selectedRequest ? <BusinessDetail>
          <BusinessDetailHeader
            eyebrow={selectedRequest.scope === "PERSONAL" ? (english ? "Personal subscription" : "Abonnement personnel") : (english ? "Business subscription" : "Abonnement entreprise")}
            title={beneficiaryName(selectedRequest)}
            summary={`${selectedRequest.plan.name} · ${Number(selectedRequest.amount).toFixed(2)} ${selectedRequest.currency}`}
            status={<StatusBadge tone={paymentStatusTone(selectedRequest.status)}>{formatEnumLabelForLocale(selectedRequest.status, english ? "en" : "fr")}</StatusBadge>}
          />
          <BusinessDetailSection title={english ? "Payment" : "Règlement"}>
            <BusinessDetailGrid>
              <BusinessDetailField label={english ? "Method" : "Mode de paiement"} value={referenceChoiceLabel("paymentMethod", selectedRequest.paymentMethod, "fr")} />
              <BusinessDetailField label={english ? "External reference" : "Référence externe"} value={<span className="break-all">{selectedRequest.externalReference || "—"}</span>} />
              <BusinessDetailField label={english ? "Requested on" : "Date de demande"} value={dateLabel(selectedRequest.requestedAt)} />
              <BusinessDetailField label={english ? "Reason" : "Motif"} value={selectedRequest.reason} wide />
            </BusinessDetailGrid>
          </BusinessDetailSection>
          <BusinessDetailSection title={english ? "Verification" : "Vérification indépendante"}>
            <BusinessDetailGrid>
              <BusinessDetailField label={english ? "Requested by" : "Demandé par"} value={selectedRequest.requestedBy.name} />
              <BusinessDetailField label={english ? "Assigned approver" : "Validateur désigné"} value={selectedRequest.validator.name} />
              <BusinessDetailField label={english ? "Invoice" : "Facture"} wide value={selectedRequest.invoice ? `${selectedRequest.invoice.number} · ${selectedRequest.invoice.emailSentAt ? (english ? "Email sent" : "E-mail envoyé") : (english ? "Email pending" : "Envoi e-mail à vérifier")}` : (english ? "Created after approval" : "Créée après validation")} />
            </BusinessDetailGrid>
          </BusinessDetailSection>
          {canValidate(selectedRequest) ? <div className="sticky bottom-0 grid min-w-0 grid-cols-2 gap-2 border-t border-dtsc-border bg-dtsc-surface/95 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
            <Button type="button" disabled={busy} className="w-full min-w-0 justify-center" onClick={() => setDecision({ request: selectedRequest, action: "APPROVE" })}><CheckCircle2 className="h-4 w-4 shrink-0" />{english ? "Approve" : "Valider"}</Button>
            <Button type="button" disabled={busy} variant="outline" className="w-full min-w-0 justify-center text-red-700" onClick={() => setDecision({ request: selectedRequest, action: "REJECT" })}><XCircle className="h-4 w-4 shrink-0" />{english ? "Reject" : "Refuser"}</Button>
          </div> : null}
        </BusinessDetail> : null}
      </FullscreenEntityDetail>

      <Dialog open={createOpen} title="Enregistrer un paiement manuel" description="Renseignez le bénéficiaire, l’offre et les informations du paiement. Les références financières sont sélectionnées dans des listes contrôlées afin d’éviter les variantes manuelles." onClose={() => setCreateOpen(false)} className="h-[92dvh] max-w-3xl">
        <form onSubmit={createPayment} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Type d’abonnement" hint="Choisissez si le paiement active une offre personnelle ou l’abonnement d’une entreprise cliente."><select value={scope} onChange={(event) => { setScope(event.target.value as typeof scope); setPlanId(""); }} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><option value="PERSONAL">Personnel</option><option value="ORGANIZATION">Entreprise</option></select></FormField>
          <FormField label="Bénéficiaire" hint="Sélectionnez le compte ou l’entreprise qui recevra l’abonnement après validation."><select name="targetId" required className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><option value="">Sélectionner…</option>{(scope === "PERSONAL" ? dataset.users : dataset.organizations).map((item) => <option key={item.id} value={item.id}>{item.name}{item.email ? ` · ${item.email}` : ""}</option>)}</select></FormField>
          <FormField label="Offre" hint="Choisissez une offre compatible avec le type d’abonnement sélectionné."><select name="planId" value={planId || selectedPlan?.id || ""} onChange={(event) => setPlanId(event.target.value)} required className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><option value="">Sélectionner…</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.priceUsd.toFixed(2)} USD</option>)}</select></FormField>
          <FormField label="Montant" hint="Saisissez le montant effectivement reçu. Le montant proposé reprend le tarif de l’offre sélectionnée."><Input name="amount" type="number" min="0.01" step="0.01" defaultValue={selectedPlan?.priceUsd || ""} key={selectedPlan?.id || scope} required /></FormField>
          <FormField label="Devise"><select name="currency" defaultValue="USD" required className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3">{["USD", "CDF", "EUR"].map((code) => <option key={code} value={code}>{code}</option>)}</select></FormField>
          <FormField label="Mode de paiement"><select name="paymentMethod" required defaultValue="" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><option value="">Sélectionner…</option>{PAYMENT_METHOD_CODES.map((code) => <option key={code} value={code}>{referenceChoiceLabel("paymentMethod", code, "fr")}</option>)}</select></FormField>
          <FormField label="Référence externe" hint="Référence obligatoire du reçu, du virement ou de la transaction. Une même référence ne peut pas être enregistrée deux fois."><Input name="externalReference" minLength={3} required placeholder="Référence du paiement" /></FormField>
          <FormField label="Validateur requis" hint="Choisissez un collaborateur habilité distinct du demandeur afin de respecter la séparation des tâches."><select name="validatorUserId" required className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><option value="">Sélectionner…</option>{dataset.validators.filter((item) => item.id !== currentUserId).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select></FormField>
          <FormField label="Motif" hint="Expliquez brièvement pourquoi ce paiement est enregistré manuellement et à quoi il correspond." className="sm:col-span-2"><Input name="reason" minLength={3} maxLength={500} required /></FormField>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button><Button disabled={busy}>Soumettre au validateur</Button></div>
        </form>
      </Dialog>
      <Dialog open={Boolean(decision)} title={decision?.action === "APPROVE" ? "Valider le paiement manuel" : "Refuser le paiement manuel"} onClose={() => { if (!busy) setDecision(null); }}>
        {decision ? <form onSubmit={applyDecision} className="grid min-w-0 gap-4">
          <div className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page/50 p-3">
            <p className="break-words text-base font-extrabold text-dtsc-ink">{beneficiaryName(decision.request)}</p>
            <p className="mt-1 text-sm font-bold text-dtsc-ink">{decision.request.plan.name} · {Number(decision.request.amount).toFixed(2)} {decision.request.currency}</p>
            <p className="mt-1 break-all text-xs text-dtsc-muted">{referenceChoiceLabel("paymentMethod", decision.request.paymentMethod, "fr")} · {decision.request.externalReference || "—"}</p>
          </div>
          <p className="text-sm leading-6 text-dtsc-muted">{decision.action === "APPROVE" ? "Cette action active ou prolonge l’abonnement et comptabilise atomiquement le paiement avec sa facture. L’envoi e-mail intervient ensuite." : "Le paiement restera sans impact sur l’abonnement et le chiffre d’affaires."}</p>
          <FormField label="Commentaire de validation" hint="Le refus doit être motivé pour l’audit."><Input name="validationComment" maxLength={500} required={decision.action === "REJECT"} /></FormField>
          <div className="flex min-w-0 flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setDecision(null)}>Annuler</Button><Button disabled={busy} className={decision.action === "REJECT" ? "bg-red-700 text-white hover:bg-red-800" : ""}>{decision.action === "APPROVE" ? "Confirmer la validation" : "Confirmer le refus"}</Button></div>
        </form> : null}
      </Dialog>
    </section>
  );
}
