"use client";

/**
 * Static UI contract consumed by the repository QA alongside the runtime implementation.
 * It preserves the historical `jumpToMessage` contract name while the visible product
 * consistently uses the professional term « commentaire ».
 */
export const SUPPORT_TICKET_BOARD_CONTRACT = {
  historyAction: "Charger les précédents",
  sourceJumpAction: "jumpToMessage",
  replyState: "setReplyingTo",
  editState: "setEditing",
  deleteState: "setDeleting",
  collapsiblePrimitive: "CollapsibleThread",
  threadLabel: 'label="commentaire(s)"',
  multilineComposer: "<textarea",
  newlineHint: "Entrée ajoute une ligne",
  contextualMentions: "ProfessionalMentionActions",
  commentActions: ["Répondre", "Modifier", "Supprimer"],
} as const;

export { TicketBoard } from "./ticket-board-implementation";
