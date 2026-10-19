"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { StatusBadge } from "@/components/workspace/status-badge";
import {
  getEnterpriseIdentityRelationLabel,
  getEnterpriseIdentityStatusLabel,
  type EnterpriseIdentityRelationType,
  type EnterpriseIdentityLinkStatus,
} from "@/lib/enterprise/identity-links/contracts";
import { relationOverviewCopy } from "@/lib/enterprise/identity-links/overview-copy";

export type RelationshipOverviewLink = {
  id: string;
  status: string;
  requestedRelationType: string;
};

type Benefit = {
  id: string; nameFr: string; nameEn: string; descriptionFr: string; descriptionEn: string;
  valueType: string; valueDecimal: number | null; currencyCode: string | null;
  minimumAmount: number | null; usageLimitTotal: number | null;
  totalRemaining: number | null; periodRemaining: number | null;
  usable: boolean; requiresBusinessContext: boolean;
  usageLimitPerPeriod: number | null; usagePeriodDays: number | null;
  startsAt: string | null; endsAt: string | null;
};
type Usage = {
  id: string; status: string; benefitNameFr: string; benefitNameEn: string;
  requestedAt: string; decidedAt: string | null; consumedAt: string | null;
  cancelledAt: string | null; executedAt: string | null;
  effectAmount: number | null; effectCurrencyCode: string | null;
  operationHref?: string | null;
};
type Overview = {
  relation: {
    id: string; status: string; requestedRelationType: string; purpose: string;
    createdAt: string; activatedAt: string | null;
  };
  benefits: Benefit[]; usages: Usage[];
  pagination: { page: number; pageCount: number; total: number };
};

const usageStatusKeys: Record<string, "requestedStatus" | "approvedStatus" | "rejectedStatus" | "consumedStatus" | "cancelledStatus"> = {
  REQUESTED: "requestedStatus", APPROVED: "approvedStatus",
  REJECTED: "rejectedStatus", CONSUMED: "consumedStatus", CANCELLED: "cancelledStatus",
};

