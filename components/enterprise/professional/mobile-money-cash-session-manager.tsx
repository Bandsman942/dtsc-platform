"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Banknote, CheckCircle2, CircleDollarSign, LockKeyhole, Plus } from "lucide-react";
import { Field } from "@/components/enterprise/core-v2/erp-v2-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { moneyValue, type RetailMutation } from "@/components/enterprise/professional/retail-workspace-shared";

type CashAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  currencyCode: string;
  operationalBalance: string | number;
};

export type MobileMoneyCashSession = {
  id: string;
  number: string;
  status: string;
  openingAmount: string | number;
  expectedCurrentAmount?: string | number;
  expectedClosingAmount?: string | number | null;
  countedClosingAmount?: string | number | null;
  discrepancyAmount?: string | number | null;
  openedAt: string;
  financialAccountId: string;
  revision: number;
  financialAccount: {
    id: string;
    code: string;
    name: string;
    currencyCode: string;
    operationalBalance: string | number;
  };
  _count: { movements: number; counts: number; discrepancies: number };
};

const COPY = {
  fr: {
    title: "Mes caisses Mobile Money",
    description: "Gardez plusieurs caisses ouvertes en parallèle et basculez d’une devise à l’autre en un toucher. Pour la RDC, une caisse CDF et une caisse USD sont recommandées.",
    active: "Caisse utilisée",
    openSessions: "caisses ouvertes",
    select: "Utiliser cette caisse",
    openingFloat: "Fonds d’ouverture",
    currentBalance: "Solde du compte",
    expected: "Théorique maintenant",
    openAnother: "Ouvrir une autre caisse",
    openAnotherDescription: "Une caisse déjà ouverte ou en attente d’approbation ne peut pas être ouverte une seconde fois.",
    till: "Compte de caisse",
    openingAmount: "Fonds d’ouverture",
    open: "Ouvrir la caisse",
    opened: "Caisse ouverte. Vous pouvez maintenant basculer vers cette devise.",
    noAvailable: "Toutes les caisses disponibles sont déjà ouvertes ou en validation.",
    noCashAccount: "Aucun compte de caisse actif n’est disponible. Configurez d’abord vos comptes de caisse dans Finance.",
    endOfDay: "Fin de journée",
    endOfDayDescription: "Comptez chaque caisse ouverte séparément. Chaque clôture passe ensuite au statut en attente d’approbation, selon le workflow Finance existant.",
    close: "Compter et clôturer",
    denominations: "Comptage des coupures",
    denomination: "Coupure",
    quantity: "Quantité",
    customDenomination: "Autre coupure",
    customQuantity: "Quantité autre",
    countedTotal: "Total compté",
    difference: "Écart estimé",
    reason: "Motif de l’écart",
    reasonPlaceholder: "Expliquez l’écart avant soumission…",
    submitClose: "Soumettre la clôture",
    closeSubmitted: "Clôture soumise à l’approbation indépendante.",
    pending: "En attente d’approbation",
    pendingDescription: "Cette caisse n’accepte plus d’opérations jusqu’à la décision du valideur.",
    nothingToClose: "Aucune caisse ouverte à clôturer.",
    processing: "Traitement…",
    recommended: "Recommandé RDC : CDF + USD",
  },
  en: {
    title: "My Mobile Money tills",
    description: "Keep several tills open in parallel and switch currency with one tap. In DR Congo, one CDF till and one USD till are recommended.",
    active: "Till in use",
    openSessions: "open tills",
    select: "Use this till",
    openingFloat: "Opening float",
    currentBalance: "Account balance",
    expected: "Expected now",
    openAnother: "Open another till",
    openAnotherDescription: "A till that is already open or awaiting approval cannot be opened a second time.",
    till: "Cash account",
    openingAmount: "Opening float",
    open: "Open till",
    opened: "Till opened. You can now switch to this currency.",
    noAvailable: "All available tills are already open or awaiting validation.",
    noCashAccount: "No active cash account is available. Configure cash accounts in Finance first.",
    endOfDay: "End of day",
    endOfDayDescription: "Count each open till separately. Each close is then submitted for approval through the existing Finance workflow.",
    close: "Count and close",
    denominations: "Denomination count",
    denomination: "Denomination",
    quantity: "Quantity",
    customDenomination: "Other denomination",
    customQuantity: "Other quantity",
    countedTotal: "Counted total",
    difference: "Estimated difference",
    reason: "Variance reason",
    reasonPlaceholder: "Explain the variance before submitting…",
    submitClose: "Submit close",
    closeSubmitted: "Till close submitted for independent approval.",
    pending: "Awaiting approval",
    pendingDescription: "This till no longer accepts operations until the validator decides.",
    nothingToClose: "No open till to close.",
    processing: "Processing…",
    recommended: "DRC recommendation: CDF + USD",
  },
} as const;

