"use client";

import { Archive, Pencil, RotateCcw, Trash2, Unlock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { type BusinessContextAction } from "@/components/workspace/context-actions";
import { FullscreenEntityDetail } from "@/components/workspace/fullscreen-entity-detail";
import { StatusBadge } from "@/components/workspace/status-badge";
import { financeDate, financeEnumLabel, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { financeMutation } from "@/components/enterprise/professional/finance-professional-workspace-shared";

type AccountingRecord = Record<string, unknown> & { id: string };
export type AccountingRecordDetailKind = "charts" | "accounts" | "years" | "periods" | "journals" | "rules" | "trial" | "anomalies";

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function booleanLabel(value: unknown, locale: FinanceLocale) {
  if (typeof value !== "boolean") return "—";
  return value ? (locale === "en" ? "Yes" : "Oui") : (locale === "en" ? "No" : "Non");
}

function objectCode(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const code = record.code || record.reference || record.name;
  const label = record.label || record.nameFr || record.nameEn;
  return [code, label].filter(Boolean).map(String).join(" · ");
}

function objectRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function titleFor(kind: AccountingRecordDetailKind, record: AccountingRecord, locale: FinanceLocale) {
  const en = locale === "en";
  const code = text(record.code || record.reference || record.mappingKey);
  const localizedName = text(locale === "en" ? record.nameEn || record.nameFr : record.nameFr || record.nameEn);
  if (kind === "years") return `${en ? "Fiscal year" : "Exercice"} ${code}`;
  if (kind === "periods") return `${en ? "Period" : "Période"} ${code}`;
  if (kind === "journals") return `${en ? "Journal" : "Journal"} ${code}`;
  if (kind === "charts") return `${en ? "Chart of accounts" : "Plan comptable"} ${code}`;
  if (kind === "accounts") return `${en ? "Ledger account" : "Compte comptable"} ${code}`;
  if (kind === "rules") return en ? "Posting rule" : "Règle de comptabilisation";
  if (kind === "trial") return `${code} · ${localizedName}`;
  return en ? "Posting anomaly" : "Anomalie de comptabilisation";
}

function detailFields(kind: AccountingRecordDetailKind, record: AccountingRecord, locale: FinanceLocale) {
  const en = locale === "en";
  const fields: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: unknown) => fields.push({ label, value: text(value) });

  if (["charts", "accounts", "years", "periods", "journals"].includes(kind)) push(en ? "Code" : "Code", record.code);
  if (kind === "charts" || kind === "accounts" || kind === "journals") {
    push(en ? "French label" : "Libellé français", record.nameFr);
    push(en ? "English label" : "Libellé anglais", record.nameEn);
  }
  if (kind === "charts") {
    push(en ? "Chart origin" : "Origine du plan", record.templateCode ? financeEnumLabel(String(record.templateCode), locale) : (en ? "Custom chart" : "Plan personnalisé"));
  }
  if (kind === "accounts") {
    push(en ? "Account type" : "Type de compte", record.accountType ? financeEnumLabel(String(record.accountType), locale) : "—");
    push(en ? "Currency" : "Devise", record.currencyCode);
    fields.push({ label: en ? "Direct manual posting" : "Saisie manuelle directe", value: booleanLabel(record.allowDirectPosting, locale) });
    fields.push({ label: en ? "Control account" : "Compte collectif", value: booleanLabel(record.isControlAccount, locale) });
    fields.push({ label: en ? "System account" : "Compte système", value: booleanLabel(record.isSystemAccount, locale) });
  }
  if (kind === "years" || kind === "periods") {
    push(en ? "Label" : "Libellé", record.label);
    push(en ? "Start date" : "Date de début", record.startDate ? financeDate(String(record.startDate), locale) : "—");
    push(en ? "End date" : "Date de fin", record.endDate ? financeDate(String(record.endDate), locale) : "—");
  }
  if (kind === "years") {
    const periods = Array.isArray(record.periods) ? record.periods.length : undefined;
    push(en ? "Periods" : "Périodes", periods ?? "—");
  }
  if (kind === "periods") push(en ? "Fiscal year" : "Exercice", objectCode(record.fiscalYear) || record.fiscalYearId);
  if (kind === "journals") {
    push(en ? "Journal type" : "Type de journal", record.journalType ? financeEnumLabel(String(record.journalType), locale) : "—");
    push(en ? "Sequence prefix" : "Préfixe de séquence", record.sequencePrefix);
    fields.push({ label: en ? "Independent approval required" : "Validation indépendante requise", value: booleanLabel(record.requiresApproval, locale) });
  }
  if (kind === "rules") {
    const account = objectRecord(record.ledgerAccount);
    const chart = objectRecord(account?.chart);
    push(en ? "Rule" : "Règle", locale === "en" ? record.semanticLabelEn || record.semanticLabelFr : record.semanticLabelFr || record.semanticLabelEn);
    push(en ? "Semantic key" : "Clé sémantique", record.mappingKey);
    push(en ? "Domain" : "Domaine", record.domain ? financeEnumLabel(String(record.domain), locale) : "—");
    push(en ? "Category" : "Catégorie", record.category ? financeEnumLabel(String(record.category), locale) : "—");
    push(en ? "Target account" : "Compte cible", account ? `${text(account.code)} · ${text(locale === "en" ? account.nameEn || account.nameFr : account.nameFr || account.nameEn)}` : "—");
    push(en ? "Chart" : "Plan comptable", chart ? `${text(chart.code)} · ${text(locale === "en" ? chart.nameEn || chart.nameFr : chart.nameFr || chart.nameEn)}` : "—");
    push(en ? "Rule origin" : "Origine de la règle", record.templateManaged ? (en ? "Managed by the accounting template" : "Gérée par le template comptable") : (en ? "Manual custom-chart rule" : "Règle manuelle du plan personnalisé"));
    push(en ? "Effective from" : "Effective à partir du", record.effectiveFrom ? financeDate(String(record.effectiveFrom), locale) : (en ? "No lower date bound" : "Sans date minimale"));
    push(en ? "Effective until" : "Effective jusqu’au", record.effectiveTo ? financeDate(String(record.effectiveTo), locale) : (en ? "No end date" : "Sans date de fin"));
  }
  if (kind === "trial") {
    push(en ? "Account" : "Compte", `${text(record.code)} · ${text(locale === "en" ? record.nameEn || record.nameFr : record.nameFr || record.nameEn)}`);
    push(en ? "Type" : "Type", record.accountType ? financeEnumLabel(String(record.accountType), locale) : "—");
    push(en ? "Opening balance" : "Solde d’ouverture", financeMoney(record.openingBalance as string | number || 0, String(record.functionalCurrencyCode || ""), locale));
    push(en ? "Period debit" : "Débit période", financeMoney(record.periodDebit as string | number || 0, String(record.functionalCurrencyCode || ""), locale));
    push(en ? "Period credit" : "Crédit période", financeMoney(record.periodCredit as string | number || 0, String(record.functionalCurrencyCode || ""), locale));
    push(en ? "Closing balance" : "Solde de clôture", financeMoney(record.closingBalance as string | number || 0, String(record.functionalCurrencyCode || ""), locale));
  }
  if (kind === "anomalies") {
    push(en ? "Reference" : "Référence", record.reference);
    push(en ? "Posting event" : "Événement", record.postingEvent ? financeEnumLabel(String(record.postingEvent), locale) : "—");
    push(en ? "Control" : "Contrôle", record.errorCode ? financeEnumLabel(String(record.errorCode), locale) : (en ? "Action required" : "Action requise"));
    push(en ? "Detected" : "Détectée", record.createdAt ? financeDate(String(record.createdAt), locale) : "—");
  }
  return fields;
}

export function AccountingRecordDetail({
  organizationId,
  locale: rawLocale,
  kind,
  record,
  canManage,
  onClose,
  onChanged,
  onError,
  onEdit,
  onDelete,
}: {
  organizationId: string;
  locale?: string | null;
  kind: AccountingRecordDetailKind | null;
  record: AccountingRecord | null;
  canManage: boolean;
  onClose: () => void;
  onChanged: (message?: string) => void;
  onError: (message: string) => void;
  onEdit?: (kind: AccountingRecordDetailKind, record: AccountingRecord) => void;
  onDelete?: (kind: AccountingRecordDetailKind, record: AccountingRecord) => void;
}) {
  const locale: FinanceLocale = rawLocale === "en" ? "en" : "fr";
  const en = locale === "en";
  const [busy, setBusy] = useState(false);
  const [detailRecord, setDetailRecord] = useState<AccountingRecord | null>(record);

  useEffect(() => { setDetailRecord(record); }, [record]);

  const refreshRecord = useCallback(async () => {
    if (!kind || !record) return;
    const detailEndpoint = kind === "charts"
      ? `charts-of-accounts/${currentRecord.id}`
      : kind === "accounts"
        ? `ledger-accounts/${currentRecord.id}`
        : kind === "years"
          ? `fiscal-years/${currentRecord.id}`
          : kind === "periods"
            ? `fiscal-periods/${currentRecord.id}`
            : kind === "journals"
              ? `journals/${currentRecord.id}`
              : kind === "rules"
                ? `account-mappings?recordId=${encodeURIComponent(currentRecord.id)}`
                : null;
    if (!detailEndpoint) { setDetailRecord(record); return; }
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/${detailEndpoint}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { item?: AccountingRecord; items?: AccountingRecord[]; message?: string; error?: string };
      if (!response.ok) throw new Error(body.message || body.error || "ACCOUNTING_DETAIL_FAILED");
      const next = body.item || body.items?.[0] || null;
      if (next) setDetailRecord(next);
    } catch (error) {
      onError(safeFinanceError(error, en ? "The accounting record could not be refreshed." : "La fiche comptable n’a pas pu être actualisée.", locale));
    }
  }, [en, kind, locale, onError, organizationId, record]);

  useEffect(() => { void refreshRecord(); }, [refreshRecord]);

  if (!kind || !record || !detailRecord) return null;

  const currentRecord = detailRecord;
  const status = String(currentRecord.status || (currentRecord.isActive === false ? "INACTIVE" : "ACTIVE"));
  const revision = Number(currentRecord.revision || 0);
  const capabilities = objectRecord(currentRecord.capabilities) || {};

  async function openFiscalYear() {
    if (!currentRecord || kind !== "years" || status !== "DRAFT" || !revision || busy || capabilities.canOpen !== true) return;
    setBusy(true);
    try {
      await financeMutation(`/api/enterprise/${organizationId}/fiscal-years/${currentRecord.id}/open`, { revision }, "POST");
      onClose();
      onChanged(en ? "Fiscal year opened." : "Exercice comptable ouvert.");
    } catch (error) {
      onError(safeFinanceError(error, en ? "The fiscal year could not be opened." : "L’exercice comptable n’a pas pu être ouvert.", locale));
    } finally {
      setBusy(false);
    }
  }

  const actions: BusinessContextAction[] = [
    ...(capabilities.canEdit === true && onEdit ? [{ id: "edit", label: en ? "Edit" : "Modifier", icon: Pencil, disabled: busy, onSelect: () => onEdit(kind, currentRecord) }] : []),
    ...(kind === "years" && capabilities.canOpen === true ? [{ id: "open-year", label: en ? "Open fiscal year" : "Ouvrir l’exercice", icon: Unlock, disabled: busy || !revision, onSelect: () => void openFiscalYear() }] : []),
    ...((capabilities.canDelete === true || capabilities.canDeactivate === true) && onDelete ? [{
      id: "delete",
      label: capabilities.canDeactivate === true ? (en ? "Deactivate" : "Désactiver") : (en ? "Delete" : "Supprimer"),
      icon: capabilities.canDeactivate === true ? Archive : Trash2,
      destructive: true,
      separatorBefore: true,
      disabled: busy,
      onSelect: () => onDelete(kind, currentRecord),
    }] : []),
    { id: "refresh", label: en ? "Refresh" : "Actualiser", icon: RotateCcw, disabled: busy, separatorBefore: true, onSelect: () => void refreshRecord() },
  ];

  const fields = detailFields(kind, currentRecord, locale);
  return (
    <FullscreenEntityDetail
      open
      onClose={onClose}
      title={titleFor(kind, currentRecord, locale)}
      description={en ? "Canonical accounting record. Actions are revalidated by the server." : "Fiche comptable canonique. Les actions sont revalidées par le serveur."}
      actions={actions}
      actionLabel={en ? "Accounting actions" : "Actions comptables"}
    >
      <div className="grid min-w-0 gap-5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page/60 p-4">
          <span className="text-sm font-black text-dtsc-ink">{en ? "Current status" : "Statut actuel"}</span>
          <StatusBadge tone={financeStatusTone(status)}>{financeStatusLabel(status, locale)}</StatusBadge>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => <div key={`${field.label}:${field.value}`} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-4"><span className="text-xs font-black uppercase tracking-[0.05em] text-dtsc-muted">{field.label}</span><strong className="mt-1 block break-words text-sm leading-6 text-dtsc-ink">{field.value}</strong></div>)}
        </div>
        {kind === "years" && status === "DRAFT" ? <p className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-4 text-sm leading-6 text-dtsc-muted">{capabilities.canOpen === true ? (en ? "This fiscal year is still a draft. Use the … menu to open it after checking its dates and periods." : "Cet exercice est encore en brouillon. Utilisez le menu … pour l’ouvrir après avoir vérifié ses dates et ses périodes.") : (en ? "This fiscal year is still a draft. A user with accounting management permission must open it." : "Cet exercice est encore en brouillon. Un utilisateur disposant de la permission de gestion comptable doit l’ouvrir.")}</p> : null}
      </div>
    </FullscreenEntityDetail>
  );
}