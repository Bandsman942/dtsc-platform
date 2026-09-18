"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Banknote, CheckCircle2, CircleDollarSign, LockKeyhole, Plus } from "lucide-react";
import { Field } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  CashPhysicalCountFields,
  cashCountsFromForm,
  cashDenominationsForCurrency,
} from "@/components/enterprise/professional/cash-physical-count-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { moneyValue, type RetailMutation } from "@/components/enterprise/professional/retail-workspace-shared";
import { notifyToast } from "@/lib/client-toast";
import { translateRetailWorkspace } from "@/lib/i18n";

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
    title: translateRetailWorkspace("fr", "cashSessionTitle"),
    description: translateRetailWorkspace("fr", "cashSessionDescription"),
    active: translateRetailWorkspace("fr", "cashSessionActive"),
    openSessions: translateRetailWorkspace("fr", "cashSessionOpenSessions"),
    select: translateRetailWorkspace("fr", "cashSessionSelect"),
    useTill: "Caisse ouverte à utiliser",
    openingFloat: translateRetailWorkspace("fr", "openingFloat"),
    currentBalance: translateRetailWorkspace("fr", "cashSessionCurrentBalance"),
    expected: translateRetailWorkspace("fr", "cashSessionExpected"),
    openAnother: translateRetailWorkspace("fr", "cashSessionOpenAnother"),
    openAnotherDescription: translateRetailWorkspace("fr", "cashSessionOpenAnotherDescription"),
    till: translateRetailWorkspace("fr", "cashSessionTill"),
    openingAmount: translateRetailWorkspace("fr", "openingFloat"),
    open: translateRetailWorkspace("fr", "dailyCloseOpenTill"),
    opened: translateRetailWorkspace("fr", "cashSessionOpened"),
    noAvailable: translateRetailWorkspace("fr", "cashSessionNoAvailable"),
    noCashAccount: translateRetailWorkspace("fr", "cashSessionNoCashAccount"),
    endOfDay: translateRetailWorkspace("fr", "cashSessionEndOfDay"),
    endOfDayDescription: translateRetailWorkspace("fr", "cashSessionEndOfDayDescription"),
    close: translateRetailWorkspace("fr", "cashSessionClose"),
    submitClose: translateRetailWorkspace("fr", "cashSessionSubmitClose"),
    closeSubmitted: translateRetailWorkspace("fr", "cashSessionCloseSubmitted"),
    pending: translateRetailWorkspace("fr", "cashSessionPending"),
    pendingDescription: translateRetailWorkspace("fr", "cashSessionPendingDescription"),
    nothingToClose: translateRetailWorkspace("fr", "cashSessionNothingToClose"),
    processing: translateRetailWorkspace("fr", "processing"),
    recommended: translateRetailWorkspace("fr", "cashSessionRecommended"),
    accountRequired: "Choisissez une caisse existante de cette entreprise avant de l’ouvrir.",
    openingAmountInvalid: "Le fond de caisse doit être un montant valide supérieur ou égal à zéro.",
    reasonRequired: "Expliquez l’écart de caisse avec un motif d’au moins 3 caractères avant de soumettre la clôture.",
    approverRequired: "Choisissez le validateur autorisé qui recevra cette clôture.",
  },
  en: {
    title: translateRetailWorkspace("en", "cashSessionTitle"),
    description: translateRetailWorkspace("en", "cashSessionDescription"),
    active: translateRetailWorkspace("en", "cashSessionActive"),
    openSessions: translateRetailWorkspace("en", "cashSessionOpenSessions"),
    select: translateRetailWorkspace("en", "cashSessionSelect"),
    useTill: "Open till to use",
    openingFloat: translateRetailWorkspace("en", "openingFloat"),
    currentBalance: translateRetailWorkspace("en", "cashSessionCurrentBalance"),
    expected: translateRetailWorkspace("en", "cashSessionExpected"),
    openAnother: translateRetailWorkspace("en", "cashSessionOpenAnother"),
    openAnotherDescription: translateRetailWorkspace("en", "cashSessionOpenAnotherDescription"),
    till: translateRetailWorkspace("en", "cashSessionTill"),
    openingAmount: translateRetailWorkspace("en", "openingFloat"),
    open: translateRetailWorkspace("en", "dailyCloseOpenTill"),
    opened: translateRetailWorkspace("en", "cashSessionOpened"),
    noAvailable: translateRetailWorkspace("en", "cashSessionNoAvailable"),
    noCashAccount: translateRetailWorkspace("en", "cashSessionNoCashAccount"),
    endOfDay: translateRetailWorkspace("en", "cashSessionEndOfDay"),
    endOfDayDescription: translateRetailWorkspace("en", "cashSessionEndOfDayDescription"),
    close: translateRetailWorkspace("en", "cashSessionClose"),
    submitClose: translateRetailWorkspace("en", "cashSessionSubmitClose"),
    closeSubmitted: translateRetailWorkspace("en", "cashSessionCloseSubmitted"),
    pending: translateRetailWorkspace("en", "cashSessionPending"),
    pendingDescription: translateRetailWorkspace("en", "cashSessionPendingDescription"),
    nothingToClose: translateRetailWorkspace("en", "cashSessionNothingToClose"),
    processing: translateRetailWorkspace("en", "processing"),
    recommended: translateRetailWorkspace("en", "cashSessionRecommended"),
    accountRequired: "Select an existing cash account for this company before opening the till.",
    openingAmountInvalid: "The opening float must be a valid amount greater than or equal to zero.",
    reasonRequired: "Explain the cash discrepancy with a reason of at least 3 characters before submitting the close.",
    approverRequired: "Select the authorized approver who will receive this cash close.",
  },
} as const;

