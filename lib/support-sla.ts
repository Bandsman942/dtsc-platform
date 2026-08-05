import type { TicketPriority } from "@prisma/client";

const firstResponseHours: Record<TicketPriority, number> = { LOW: 24, MEDIUM: 8, HIGH: 4, URGENT: 1 };
const resolutionHours: Record<TicketPriority, number> = { LOW: 120, MEDIUM: 72, HIGH: 24, URGENT: 8 };

export function calculateSupportSla(priority: TicketPriority, createdAt = new Date()) {
  return {
    firstResponseDueAt: new Date(createdAt.getTime() + firstResponseHours[priority] * 60 * 60 * 1000),
    resolutionDueAt: new Date(createdAt.getTime() + resolutionHours[priority] * 60 * 60 * 1000),
    firstResponseHours: firstResponseHours[priority],
    resolutionHours: resolutionHours[priority],
  };
}

export function supportSlaBreached(input: { now?: Date; dueAt?: Date | null; completedAt?: Date | null; pausedAt?: Date | null }) {
  if (!input.dueAt || input.pausedAt) return false;
  return (input.completedAt || input.now || new Date()).getTime() > input.dueAt.getTime();
}
