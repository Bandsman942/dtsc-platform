type TargetValue = string | number | null | undefined;

function safeSegment(value: TargetValue) {
  return encodeURIComponent(String(value ?? ""));
}

function withQuery(pathname: string, query: Record<string, TargetValue>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value).length > 0) params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function announcementNotificationTarget(announcementId: string, commentId?: string | null) {
  return withQuery(`/announcements/${safeSegment(announcementId)}`, { commentId });
}

export function publicationNotificationTarget(publicationSlug: string, commentId?: string | null) {
  return withQuery(`/ressources/${safeSegment(publicationSlug)}`, { commentId });
}

export function supportNotificationTarget(ticketId: string, messageId?: string | null) {
  return withQuery("/support", { ticketId, messageId });
}

export function activitiesNotificationTarget(entityType: string, itemId: string, commentId?: string | null) {
  return withQuery("/activities", { entityType, itemId, commentId });
}

export function collaboratorsNotificationTarget(groupId: string, messageId?: string | null) {
  return withQuery("/collaborators", { groupId, messageId });
}

export function enterpriseModuleNotificationTarget(moduleCode: string, focusId: string, focusKind?: string | null) {
  return withQuery(`/enterprise-modules/${safeSegment(moduleCode)}`, { focusId, focusKind });
}

export function adminNotificationTarget(section: string, focusId?: string | null, focusKind?: string | null) {
  return withQuery("/admin", { section, focusId, focusKind });
}

export function calendarNotificationTarget(eventId: string) {
  return withQuery("/calendar", { eventId });
}

export function normalizeNotificationTarget(targetUrl?: string | null, fallback = "/notifications") {
  const target = targetUrl?.trim();
  if (!target || !target.startsWith("/") || target.startsWith("//")) return fallback;
  return target;
}
