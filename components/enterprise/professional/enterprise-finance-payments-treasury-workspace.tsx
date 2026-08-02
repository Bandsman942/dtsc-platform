"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRightLeft, CheckCircle2, CircleDollarSign, Plus, Send, ShieldCheck, Undo2, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  FinanceCollaboration,
  FinanceDetailGrid,
  FinanceDetailValue,
  FinancePaginationControls,
  FinanceRecordList,
  financeMutation,
  useFinanceCollection,
  useFinanceLookups,
  type FinanceRecord,
  type OpenBalanceLookup,
} from "@/components/enterprise/professional/finance-professional-workspace-shared";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalSearch,
  ProfessionalTabs,
} from "@/components/enterprise/professional/professional-erp-ui";
import {
  financeEnumLabel,
  financeMoney,
  financeStatusLabel,
  financeStatusTone,
  safeFinanceError,
  type FinanceLocale,
} from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Payment = FinanceRecord & {
  number: string;
  direction: string;
  paymentType: string;
  methodType: string;
  financialAccountId?: string | null;
  businessPartyId?: string | null;
  employeeId?: string | null;
  payrollRunId?: string | null;
  currencyCode: string;
  amount: string | number;
  unallocatedAmount: string | number;
  paymentDate: string;
  reference?: string | null;
  maskedExternalReference?: string | null;
  revision: number;
};

function paymentActions(status?: string) {
  if (status === "DRAFT") return [
    { action: "SUBMIT", label: "Soumettre", icon: Send },
    { action: "CANCEL", label: "Annuler", icon: XCircle },
  ];
  if (status === "PENDING_APPROVAL") return [
    { action: "APPROVE", label: "Approuver", icon: CheckCircle2 },
    { action: "CANCEL", label: "Rejeter", icon: XCircle },
  ];
  if (status === "APPROVED") return [{ action: "CONFIRM", label: "Confirmer", icon: ShieldCheck }];
  if (status === "CONFIRMED") return [
    { action: "RECONCILE", label: "Marquer rapproché", icon: CheckCircle2 },
    { action: "REVERSE", label: "Contrepasser", icon: Undo2 },
  ];
  if (status === "RECONCILED") return [{ action: "REVERSE", label: "Contrepasser", icon: Undo2 }];
  return [];
}

function transferActions(status?: string) {
  if (status === "DRAFT" || status === "PENDING_APPROVAL") return [{ action: "APPROVE", label: "Approuver", icon: CheckCircle2 }];
  if (status === "APPROVED") return [{ action: "CONFIRM", label: "Exécuter et confirmer", icon: ShieldCheck }];
  return [];
}

