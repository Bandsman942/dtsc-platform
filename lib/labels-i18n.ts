import { formatEnumLabel } from "@/lib/labels";

const englishLabels: Record<string, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  CLIENT: "Client",
  SUPPORT: "Support",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  PENDING: "Pending",
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
  CRITICAL: "Critical",
  PROCESSING: "Processing",
  READY: "Ready",
  FAILED: "Failed",
  ACCEPTED: "Accepted",
  PAID: "Paid",
  CANCELED: "Canceled",
  DRAFT: "Draft",
  ISSUED: "Issued",
  PAST_DUE: "Past due",
  EXPIRED: "Expired",
  PENDING_PAYMENT: "Payment pending",
  INACTIVE: "Inactive",
  ONBOARDING: "Onboarding",
  ON_LEAVE: "On leave",
  EXITED: "Exited",
  COMPLETE: "Complete",
  TO_REVIEW: "To review",
  VALIDATED: "Validated",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
  APPROVED: "Approved",
  WAITING: "Waiting",
  TODO: "To do",
  PENDING_VALIDATION: "Pending validation",
  LATE: "Late",
  BLOCKED: "Blocked",
  SUBMITTED: "Submitted",
  PLANNED: "Planned",
  DONE: "Done",
  ANSWERED: "Answered",
  DELIVERED: "Delivered",
  PRODUCTION: "Production",
  DTSC_INTERNAL: "DTSC internal",
  ORGANIZATION: "Organization",
  GLOBAL_CLIENT: "Personal account",
  COMMUNITY: "Community",
  OWNER: "Owner",
  ORGANIZATION_ADMIN: "Organization administrator",
  MEMBER: "Member",
  GUEST: "Guest",
  CEO: "CEO",
  COO: "COO",
  CTO: "CTO",
  HR_CFO: "HR & CFO",
  MPO: "MPO",
  SCO: "SCO",
  LA: "Legal Advisor",
  COLLABORATOR: "Collaborator",
  WEEKLY: "Weekly",
  DAILY: "Daily",
  MONTHLY: "Monthly",
  NEVER: "Never",
  PROFESSIONAL: "Professional",
  DIRECT: "Direct",
  DETAILED: "Detailed",
  EXECUTIVE: "Executive",
  SHORT: "Short",
  BALANCED: "Balanced",
};

function humanizeEnglishEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part, index) => index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(" ");
}

export function formatEnumLabelForLocale(value: string, locale?: string | null) {
  if (locale !== "en") return formatEnumLabel(value);
  return englishLabels[value] || humanizeEnglishEnum(value);
}
