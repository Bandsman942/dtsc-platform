"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Circle, Settings2, ShieldAlert } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
} from "@/components/enterprise/professional/professional-erp-ui";
import { financeMutation, ReloadButton } from "@/components/enterprise/professional/finance-professional-workspace-shared";
import {
  financeEnumLabel,
  financeMetricLabel,
  type FinanceLocale,
} from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Readiness = {
  configuration?: {
    functionalCurrencyCode?: string;
    presentationCurrencyCode?: string | null;
    inventoryValuationMethod?: string;
    reconciliationTolerance?: string | number;
    automaticPostingEnabled?: boolean;
    revision?: number;
  } | null;
  checklist?: Record<string, boolean>;
  ready?: boolean;
  status?: string;
  blockers?: string[];
  metrics?: Record<string, number>;
};

type Summary = {
  openReceivables: number;
  openPayables: number;
  unallocatedPayments: number;
  openCashSessions: number;
  pendingReconciliations: number;
  invoicesToPost: number;
  pendingApprovals: number;
};

const EMPTY_SUMMARY: Summary = {
  openReceivables: 0,
  openPayables: 0,
  unallocatedPayments: 0,
  openCashSessions: 0,
  pendingReconciliations: 0,
  invoicesToPost: 0,
  pendingApprovals: 0,
};

async function totalFor(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => null) as { pagination?: { total?: number }; items?: Array<{ unallocatedAmount?: string | number; status?: string }> } | null;
  if (!response.ok || !body) return { total: 0, items: [] as Array<{ unallocatedAmount?: string | number; status?: string }> };
  return { total: Number(body.pagination?.total || 0), items: body.items || [] };
}