export function RelationshipOverviewPanel({
  organizationId,
  partyId,
  links,
}: {
  organizationId: string;
  partyId?: string;
  links: RelationshipOverviewLink[];
}) {
  const locale = useAppLocale() === "en" ? "en" : "fr";
  const copy = relationOverviewCopy[locale];
  const [linkId, setLinkId] = useState(links[0]?.id || "");
  const [tab, setTab] = useState<"SUMMARY" | "BENEFITS" | "HISTORY">("SUMMARY");
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState("");
  const [snapshot, setSnapshot] = useState<Overview | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const currentStatus = links.find((item) => item.id === linkId)?.status || "";
  const [expandedUsageId, setExpandedUsageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!links.some((link) => link.id === linkId)) {
      setLinkId(links[0]?.id || "");
      setPage(1);
    }
  }, [links, linkId]);

  useEffect(() => {
    if (!linkId) {
      setSnapshot(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page) });
    if (filterStatus) params.set("status", filterStatus);
    if (partyId) params.set("partyId", partyId);
    void fetch(
      `/api/enterprise/${encodeURIComponent(organizationId)}/identity-links/${encodeURIComponent(linkId)}/overview?${params.toString()}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || copy.failed);
        if (!controller.signal.aborted) setSnapshot(data as Overview);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : copy.failed);
          setSnapshot(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [organizationId, linkId, partyId, page, filterStatus, currentStatus, refreshKey, copy.failed]);

  const fmtDate = (value: string | null) => value
    ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value))
    : "—";
  const fmtAmount = (value: number | null, currency?: string | null) => {
    if (value === null) return "—";
    return new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 2 }).format(value) +
      (currency ? ` ${currency}` : "");
  };
  const currentLink = links.find((link) => link.id === linkId);
  if (!links.length) return <p className="py-5 text-sm text-dtsc-muted">{copy.noLink}</p>;

  return (
    <section data-relationship-overview className="grid min-w-0 max-w-full gap-4">
      <div data-responsive-actions className="flex justify-end">
        <button type="button" onClick={() => setRefreshKey((key) => key + 1)}
          disabled={loading} className="min-h-11 rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-blue disabled:opacity-50">
          {locale === "en" ? "Refresh relation" : "Actualiser la relation"}
        </button>
      </div>
      {links.length > 1 ? (
        <label className="text-sm font-bold text-dtsc-ink">
          {copy.select}
          <select
            value={linkId}
            onChange={(event) => { setLinkId(event.target.value); setPage(1); setTab("SUMMARY"); }}
            className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"
          >
            {links.map((link, index) => (
              <option value={link.id} key={link.id}>
                {index + 1} · {getEnterpriseIdentityRelationLabel(link.requestedRelationType as EnterpriseIdentityRelationType, locale)} · {getEnterpriseIdentityStatusLabel(link.status as EnterpriseIdentityLinkStatus, locale)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div role="tablist" aria-label={copy.title} className="flex min-w-0 gap-2 overflow-x-auto pb-1 [touch-action:pan-x]">
        {([
          ["SUMMARY", copy.summary], ["BENEFITS", copy.benefits], ["HISTORY", copy.history],
        ] as const).map(([key, label]) => (
          <button key={key} role="tab" type="button" aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-11 shrink-0 rounded-xl border px-3 text-sm font-bold ${tab === key ? "border-dtsc-blue bg-dtsc-soft text-dtsc-blue" : "border-dtsc-border text-dtsc-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      {loading ? <p role="status" className="text-sm text-dtsc-muted">{copy.loading}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      {tab === "SUMMARY" && snapshot ? (
        <div role="tabpanel" className="grid gap-3 rounded-xl border border-dtsc-border p-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={currentLink?.status === "ACTIVE" ? "success" : "neutral"}>
              {getEnterpriseIdentityStatusLabel(snapshot.relation.status as EnterpriseIdentityLinkStatus, locale)}
            </StatusBadge>
            <StatusBadge>{getEnterpriseIdentityRelationLabel(snapshot.relation.requestedRelationType as EnterpriseIdentityRelationType, locale)}</StatusBadge>
          </div>
          <p className="break-words text-dtsc-ink">{copy.purpose} : {snapshot.relation.purpose}</p>
          <p className="text-dtsc-muted">{copy.requested} : {fmtDate(snapshot.relation.createdAt)}</p>
          {snapshot.relation.activatedAt ? <p className="text-dtsc-muted">{copy.started} : {fmtDate(snapshot.relation.activatedAt)}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-dtsc-page p-3 font-bold">{copy.benefits} : {snapshot.benefits.length}</div>
            <div className="rounded-lg bg-dtsc-page p-3 font-bold">{copy.history} : {snapshot.pagination.total}</div>
          </div>
          <p className="text-xs text-dtsc-muted">{copy.noGuaranteedConsumption}</p>
        </div>
      ) : null}
      {tab === "BENEFITS" && snapshot ? (
        <div role="tabpanel" className="grid gap-3">
          {snapshot.benefits.length ? (
            <BusinessList ariaLabel={copy.benefits}>
              {snapshot.benefits.map((item) => (
                <BusinessListItem
                  key={item.id}
                  title={locale === "en" ? item.nameEn : item.nameFr}
                  description={<span className="grid gap-1"><span>{locale === "en" ? item.descriptionEn : item.descriptionFr}</span><span className="text-xs font-semibold text-dtsc-blue">{item.usable ? (locale === "en" ? "Potentially available" : "Potentiellement utilisable") : (locale === "en" ? "Usage limit reached" : "Quota d’utilisation atteint")}{item.requiresBusinessContext ? (locale === "en" ? " · Conditions evaluated at checkout" : " · Conditions évaluées lors de l’opération") : ""}</span></span>}
                  status={<StatusBadge tone={item.usable ? "success" : "warning"}>{item.usable ? (locale === "en" ? "Available" : "Disponible") : (locale === "en" ? "Quota reached" : "Quota atteint")}</StatusBadge>}
                  meta={
                    <span className="flex flex-wrap gap-x-3 gap-y-1">
                      {item.valueDecimal !== null ? <span>{item.valueType === "PERCENT" ? `${item.valueDecimal}%` : fmtAmount(item.valueDecimal, item.currencyCode)}</span> : null}
                      {item.minimumAmount !== null ? <span>{copy.minAmount}: {fmtAmount(item.minimumAmount, item.currencyCode)}</span> : null}
                      {item.usageLimitTotal ? <span>{copy.totalLimit}: {item.usageLimitTotal} · {locale === "en" ? "remaining" : "restant"}: {item.totalRemaining ?? "—"}</span> : null}
                      {item.usageLimitPerPeriod ? <span>{copy.periodLimit}: {item.usageLimitPerPeriod} / {item.usagePeriodDays} {locale === "en" ? "days" : "jours"} · {locale === "en" ? "remaining" : "restant"}: {item.periodRemaining ?? "—"}</span> : null}
                      {item.endsAt ? <span>{copy.validUntil}: {fmtDate(item.endsAt)}</span> : null}
                    </span>
                  }
                />
              ))}
            </BusinessList>
          ) : <p className="text-sm text-dtsc-muted">{copy.noBenefit}</p>}
          <p className="text-xs text-dtsc-muted">{copy.eligibility}</p>
        </div>
      ) : null}
      {tab === "HISTORY" && snapshot ? (
        <div role="tabpanel" className="grid gap-3">
          <label className="max-w-sm text-xs font-bold text-dtsc-ink">
            {locale === "en" ? "Filter by status" : "Filtrer par statut"}
            <select value={filterStatus} onChange={(event) => { setFilterStatus(event.target.value); setPage(1); }}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm">
              <option value="">{locale === "en" ? "All statuses" : "Tous les statuts"}</option>
              {Object.entries(usageStatusKeys).map(([value, labelKey]) => <option key={value} value={value}>{copy[labelKey]}</option>)}
            </select>
          </label>
          {snapshot.usages.length ? (
            <BusinessList ariaLabel={copy.history}>
              {snapshot.usages.map((usage) => (
                <BusinessListItem key={usage.id}
                  onOpen={() => setExpandedUsageId((previous) => previous === usage.id ? null : usage.id)}
                  openLabel={locale === "en" ? "Open dated usage details" : "Ouvrir le détail de cette utilisation"}
                  title={locale === "en" ? usage.benefitNameEn : usage.benefitNameFr}
                  status={<StatusBadge tone={usage.status === "CONSUMED" ? "success" : usage.status === "REQUESTED" ? "warning" : "neutral"}>
                    {copy[usageStatusKeys[usage.status] || "requestedStatus"]}
                  </StatusBadge>}
                  meta={fmtDate(usage.executedAt || usage.requestedAt)}
                  description={<div className="grid gap-1">
                    <span>{usage.executedAt ? `${copy.consumed} · ${fmtAmount(usage.effectAmount, usage.effectCurrencyCode)}` : copy.unexecuted}</span>
                    {expandedUsageId === usage.id ? (
                      <div className="grid gap-1 text-xs text-dtsc-ink">
                        <span>{copy.requested} : {fmtDate(usage.requestedAt)}</span>
                        {usage.decidedAt ? <span>{locale === "en" ? "Decision" : "Décision"} : {fmtDate(usage.decidedAt)}</span> : null}
                        {usage.cancelledAt ? <span>{locale === "en" ? "Cancellation" : "Annulation"} : {fmtDate(usage.cancelledAt)}</span> : null}
                        {usage.executedAt ? <span>{copy.consumed} : {fmtDate(usage.executedAt)}</span> : null}
                        {usage.operationHref ? (
                          <Link href={usage.operationHref} className="w-fit min-h-11 rounded-xl border border-dtsc-border px-3 py-2 font-bold text-dtsc-blue underline">
                            {locale === "en" ? "Open business operation" : "Ouvrir l’opération métier"}
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>}

                />
              ))}
            </BusinessList>
          ) : <p className="text-sm text-dtsc-muted">{copy.noHistory}</p>}
          {snapshot.pagination.pageCount > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="min-h-11 rounded-xl border border-dtsc-border px-3 text-sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{copy.previous}</button>
              <p className="text-xs text-dtsc-muted">{copy.page} {page} / {snapshot.pagination.pageCount}</p>
              <button type="button" className="min-h-11 rounded-xl border border-dtsc-border px-3 text-sm" disabled={page >= snapshot.pagination.pageCount} onClick={() => setPage((current) => current + 1)}>{copy.next}</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
