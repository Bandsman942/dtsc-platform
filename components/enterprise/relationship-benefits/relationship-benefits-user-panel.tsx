"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  CircleDollarSign,
  Clock3,
  FileText,
  Gift,
  Layers3,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import { notifyToast } from "@/lib/client-toast";

type BenefitItem = {
  id: string;
  code: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  benefitType: string;
  valueType: string;
  valueDecimal: number | null;
  currencyCode: string | null;
  minimumAmount: number | null;
  actionCode: string;
  actionLabelFr: string | null;
  actionLabelEn: string | null;
  targetModuleCode: string | null;
  stackable: boolean;
  applicationMode: "TRANSACTIONAL" | "REQUEST";
  contextRequired: boolean;
  blockedReason: string | null;
  startsAt: string | null;
  endsAt: string | null;
  usable: boolean;
  totalRemaining: number | null;
  periodRemaining: number | null;
  usagePeriodDays: number | null;
};

type BenefitRequest = {
  id: string;
  benefitId: string;
  benefitNameFr: string;
  benefitNameEn: string;
  actionCode: string;
  status: string;
  note: string | null;
  organizationNote: string | null;
  requestedAt: string;
  decidedAt: string | null;
  consumedAt: string | null;
  cancelledAt: string | null;
  revision: number;
  canCancel: boolean;
};

type Snapshot = {
  access: {
    allowed: boolean;
    capabilities: string[];
    message: string;
  };
  items: BenefitItem[];
  requests: BenefitRequest[];
  retail: null | {
    loyalty: Array<{
      id: string;
      programNameFr: string;
      programNameEn: string;
      currencyCode: string;
      pointsBalance: number;
      lifetimeEarned: number;
      lifetimeRedeemed: number;
      tierCode: string | null;
    }>;
    storedValue: Array<{
      id: string;
      accountType: string;
      displayCode: string;
      currencyCode: string;
      balance: number;
      expiresAt: string | null;
    }>;
  };
};

const CAPABILITY_COPY: Record<string, { fr: string; en: string; icon: typeof ShieldCheck }> = {
  RELATIONSHIP_SUMMARY: { fr: "Synthèse de la relation", en: "Relationship summary", icon: ShieldCheck },
  TARGETED_NOTIFICATIONS: { fr: "Notifications ciblées", en: "Targeted notifications", icon: Layers3 },
  SHARED_DOCUMENTS: { fr: "Documents partagés", en: "Shared documents", icon: FileText },
  CUSTOMER_SERVICES: { fr: "Services client", en: "Customer services", icon: Layers3 },
  SUPPLIER_SERVICES: { fr: "Services fournisseur", en: "Supplier services", icon: Layers3 },
  EMPLOYEE_SERVICES: { fr: "Services employé", en: "Employee services", icon: Layers3 },
  COLLABORATOR_SERVICES: { fr: "Services collaborateur", en: "Collaborator services", icon: Layers3 },
  ENTERPRISE_BENEFITS: { fr: "Avantages entreprise", en: "Enterprise benefits", icon: BadgePercent },
};

function formatValue(item: BenefitItem, locale: "fr" | "en") {
  if (item.valueDecimal === null) return null;
  if (item.valueType === "PERCENT") return `${item.valueDecimal}%`;
  if (item.valueType === "AMOUNT" && item.currencyCode) {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", {
      style: "currency",
      currency: item.currencyCode,
      maximumFractionDigits: 2,
    }).format(item.valueDecimal);
  }
  if (item.valueType === "POINTS") return `${item.valueDecimal} pts`;
  return String(item.valueDecimal);
}

function humanAction(item: BenefitItem, locale: "fr" | "en") {
  return locale === "en"
    ? item.actionLabelEn ||
        (item.actionCode === "BOOK"
          ? "Request booking"
          : item.actionCode === "CONTACT"
            ? "Contact"
            : item.actionCode === "CLAIM"
              ? "Request use"
              : "Request")
    : item.actionLabelFr ||
        (item.actionCode === "BOOK"
          ? "Demander une réservation"
          : item.actionCode === "CONTACT"
            ? "Contacter"
            : item.actionCode === "CLAIM"
              ? "Demander l’utilisation"
              : "Demander");
}