const DENOMINATIONS: Record<string, number[]> = {
  CDF: [20000, 10000, 5000, 1000, 500, 200, 100, 50],
  USD: [100, 50, 20, 10, 5, 1],
};

function currencyPriority(currency: string) {
  if (currency === "CDF") return 0;
  if (currency === "USD") return 1;
  return 10;
}

export function MobileMoneyCashSessionManager({
  organizationId,
  accounts,
  sessions,
  selectedSessionId,
  onSelectSession,
  locale,
  busyAction,
  mutate,
  reload,
}: {
  organizationId: string;
  accounts: CashAccount[];
  sessions: MobileMoneyCashSession[];
  selectedSessionId: string;
  onSelectSession: (sessionId: string) => void;
  locale: "fr" | "en";
  busyAction: string | null;
  mutate: RetailMutation;
  reload: () => Promise<void>;
}) {
  const copy = COPY[locale];
  const cashAccounts = useMemo(
    () => accounts.filter((account) => account.accountType === "CASH").sort((a, b) => currencyPriority(a.currencyCode) - currencyPriority(b.currencyCode) || a.name.localeCompare(b.name)),
    [accounts],
  );
  const openSessions = useMemo(
    () => sessions.filter((session) => session.status === "OPEN").sort((a, b) => currencyPriority(a.financialAccount.currencyCode) - currencyPriority(b.financialAccount.currencyCode)),
    [sessions],
  );
  const pendingSessions = useMemo(
    () => sessions.filter((session) => session.status === "CLOSING" || session.status === "PENDING_VALIDATION"),
    [sessions],
  );
  const lockedAccountIds = useMemo(() => new Set(sessions.map((session) => session.financialAccountId)), [sessions]);
  const availableAccounts = cashAccounts.filter((account) => !lockedAccountIds.has(account.id));

  async function openTill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const accountId = String(form.get("financialAccountId") || "");
    const result = await mutate(
      `open-mobile-money-cash-${accountId}`,
      `/api/enterprise/${organizationId}/retail/cash-sessions`,
      {
        financialAccountId: accountId,
        openingAmount: String(form.get("openingAmount") || "0"),
      },
      copy.opened,
      { idempotent: false },
    );
    if (result) await reload();
  }

  return (
    <div className="grid min-w-0 gap-5">
      <ModuleSection title={copy.title} description={copy.description}>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted">
              <StatusBadge tone={openSessions.length >= 2 ? "success" : openSessions.length ? "warning" : "neutral"}>{openSessions.length} {copy.openSessions}</StatusBadge>
              <span>{copy.recommended}</span>
            </div>
          </div>

          {openSessions.length ? (
            <div role="group" aria-label={copy.active} className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {openSessions.map((session) => {
                const selected = session.id === selectedSessionId;
                const currency = session.financialAccount.currencyCode;
                return (
                  <button
                    key={session.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelectSession(session.id)}
                    className={`min-h-24 min-w-0 rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:scale-[0.99] ${selected ? "border-cyan-500 bg-cyan-500/10 shadow-sm" : "border-dtsc-border bg-dtsc-page hover:border-cyan-500/50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xl font-black text-dtsc-ink">{currency}</span>
                          {selected ? <StatusBadge tone="success">{copy.active}</StatusBadge> : null}
                        </div>
                        <p className="mt-1 break-words text-sm font-black text-dtsc-ink">{session.financialAccount.name}</p>
                        <p className="mt-1 text-xs font-semibold text-dtsc-muted">{copy.openingFloat}: {moneyValue(session.openingAmount, currency)}</p>
                        <p className="text-xs font-semibold text-dtsc-muted">{copy.currentBalance}: {moneyValue(session.financialAccount.operationalBalance, currency)}</p>
                      </div>
                      <CircleDollarSign className="h-5 w-5 shrink-0 text-dtsc-muted" aria-hidden="true" />
                    </div>
                    {!selected ? <span className="mt-3 inline-flex text-xs font-black text-cyan-700 dark:text-cyan-200">{copy.select}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-800 dark:text-amber-200">
              {locale === "en" ? "Open at least one till before recording a Mobile Money operation." : "Ouvrez au moins une caisse avant d’enregistrer une opération Mobile Money."}
            </div>
          )}

          {cashAccounts.length ? (
            availableAccounts.length ? (
              <details className="rounded-2xl border border-dtsc-border bg-dtsc-surface" open={!openSessions.length}>
                <summary className="min-h-11 cursor-pointer list-none px-4 py-3 text-sm font-black text-dtsc-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                  <span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" aria-hidden="true" />{copy.openAnother}</span>
                </summary>
                <form onSubmit={openTill} className="grid min-w-0 gap-4 border-t border-dtsc-border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.55fr)_auto] sm:items-end">
                  <Field label={copy.till}>
                    <select name="financialAccountId" required disabled={Boolean(busyAction)} className="min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                      <option value="">—</option>
                      {availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.currencyCode} · {account.name}</option>)}
                    </select>
                  </Field>
                  <Field label={copy.openingAmount}><Input name="openingAmount" type="number" min="0" step="0.01" required disabled={Boolean(busyAction)} /></Field>
                  <Button disabled={Boolean(busyAction)}><Banknote className="h-4 w-4" />{busyAction?.startsWith("open-mobile-money-cash") ? copy.processing : copy.open}</Button>
                  <p className="text-xs font-semibold text-dtsc-muted sm:col-span-3">{copy.openAnotherDescription}</p>
                </form>
              </details>
            ) : (
              <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">{copy.noAvailable}</div>
            )
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-800 dark:text-amber-200">{copy.noCashAccount}</div>
          )}
        </div>
      </ModuleSection>

      <ModuleSection title={copy.endOfDay} description={copy.endOfDayDescription}>
        <div className="grid gap-3">
          {openSessions.map((session) => (
            <CashCloseCard
              key={session.id}
              organizationId={organizationId}
              session={session}
              locale={locale}
              busyAction={busyAction}
              mutate={mutate}
              reload={reload}
            />
          ))}
          {!openSessions.length ? <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">{copy.nothingToClose}</div> : null}
          {pendingSessions.map((session) => (
            <div key={session.id} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-black text-dtsc-ink">{session.financialAccount.currencyCode} · {session.financialAccount.name}</p>
                  <p className="mt-1 text-xs font-semibold text-dtsc-muted">{copy.pendingDescription}</p>
                </div>
                <StatusBadge tone="warning">{copy.pending}</StatusBadge>
              </div>
            </div>
          ))}
        </div>
      </ModuleSection>
    </div>
  );
}

function CashCloseCard({
  organizationId,
  session,
  locale,
  busyAction,
  mutate,
  reload,
}: {
  organizationId: string;
  session: MobileMoneyCashSession;
  locale: "fr" | "en";
  busyAction: string | null;
  mutate: RetailMutation;
  reload: () => Promise<void>;
}) {
  const copy = COPY[locale];
  const currency = session.financialAccount.currencyCode;
  const denominations = DENOMINATIONS[currency] || [100, 50, 20, 10, 5, 1];
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customDenomination, setCustomDenomination] = useState("");
  const [customQuantity, setCustomQuantity] = useState(0);
  const [reason, setReason] = useState("");
  const countedTotal = denominations.reduce((total, denomination) => total + denomination * (quantities[String(denomination)] || 0), 0)
    + (Number(customDenomination) > 0 ? Number(customDenomination) * customQuantity : 0);
  const expected = Number(session.expectedCurrentAmount ?? session.openingAmount ?? 0);
  const difference = countedTotal - expected;
  const reasonRequired = Math.abs(difference) > 0.000001;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reasonRequired && !reason.trim()) return;
    const counts = denominations
      .map((denomination) => ({ denomination: String(denomination), quantity: quantities[String(denomination)] || 0 }))
      .filter((item) => item.quantity > 0);
    if (Number(customDenomination) > 0 && customQuantity > 0) counts.push({ denomination: customDenomination, quantity: customQuantity });
    const result = await mutate(
      `close-mobile-money-cash-${session.id}`,
      `/api/enterprise/${organizationId}/retail/cash-sessions/${session.id}/close`,
      {
        countedClosingAmount: countedTotal.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") || "0",
        closingReason: reason.trim() || undefined,
        counts,
        revision: session.revision,
      },
      copy.closeSubmitted,
      { idempotent: false },
    );
    if (result) await reload();
  }

  return (
    <details className="rounded-2xl border border-dtsc-border bg-dtsc-surface">
      <summary className="min-h-11 cursor-pointer list-none p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words font-black text-dtsc-ink">{currency} · {session.financialAccount.name}</p>
            <p className="mt-1 text-xs font-semibold text-dtsc-muted">{copy.expected}: {moneyValue(expected, currency)} · {session._count.movements} {locale === "en" ? "movements" : "mouvements"}</p>
          </div>
          <span className="inline-flex items-center gap-2 text-sm font-black text-dtsc-ink"><LockKeyhole className="h-4 w-4" aria-hidden="true" />{copy.close}</span>
        </div>
      </summary>
      <form onSubmit={submit} className="grid gap-4 border-t border-dtsc-border p-4">
        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted">{copy.denominations}</p>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {denominations.map((denomination) => (
              <label key={denomination} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-2">
                <span className="min-w-16 text-sm font-black text-dtsc-ink">{denomination.toLocaleString()} {currency}</span>
                <Input
                  aria-label={`${copy.quantity} ${denomination} ${currency}`}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={quantities[String(denomination)] || ""}
                  onChange={(event) => setQuantities((current) => ({ ...current, [String(denomination)]: Math.max(0, Number(event.target.value || 0)) }))}
                  disabled={Boolean(busyAction)}
                />
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={copy.customDenomination}><Input type="number" min="0.000001" step="0.000001" value={customDenomination} onChange={(event) => setCustomDenomination(event.target.value)} disabled={Boolean(busyAction)} /></Field>
            <Field label={copy.customQuantity}><Input type="number" min="0" step="1" inputMode="numeric" value={customQuantity || ""} onChange={(event) => setCustomQuantity(Math.max(0, Number(event.target.value || 0)))} disabled={Boolean(busyAction)} /></Field>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase text-dtsc-muted">{copy.expected}</p><p className="mt-1 font-black text-dtsc-ink">{moneyValue(expected, currency)}</p></div>
          <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase text-dtsc-muted">{copy.countedTotal}</p><p className="mt-1 font-black text-dtsc-ink">{moneyValue(countedTotal, currency)}</p></div>
          <div className={`rounded-xl border p-3 ${reasonRequired ? "border-amber-500/30 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}><p className="text-xs font-black uppercase text-dtsc-muted">{copy.difference}</p><p className="mt-1 font-black text-dtsc-ink">{moneyValue(difference, currency)}</p></div>
        </div>

        {reasonRequired ? <Field label={copy.reason}><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={copy.reasonPlaceholder} minLength={3} maxLength={1000} required disabled={Boolean(busyAction)} /></Field> : null}
        <Button className="w-fit" disabled={Boolean(busyAction) || (reasonRequired && reason.trim().length < 3)}>
          <CheckCircle2 className="h-4 w-4" />{busyAction === `close-mobile-money-cash-${session.id}` ? copy.processing : copy.submitClose}
        </Button>
      </form>
    </details>
  );
}
