/** Display capabilities only: mutation services remain the authoritative guards. */
export function journalEntryCapabilities(input: {
  entry: { status: string; preparedByUserId: string | null; approvedByUserId?: string | null; postedByUserId?: string | null; journal?: { requiresApproval?: boolean } | null };
  actorUserId: string;
  access: { canSubmit: boolean; canApprove: boolean; canManage: boolean };
  assigned: boolean;
}) {
  const { entry, actorUserId, access, assigned } = input;
  const independent = ![entry.preparedByUserId, entry.approvedByUserId, entry.postedByUserId].includes(actorUserId);
  return {
    canSubmit: Boolean(access.canSubmit && entry.status === "DRAFT" && entry.preparedByUserId === actorUserId),
    canApprove: Boolean(access.canApprove && entry.status === "PENDING_APPROVAL" && assigned && entry.preparedByUserId !== actorUserId),
    canReject: Boolean(access.canApprove && entry.status === "PENDING_APPROVAL" && assigned),
    canPost: Boolean(access.canManage && entry.status === "APPROVED" && (!entry.journal?.requiresApproval || entry.preparedByUserId !== actorUserId)),
    canReverse: Boolean(access.canManage && entry.status === "POSTED" && independent),
    reverseBlockReason: entry.status !== "POSTED" ? null : !access.canManage ? "PERMISSION_REQUIRED" : !independent ? "JOURNAL_ENTRY_SELF_REVERSAL_FORBIDDEN" : null,
  };
}
