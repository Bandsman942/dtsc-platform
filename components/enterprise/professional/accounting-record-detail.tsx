"use client";

import { RotateCcw, Unlock } from "lucide-react";
import { useState } from "react";
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
  return text(record.code || record.reference || record.name);
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
    push(en ? "Template" : "Modèle", record.templateCode ? financeEnumLabel(String(record.templateCode), locale) : "—");
  }
  if (kind === "accounts") {
    push(en ? "Account type" : "Type de compte", record.accountType ? financeEnumLabel(String(record.accountType), locale) : "—");
    push(en ? "Currency" : "Devise", record.currencyCode);
    fields.push({ label: en ? "Direct manual posting" : "Saisie manuelle directe", value: booleanLabel(record.allowDirectPosting, locale) });
    fields.push({ label: en ? "Control account" : "Compte collectif", value: booleanLabel(record.isControlAccount, locale) });
    fields.push({ label: en ? "System account" : "Compte système", value: booleanLabel(record.isSystemAccount, locale) });
  }
  if (kind === "years" || kind === "periods") {
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
    push(en ? "Mapping" : "Correspondance", record.mappingKey ? financeEnumLabel(String(record.mappingKey), locale) : "—");
    push(en ? "Source module" : "Module source", record.sourceModule ? financeEnumLabel(String(record.sourceModule), locale) : "—");
    push(en ? "Posting event" : "Événement de comptabilisation", record.postingEvent ? financeEnumLabel(String(record.postingEvent), locale) : "—");
    push(en ? "Description" : "Description", record.description);
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
}: {
  organizationId: string;
  locale?: string | null;
  kind: AccountingRecordDetailKind | null;
  record: AccountingRecord | null;
  canManage: boolean;
  onClose: () => void;
  onChanged: (message?: string) => void;
  onError: (message: string) => void;
}) {
  const locale: FinanceLocale = rawLocale === "en" ? "en" : "fr";
  const en = locale === "en";
  const [busy, setBusy] = useState(false);
  if (!kind || !record) return null;

  const status = String(record.status || (record.isActive === false ? "INACTIVE" : "ACTIVE"));
  const revision = Number(record.revision || 0);

  async function openFiscalYear() {
    if (kind !== "years" || status !== "DRAFT" || !revision || busy) return;
    setBusy(true);
    try {
      await financeMutation(`/api/enterprise/${organizationId}/fiscal-years/${record.id}/open`, { revision }, "POST");
      onClose();
      onChanged(en ? "Fiscal year opened." : "Exercice comptable ouvert.");
    } catch (error) {
      onError(safeFinanceError(error, en ? "The fiscal year could not be opened." : "L’exercice comptable n’a pas pu être ouvert.", locale));
    } finally {
      setBusy(false);
    }
  }

  const actions: BusinessContextAction[] = [
    ...(kind === "years" && status === "DRAFT" && canManage ? [{ id: "open-year", label: en ? "Open fiscal year" : "Ouvrir l’exercice", icon: Unlock, disabled: busy || !revision, onSelect: () => void openFiscalYear() }] : []),
    { id: "refresh", label: en ? "Refresh" : "Actualiser", icon: RotateCcw, disabled: busy, separatorBefore: kind === "years" && status === "DRAFT" && canManage, onSelect: () => onChanged() },
  ];

  const fields = detailFields(kind, record, locale);
  return (
    <FullscreenEntityDetail
      open
      onClose={onClose}
      title={titleFor(kind, record, locale)}
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
        {kind === "years" && status === "DRAFT" ? <p className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-4 text-sm leading-6 text-dtsc-muted">{canManage ? (en ? "This fiscal year is still a draft. Use the … menu to open it after checking its dates and periods." : "Cet exercice est encore en brouillon. Utilisez le menu … pour l’ouvrir après avoir vérifié ses dates et ses périodes.") : (en ? "This fiscal year is still a draft. A user with accounting management permission must open it." : "Cet exercice est encore en brouillon. Un utilisateur disposant de la permission de gestion comptable doit l’ouvrir.")}</p> : null}
      </div>
    </FullscreenEntityDetail>
  );
}