export function EnterpriseFinanceOverviewWorkspace({
  organizationId,
  organizationName,
  definition,
  locale: requestedLocale,
  canManage,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  locale?: string | null;
  canManage: boolean;
}) {
  const locale: FinanceLocale = requestedLocale === "en" ? "en" : "fr";
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [readinessResponse, receivables, payables, payments, cash, reconciliations, approvedInvoices, pendingPayments] = await Promise.all([
        fetch(`/api/enterprise/${organizationId}/finance/configuration`, { cache: "no-store" }),
        totalFor(`/api/enterprise/${organizationId}/receivables?page=1&pageSize=1&status=OPEN`),
        totalFor(`/api/enterprise/${organizationId}/payables?page=1&pageSize=1&status=OPEN`),
        totalFor(`/api/enterprise/${organizationId}/payments?page=1&pageSize=100&status=CONFIRMED`),
        totalFor(`/api/enterprise/${organizationId}/cash-sessions?page=1&pageSize=1&status=OPEN`),
        totalFor(`/api/enterprise/${organizationId}/reconciliations?page=1&pageSize=1&status=SUBMITTED`),
        totalFor(`/api/enterprise/${organizationId}/sales-invoices?page=1&pageSize=1&status=APPROVED`),
        totalFor(`/api/enterprise/${organizationId}/payments?page=1&pageSize=1&status=PENDING_APPROVAL`),
      ]);
      const body = await readinessResponse.json().catch(() => null) as Readiness & { message?: string; error?: string } | null;
      if (!readinessResponse.ok || !body) throw new Error(body?.message || body?.error || "La préparation Finance ne peut pas être chargée.");
      setReadiness(body);
      setSummary({
        openReceivables: receivables.total,
        openPayables: payables.total,
        unallocatedPayments: payments.items.filter((item) => Number(item.unallocatedAmount || 0) > 0).length,
        openCashSessions: cash.total,
        pendingReconciliations: reconciliations.total,
        invoicesToPost: approvedInvoices.total,
        pendingApprovals: pendingPayments.total,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "La préparation Finance ne peut pas être chargée.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  const checklist = readiness?.checklist || {};
  const completed = Object.values(checklist).filter(Boolean).length;
  const total = Object.keys(checklist).length;
  const percentage = total ? Math.round((completed / total) * 100) : 0;

  const steps = useMemo(() => [
    { id: "currency", label: locale === "fr" ? "Devise fonctionnelle" : "Functional currency", done: Boolean(checklist.hasFunctionalCurrency), href: null },
    { id: "presentation", label: locale === "fr" ? "Devise de présentation" : "Presentation currency", done: Boolean(readiness?.configuration?.presentationCurrencyCode || readiness?.configuration?.functionalCurrencyCode), href: null },
    { id: "year", label: locale === "fr" ? "Exercice financier" : "Fiscal year", done: Boolean(checklist.hasFiscalYear), href: "/enterprise-modules/FINANCE_ACCOUNTING?tab=fiscal-years" },
    { id: "period", label: locale === "fr" ? "Première période" : "First period", done: Boolean(checklist.hasOpenPeriod), href: "/enterprise-modules/FINANCE_ACCOUNTING?tab=fiscal-periods" },
    { id: "chart", label: locale === "fr" ? "Plan comptable" : "Chart of accounts", done: Boolean(checklist.hasChartOfAccounts), href: "/enterprise-modules/FINANCE_ACCOUNTING?tab=ledger-accounts" },
    { id: "journals", label: locale === "fr" ? "Journaux" : "Journals", done: Boolean(checklist.hasSalesJournal && checklist.hasPurchaseJournal), href: "/enterprise-modules/FINANCE_ACCOUNTING?tab=journals" },
    { id: "accounts", label: locale === "fr" ? "Comptes financiers" : "Financial accounts", done: Boolean(checklist.hasFinancialAccount), href: "/enterprise-modules/FINANCE_TREASURY?tab=accounts" },
    { id: "taxes", label: locale === "fr" ? "Taxes de base" : "Base taxes", done: Boolean(checklist.hasTaxConfiguration), href: "/enterprise-modules/FINANCE_TAX" },
    { id: "tolerances", label: locale === "fr" ? "Tolérances" : "Tolerances", done: Boolean(readiness?.configuration?.reconciliationTolerance), href: null },
    { id: "posting", label: locale === "fr" ? "Règles de comptabilisation" : "Posting rules", done: Boolean(checklist.ledgerReady), href: "/enterprise-modules/FINANCE_ACCOUNTING" },
    { id: "approvers", label: locale === "fr" ? "Responsables et approbateurs" : "Owners and approvers", done: Boolean(readiness?.configuration), href: "/enterprise-admin?section=permissions" },
    { id: "verify", label: locale === "fr" ? "Vérification finale" : "Final verification", done: Boolean(readiness?.ready), href: null },
  ], [checklist, locale, readiness]);

  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setError("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/finance/configuration`, {
        functionalCurrencyCode: String(form.get("functionalCurrencyCode") || "USD").toUpperCase(),
        presentationCurrencyCode: String(form.get("presentationCurrencyCode") || "").toUpperCase() || null,
        inventoryValuationMethod: String(form.get("inventoryValuationMethod") || "WEIGHTED_AVERAGE"),
        reconciliationTolerance: String(form.get("reconciliationTolerance") || "0.01"),
        automaticPostingEnabled: form.get("automaticPostingEnabled") === "on",
        revision: readiness?.configuration?.revision || undefined,
      }, "PATCH");
      setConfigurationOpen(false);
      setMessage(locale === "fr" ? "Configuration financière enregistrée." : "Finance configuration saved.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Enregistrement impossible.");
    }
  }

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`${locale === "fr" ? "Préparation financière" : "Finance readiness"} · ${organizationName}`}
        title={locale === "fr" ? "Vue d’ensemble financière" : "Finance overview"}
        description={definition.descriptionFr}
        count={`${percentage}%`}
        primaryAction={canManage ? <Button onClick={() => setConfigurationOpen(true)}><Settings2 className="h-4 w-4" />{locale === "fr" ? "Configurer Finance" : "Configure Finance"}</Button> : undefined}
        secondaryActions={<ReloadButton onClick={() => void load()} locale={locale} loading={loading} />}
      />

      <ModuleMetrics label={locale === "fr" ? "Indicateurs financiers" : "Finance metrics"}>
        <ModuleMetric label={financeMetricLabel("openReceivables", locale)} value={summary.openReceivables} />
        <ModuleMetric label={financeMetricLabel("openPayables", locale)} value={summary.openPayables} />
        <ModuleMetric label={financeMetricLabel("unallocatedPayments", locale)} value={summary.unallocatedPayments} />
        <ModuleMetric label={financeMetricLabel("openCashSessions", locale)} value={summary.openCashSessions} />
        <ModuleMetric label={financeMetricLabel("pendingReconciliations", locale)} value={summary.pendingReconciliations} />
        <ModuleMetric label={financeMetricLabel("pendingApprovals", locale)} value={summary.pendingApprovals} />
      </ModuleMetrics>

      <ModuleContent>
        {message ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-200">{message}</div> : null}
        {error ? <ProfessionalError message={error} /> : null}
        {loading && !readiness ? <ProfessionalLoading /> : (
          <>
            <ModuleSection
              title={locale === "fr" ? "Assistant de configuration" : "Configuration assistant"}
              description={locale === "fr"
                ? "Chaque étape ouvre l’outil responsable. La devise fonctionnelle devient contrôlée après les premières écritures comptabilisées."
                : "Each step opens the responsible tool. The functional currency becomes controlled after the first posted entries."}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {steps.map((step, index) => {
                  const content = (
                    <div className="flex min-h-20 items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-4">
                      {step.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-dtsc-muted" />}
                      <div className="min-w-0"><p className="text-xs font-black uppercase text-dtsc-muted">{locale === "fr" ? "Étape" : "Step"} {index + 1}</p><p className="mt-1 font-black text-dtsc-ink">{step.label}</p></div>
                      {step.href ? <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-dtsc-blue" /> : null}
                    </div>
                  );
                  return step.href ? <Link key={step.id} href={step.href}>{content}</Link> : <button key={step.id} type="button" className="text-left" onClick={() => canManage && setConfigurationOpen(true)}>{content}</button>;
                })}
              </div>
            </ModuleSection>

            <ModuleSection
              title={locale === "fr" ? "Checklist de préparation" : "Readiness checklist"}
              description={locale === "fr" ? "Les libellés sont métier et chaque anomalie mène à l’action utile." : "Business labels are used and every issue leads to the useful action."}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(checklist).map(([key, valid]) => (
                  <article key={key} className="flex items-start gap-3 rounded-xl border border-dtsc-border p-4">
                    {valid ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />}
                    <div><p className="font-black text-dtsc-ink">{financeMetricLabel(key, locale)}</p><p className="mt-1 text-sm text-dtsc-muted">{valid ? (locale === "fr" ? "Configuré" : "Configured") : (locale === "fr" ? "Action requise" : "Action required")}</p></div>
                  </article>
                ))}
              </div>
            </ModuleSection>

            <ModuleSection title={locale === "fr" ? "Actions recommandées" : "Recommended actions"}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { href: "/enterprise-modules/FINANCE_RECEIVABLES?tab=overdue", label: locale === "fr" ? "Traiter les créances en retard" : "Handle overdue receivables", count: summary.openReceivables },
                  { href: "/enterprise-modules/FINANCE_PAYABLES?tab=to-pay", label: locale === "fr" ? "Préparer les paiements fournisseurs" : "Prepare supplier payments", count: summary.openPayables },
                  { href: "/enterprise-modules/FINANCE_PAYMENTS?tab=unallocated", label: locale === "fr" ? "Affecter les paiements" : "Allocate payments", count: summary.unallocatedPayments },
                  { href: "/enterprise-modules/FINANCE_RECONCILIATION?tab=pending", label: locale === "fr" ? "Finaliser les rapprochements" : "Complete reconciliations", count: summary.pendingReconciliations },
                ].map((action) => (
                  <Link key={action.href} href={action.href} className="rounded-xl border border-dtsc-border p-4 hover:bg-dtsc-soft">
                    <p className="text-2xl font-black text-dtsc-blue">{action.count}</p><p className="mt-1 font-black text-dtsc-ink">{action.label}</p>
                  </Link>
                ))}
              </div>
            </ModuleSection>
            <ProfessionalHelp moduleCode="FINANCE_OVERVIEW" />
          </>
        )}
      </ModuleContent>

      <Dialog open={configurationOpen} onClose={() => setConfigurationOpen(false)} title={locale === "fr" ? "Configuration financière" : "Finance configuration"} description={locale === "fr" ? "Les mutations sont contrôlées par révision et les périodes financières." : "Changes are controlled by revision and finance periods."} className="h-[94dvh] max-w-4xl">
        <form onSubmit={saveConfiguration} className="grid gap-6">
          <ProfessionalFormSection title={locale === "fr" ? "Devises et méthode" : "Currencies and method"}>
            <Field label={locale === "fr" ? "Devise fonctionnelle" : "Functional currency"}><Input name="functionalCurrencyCode" defaultValue={readiness?.configuration?.functionalCurrencyCode || "USD"} maxLength={3} required /></Field>
            <Field label={locale === "fr" ? "Devise de présentation" : "Presentation currency"}><Input name="presentationCurrencyCode" defaultValue={readiness?.configuration?.presentationCurrencyCode || ""} maxLength={3} /></Field>
            <Field label={locale === "fr" ? "Valorisation du stock" : "Inventory valuation"}><NativeSelect name="inventoryValuationMethod" defaultValue={readiness?.configuration?.inventoryValuationMethod || "WEIGHTED_AVERAGE"} items={[{ id: "WEIGHTED_AVERAGE", label: financeEnumLabel("WEIGHTED_AVERAGE", locale) }, { id: "FIFO", label: financeEnumLabel("FIFO", locale) }]} required /></Field>
            <Field label={locale === "fr" ? "Tolérance de rapprochement" : "Reconciliation tolerance"}><Input name="reconciliationTolerance" inputMode="decimal" defaultValue={String(readiness?.configuration?.reconciliationTolerance || "0.01")} required /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title={locale === "fr" ? "Comptabilisation" : "Posting"}>
            <Field label={locale === "fr" ? "Automatisation" : "Automation"}><label className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3"><input name="automaticPostingEnabled" type="checkbox" defaultChecked={Boolean(readiness?.configuration?.automaticPostingEnabled)} />{locale === "fr" ? "Comptabiliser automatiquement après les validations requises" : "Post automatically after required approvals"}</label></Field>
          </ProfessionalFormSection>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setConfigurationOpen(false)}>{locale === "fr" ? "Annuler" : "Cancel"}</Button><Button type="submit">{locale === "fr" ? "Enregistrer" : "Save"}</Button></div>
        </form>
      </Dialog>
    </ModuleWorkspace>
  );
}