export function EnterpriseFinancePaymentsTreasuryWorkspace({
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
  const moduleCode = definition.code as "FINANCE_PAYMENTS" | "FINANCE_TREASURY";
  const isPayments = moduleCode === "FINANCE_PAYMENTS";
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") || (isPayments ? "all" : "accounts"));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<FinanceRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [allocationTarget, setAllocationTarget] = useState<Payment | null>(null);
  const [actionTarget, setActionTarget] = useState<{ record: FinanceRecord; action: string; kind: "payment" | "transfer" } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const endpoint = isPayments ? "payments" : tab === "transfers" ? "account-transfers" : "financial-accounts";
  const effectiveStatus = status || (isPayments && tab === "approvals" ? "PENDING_APPROVAL" : "");
  const collection = useFinanceCollection<FinanceRecord>({
    endpoint: `/api/enterprise/${organizationId}/${endpoint}`,
    page,
    search,
    status: effectiveStatus,
    refreshKey,
  });
  const lookupData = useFinanceLookups(organizationId, moduleCode, refreshKey);

  const visibleItems = useMemo(() => {
    if (!isPayments) return collection.items;
    if (tab === "inbound") return collection.items.filter((item) => item.direction === "INBOUND");
    if (tab === "outbound") return collection.items.filter((item) => item.direction === "OUTBOUND");
    if (tab === "unallocated") return collection.items.filter((item) => Number(item.unallocatedAmount || 0) > 0 && ["CONFIRMED", "RECONCILED"].includes(String(item.status)));
    return collection.items;
  }, [collection.items, isPayments, tab]);

  useEffect(() => {
    const key = isPayments ? "paymentId" : tab === "transfers" ? "transferId" : "accountId";
    const deepId = searchParams.get(key);
    if (!deepId) return;
    const found = collection.items.find((item) => item.id === deepId);
    if (found) setDetail(found);
  }, [collection.items, isPayments, searchParams, tab]);

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/payments`, {
        direction: String(form.get("direction") || "INBOUND"),
        paymentType: String(form.get("paymentType") || "CUSTOMER_PAYMENT"),
        methodType: String(form.get("methodType") || "BANK_TRANSFER"),
        financialAccountId: String(form.get("financialAccountId") || "") || undefined,
        businessPartyId: String(form.get("businessPartyId") || "") || undefined,
        employeeId: String(form.get("employeeId") || "") || undefined,
        payrollRunId: String(form.get("payrollRunId") || "") || undefined,
        currencyCode: String(form.get("currencyCode") || "USD").toUpperCase(),
        amount: String(form.get("amount") || "0"),
        paymentDate: String(form.get("paymentDate") || ""),
        reference: String(form.get("reference") || "") || undefined,
        maskedExternalReference: String(form.get("maskedExternalReference") || "") || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      setCreateOpen(false);
      setRefreshKey((value) => value + 1);
      setMessage(locale === "fr" ? "Le paiement a été enregistré en brouillon." : "The payment was saved as a draft.");
    } catch (createError) {
      setError(safeFinanceError(createError, locale === "fr" ? "Création du paiement impossible." : "Payment creation failed."));
    }
  }

  async function createFinancialAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await financeMutation(`/api/enterprise/${organizationId}/financial-accounts`, {
        code: String(form.get("code") || ""),
        name: String(form.get("name") || ""),
        accountType: String(form.get("accountType") || "BANK"),
        currencyCode: String(form.get("currencyCode") || "USD").toUpperCase(),
        maskedReference: String(form.get("maskedReference") || "") || undefined,
        openingBalance: String(form.get("openingBalance") || "0"),
        ledgerAccountId: String(form.get("ledgerAccountId") || ""),
        responsibleUserId: String(form.get("responsibleUserId") || "") || undefined,
        siteId: String(form.get("siteId") || "") || undefined,
      });
      setCreateOpen(false);
      setRefreshKey((value) => value + 1);
      setMessage(locale === "fr" ? "Le compte financier a été créé." : "The financial account was created.");
    } catch (createError) {
      setError(safeFinanceError(createError, locale === "fr" ? "Création du compte impossible." : "Account creation failed."));
    }
  }

  async function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await financeMutation(`/api/enterprise/${organizationId}/account-transfers`, {
        sourceFinancialAccountId: String(form.get("sourceFinancialAccountId") || ""),
        targetFinancialAccountId: String(form.get("targetFinancialAccountId") || ""),
        sourceAmount: String(form.get("sourceAmount") || "0"),
        targetAmount: String(form.get("targetAmount") || "0"),
        exchangeRate: String(form.get("exchangeRate") || "") || undefined,
        transferDate: String(form.get("transferDate") || ""),
      });
      setTransferOpen(false);
      setTab("transfers");
      setRefreshKey((value) => value + 1);
      setMessage(locale === "fr" ? "Le transfert a été préparé." : "The transfer was prepared.");
    } catch (createError) {
      setError(safeFinanceError(createError, locale === "fr" ? "Création du transfert impossible." : "Transfer creation failed."));
    }
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionTarget) return;
    const form = new FormData(event.currentTarget);
    const endpointPath = actionTarget.kind === "payment"
      ? `/api/enterprise/${organizationId}/payments/${actionTarget.record.id}/transition`
      : `/api/enterprise/${organizationId}/account-transfers/${actionTarget.record.id}/transition`;
    try {
      await financeMutation(endpointPath, {
        action: actionTarget.action,
        reason: String(form.get("reason") || "") || undefined,
        revision: actionTarget.record.revision,
      });
      setActionTarget(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
      setMessage(locale === "fr" ? "Le workflow financier a été mis à jour." : "The finance workflow was updated.");
    } catch (transitionError) {
      setError(safeFinanceError(transitionError, locale === "fr" ? "Transition impossible." : "Transition failed."));
    }
  }

  async function allocate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allocationTarget) return;
    const form = new FormData(event.currentTarget);
    const targetType = String(form.get("targetType") || "");
    const targetId = String(form.get("targetId") || "");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/payments/${allocationTarget.id}/allocations`, {
        receivableId: targetType === "receivable" ? targetId : undefined,
        payableId: targetType === "payable" ? targetId : undefined,
        amount: String(form.get("amount") || "0"),
      });
      setAllocationTarget(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
      setMessage(locale === "fr" ? "Le paiement a été affecté sans dépasser le solde disponible." : "The payment was allocated without exceeding the available balance.");
    } catch (allocationError) {
      setError(safeFinanceError(allocationError, locale === "fr" ? "Affectation impossible." : "Allocation failed."));
    }
  }

  const paymentTabs = [
    { id: "all", label: locale === "fr" ? "Tous les paiements" : "All payments" },
    { id: "inbound", label: locale === "fr" ? "Encaissements" : "Receipts" },
    { id: "outbound", label: locale === "fr" ? "Décaissements" : "Disbursements" },
    { id: "unallocated", label: locale === "fr" ? "Non affectés" : "Unallocated" },
    { id: "approvals", label: locale === "fr" ? "À valider" : "To approve" },
  ];
  const treasuryTabs = [
    { id: "accounts", label: locale === "fr" ? "Comptes financiers" : "Financial accounts" },
    { id: "transfers", label: locale === "fr" ? "Transferts" : "Transfers" },
  ];
  const tabs = isPayments ? paymentTabs : treasuryTabs;
  const unallocatedCount = collection.items.filter((item) => Number(item.unallocatedAmount || 0) > 0).length;
  const pendingCount = collection.items.filter((item) => ["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(String(item.status))).length;

  const compatibleTargets = useMemo(() => {
    if (!allocationTarget) return [] as Array<{ type: "receivable" | "payable"; item: OpenBalanceLookup }>;
    const source = allocationTarget.direction === "INBOUND" ? lookupData.receivables : lookupData.payables;
    const type = allocationTarget.direction === "INBOUND" ? "receivable" : "payable";
    return source
      .filter((item) => item.currencyCode === allocationTarget.currencyCode)
      .filter((item) => !allocationTarget.businessPartyId || item.businessPartyId === allocationTarget.businessPartyId)
      .map((item) => ({ type: type as "receivable" | "payable", item }));
  }, [allocationTarget, lookupData.payables, lookupData.receivables]);

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`${isPayments ? (locale === "fr" ? "Paiements et allocations" : "Payments and allocations") : (locale === "fr" ? "Trésorerie" : "Treasury")} · ${organizationName}`}
        title={isPayments ? (locale === "fr" ? "Paiements professionnels" : "Professional payments") : (locale === "fr" ? "Comptes financiers et transferts" : "Financial accounts and transfers")}
        description={definition.descriptionFr}
        count={`${collection.pagination.total}`}
        primaryAction={canManage ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{isPayments ? (locale === "fr" ? "Nouveau paiement" : "New payment") : (locale === "fr" ? "Nouveau compte" : "New account")}</Button> : undefined}
        secondaryActions={!isPayments && canManage ? <Button variant="outline" onClick={() => setTransferOpen(true)}><ArrowRightLeft className="h-4 w-4" />{locale === "fr" ? "Nouveau transfert" : "New transfer"}</Button> : undefined}
      />
      <ModuleMetrics label={locale === "fr" ? "Indicateurs opérationnels" : "Operational metrics"}>
        <ModuleMetric label={locale === "fr" ? "Total de la vue" : "View total"} value={collection.pagination.total} />
        <ModuleMetric label={locale === "fr" ? "En attente" : "Pending"} value={pendingCount} />
        <ModuleMetric label={locale === "fr" ? "Non affectés" : "Unallocated"} value={isPayments ? unallocatedCount : 0} />
        <ModuleMetric label={locale === "fr" ? "Comptes actifs" : "Active accounts"} value={isPayments ? lookupData.accounts.length : collection.items.filter((item) => item.status === "ACTIVE").length} />
      </ModuleMetrics>
      <ModuleToolbar
        search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={locale === "fr" ? "Numéro, référence ou compte…" : "Number, reference or account…"} />}
        controls={<div className="grid min-w-0 gap-2"><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={tabs} label={locale === "fr" ? "Vues du module" : "Module views"} /><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: locale === "fr" ? "Tous les statuts" : "All statuses" }, ...["DRAFT", "PENDING_APPROVAL", "APPROVED", "CONFIRMED", "RECONCILED", "CANCELLED", "REVERSED", "ACTIVE", "INACTIVE"].map((id) => ({ id, label: financeStatusLabel(id, locale) }))]} /></div>}
        summary={locale === "fr" ? "Les montants et comptes sont contrôlés côté serveur." : "Amounts and accounts are controlled server-side."}
      />
      <ModuleContent>
        {message ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-200">{message}</div> : null}
        {error ? <ProfessionalError message={error} /> : null}
        {lookupData.error ? <ProfessionalError message={lookupData.error} /> : null}
        <ModuleSection title={tabs.find((item) => item.id === tab)?.label || ""} description={isPayments ? (locale === "fr" ? "Un paiement confirmé peut rester non affecté ; l’allocation reste une opération distincte, bornée et auditée." : "A confirmed payment may remain unallocated; allocation remains a distinct, bounded and audited operation.") : (locale === "fr" ? "Les références bancaires sont masquées et les transferts nécessitent des comptes compatibles." : "Bank references are masked and transfers require compatible accounts.")}>
          {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : <FinanceRecordList items={visibleItems} locale={locale} emptyTitle={locale === "fr" ? "Aucun élément" : "No item"} emptyDescription={locale === "fr" ? "Créez la première opération autorisée ou vérifiez les filtres." : "Create the first authorized operation or review the filters."} onOpen={setDetail} />}
          <FinancePaginationControls pagination={collection.pagination} page={page} onPage={setPage} locale={locale} />
        </ModuleSection>
        <ProfessionalHelp moduleCode={moduleCode} />
      </ModuleContent>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={isPayments ? (locale === "fr" ? "Nouveau paiement" : "New payment") : (locale === "fr" ? "Nouveau compte financier" : "New financial account")} className="h-[94dvh] max-w-4xl">
        {isPayments ? <form onSubmit={createPayment} className="grid gap-6">
          <ProfessionalFormSection title={locale === "fr" ? "Nature du paiement" : "Payment nature"}>
            <Field label={locale === "fr" ? "Sens" : "Direction"}><NativeSelect name="direction" defaultValue="INBOUND" required items={[{ id: "INBOUND", label: financeEnumLabel("INBOUND", locale) }, { id: "OUTBOUND", label: financeEnumLabel("OUTBOUND", locale) }]} /></Field>
            <Field label={locale === "fr" ? "Type" : "Type"}><NativeSelect name="paymentType" defaultValue="CUSTOMER_PAYMENT" required items={["CUSTOMER_PAYMENT", "SUPPLIER_PAYMENT", "PAYROLL_PAYMENT", "EXPENSE_REIMBURSEMENT", "TAX_PAYMENT", "REFUND", "OTHER"].map((id) => ({ id, label: financeEnumLabel(id, locale) }))} /></Field>
            <Field label={locale === "fr" ? "Moyen de paiement" : "Payment method"}><NativeSelect name="methodType" defaultValue="BANK_TRANSFER" required items={["CASH", "BANK_TRANSFER", "CARD", "MOBILE_MONEY", "CHEQUE", "CREDIT", "OTHER"].map((id) => ({ id, label: financeEnumLabel(id, locale) }))} /></Field>
            <Field label={locale === "fr" ? "Compte financier" : "Financial account"}><NativeSelect name="financialAccountId" items={lookupData.accounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${account.currencyCode}` }))} /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title={locale === "fr" ? "Tiers ou collaborateur" : "Party or employee"}>
            <Field label={locale === "fr" ? "Tiers" : "Party"}><NativeSelect name="businessPartyId" items={lookupData.lookups.parties.map((party) => ({ id: party.id, label: party.displayName || party.legalName }))} /></Field>
            <Field label={locale === "fr" ? "Collaborateur" : "Employee"}><NativeSelect name="employeeId" items={lookupData.lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))} /></Field>
            <Field label={locale === "fr" ? "Période de paie" : "Payroll period"}><NativeSelect name="payrollRunId" items={lookupData.lookups.payrollPeriods.map((period) => ({ id: period.id, label: `${period.code} · ${period.name}` }))} /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title={locale === "fr" ? "Montant et références" : "Amount and references"}>
            <Field label={locale === "fr" ? "Montant" : "Amount"}><Input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required /></Field>
            <Field label={locale === "fr" ? "Devise" : "Currency"}><Input name="currencyCode" defaultValue="USD" maxLength={3} required /></Field>
            <Field label={locale === "fr" ? "Date" : "Date"}><Input name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
            <Field label={locale === "fr" ? "Référence externe" : "External reference"}><Input name="maskedExternalReference" /></Field>
            <Field label={locale === "fr" ? "Objet" : "Purpose"}><Input name="reference" /></Field>
          </ProfessionalFormSection>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{locale === "fr" ? "Annuler" : "Cancel"}</Button><Button type="submit">{locale === "fr" ? "Enregistrer le brouillon" : "Save draft"}</Button></div>
        </form> : <form onSubmit={createFinancialAccount} className="grid gap-6">
          <ProfessionalFormSection title={locale === "fr" ? "Identification" : "Identification"}>
            <Field label={locale === "fr" ? "Code" : "Code"}><Input name="code" required /></Field>
            <Field label={locale === "fr" ? "Nom" : "Name"}><Input name="name" required /></Field>
            <Field label={locale === "fr" ? "Type de compte" : "Account type"}><NativeSelect name="accountType" defaultValue="BANK" required items={["BANK", "CASH", "MOBILE_MONEY", "CLEARING"].map((id) => ({ id, label: financeEnumLabel(id, locale) }))} /></Field>
            <Field label={locale === "fr" ? "Devise" : "Currency"}><Input name="currencyCode" defaultValue="USD" maxLength={3} required /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title={locale === "fr" ? "Rattachement et sécurité" : "Linkage and security"}>
            <Field label={locale === "fr" ? "Compte comptable lié" : "Linked ledger account"}><NativeSelect name="ledgerAccountId" required items={lookupData.ledgerAccounts.map((account) => ({ id: account.id, label: `${account.code} · ${locale === "fr" ? account.nameFr : account.nameEn}` }))} /></Field>
            <Field label={locale === "fr" ? "Responsable" : "Owner"}><NativeSelect name="responsibleUserId" items={lookupData.lookups.members.map((member) => ({ id: member.id, label: member.label }))} /></Field>
            <Field label={locale === "fr" ? "Site" : "Site"}><NativeSelect name="siteId" items={lookupData.lookups.sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}` }))} /></Field>
            <Field label={locale === "fr" ? "Référence masquée" : "Masked reference"}><Input name="maskedReference" placeholder="•••• 1234" /></Field>
            <Field label={locale === "fr" ? "Solde d’ouverture" : "Opening balance"}><Input name="openingBalance" type="number" inputMode="decimal" defaultValue="0" step="0.01" /></Field>
          </ProfessionalFormSection>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{locale === "fr" ? "Annuler" : "Cancel"}</Button><Button type="submit">{locale === "fr" ? "Créer le compte" : "Create account"}</Button></div>
        </form>}
      </Dialog>

      <Dialog open={transferOpen} onClose={() => setTransferOpen(false)} title={locale === "fr" ? "Nouveau transfert" : "New transfer"} description={locale === "fr" ? "Le compte source et le compte cible doivent être distincts. Le serveur contrôle devise, solde, tenant et approbation." : "Source and target accounts must differ. The server controls currency, balance, tenant and approval."} className="max-w-3xl">
        <form onSubmit={createTransfer} className="grid gap-5">
          <ProfessionalFormSection title={locale === "fr" ? "Comptes" : "Accounts"}>
            <Field label={locale === "fr" ? "Compte source" : "Source account"}><NativeSelect name="sourceFinancialAccountId" required items={lookupData.accounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${account.currencyCode}` }))} /></Field>
            <Field label={locale === "fr" ? "Compte cible" : "Target account"}><NativeSelect name="targetFinancialAccountId" required items={lookupData.accounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${account.currencyCode}` }))} /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title={locale === "fr" ? "Montants" : "Amounts"}>
            <Field label={locale === "fr" ? "Montant source" : "Source amount"}><Input name="sourceAmount" type="number" inputMode="decimal" min="0.01" step="0.01" required /></Field>
            <Field label={locale === "fr" ? "Montant cible" : "Target amount"}><Input name="targetAmount" type="number" inputMode="decimal" min="0.01" step="0.01" required /></Field>
            <Field label={locale === "fr" ? "Taux de change" : "Exchange rate"}><Input name="exchangeRate" type="number" inputMode="decimal" min="0.000001" step="0.000001" /></Field>
            <Field label={locale === "fr" ? "Date" : "Date"}><Input name="transferDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
          </ProfessionalFormSection>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>{locale === "fr" ? "Annuler" : "Cancel"}</Button><Button type="submit"><ArrowRightLeft className="h-4 w-4" />{locale === "fr" ? "Préparer le transfert" : "Prepare transfer"}</Button></div>
        </form>
      </Dialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? String(detail.number || detail.reference || detail.name || detail.code || "") : ""} className="h-[92dvh] max-w-4xl">
        {detail ? <div className="grid gap-5">
          <div className="flex flex-wrap gap-2">{detail.status ? <StatusBadge tone={financeStatusTone(detail.status)}>{financeStatusLabel(detail.status, locale)}</StatusBadge> : null}{detail.currencyCode ? <StatusBadge>{String(detail.currencyCode)}</StatusBadge> : null}</div>
          <FinanceDetailGrid>
            <FinanceDetailValue label={locale === "fr" ? "Montant" : "Amount"}>{financeMoney(detail.amount ?? detail.operationalBalance ?? detail.sourceAmount, String(detail.currencyCode || detail.sourceCurrencyCode || "USD"), locale)}</FinanceDetailValue>
            {detail.unallocatedAmount !== undefined ? <FinanceDetailValue label={locale === "fr" ? "Non affecté" : "Unallocated"}>{financeMoney(detail.unallocatedAmount, String(detail.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
            {detail.availableBalance !== undefined ? <FinanceDetailValue label={locale === "fr" ? "Disponible" : "Available"}>{financeMoney(detail.availableBalance, String(detail.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
            {detail.accountType ? <FinanceDetailValue label={locale === "fr" ? "Type de compte" : "Account type"}>{financeEnumLabel(String(detail.accountType), locale)}</FinanceDetailValue> : null}
            {detail.methodType ? <FinanceDetailValue label={locale === "fr" ? "Moyen" : "Method"}>{financeEnumLabel(String(detail.methodType), locale)}</FinanceDetailValue> : null}
            {detail.maskedReference ? <FinanceDetailValue label={locale === "fr" ? "Référence masquée" : "Masked reference"}>{String(detail.maskedReference)}</FinanceDetailValue> : null}
          </FinanceDetailGrid>
          {canManage && isPayments && ["CONFIRMED", "RECONCILED"].includes(String(detail.status)) && Number(detail.unallocatedAmount || 0) > 0 ? <Button onClick={() => setAllocationTarget(detail as Payment)}><CircleDollarSign className="h-4 w-4" />{locale === "fr" ? "Affecter le paiement" : "Allocate payment"}</Button> : null}
          {canManage ? <div data-responsive-actions>{(isPayments ? paymentActions(detail.status) : tab === "transfers" ? transferActions(detail.status) : []).map((action) => { const Icon = action.icon; return <Button key={action.action} variant={["CANCEL", "REVERSE"].includes(action.action) ? "destructive" : "outline"} onClick={() => setActionTarget({ record: detail, action: action.action, kind: isPayments ? "payment" : "transfer" })}><Icon className="h-4 w-4" />{locale === "fr" ? action.label : action.action}</Button>; })}</div> : null}
          <FinanceCollaboration organizationId={organizationId} moduleCode={moduleCode} record={detail} locale={locale} />
        </div> : null}
      </Dialog>

      <Dialog open={Boolean(actionTarget)} onClose={() => setActionTarget(null)} title={actionTarget ? `${actionTarget.action} · ${String(actionTarget.record.number || actionTarget.record.reference || "")}` : ""} className="max-w-xl">
        {actionTarget ? <form onSubmit={transition} className="grid gap-4"><Field label={locale === "fr" ? "Motif" : "Reason"}><textarea name="reason" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field><p className="text-sm text-dtsc-muted">{locale === "fr" ? "L’initiateur ne peut pas approuver ou confirmer sa propre opération lorsque la séparation des rôles est requise." : "The initiator cannot approve or confirm their own operation when separation of duties is required."}</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setActionTarget(null)}>{locale === "fr" ? "Annuler" : "Cancel"}</Button><Button type="submit">{locale === "fr" ? "Confirmer" : "Confirm"}</Button></div></form> : null}
      </Dialog>

      <Dialog open={Boolean(allocationTarget)} onClose={() => setAllocationTarget(null)} title={locale === "fr" ? "Affecter le paiement" : "Allocate payment"} description={allocationTarget ? `${financeMoney(allocationTarget.unallocatedAmount, allocationTarget.currencyCode, locale)} ${locale === "fr" ? "encore disponible" : "still available"}` : ""} className="max-w-3xl">
        {allocationTarget ? <form onSubmit={allocate} className="grid gap-5">
          <ProfessionalFormSection title={locale === "fr" ? "Cible de l’affectation" : "Allocation target"}>
            <Field label={locale === "fr" ? "Type" : "Type"}><NativeSelect name="targetType" required defaultValue={allocationTarget.direction === "INBOUND" ? "receivable" : "payable"} items={[{ id: allocationTarget.direction === "INBOUND" ? "receivable" : "payable", label: allocationTarget.direction === "INBOUND" ? (locale === "fr" ? "Créance client" : "Customer receivable") : (locale === "fr" ? "Dette fournisseur" : "Supplier payable") }]} /></Field>
            <Field label={locale === "fr" ? "Facture ouverte" : "Open invoice"}><NativeSelect name="targetId" required items={compatibleTargets.map(({ item }) => ({ id: item.id, label: `${item.salesInvoice?.number || item.supplierInvoice?.number || (locale === "fr" ? "Solde ouvert" : "Open balance")} · ${financeMoney(item.outstandingAmount, item.currencyCode, locale)}` }))} /></Field>
            <Field label={locale === "fr" ? "Montant à affecter" : "Amount to allocate"}><Input name="amount" type="number" inputMode="decimal" min="0.01" max={Number(allocationTarget.unallocatedAmount)} step="0.01" required /></Field>
          </ProfessionalFormSection>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAllocationTarget(null)}>{locale === "fr" ? "Annuler" : "Cancel"}</Button><Button type="submit">{locale === "fr" ? "Confirmer l’affectation" : "Confirm allocation"}</Button></div>
        </form> : null}
      </Dialog>
    </ModuleWorkspace>
  );
}