// Kept as a named contract for Retail/Telco regression QA; values come from the canonical cash-count primitive.
const DENOMINATIONS = {
  CDF: cashDenominationsForCurrency("CDF"),
  USD: cashDenominationsForCurrency("USD"),
} as const;
void DENOMINATIONS;

function currencyPriority(currency: string) {
  if (currency === "CDF") return 0;
  if (currency === "USD") return 1;
  return 10;
}

export function MobileMoneyCashSessionManager({
  organizationId,
  moduleCode = "MOBILE_MONEY_AGENCY",
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
  moduleCode?: "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS";
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
  const telco = moduleCode === "TELCO_TOPUPS";
  const operationTitle = telco ? translateRetailWorkspace(locale, "cashSessionMyTelcoTills") : copy.title;
  const operationDescription = telco
    ? translateRetailWorkspace(locale, "cashSessionKeepCDFAndUSDTillsOpenInParallelForCashTopUps")
    : copy.description;
  const actionScope = telco ? "telco" : "mobile-money";
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
  const [openError, setOpenError] = useState("");

  async function openTill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const accountId = String(form.get("financialAccountId") || "");
    const openingAmount = Number(form.get("openingAmount") || 0);
    if (!accountId || !availableAccounts.some((account) => account.id === accountId)) {
      setOpenError(copy.accountRequired);
      notifyToast(copy.accountRequired, "error");
      return;
    }
    if (!Number.isFinite(openingAmount) || openingAmount < 0) {
      setOpenError(copy.openingAmountInvalid);
      notifyToast(copy.openingAmountInvalid, "error");
      return;
    }
    setOpenError("");
    const result = await mutate(
      `open-${actionScope}-cash-${accountId}`,
      `/api/enterprise/${organizationId}/retail/cash-sessions`,
      { financialAccountId: accountId, openingAmount: String(openingAmount) },
      copy.opened,
      { idempotent: false },
    );
    if (result) {
      formElement.reset();
      await reload();
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      <ModuleSection title={operationTitle} description={operationDescription}>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted">
              <StatusBadge tone={openSessions.length >= 2 ? "success" : openSessions.length ? "warning" : "neutral"}>{openSessions.length} {copy.openSessions}</StatusBadge>
              <span>{copy.recommended}</span>
            </div>
          </div>

          {openSessions.length ? (
            <>
              <Field label={copy.useTill}>
                <select value={selectedSessionId} onChange={(event) => onSelectSession(event.target.value)} disabled={Boolean(busyAction)} className="min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                  {openSessions.map((session) => <option key={session.id} value={session.id}>{session.financialAccount.currencyCode} · {session.financialAccount.name}</option>)}
                </select>
              </Field>
              <div role="group" aria-label={copy.active} className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-2 overscroll-x-contain">
                {openSessions.map((session) => {
                  const selected = session.id === selectedSessionId;
                  const currency = session.financialAccount.currencyCode;
                  return (
                    <button key={session.id} type="button" aria-pressed={selected} onClick={() => onSelectSession(session.id)} className={`min-h-24 w-[min(82vw,22rem)] shrink-0 snap-start rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:scale-[0.99] ${selected ? "border-cyan-500 bg-cyan-500/10 shadow-sm" : "border-dtsc-border bg-dtsc-page hover:border-cyan-500/50"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2"><span className="text-xl font-black text-dtsc-ink">{currency}</span>{selected ? <StatusBadge tone="success">{copy.active}</StatusBadge> : null}</div>
                          <p className="mt-1 break-words text-sm font-black text-dtsc-ink">{session.financialAccount.name}</p>
                          <p className="mt-1 text-xs font-semibold text-dtsc-muted">{copy.openingFloat}: {moneyValue(session.openingAmount, currency, locale)}</p>
                          <p className="text-xs font-semibold text-dtsc-muted">{copy.currentBalance}: {moneyValue(session.financialAccount.operationalBalance, currency, locale)}</p>
                        </div>
                        <CircleDollarSign className="h-5 w-5 shrink-0 text-dtsc-muted" aria-hidden="true" />
                      </div>
                      {!selected ? <span className="mt-3 inline-flex text-xs font-black text-cyan-700 dark:text-cyan-200">{copy.select}</span> : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-800 dark:text-amber-200">
              {telco ? translateRetailWorkspace(locale, "cashSessionNoCashTillIsOpenYouCanOpenOneForCashTelco") : translateRetailWorkspace(locale, "cashSessionOpenAtLeastOneTillBeforeRecordingAMobileMoneyOperation")}
            </div>
          )}

          {cashAccounts.length ? availableAccounts.length ? (
            <details className="rounded-2xl border border-dtsc-border bg-dtsc-surface" open={!openSessions.length}>
              <summary className="min-h-11 cursor-pointer list-none px-4 py-3 text-sm font-black text-dtsc-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"><span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" aria-hidden="true" />{copy.openAnother}</span></summary>
              <form onSubmit={openTill} className="grid min-w-0 gap-4 border-t border-dtsc-border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.55fr)_auto] sm:items-end">
                <Field label={copy.till}><select name="financialAccountId" required disabled={Boolean(busyAction)} className="min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink"><option value="">—</option>{availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.currencyCode} · {account.name}</option>)}</select></Field>
                <Field label={copy.openingAmount}><Input name="openingAmount" type="number" min="0" step="0.01" required disabled={Boolean(busyAction)} /></Field>
                <Button disabled={Boolean(busyAction)}><Banknote className="h-4 w-4" />{busyAction?.startsWith(`open-${actionScope}-cash`) ? copy.processing : copy.open}</Button>
                <p className="text-xs font-semibold text-dtsc-muted sm:col-span-3">{copy.openAnotherDescription}</p>
                {openError ? <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-bold text-rose-700 dark:text-rose-200 sm:col-span-3">{openError}</p> : null}
              </form>
            </details>
          ) : <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">{copy.noAvailable}</div> : <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-800 dark:text-amber-200">{copy.noCashAccount}</div>}
        </div>
      </ModuleSection>

      <ModuleSection title={copy.endOfDay} description={copy.endOfDayDescription}>
        <div className="grid gap-3">
          {openSessions.map((session) => <CashCloseCard key={session.id} organizationId={organizationId} moduleCode={moduleCode} session={session} locale={locale} busyAction={busyAction} mutate={mutate} reload={reload} />)}
          {!openSessions.length ? <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">{copy.nothingToClose}</div> : null}
          {pendingSessions.map((session) => <div key={session.id} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="break-words font-black text-dtsc-ink">{session.financialAccount.currencyCode} · {session.financialAccount.name}</p><p className="mt-1 text-xs font-semibold text-dtsc-muted">{copy.pendingDescription}</p></div><StatusBadge tone="warning">{copy.pending}</StatusBadge></div></div>)}
        </div>
      </ModuleSection>
    </div>
  );
}

function CashCloseCard({ organizationId, moduleCode, session, locale, busyAction, mutate, reload }: {
  organizationId: string;
  moduleCode: "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS";
  session: MobileMoneyCashSession;
  locale: "fr" | "en";
  busyAction: string | null;
  mutate: RetailMutation;
  reload: () => Promise<void>;
}) {
  const copy = COPY[locale];
  const actionScope = moduleCode === "TELCO_TOPUPS" ? "telco" : "mobile-money";
  const closeEndpoint = moduleCode === "TELCO_TOPUPS"
    ? `/api/enterprise/${organizationId}/retail/telco-topups/cash-sessions/${session.id}/close`
    : `/api/enterprise/${organizationId}/retail/cash-sessions/${session.id}/close`;
  const currency = session.financialAccount.currencyCode;
  const expected = Number(session.expectedCurrentAmount ?? session.openingAmount ?? 0);
  const [closeError, setCloseError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const countedClosingAmount = Number(form.get("countedClosingAmount") || 0);
    const closingReason = String(form.get("closingReason") || "").trim();
    const approverUserId = String(form.get("approverUserId") || "").trim();
    const reasonRequired = Math.abs(countedClosingAmount - expected) > 0.000001;
    if (reasonRequired && closingReason.length < 3) {
      setCloseError(copy.reasonRequired);
      notifyToast(copy.reasonRequired, "error");
      return;
    }
    if (!approverUserId) {
      setCloseError(copy.approverRequired);
      notifyToast(copy.approverRequired, "error");
      return;
    }
    setCloseError("");
    const result = await mutate(
      `close-${actionScope}-cash-${session.id}`,
      closeEndpoint,
      {
        countedClosingAmount: String(form.get("countedClosingAmount") || "0"),
        closingReason: closingReason || undefined,
        counts: cashCountsFromForm(form, currency),
        revision: session.revision,
        approverUserId,
      },
      copy.closeSubmitted,
      { idempotent: false },
    );
    if (result) {
      setCloseError("");
      await reload();
    }
  }

  return (
    <details className="rounded-2xl border border-dtsc-border bg-dtsc-surface">
      <summary className="min-h-11 cursor-pointer list-none p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><p className="break-words font-black text-dtsc-ink">{currency} · {session.financialAccount.name}</p><p className="mt-1 text-xs font-semibold text-dtsc-muted">{copy.expected}: {moneyValue(expected, currency, locale)} · {session._count.movements} {translateRetailWorkspace(locale, "cashSessionMovements")}</p></div>
          <span className="inline-flex items-center gap-2 text-sm font-black text-dtsc-ink"><LockKeyhole className="h-4 w-4" aria-hidden="true" />{copy.close}</span>
        </div>
      </summary>
      <form onSubmit={submit} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 border-t border-dtsc-border p-4">
        <CashPhysicalCountFields organizationId={organizationId} currencyCode={currency} expectedAmount={expected} locale={locale} disabled={Boolean(busyAction)} />
        {closeError ? <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-bold text-rose-700 dark:text-rose-200">{closeError}</p> : null}
        <Button className="w-fit" disabled={Boolean(busyAction)}><CheckCircle2 className="h-4 w-4" />{busyAction === `close-${actionScope}-cash-${session.id}` ? copy.processing : copy.submitClose}</Button>
      </form>
    </details>
  );
}
