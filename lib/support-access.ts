import { UserRole, type SupportTicket } from "@prisma/client";
import type { SessionPayload } from "@/lib/session";
import { isDtscInternalSession } from "@/lib/organizations";

export function canManageSupportTickets(session: Pick<SessionPayload, "role" | "activeContext" | "activeOrganizationId"> | null | undefined) {
  if (!session || !isDtscInternalSession(session)) {
    return false;
  }

  return session.role === UserRole.ADMIN || session.role === UserRole.SUPPORT;
}

export function canUserAccessSupportTicket(
  ticket: Pick<SupportTicket, "userId">,
  session: Pick<SessionPayload, "userId" | "role" | "activeContext" | "activeOrganizationId"> | null | undefined
) {
  if (!session) {
    return false;
  }
  if (ticket.userId === session.userId) {
    return true;
  }
  return canManageSupportTickets(session);
}

export function supportTicketVisibilityWhere(
  session: Pick<SessionPayload, "userId" | "role" | "activeContext" | "activeOrganizationId">
) {
  return canManageSupportTickets(session) ? undefined : { userId: session.userId };
}

export function canManageSupportRole(role: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.SUPPORT;
}
