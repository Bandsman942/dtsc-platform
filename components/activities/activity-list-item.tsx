"use client";

import { CheckCircle2, CircleAlert, Clock3, Eye, FileText, Send } from "lucide-react";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { BusinessListItem } from "@/components/workspace/business-list";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import { formatEnumLabel } from "@/lib/labels";
import type { ActivityItem } from "./activity-types";

export function ActivityBusinessItem({
  item,
  onOpen,
  onCreateRelatedRequest,
  onTaskStatus,
}: {
  item: ActivityItem;
  onOpen: () => void;
  onCreateRelatedRequest: () => void;
  onTaskStatus: (status: "IN_PROGRESS" | "COMPLETED") => void;
}) {
  const actions: BusinessContextAction[] = [
    { id: "open", label: "Ouvrir", icon: Eye, onSelect: onOpen },
    { id: "request", label: "Formuler une demande liée", icon: Send, onSelect: onCreateRelatedRequest },
  ];

  const href = typeof item.href === "string" && item.href.length > 0 ? item.href : undefined;
  if (href) {
    actions.push({
      id: "document",
      label: item.hrefLabel || "Ouvrir le document",
      icon: FileText,
      onSelect: () => window.open(href, "_blank", "noopener,noreferrer"),
    });
  }

  if (item.entityType === "TASK" && item.status !== "IN_PROGRESS") {
    actions.push({ id: "task-progress", label: "Marquer en cours", icon: Clock3, onSelect: () => onTaskStatus("IN_PROGRESS") });
  }
  if (item.entityType === "TASK" && item.status !== "COMPLETED" && item.status !== "VALIDATED") {
    actions.push({ id: "task-complete", label: "Marquer terminée", icon: CheckCircle2, onSelect: () => onTaskStatus("COMPLETED") });
  }

  return (
    <BusinessListItem
      title={item.title}
      status={<StatusBadge tone={statusTone(item.status)}>{formatEnumLabel(item.status)}</StatusBadge>}
      meta={activityMeta(item)}
      description={item.body}
      onOpen={onOpen}
      openLabel={`Ouvrir l’activité « ${item.title} »`}
      leading={<EntityMark entityType={item.entityType} />}
      actions={<ContextActions label={`Actions pour l’activité « ${item.title} »`} actions={actions} />}
    />
  );
}

function activityMeta(item: ActivityItem) {
  const parts = [item.detail];
  if (item.priority) {
    parts.push(`Priorité ${formatEnumLabel(item.priority)}`);
  }
  if (typeof item.progress === "number") {
    parts.push(`${item.progress}%`);
  }
  return parts.filter(Boolean).join(" · ");
}

function EntityMark({ entityType }: { entityType: ActivityItem["entityType"] }) {
  const isAlert = entityType === "BLOCKER" || entityType === "LEGAL_RISK" || entityType === "LEGAL_DISPUTE";
  const Icon = isAlert ? CircleAlert : CheckCircle2;
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dtsc-soft text-dtsc-blue" aria-hidden="true">
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function statusTone(status: string): StatusBadgeTone {
  const normalized = status.toUpperCase();
  if (["COMPLETED", "VALIDATED", "ANSWERED", "TREATED", "PUBLISHED", "APPROVED", "RESOLVED", "ACTIVE", "MINUTES_PUBLISHED"].includes(normalized)) {
    return "success";
  }
  if (["BLOCKED", "REJECTED", "CANCELED", "CANCELLED", "ESCALATED", "LOST", "DAMAGED", "OUT_OF_STOCK"].includes(normalized)) {
    return "danger";
  }
  if (["PENDING_VALIDATION", "WAITING_RESPONSE", "WAITING_MATERIAL", "WAITING_BUDGET", "OPEN"].includes(normalized)) {
    return "warning";
  }
  if (["IN_PROGRESS", "SUBMITTED", "PLANNED", "LEGAL_REVIEW"].includes(normalized)) {
    return "info";
  }
  return "neutral";
}
