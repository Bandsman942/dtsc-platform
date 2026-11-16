"use client";

import { ErpDesign2RegisterTools, type ErpDesign2StatusOption } from "@/components/enterprise/professional/erp-design2-register";
import type { FinanceExportColumn } from "@/components/enterprise/professional/finance-design2-controls";

type Kind = "tasks" | "requests" | "approvals" | "meetings";

const fields: Record<Kind, FinanceExportColumn[]> = {
  tasks: [
    { key: "title", labelFr: "Tâche / opération", labelEn: "Task / operation", get: (row) => String(row.title ?? "") },
    { key: "taskType", labelFr: "Type", labelEn: "Type", get: (row) => String(row.taskType ?? "") },
    { key: "status", labelFr: "Statut", labelEn: "Status", get: (row) => String(row.status ?? "") },
    { key: "priority", labelFr: "Priorité", labelEn: "Priority", get: (row) => String(row.priority ?? "") },
    { key: "dueAt", labelFr: "Échéance", labelEn: "Due date", get: (row) => String(row.dueAt ?? "").slice(0, 10) },
  ],
  requests: [
    { key: "title", labelFr: "Demande", labelEn: "Request", get: (row) => String(row.title ?? "") },
    { key: "requestType", labelFr: "Type", labelEn: "Type", get: (row) => String(row.requestType ?? "") },
    { key: "status", labelFr: "Statut", labelEn: "Status", get: (row) => String(row.status ?? "") },
    { key: "priority", labelFr: "Priorité", labelEn: "Priority", get: (row) => String(row.priority ?? "") },
    { key: "createdAt", labelFr: "Date de création", labelEn: "Created", get: (row) => String(row.createdAt ?? "").slice(0, 10) },
  ],
  approvals: [
    { key: "title", labelFr: "Objet", labelEn: "Subject", get: (row) => {
      const target = row.target;
      return target && typeof target === "object" && "title" in target ? String((target as { title?: unknown }).title ?? "") : String(row.targetEntityType ?? "");
    } },
    { key: "status", labelFr: "Décision", labelEn: "Decision", get: (row) => String(row.status ?? "") },
    { key: "targetEntityType", labelFr: "Domaine", labelEn: "Domain", get: (row) => String(row.targetEntityType ?? "") },
    { key: "requestedAt", labelFr: "Date de demande", labelEn: "Requested", get: (row) => String(row.requestedAt ?? "").slice(0, 10) },
  ],
  meetings: [
    { key: "title", labelFr: "Réunion", labelEn: "Meeting", get: (row) => String(row.title ?? "") },
    { key: "status", labelFr: "Statut", labelEn: "Status", get: (row) => String(row.status ?? "") },
    { key: "startAt", labelFr: "Début", labelEn: "Starts", get: (row) => String(row.startAt ?? "").slice(0, 16).replace("T", " ") },
    { key: "endAt", labelFr: "Fin", labelEn: "Ends", get: (row) => String(row.endAt ?? "").slice(0, 16).replace("T", " ") },
    { key: "locationMode", labelFr: "Modalité", labelEn: "Format", get: (row) => String(row.locationMode ?? "") },
  ],
};

/**
 * Shared, read-only Design 2.0 controls. The endpoint enforces tenant scope,
 * entitlements, object visibility and all filters before paginating/exporting.
 * Do not add private RH or clinical fields here.
 */
export function CoordinationDesign2Tools({
  kind, organizationId, organizationName, title, locale, filters, status, statuses,
  onStatusChange, dateFrom, dateTo, onDateChange,
}: {
  kind: Kind;
  organizationId: string;
  organizationName: string;
  title: string;
  locale: "fr" | "en";
  filters: URLSearchParams;
  status: string;
  statuses: ErpDesign2StatusOption[];
  onStatusChange: (status: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateChange: (from: string, to: string) => void;
}) {
  const endpoints: Record<Kind, string> = {
    tasks: "tasks", requests: "requests", approvals: "approvals", meetings: "meetings",
  };
  return <CoordinationToolsSurface
    title={title} locale={locale} organizationName={organizationName}
    endpoint={`/api/enterprise/${organizationId}/${endpoints[kind]}`}
    filters={Object.fromEntries(filters.entries())}
    columns={fields[kind]} status={status} statuses={statuses}
    onStatusChange={onStatusChange}
    dateFrom={dateFrom} dateTo={dateTo} onDateChange={onDateChange}
  />;
}

const CoordinationToolsSurface = ErpDesign2RegisterTools;
