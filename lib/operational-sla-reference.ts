export const OPERATIONAL_SLA_OBJECT_TYPES = [
  "CALENDAR_EVENT",
  "TASK",
  "OPERATION",
  "DEPARTMENT_REQUEST",
  "BLOCKER",
  "MEETING",
  "COLLAB_REQUEST",
  "CEO_OBJECTIVE",
  "CEO_SUPERVISION",
  "SCO_PURCHASE_REQUEST",
  "SCO_LOGISTICS",
  "MPO_PROJECT",
  "MPO_RECORD",
  "CTO_PROJECT",
  "CTO_RECORD",
] as const;

export type OperationalSlaObjectType = (typeof OPERATIONAL_SLA_OBJECT_TYPES)[number];
export type OperationalSlaPriorityField = "priority" | "severity" | "urgency" | null;

export type OperationalSlaReference = {
  label: string;
  statuses: readonly string[];
  priorityField: OperationalSlaPriorityField;
  priorities: readonly string[];
};

const STANDARD_PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
const SEVERITY_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const OPERATIONAL_SLA_REFERENCES: Record<OperationalSlaObjectType, OperationalSlaReference> = {
  CALENDAR_EVENT: {
    label: "Événement calendrier",
    statuses: ["Planifié", "En cours", "Terminé", "Reporté", "Annulé"],
    priorityField: "priority",
    priorities: ["Faible", "Normale", "Élevée", "Critique"],
  },
  TASK: {
    label: "Tâche",
    statuses: ["TODO", "IN_PROGRESS", "PENDING_VALIDATION", "COMPLETED", "VALIDATED", "REJECTED", "LATE", "BLOCKED", "CANCELED"],
    priorityField: "priority",
    priorities: STANDARD_PRIORITIES,
  },
  OPERATION: {
    label: "Opération",
    statuses: ["DRAFT", "PLANNED", "IN_PROGRESS", "WAITING", "BLOCKED", "COMPLETED", "CANCELED"],
    priorityField: "priority",
    priorities: STANDARD_PRIORITIES,
  },
  DEPARTMENT_REQUEST: {
    label: "Demande inter-départements",
    statuses: ["NEW", "ACCEPTED", "IN_PROGRESS", "WAITING_INFORMATION", "DONE", "REJECTED", "BLOCKED", "CANCELED"],
    priorityField: "priority",
    priorities: STANDARD_PRIORITIES,
  },
  BLOCKER: {
    label: "Blocage",
    statuses: ["OPEN", "IN_PROGRESS", "RESOLVED", "UNRESOLVED", "ESCALATED", "CANCELED"],
    priorityField: "severity",
    priorities: SEVERITY_PRIORITIES,
  },
  MEETING: {
    label: "Réunion",
    statuses: ["PLANNED", "HELD", "POSTPONED", "CANCELED", "MINUTES_PUBLISHED", "CLOSED"],
    priorityField: null,
    priorities: [],
  },
  COLLAB_REQUEST: {
    label: "Demande collaborateur",
    statuses: ["SUBMITTED", "IN_PROGRESS", "WAITING_RESPONSE", "ANSWERED", "TREATED", "REJECTED", "CANCELED"],
    priorityField: "priority",
    priorities: STANDARD_PRIORITIES,
  },
  CEO_OBJECTIVE: {
    label: "Objectif CEO",
    statuses: ["PLANNED", "IN_PROGRESS", "ACHIEVED", "MISSED", "LATE", "CANCELED"],
    priorityField: "priority",
    priorities: STANDARD_PRIORITIES,
  },
  CEO_SUPERVISION: {
    label: "Suivi CEO",
    statuses: ["OPEN", "IN_PROGRESS", "DONE", "ARCHIVED", "CANCELED"],
    priorityField: "priority",
    priorities: STANDARD_PRIORITIES,
  },
  SCO_PURCHASE_REQUEST: {
    label: "Demande d’achat SCO",
    statuses: ["DRAFT", "SUBMITTED", "SCO_REVIEW", "WAITING_BUDGET", "WAITING_HR_CFO_VALIDATION", "WAITING_CEO_VALIDATION", "APPROVED", "ORDERED", "RECEIVED", "REJECTED", "CANCELED"],
    priorityField: "urgency",
    priorities: ["LOW", "NORMAL", "HIGH", "CRITICAL", "MEDIUM", "URGENT"],
  },
  SCO_LOGISTICS: {
    label: "Mission logistique SCO",
    statuses: ["PLANNED", "PREPARING", "WAITING_MATERIAL", "WAITING_BUDGET", "READY", "IN_PROGRESS", "COMPLETED", "CANCELED"],
    priorityField: null,
    priorities: [],
  },
  MPO_PROJECT: {
    label: "Projet MPO",
    statuses: ["DRAFT", "SCOPING", "INTERNAL_VALIDATION", "WAITING_CTO", "WAITING_BUDGET", "WAITING_SCO_RESOURCES", "DEVELOPMENT", "TESTING", "WAITING_CLIENT", "BLOCKED", "DELIVERED", "CLOSED", "CANCELED"],
    priorityField: "priority",
    priorities: STANDARD_PRIORITIES,
  },
  MPO_RECORD: {
    label: "Registre MPO",
    statuses: ["DRAFT", "IN_PROGRESS", "SUBMITTED", "WAITING", "VALIDATED", "DELIVERED", "BLOCKED", "ARCHIVED", "CANCELED"],
    priorityField: "priority",
    priorities: STANDARD_PRIORITIES,
  },
  CTO_PROJECT: {
    label: "Projet CTO",
    statuses: ["DRAFT", "TECH_ANALYSIS", "WAITING_MPO", "WAITING_BUDGET", "WAITING_MATERIAL", "DEVELOPMENT", "REVIEW", "TESTING", "PREPRODUCTION", "PRODUCTION", "BLOCKED", "DELIVERED", "CLOSED", "CANCELED"],
    priorityField: "priority",
    priorities: STANDARD_PRIORITIES,
  },
  CTO_RECORD: {
    label: "Registre CTO",
    statuses: ["DRAFT", "OPEN", "ANALYSIS", "IN_PROGRESS", "REVIEW", "TESTING", "RESOLVED", "VALIDATED", "BLOCKED", "ARCHIVED", "CANCELED"],
    priorityField: "priority",
    priorities: STANDARD_PRIORITIES,
  },
};

export function isOperationalSlaObjectType(value: string): value is OperationalSlaObjectType {
  return (OPERATIONAL_SLA_OBJECT_TYPES as readonly string[]).includes(value);
}

export function getOperationalSlaReference(value: string): OperationalSlaReference | null {
  return isOperationalSlaObjectType(value) ? OPERATIONAL_SLA_REFERENCES[value] : null;
}

export function isCanonicalOperationalSlaStatus(objectType: string, value: string) {
  const reference = getOperationalSlaReference(objectType);
  return Boolean(reference && reference.statuses.includes(value));
}

export function isCanonicalOperationalSlaPriority(objectType: string, value: string) {
  const reference = getOperationalSlaReference(objectType);
  return Boolean(reference && reference.priorities.includes(value));
}
