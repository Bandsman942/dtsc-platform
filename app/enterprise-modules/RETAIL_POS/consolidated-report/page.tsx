import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, CheckCircle2, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ProfessionalReportView } from "@/components/reports/professional-report-view";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { getSession, requireUser } from "@/lib/auth";
import { getRetailMetricsByCurrency } from "@/lib/enterprise/retail/commercial-guardrails";
import { getRetailFunctionalCurrencySummary } from "@/lib/enterprise/retail/fx-reporting";
import { buildRetailProfessionalReport } from "@/lib/reporting/retail-professional-report";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{ period?: string }>;

function money(value: string | number | null | undefined, currency: string, locale: "fr" | "en") {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function periodRange(period: string) {
  const to = new Date();
  const from = new Date();
  if (period === "7D") from.setDate(from.getDate() - 7);
  else if (period === "30D") from.setDate(from.getDate() - 30);
  else from.setHours(0, 0, 0, 0);
  return { from, to };
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");
  const access = await resolveEnterpriseModuleAccess({ userId: user.id, organizationId, moduleCode: "RETAIL_POS", action: "read" });
  if (!access.allowed) notFound();
  const [membership, organization] = await Promise.all([
    requireEnterpriseMembership(session, organizationId),
    prisma.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT", sectorCode: "COMMERCE_RETAIL" }, select: { name: true, logoUrl: true } }),
  ]);
  if (!membership || !organization) notFound();

  const query = await searchParams;
  const period = ["TODAY", "7D", "30D"].includes(query.period || "") ? String(query.period) : "TODAY";
  const { from, to } = periodRange(period);
  const [native, consolidated] = await Promise.all([
    getRetailMetricsByCurrency(organizationId, from, to),
    getRetailFunctionalCurrencySummary(organizationId, from, to),
  ]);
  const locale = user.locale === "en" ? "en" : "fr";
  const target = consolidated.targetCurrencyCode || "—";
  const periodLabel = period === "TODAY" ? (locale === "fr" ? "Aujourd’hui" : "Today") : period === "7D" ? (locale === "fr" ? "7 jours" : "7 days") : (locale === "fr" ? "30 jours" : "30 days");
  const professionalReport = buildRetailProfessionalReport({ organizationName: organization.name, locale, periodLabel, from, to, native, consolidated });

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow={`${locale === "fr" ? "Shop · Reporting multi-devise" : "Shop · Multi-currency reporting"} · ${organization.name}`}
          title={locale === "fr" ? "Rapport consolidé avec taux historiques" : "Historical FX consolidated report"}
          description={locale === "fr" ? "Chaque opération est convertie au taux applicable à sa propre date. Les agrégats natifs restent visibles et aucune consolidation partielle n’est présentée si un taux manque." : "Each operation is converted using the rate applicable on its own date. Native aggregates remain visible and no partial consolidation is shown when a rate is missing."}
          primaryAction={<Link href="/enterprise-modules/FINANCE_TREASURY/exchange-rates" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink"><ArrowRightLeft className="h-4 w-4" />{locale === "fr" ? "Configurer les taux" : "Configure rates"}</Link>}
          secondaryActions={<Link href="/enterprise-modules/RETAIL_POS" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink"><ArrowLeft className="h-4 w-4" />POS</Link>}
        />
        <ModuleContent>
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            {[{ id: "TODAY", fr: "Aujourd’hui", en: "Today" }, { id: "7D", fr: "7 jours", en: "7 days" }, { id: "30D", fr: "30 jours", en: "30 days" }].map((item) => <Link key={item.id} href={`/enterprise-modules/RETAIL_POS/consolidated-report?period=${item.id}`} className={`whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-black ${period === item.id ? "border-cyan-500 bg-cyan-500/10 text-cyan-700" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink"}`}>{locale === "fr" ? item.fr : item.en}</Link>)}
          </div>

          <ProfessionalReportView model={professionalReport} locale={locale} logoUrl={organization.logoUrl} />

          <ModuleSection title={locale === "fr" ? "État de la consolidation" : "Consolidation status"} description={`${from.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US")} → ${to.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US")}`}>
            <div className={`rounded-2xl border p-4 ${consolidated.complete ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
              <div className="flex flex-wrap items-center gap-3">{consolidated.complete ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <TriangleAlert className="h-5 w-5 text-amber-600" />}<p className="font-black text-dtsc-ink">{consolidated.complete ? (locale === "fr" ? `Consolidation complète en ${target}` : `Complete consolidation in ${target}`) : (locale === "fr" ? "Consolidation suspendue : taux manquant" : "Consolidation withheld: missing rate")}</p><StatusBadge tone={consolidated.complete ? "success" : "warning"}>{consolidated.complete ? (locale === "fr" ? "Complète" : "Complete") : (locale === "fr" ? "Suspendue" : "Withheld")}</StatusBadge></div>
              {!consolidated.complete ? <p className="mt-2 text-sm font-semibold text-dtsc-muted">{locale === "fr" ? "DTSC refuse d’additionner des montants partiellement convertis. Configurez les paires manquantes puis rechargez ce rapport." : "DTSC refuses to add partially converted amounts. Configure the missing pairs, then reload this report."}</p> : null}
            </div>
          </ModuleSection>


          {!consolidated.complete && consolidated.missingRates.length ? <ModuleSection title={locale === "fr" ? "Taux manquants" : "Missing rates"} description={locale === "fr" ? "Chaque ligne correspond à une date d’opération qui ne possède aucun taux direct ni inverse applicable." : "Each row represents an operation date with no applicable direct or inverse rate."}>
            <div className="grid min-w-0 gap-2">{consolidated.missingRates.map((item) => <div key={`${item.sourceCurrencyCode}-${item.targetCurrencyCode}-${item.at}`} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm"><strong className="text-dtsc-ink">{item.sourceCurrencyCode} → {item.targetCurrencyCode}</strong><span className="text-dtsc-muted">{new Date(item.at).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US")} · {item.count} op.</span></div>)}</div>
          </ModuleSection> : null}

          <ModuleSection title={locale === "fr" ? "Agrégats dans les devises d’origine" : "Native-currency aggregates"} description={locale === "fr" ? "Ces montants ne sont jamais additionnés entre devises." : "These amounts are never added across currencies."}>
            <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {native.sales.map((row) => <div key={`sales-${row.currencyCode}`} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><p className="text-xs font-black uppercase text-dtsc-muted">POS · {row.currencyCode}</p><p className="mt-2 text-xl font-black text-dtsc-ink">{money(row.amount, row.currencyCode, locale)}</p><p className="text-xs font-semibold text-dtsc-muted">{row.count} tickets</p></div>)}
              {native.mobileMoney.map((row) => <div key={`mm-${row.currencyCode}`} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><p className="text-xs font-black uppercase text-dtsc-muted">Mobile Money · {row.currencyCode}</p><p className="mt-2 font-black text-dtsc-ink">{locale === "fr" ? "Dépôts" : "Deposits"}: {money(row.deposits, row.currencyCode, locale)}</p><p className="font-black text-dtsc-ink">{locale === "fr" ? "Retraits" : "Withdrawals"}: {money(row.withdrawals, row.currencyCode, locale)}</p></div>)}
              {native.telco.map((row) => <div key={`telco-${row.currencyCode}`} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><p className="text-xs font-black uppercase text-dtsc-muted">Telco · {row.currencyCode}</p><p className="mt-2 font-black text-dtsc-ink">{money(row.revenue, row.currencyCode, locale)}</p><p className="text-xs font-semibold text-dtsc-muted">{locale === "fr" ? "Marge" : "Margin"}: {money(row.margin, row.currencyCode, locale)}</p></div>)}
            </div>
          </ModuleSection>

          {consolidated.ratesUsed.length ? <ModuleSection title={locale === "fr" ? "Taux effectivement utilisés" : "Rates actually used"} description={locale === "fr" ? "La résolution est historique : chaque taux est choisi selon la date de l’opération." : "Resolution is historical: each rate is chosen according to the operation date."}>
            <div className="grid min-w-0 gap-2">{consolidated.ratesUsed.map((rate) => <div key={`${rate.rateId}-${rate.direction}`} className="grid min-w-0 gap-1 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"><span className="break-words font-black text-dtsc-ink">{rate.pair} · {rate.rate} · {rate.direction === "INVERSE" ? (locale === "fr" ? "taux inversé" : "inverse rate") : (locale === "fr" ? "taux direct" : "direct rate")}</span><span className="text-xs font-semibold text-dtsc-muted">{new Date(rate.rateDate).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US")} · {rate.source}</span></div>)}</div>
          </ModuleSection> : null}
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
