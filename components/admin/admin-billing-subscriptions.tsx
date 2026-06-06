"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CreditCard,
  Edit3,
  History,
  PauseCircle,
  Plus,
  RefreshCw,
  ShieldX,
  Sparkles,
  XCircle,
} from "lucide-react";
import { AdminAuditTables } from "@/components/admin/admin-audit-tables";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";

type PlanLimits = {
  maxUsers: number;
  maxStorageMb: number;
  maxMonthlyCallMinutes: number;
  maxActiveModules: number;
  maxDocuments: number;
  supportLevel: string;
};

type SubscriptionHistoryItem = {
  id: string;
  planName: string;
  planCode: string;
  priceUsd: number;
  status: string;
  startedAt: string | null;
  trialEndsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type OrganizationBillingItem = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationStatus: string;
  activeUsers: number;
  enabledModules: number;
  totalModules: number;
  subscription: (SubscriptionHistoryItem & { planId: string; limits: PlanLimits }) | null;
  history: SubscriptionHistoryItem[];
  latestBillingRecord: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    reference: string | null;
    createdAt: string;
  } | null;
};

type PlanOption = {
  id: string;
  name: string;
  slug: string;
  priceUsd: number;
  planCode: string;
  limits: PlanLimits;
};

type BillingSummary = {
  organizations: number;
  active: number;
  trial: number;
  attention: number;
  withoutSubscription: number;
  monthlyRecurringRevenueUsd: number;
};

type PaymentAuditItem = Parameters<typeof AdminAuditTables>[0]["payments"][number];
type SubscriptionFormMode = "create" | "edit" | "renew";
type LifecycleAction = "activate" | "start_trial" | "suspend" | "mark_past_due" | "cancel" | "expire";

const LIFECYCLE_LABELS: Record<LifecycleAction, string> = {
  activate: "Activer l'abonnement",
  start_trial: "Démarrer un essai",
  suspend: "Suspendre l'abonnement",
  mark_past_due: "Signaler un retard de paiement",
  cancel: "Annuler l'abonnement",
  expire: "Clôturer comme expiré",
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("fr-FR") : "Non défini";
}