function requestStatus(status: string, locale: "fr" | "en") {
  const fr: Record<string, string> = {
    REQUESTED: "Demandée",
    APPROVED: "Approuvée",
    REJECTED: "Refusée",
    CONSUMED: "Utilisée",
    CANCELLED: "Annulée",
  };
  const en: Record<string, string> = {
    REQUESTED: "Requested",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    CONSUMED: "Used",
    CANCELLED: "Cancelled",
  };
  return (locale === "en" ? en : fr)[status] || status;
}

function requestTone(status: string): StatusBadgeTone {
  if (status === "APPROVED" || status === "CONSUMED") return "success";
  if (status === "REQUESTED") return "warning";
  if (status === "REJECTED") return "danger";
  return "neutral";
}

export function RelationshipBenefitsUserPanel({
  organizationId,
  identityLinkId,
}: {
  organizationId: string;
  identityLinkId: string;
}) {
  const locale = useAppLocale() === "en" ? "en" : "fr";
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/account/enterprise-relationships/${encodeURIComponent(organizationId)}/benefits?identityLinkId=${encodeURIComponent(identityLinkId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => null)) as Snapshot | { message?: string } | null;
      if (!response.ok) {
        throw new Error(
          (body as { message?: string } | null)?.message ||
            (locale === "en" ? "Benefits could not be loaded." : "Les avantages n’ont pas pu être chargés."),
        );
      }
      setSnapshot(body as Snapshot);
    } catch (error) {
      notifyToast(
        error instanceof Error
          ? error.message
          : locale === "en"
            ? "Benefits could not be loaded."
            : "Les avantages n’ont pas pu être chargés.",
        "error",
      );
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId, identityLinkId]);

  async function requestBenefit(item: BenefitItem) {
    setBusyId(item.id);
    try {
      const response = await fetch(
        `/api/account/enterprise-relationships/${encodeURIComponent(organizationId)}/benefits`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            identityLinkId,
            benefitId: item.id,
            idempotencyKey:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? `benefit:${crypto.randomUUID()}`
                : `benefit:${Date.now()}:${item.id}`,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.message ||
            (locale === "en" ? "The request could not be sent." : "La demande n’a pas pu être envoyée."),
        );
      }
      notifyToast(body?.message || (locale === "en" ? "Request sent." : "Demande envoyée."), "success");
      await load();
    } catch (error) {
      notifyToast(
        error instanceof Error
          ? error.message
          : locale === "en"
            ? "The request could not be sent."
            : "La demande n’a pas pu être envoyée.",
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function cancelRequest(request: BenefitRequest) {
    setBusyId(`request:${request.id}`);
    try {
      const response = await fetch(
        `/api/account/enterprise-relationships/${encodeURIComponent(organizationId)}/benefits`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            identityLinkId,
            usageId: request.id,
            revision: request.revision,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.message ||
            (locale === "en" ? "The request could not be cancelled." : "La demande n’a pas pu être annulée."),
        );
      }
      notifyToast(
        body?.message || (locale === "en" ? "Benefit request cancelled." : "Demande d’avantage annulée."),
        "success",
      );
      await load();
    } catch (error) {
      notifyToast(
        error instanceof Error
          ? error.message
          : locale === "en"
            ? "The request could not be cancelled."
            : "La demande n’a pas pu être annulée.",
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  const capabilities = useMemo(
    () =>
      (snapshot?.access.capabilities || [])
        .map((code) => ({ code, copy: CAPABILITY_COPY[code] }))
        .filter((item): item is { code: string; copy: { fr: string; en: string; icon: typeof ShieldCheck } } => Boolean(item.copy)),
    [snapshot?.access.capabilities],
  );
  const hasRetail = Boolean(
    snapshot?.retail && (snapshot.retail.loyalty.length || snapshot.retail.storedValue.length),
  );
  const empty = useMemo(
    () =>
      !loading &&
      snapshot &&
      snapshot.items.length === 0 &&
      snapshot.requests.length === 0 &&
      !hasRetail,
    [hasRetail, loading, snapshot],
  );

  return (
    <section className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-cyan-600">
            {locale === "en" ? "Relationship benefits" : "Avantages de la relation"}
          </p>
          <h3 className="mt-1 text-lg font-black text-dtsc-ink">
            {locale === "en"
              ? "Your available services and benefits"
              : "Vos services et avantages disponibles"}
          </h3>
          <p className="mt-1 text-sm leading-6 text-dtsc-muted">
            {locale === "en"
              ? "Eligibility is checked again by the server when you act."
              : "Votre éligibilité est revérifiée par le serveur au moment de chaque action."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          disabled={loading || busyId !== null}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : locale === "en" ? (
            "Refresh"
          ) : (
            "Actualiser"
          )}
        </Button>
      </div>

      {loading ? (
        <div className="mt-5 flex min-h-28 items-center justify-center text-sm font-semibold text-dtsc-muted">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {locale === "en" ? "Resolving benefits…" : "Résolution des avantages…"}
        </div>
      ) : null}

      {capabilities.length ? (
        <div className="mt-5">
          <h4 className="font-black text-dtsc-ink">
            {locale === "en" ? "Authorized relationship services" : "Services autorisés par la relation"}
          </h4>
          <div className="mt-3 flex min-w-0 flex-wrap gap-2">
            {capabilities.map(({ code, copy }) => {
              const Icon = copy.icon;
              return (
                <span
                  key={code}
                  className="inline-flex min-w-0 items-center gap-2 rounded-full border border-dtsc-border bg-dtsc-page/60 px-3 py-2 text-xs font-bold text-dtsc-ink"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
                  <span className="break-words">{locale === "en" ? copy.en : copy.fr}</span>
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {empty ? (
        <div className="mt-5 rounded-xl border border-dashed border-dtsc-border p-5 text-sm leading-6 text-dtsc-muted">
          {locale === "en"
            ? "No benefit is currently available for this active relationship."
            : "Aucun avantage n’est actuellement disponible pour cette relation active."}
        </div>
      ) : null}

      {snapshot?.items.length ? (
        <div className="mt-5 grid min-w-0 gap-3">
          <h4 className="font-black text-dtsc-ink">
            {locale === "en" ? "Available benefits" : "Avantages disponibles"}
          </h4>
          {snapshot.items.map((item) => {
            const value = formatValue(item, locale);
            return (
              <article
                key={item.id}
                className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page/60 p-4"
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <BadgePercent className="h-4 w-4 shrink-0 text-cyan-600" />
                      <h5 className="break-words font-black text-dtsc-ink">
                        {locale === "en" ? item.nameEn : item.nameFr}
                      </h5>
                    </div>
                    <p className="mt-2 break-words text-sm leading-6 text-dtsc-muted">
                      {locale === "en" ? item.descriptionEn : item.descriptionFr}
                    </p>
                  </div>
                  {value ? (
                    <strong className="rounded-full bg-cyan-500/10 px-3 py-1 text-sm text-cyan-700 dark:text-cyan-300">
                      {value}
                    </strong>
                  ) : null}
                </div>
                <div className="mt-3 flex min-w-0 flex-wrap gap-2 text-xs font-semibold text-dtsc-muted">
                  {item.totalRemaining !== null ? (
                    <span>
                      {locale === "en"
                        ? `${item.totalRemaining} remaining`
                        : `${item.totalRemaining} restante(s)`}
                    </span>
                  ) : null}
                  {item.periodRemaining !== null ? (
                    <span>
                      ·{" "}
                      {locale === "en"
                        ? `${item.periodRemaining} in current period`
                        : `${item.periodRemaining} sur la période`}
                    </span>
                  ) : null}
                  {item.endsAt ? (
                    <span>
                      · {locale === "en" ? "Until" : "Jusqu’au"}{" "}
                      {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", {
                        dateStyle: "medium",
                      }).format(new Date(item.endsAt))}
                    </span>
                  ) : null}
                </div>
                {item.applicationMode === "TRANSACTIONAL" ? (
                  <div className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-3 text-xs font-semibold leading-5 text-dtsc-muted">
                    {locale === "en"
                      ? "This benefit is applied automatically by the eligible business transaction. No manual consumption is required."
                      : "Cet avantage est appliqué automatiquement par l’opération métier éligible. Aucune consommation manuelle n’est requise."}
                  </div>
                ) : null}
                {item.applicationMode === "REQUEST" && item.actionCode !== "NONE" ? (
                  <div data-responsive-actions className="mt-4">
                    <Button
                      type="button"
                      onClick={() => void requestBenefit(item)}
                      disabled={!item.usable || busyId !== null}
                    >
                      {busyId === item.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      {item.usable
                        ? humanAction(item, locale)
                        : locale === "en"
                          ? "Limit reached"
                          : "Limite atteinte"}
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {snapshot?.requests.length ? (
        <div className="mt-5 grid min-w-0 gap-3">
          <h4 className="font-black text-dtsc-ink">
            {locale === "en" ? "My benefit requests" : "Mes demandes d’avantages"}
          </h4>
          {snapshot.requests.map((request) => (
            <article
              key={request.id}
              className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page/60 p-4"
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Clock3 className="h-4 w-4 shrink-0 text-cyan-600" />
                    <h5 className="break-words font-black text-dtsc-ink">
                      {locale === "en" ? request.benefitNameEn : request.benefitNameFr}
                    </h5>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-dtsc-muted">
                    {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(request.requestedAt))}
                  </p>
                  {request.organizationNote ? (
                    <p className="mt-2 break-words text-sm leading-6 text-dtsc-muted">
                      {request.organizationNote}
                    </p>
                  ) : null}
                </div>
                <StatusBadge tone={requestTone(request.status)}>
                  {requestStatus(request.status, locale)}
                </StatusBadge>
              </div>
              {request.canCancel ? (
                <div data-responsive-actions className="mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void cancelRequest(request)}
                    disabled={busyId !== null}
                  >
                    {busyId === `request:${request.id}` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <X className="mr-2 h-4 w-4" />
                    )}
                    {locale === "en" ? "Cancel request" : "Annuler la demande"}
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {snapshot?.retail?.loyalty.length ? (
        <div className="mt-5 grid min-w-0 gap-3">
          <h4 className="font-black text-dtsc-ink">
            {locale === "en" ? "Retail loyalty" : "Fidélité Retail"}
          </h4>
          {snapshot.retail.loyalty.map((account) => (
            <div
              key={account.id}
              className="rounded-xl border border-dtsc-border bg-dtsc-page/60 p-4"
            >
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-cyan-600" />
                <strong className="text-dtsc-ink">
                  {locale === "en" ? account.programNameEn : account.programNameFr}
                </strong>
              </div>
              <p className="mt-2 text-sm text-dtsc-muted">
                <strong className="text-dtsc-ink">{account.pointsBalance}</strong>{" "}
                {locale === "en" ? "points available" : "points disponibles"}
                {account.tierCode ? ` · ${account.tierCode}` : ""}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {snapshot?.retail?.storedValue.length ? (
        <div className="mt-5 grid min-w-0 gap-3">
          <h4 className="font-black text-dtsc-ink">
            {locale === "en" ? "Gift cards and credits" : "Cartes-cadeaux et avoirs"}
          </h4>
          {snapshot.retail.storedValue.map((account) => (
            <div
              key={account.id}
              className="rounded-xl border border-dtsc-border bg-dtsc-page/60 p-4"
            >
              <div className="flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4 text-cyan-600" />
                <strong className="text-dtsc-ink">{account.displayCode}</strong>
              </div>
              <p className="mt-2 text-sm text-dtsc-muted">
                {new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", {
                  style: "currency",
                  currency: account.currencyCode,
                }).format(account.balance)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
