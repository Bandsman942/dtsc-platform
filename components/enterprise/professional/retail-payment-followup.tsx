"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  customerFacingError,
  customerFacingPaymentMethod,
  customerFacingPaymentStatus,
  type CustomerFacingLocale,
} from "@/lib/customer-facing-language";

type Capabilities = {
  canManagePayments: boolean;
  canRefundPayments: boolean;
};

type Payment = {
  id: string;
  methodType: string;
  currencyCode: string;
  amount: string;
  status: string;
  clientReference: string;
  createdAt: string;
  updatedAt: string;
};

const PAYMENT_FILTERS = ["", "INITIATED", "AUTHORIZED", "CAPTURED", "FAILED", "VOIDED", "REFUNDED"] as const;

async function readJson(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || body?.error || "RETAIL_PAYMENT_LIST_FAILED");
  return body;
}

function money(value: string | number, currencyCode: string) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

function statusHelp(status: string, locale: CustomerFacingLocale) {
  const messages: Record<string, { fr: string; en: string }> = {
    INITIATED: {
      fr: "Le paiement est enregistré mais n’est pas encore confirmé.",
      en: "The payment is recorded but has not been confirmed yet.",
    },
    AUTHORIZED: {
      fr: "L’autorisation est obtenue ; la confirmation finale reste à enregistrer.",
      en: "Authorization was received; final confirmation is still pending.",
    },
    CAPTURED: {
      fr: "Le paiement est confirmé.",
      en: "The payment is confirmed.",
    },
    FAILED: {
      fr: "Le paiement n’a pas été confirmé. Vérifiez le moyen de paiement avant une nouvelle tentative.",
      en: "The payment was not confirmed. Check the payment method before trying again.",
    },
    VOIDED: {
      fr: "Le paiement a été annulé avant confirmation finale.",
      en: "The payment was voided before final confirmation.",
    },
    REFUNDED: {
      fr: "Le paiement a été remboursé.",
      en: "The payment was refunded.",
    },
  };
  return messages[status]?.[locale] || (locale === "en" ? "Payment status available." : "État du paiement disponible.");
}

export function RetailPaymentFollowup({ organizationId, locale }: { organizationId: string; locale: CustomerFacingLocale }) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = useMemo(() => locale === "en" ? {
    title: "Payment follow-up",
    intro: "Review recent payments and quickly identify those that still need attention.",
    all: "All",
    reference: "Payment reference",
    date: "Created",
    noPayments: "No payment matches this filter.",
    loading: "Loading payments…",
    refresh: "Refresh",
    open: "Open",
    close: "Close",
  } : {
    title: "Suivi des paiements",
    intro: "Consultez les paiements récents et identifiez rapidement ceux qui demandent encore une action.",
    all: "Tous",
    reference: "Référence du paiement",
    date: "Créé le",
    noPayments: "Aucun paiement ne correspond à ce filtre.",
    loading: "Chargement des paiements…",
    refresh: "Actualiser",
    open: "Ouvrir",
    close: "Fermer",
  }, [locale]);

  const loadPermissions = useCallback(async () => {
    try {
      const data = await fetch(`/api/enterprise/${organizationId}/retail/customer-payment-permissions`, { cache: "no-store" }).then(readJson);
      setCapabilities(data.capabilities);
    } catch (caught) {
      setError(customerFacingError(caught, locale, {
        fr: "Les autorisations de suivi des paiements ne sont pas disponibles pour le moment.",
        en: "Payment follow-up permissions are not available right now.",
      }));
      setCapabilities(null);
      setLoading(false);
    }
  }, [organizationId, locale]);

  const loadPayments = useCallback(async () => {
    if (!capabilities || (!capabilities.canManagePayments && !capabilities.canRefundPayments)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: "1", pageSize: "30" });
      if (status) query.set("status", status);
      const data = await fetch(`/api/enterprise/${organizationId}/retail/payments?${query.toString()}`, { cache: "no-store" }).then(readJson);
      setPayments((data.items || []).map((item: Payment) => ({
        id: item.id,
        methodType: item.methodType,
        currencyCode: item.currencyCode,
        amount: item.amount,
        status: item.status,
        clientReference: item.clientReference,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })));
    } catch (caught) {
      setError(customerFacingError(caught, locale, {
        fr: "Le suivi des paiements n’est pas disponible pour le moment.",
        en: "Payment follow-up is not available right now.",
      }));
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [capabilities, organizationId, locale, status]);

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  if (capabilities && !capabilities.canManagePayments && !capabilities.canRefundPayments) return null;

  return (
    <details className="group rounded-2xl border border-dtsc-border bg-dtsc-surface shadow-sm">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-dtsc-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
        <span>{copy.title}</span>
        <span className="text-xs font-bold text-dtsc-muted group-open:hidden">{copy.open}</span>
        <span className="hidden text-xs font-bold text-dtsc-muted group-open:inline">{copy.close}</span>
      </summary>
      <section className="border-t border-dtsc-border p-3 sm:p-4" aria-label={copy.title}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-3xl text-xs leading-5 text-dtsc-muted">{copy.intro}</p>
          <button type="button" onClick={() => void loadPayments()} className="min-h-10 w-full rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-ink hover:bg-black/5 sm:w-auto">
            {copy.refresh}
          </button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [touch-action:pan-x]" aria-label={locale === "en" ? "Payment filters" : "Filtres des paiements"}>
          {PAYMENT_FILTERS.map((filter) => (
            <button
              key={filter || "ALL"}
              type="button"
              onClick={() => setStatus(filter)}
              className={`min-h-10 shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${status === filter ? "border-dtsc-ink bg-dtsc-ink text-white" : "border-dtsc-border text-dtsc-ink"}`}
            >
              {filter ? customerFacingPaymentStatus(filter, locale) : copy.all}
            </button>
          ))}
        </div>

        {error ? <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p> : null}

        {loading ? <p className="mt-4 text-sm text-dtsc-muted">{copy.loading}</p> : payments.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {payments.map((payment) => (
              <article key={payment.id} className="min-w-0 rounded-xl border border-dtsc-border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-dtsc-ink">{money(payment.amount, payment.currencyCode)}</p>
                    <p className="mt-1 text-xs font-medium text-dtsc-muted">{customerFacingPaymentMethod(payment.methodType, locale)}</p>
                  </div>
                  <span className="rounded-full border border-dtsc-border px-2 py-1 text-[11px] font-bold text-dtsc-ink">{customerFacingPaymentStatus(payment.status, locale)}</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-dtsc-muted">{statusHelp(payment.status, locale)}</p>
                <dl className="mt-3 space-y-1 text-xs">
                  <div className="flex min-w-0 gap-2">
                    <dt className="shrink-0 text-dtsc-muted">{copy.reference}</dt>
                    <dd className="min-w-0 truncate font-medium text-dtsc-ink">{payment.clientReference}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-dtsc-muted">{copy.date}</dt>
                    <dd className="font-medium text-dtsc-ink">{new Date(payment.createdAt).toLocaleString(locale === "en" ? "en" : "fr")}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-dtsc-border p-4 text-sm text-dtsc-muted">{copy.noPayments}</p>
        )}
      </section>
    </details>
  );
}
