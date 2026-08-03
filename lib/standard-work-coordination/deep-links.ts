const SAFE_ID = /^[A-Za-z0-9_-]{1,160}$/;

function safeId(value: string) {
  if (!SAFE_ID.test(value)) throw new Error("INVALID_DEEP_LINK_IDENTIFIER");
  return encodeURIComponent(value);
}

export type WorkCoordinationEntityType =
  | "CALENDAR_EVENT"
  | "ACTIVITY"
  | "TASK"
  | "REQUEST"
  | "APPROVAL"
  | "MEETING"
  | "WORKFLOW_RUN"
  | "DOCUMENT";

export function workCoordinationDeepLink(type: WorkCoordinationEntityType, id: string, secondaryId?: string | null) {
  const objectId = safeId(id);
  if (type === "CALENDAR_EVENT") return `/calendar?event=${objectId}`;
  if (type === "ACTIVITY") return `/enterprise-activities?activity=${objectId}`;
  if (type === "TASK") return `/enterprise-modules/TASKS_OPERATIONS?task=${objectId}`;
  if (type === "REQUEST") return `/enterprise-modules/INTERNAL_REQUESTS?request=${objectId}`;
  if (type === "APPROVAL") return `/enterprise-modules/VALIDATIONS?approval=${objectId}`;
  if (type === "MEETING") return `/enterprise-modules/MEETINGS?meeting=${objectId}`;
  if (type === "WORKFLOW_RUN") return `/enterprise-modules/WORKFLOWS?run=${objectId}`;
  const version = secondaryId ? `?version=${safeId(secondaryId)}` : "";
  return `/enterprise-modules/DOCUMENTS?document=${objectId}${version}`;
}

export function isInternalWorkCoordinationLink(value: string) {
  if (!value.startsWith("/")) return false;
  try {
    const parsed = new URL(value, "https://app.dtsc-platform.com");
    return parsed.origin === "https://app.dtsc-platform.com" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}