function formatDateInput(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function statusClassName(status: string) {
  if (status === "ACTIVE" || status === "PAID" || status === "ACCEPTED") {
    return "bg-emerald-400/14 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "TRIAL" || status === "PENDING_PAYMENT" || status === "PENDING") {
    return "bg-amber-400/18 text-amber-700 dark:text-amber-300";
  }
  if (status === "CANCELED" || status === "EXPIRED") {
    return "bg-slate-400/16 text-slate-700 dark:text-slate-300";
  }
  return "bg-red-500/12 text-red-700 dark:text-red-300";
}

export function AdminBillingSubscriptions({
  subscriptions,
  plans,
  summary,
  payments,
}: {
  subscriptions: OrganizationBillingItem[];
  plans: PlanOption[];
  summary: BillingSummary;
  payments: PaymentAuditItem[];
}) {
  const router = useRouter();
  const [formTarget, setFormTarget] = useState<{ organization: OrganizationBillingItem; mode: SubscriptionFormMode } | null>(null);
  const [lifecycleTarget, setLifecycleTarget] = useState<{ organization: OrganizationBillingItem; action: LifecycleAction } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<OrganizationBillingItem | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const summaryCards = [
    { label: "Entreprises", value: summary.organizations, icon: CreditCard },
    { label: "Actifs", value: summary.active, icon: CheckCircle2 },
    { label: "Essais", value: summary.trial, icon: Sparkles },
    { label: "À traiter", value: summary.attention, icon: AlertTriangle },
    { label: "Sans abonnement", value: summary.withoutSubscription, icon: ShieldX },
    { label: "MRR estimé", value: `${summary.monthlyRecurringRevenueUsd.toFixed(2)} USD`, icon: RefreshCw },
  ];
  const subscriptionList = useSmartList({
    items: subscriptions,
    pageSize: 8,
    getSearchText: (organization) => `${organization.organizationName} ${organization.organizationSlug} ${organization.subscription?.planName || ""} ${organization.subscription?.planCode || ""} ${organization.subscription?.status || "sans abonnement"} ${organization.organizationStatus}`,
  });

  async function sendSubscriptionRequest(url: string, method: "POST" | "PATCH", payload: Record<string, string>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setMessage(response.ok ? "Opération d'abonnement enregistrée et journalisée." : body?.message || "Action impossible.");
      if (response.ok) {
        setFormTarget(null);
        setLifecycleTarget(null);
        router.refresh();
      }
    } catch {
      setMessage("Le serveur est momentanément inaccessible. Réessayez sans fermer la Console.");
    } finally {
      setBusy(false);
    }
  }

  async function submitSubscriptionForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formTarget) {
      return;
    }
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    const subscriptionId = formTarget.organization.subscription?.id;
    if (formTarget.mode === "create") {
      await sendSubscriptionRequest("/api/admin/organization-subscriptions", "POST", {
        ...payload,
        organizationId: formTarget.organization.organizationId,
      });
      return;
    }
    if (!subscriptionId) {
      setMessage("Aucun abonnement courant à modifier.");
      return;
    }
    await sendSubscriptionRequest(`/api/admin/organization-subscriptions/${subscriptionId}`, "PATCH", {
      ...payload,
      action: formTarget.mode === "renew" ? "renew" : "update",
    });
  }

  async function confirmLifecycleAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subscriptionId = lifecycleTarget?.organization.subscription?.id;
    if (!lifecycleTarget || !subscriptionId) {
      return;
    }
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    await sendSubscriptionRequest(`/api/admin/organization-subscriptions/${subscriptionId}`, "PATCH", {
      ...payload,
      action: lifecycleTarget.action,
    });
  }

  return (
    <div className="space-y-6">
      <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">Centre de contrôle SaaS</p>
            <h2 className="mt-1 text-xl font-black text-dtsc-ink">Abonnements & facturation</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">
              Pilotez le cycle de vie des abonnements clients. Les annulations et renouvellements conservent l&apos;historique pour l&apos;audit.
            </p>
          </div>
          <CreditCard className="h-5 w-5 text-cyan-600" />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page p-3">
                <Icon className="h-4 w-4 text-cyan-600" />
                <p className="mt-3 break-words text-xl font-black text-dtsc-ink">{card.value}</p>
                <p className="mt-1 text-xs font-bold text-dtsc-muted">{card.label}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-5">
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

        {message && <p className="mt-4 rounded-lg border border-cyan-300/40 bg-cyan-400/10 p-3 text-sm font-bold text-dtsc-ink">{message}</p>}

        <div className="mt-4 grid gap-3">
          {subscriptionList.paginatedItems.map((organization) => {
            const subscription = organization.subscription;
            return (
              <article key={organization.organizationId} className="min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{organization.organizationSlug}</p>
                    <h3 className="mt-1 break-words font-black text-dtsc-ink">{organization.organizationName}</h3>
                    <p className="mt-1 text-sm font-semibold text-dtsc-muted">
                      {subscription ? `${subscription.planName} · ${subscription.priceUsd.toFixed(2)} USD` : "Aucun abonnement configuré"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClassName(subscription?.status || "NONE")}`}>
                      {subscription ? formatEnumLabel(subscription.status) : "Sans abonnement"}
                    </span>
                    <ActionMenu
                      label={`Actions abonnement ${organization.organizationName}`}
                      items={[
                        { key: "create", label: "Créer un abonnement", icon: Plus, disabled: Boolean(subscription), onSelect: () => setFormTarget({ organization, mode: "create" }) },
                        { key: "edit", label: "Modifier", icon: Edit3, disabled: !subscription, onSelect: () => setFormTarget({ organization, mode: "edit" }) },
                        { key: "renew", label: "Renouveler avec historique", icon: RefreshCw, disabled: !subscription, onSelect: () => setFormTarget({ organization, mode: "renew" }) },
                        { key: "activate", label: "Activer", icon: CheckCircle2, disabled: !subscription || subscription.status === "ACTIVE", onSelect: () => setLifecycleTarget({ organization, action: "activate" }) },
                        { key: "trial", label: "Démarrer un essai", icon: Sparkles, disabled: !subscription, onSelect: () => setLifecycleTarget({ organization, action: "start_trial" }) },
                        { key: "past-due", label: "Signaler un retard", icon: AlertTriangle, disabled: !subscription, onSelect: () => setLifecycleTarget({ organization, action: "mark_past_due" }) },
                        { key: "suspend", label: "Suspendre", icon: PauseCircle, disabled: !subscription, onSelect: () => setLifecycleTarget({ organization, action: "suspend" }) },
                        { key: "history", label: "Voir l'historique", icon: History, disabled: !organization.history.length, onSelect: () => setHistoryTarget(organization) },
                        { key: "expire", label: "Clôturer comme expiré", icon: Clock3, destructive: true, disabled: !subscription, onSelect: () => setLifecycleTarget({ organization, action: "expire" }) },
                        { key: "cancel", label: "Annuler l'abonnement", icon: XCircle, destructive: true, disabled: !subscription, onSelect: () => setLifecycleTarget({ organization, action: "cancel" }) },
                      ]}
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-2 text-xs font-bold text-dtsc-muted sm:grid-cols-2 xl:grid-cols-4">
                  <span>Organisation: {formatEnumLabel(organization.organizationStatus)}</span>
                  <span>Début: {formatDate(subscription?.startedAt || null)}</span>
                  <span>Essai: {formatDate(subscription?.trialEndsAt || null)}</span>
                  <span>Fin / renouvellement: {formatDate(subscription?.expiresAt || null)}</span>
                  <span>Utilisateurs: {organization.activeUsers}/{subscription?.limits.maxUsers ?? 0}</span>
                  <span>Modules: {organization.enabledModules}/{organization.totalModules}, limite {subscription?.limits.maxActiveModules ?? 0}</span>
                  <span>Documents: limite {subscription?.limits.maxDocuments ?? 0}</span>
                  <span>Support: {subscription ? formatEnumLabel(subscription.limits.supportLevel) : "Non défini"}</span>
                </div>
                {organization.latestBillingRecord && (
                  <p className="mt-3 rounded-lg bg-dtsc-surface px-3 py-2 text-xs font-bold text-dtsc-muted">
                    Dernière écriture: {organization.latestBillingRecord.amount.toFixed(2)} {organization.latestBillingRecord.currency} · {formatEnumLabel(organization.latestBillingRecord.status)} · {formatDate(organization.latestBillingRecord.createdAt)}
                  </p>
                )}
              </article>
            );
          })}
          {!subscriptionList.filteredCount && <p className="rounded-lg border border-dtsc-border bg-dtsc-page p-4 text-sm font-semibold text-dtsc-muted">Aucune entreprise cliente à afficher.</p>}
        </div>
      </section>

      <SubscriptionFormDialog target={formTarget} plans={plans} busy={busy} onClose={() => setFormTarget(null)} onSubmit={submitSubscriptionForm} />
      <LifecycleDialog target={lifecycleTarget} busy={busy} onClose={() => setLifecycleTarget(null)} onSubmit={confirmLifecycleAction} />
      <HistoryDialog organization={historyTarget} onClose={() => setHistoryTarget(null)} />
      <AdminAuditTables payments={payments} logs={[]} />
    </div>
  );
}

function SubscriptionFormDialog({
  target,
  plans,
  busy,
  onClose,
  onSubmit,
}: {
  target: { organization: OrganizationBillingItem; mode: SubscriptionFormMode } | null;
  plans: PlanOption[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const subscription = target?.organization.subscription;
  const title = target?.mode === "create" ? "Créer un abonnement" : target?.mode === "renew" ? "Renouveler l'abonnement" : "Modifier l'abonnement";
  return (
    <Dialog open={Boolean(target)} title={title} description={target?.organization.organizationName} onClose={onClose} className="max-w-4xl">
      {target && (
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <FormField label="Plan">
            <select name="planId" defaultValue={subscription?.planId || ""} required className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              <option value="">Choisir un plan</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.priceUsd.toFixed(2)} USD</option>)}
            </select>
          </FormField>
          <FormField label="Statut">
            <select name="status" defaultValue={target.mode === "renew" ? "ACTIVE" : subscription?.status || "PENDING_PAYMENT"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              {["ACTIVE", "PENDING_PAYMENT", "PAST_DUE", "TRIAL", "SUSPENDED", "EXPIRED", "CANCELED"].map((status) => <option key={status} value={status}>{formatEnumLabel(status)}</option>)}
            </select>
          </FormField>
          <FormField label="Date de début"><Input name="startedAt" type="date" defaultValue={target.mode === "renew" ? "" : formatDateInput(subscription?.startedAt)} /></FormField>
          <FormField label="Date d'expiration"><Input name="expiresAt" type="date" defaultValue={target.mode === "renew" ? "" : formatDateInput(subscription?.expiresAt)} /></FormField>
          <FormField label="Fin d'essai"><Input name="trialEndsAt" type="date" defaultValue={target.mode === "renew" ? "" : formatDateInput(subscription?.trialEndsAt)} /></FormField>
          <FormField label="Motif" hint="Obligatoire pour assurer une piste d'audit exploitable."><Input name="reason" minLength={3} maxLength={500} required placeholder="Motif de l'opération" /></FormField>
          <div className="flex justify-end gap-3 md:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button disabled={busy} className="bg-[#002b5b] text-white hover:bg-[#001736]">{busy ? "Enregistrement..." : title}</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function LifecycleDialog({
  target,
  busy,
  onClose,
  onSubmit,
}: {
  target: { organization: OrganizationBillingItem; action: LifecycleAction } | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isTrial = target?.action === "start_trial";
  const isDestructive = target?.action === "cancel" || target?.action === "expire";
  return (
    <Dialog open={Boolean(target)} title={target ? LIFECYCLE_LABELS[target.action] : "Action abonnement"} description={target?.organization.organizationName} onClose={onClose} className="max-w-lg">
      {target && (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className={`rounded-lg border p-4 text-sm font-semibold leading-6 ${isDestructive ? "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200" : "border-dtsc-border bg-dtsc-page text-dtsc-muted"}`}>
            {isDestructive ? "Cette opération termine l'accès courant sans supprimer l'historique, les paiements ni les journaux." : "Cette transition sera appliquée immédiatement et enregistrée dans les journaux d'audit."}
          </p>
          {isTrial && <FormField label="Fin d'essai"><Input name="trialEndsAt" type="date" required /></FormField>}
          <FormField label="Motif"><Input name="reason" minLength={3} maxLength={500} required placeholder="Motif de la transition" /></FormField>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button disabled={busy} variant={isDestructive ? "destructive" : "default"}>{busy ? "Enregistrement..." : "Confirmer"}</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function HistoryDialog({ organization, onClose }: { organization: OrganizationBillingItem | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(organization)} title="Historique des abonnements" description={organization?.organizationName} onClose={onClose} className="max-w-4xl">
      <div className="grid gap-3">
        {organization?.history.map((historyItem) => (
          <article key={historyItem.id} className="rounded-lg border border-dtsc-border bg-dtsc-page p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-dtsc-ink">{historyItem.planName}</h3>
                <p className="mt-1 text-xs font-bold text-dtsc-muted">{historyItem.planCode} · {historyItem.priceUsd.toFixed(2)} USD</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClassName(historyItem.status)}`}>{formatEnumLabel(historyItem.status)}</span>
            </div>
            <div className="mt-3 grid gap-2 text-xs font-bold text-dtsc-muted sm:grid-cols-2">
              <span>Créé: {formatDate(historyItem.createdAt)}</span>
              <span>Mis à jour: {formatDate(historyItem.updatedAt)}</span>
              <span>Début: {formatDate(historyItem.startedAt)}</span>
              <span>Expiration: {formatDate(historyItem.expiresAt)}</span>
            </div>
          </article>
        ))}
      </div>
    </Dialog>
  );
}
