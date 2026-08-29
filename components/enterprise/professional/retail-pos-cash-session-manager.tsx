"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Banknote, CircleDollarSign, Plus } from "lucide-react";
import type { MobileMoneyCashSession } from "@/components/enterprise/professional/mobile-money-cash-session-manager";
import { moneyValue, type RetailMutation } from "@/components/enterprise/professional/retail-workspace-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import retailTransactionFormsEn from "@/locales/retail-transaction-forms.en.json";
import retailTransactionFormsFr from "@/locales/retail-transaction-forms.fr.json";
import { notifyToast } from "@/lib/client-toast";

type CashAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  currencyCode: string;
  operationalBalance: string | number;
};

export function RetailPosCashSessionManager({
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
  const copy = (locale === "en" ? retailTransactionFormsEn : retailTransactionFormsFr).posCash;
  const cashAccounts = useMemo(
    () => accounts.filter((account) => account.accountType === "CASH").sort((a, b) => a.currencyCode.localeCompare(b.currencyCode) || a.name.localeCompare(b.name)),
    [accounts],
  );
  const openSessions = useMemo(
    () => sessions.filter((session) => session.status === "OPEN").sort((a, b) => a.financialAccount.currencyCode.localeCompare(b.financialAccount.currencyCode) || a.financialAccount.name.localeCompare(b.financialAccount.name)),
    [sessions],
  );
  const lockedAccountIds = useMemo(() => new Set(sessions.map((session) => session.financialAccountId)), [sessions]);
  const availableAccounts = cashAccounts.filter((account) => !lockedAccountIds.has(account.id));
  const [error, setError] = useState("");

  async function openTill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const financialAccountId = String(data.get("financialAccountId") || "");
    const openingAmount = Number(data.get("openingAmount") || 0);
    if (!financialAccountId || !availableAccounts.some((account) => account.id === financialAccountId)) {
      setError(copy.accountRequired);
      notifyToast(copy.accountRequired, "error");
      return;
    }
    if (!Number.isFinite(openingAmount) || openingAmount < 0) {
      setError(copy.amountInvalid);
      notifyToast(copy.amountInvalid, "error");
      return;
    }
    setError("");
    const result = await mutate(
      `open-pos-cash-${financialAccountId}`,
      `/api/enterprise/${organizationId}/retail/cash-sessions`,
      { financialAccountId, openingAmount: String(openingAmount) },
      copy.opened,
      { idempotent: false },
    );
    if (result) {
      formElement.reset();
      await reload();
    }
  }

  return (
    <ModuleSection title={copy.title} description={copy.description}>
      <div className="grid min-w-0 gap-4">
        {openSessions.length ? (
          <>
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <label htmlFor="pos-active-cash-session" className="text-sm font-black text-dtsc-ink">{copy.useTill}</label>
                <span className="rounded-full border border-dtsc-border px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-dtsc-muted">{copy.required}</span>
              </div>
              <select
                id="pos-active-cash-session"
                value={selectedSessionId}
                onChange={(event) => onSelectSession(event.target.value)}
                disabled={Boolean(busyAction)}
                className="min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink"
              >
                {openSessions.map((session) => (
                  <option key={session.id} value={session.id}>{session.financialAccount.currencyCode} · {session.financialAccount.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs font-semibold leading-5 text-dtsc-muted">{copy.description}</p>
            </div>
            <div role="group" aria-label={copy.openSessions} className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-2 overscroll-x-contain [touch-action:pan-x]">
              {openSessions.map((session) => {
                const selected = session.id === selectedSessionId;
                const currency = session.financialAccount.currencyCode;
                return (
                  <button
                    key={session.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelectSession(session.id)}
                    className={`min-h-24 w-[min(82vw,22rem)] shrink-0 snap-start rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:scale-[0.99] ${selected ? "border-cyan-500 bg-cyan-500/10 shadow-sm" : "border-dtsc-border bg-dtsc-page hover:border-cyan-500/50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xl font-black text-dtsc-ink">{currency}</span>
                          {selected ? <StatusBadge tone="success">{copy.active}</StatusBadge> : null}
                        </div>
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
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-800 dark:text-amber-200">{copy.noOpen}</div>
        )}

        {cashAccounts.length ? availableAccounts.length ? (
          <details className="rounded-2xl border border-dtsc-border bg-dtsc-surface" open={!openSessions.length}>
            <summary className="min-h-11 cursor-pointer list-none px-4 py-3 text-sm font-black text-dtsc-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
              <span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" aria-hidden="true" />{copy.openAnother}</span>
            </summary>
            <form noValidate onSubmit={openTill} className="grid min-w-0 gap-4 border-t border-dtsc-border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.55fr)_auto] sm:items-end">
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <label className="text-sm font-black text-dtsc-ink" htmlFor="pos-open-cash-account">{copy.till}</label>
                  <span className="rounded-full border border-dtsc-border px-2 py-0.5 text-[11px] font-black uppercase text-dtsc-muted">{copy.required}</span>
                </div>
                <select id="pos-open-cash-account" name="financialAccountId" disabled={Boolean(busyAction)} className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                  <option value="">—</option>
                  {availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.currencyCode} · {account.name}</option>)}
                </select>
                <p className="mt-1 text-xs font-semibold leading-5 text-dtsc-muted">{copy.accountHelp}</p>
              </div>
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <label className="text-sm font-black text-dtsc-ink" htmlFor="pos-opening-amount">{copy.openingAmount}</label>
                  <span className="rounded-full border border-dtsc-border px-2 py-0.5 text-[11px] font-black uppercase text-dtsc-muted">{copy.required}</span>
                </div>
                <Input id="pos-opening-amount" name="openingAmount" type="number" min="0" step="0.01" defaultValue="0" disabled={Boolean(busyAction)} />
                <p className="mt-1 text-xs font-semibold leading-5 text-dtsc-muted">{copy.amountHelp}</p>
              </div>
              <Button disabled={Boolean(busyAction)}><Banknote className="h-4 w-4" />{busyAction?.startsWith("open-pos-cash") ? copy.processing : copy.open}</Button>
              <p className="text-xs font-semibold leading-5 text-dtsc-muted sm:col-span-3">{copy.openAnotherHelp}</p>
              {error ? <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-bold text-rose-700 dark:text-rose-200 sm:col-span-3">{error}</p> : null}
            </form>
          </details>
        ) : (
          <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">{copy.noAvailable}</div>
        ) : (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-800 dark:text-amber-200">{copy.noCashAccount}</div>
        )}
      </div>
    </ModuleSection>
  );
}
