"use client";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import { useAppLocale } from "@/components/i18n/locale-provider";

const known: Record<string,{fr:string;en:string;tone:StatusBadgeTone}> = {
  SENDING:{fr:"Transmission",en:"Sending",tone:"info"},
  UPLOADING:{fr:"Téléversement",en:"Uploading",tone:"info"},
  QUEUED:{fr:"En file d’attente",en:"Queued",tone:"warning"},
  RECEIVED:{fr:"Reçu par HSL",en:"Received by HSL",tone:"success"},
  REJECTED:{fr:"Rejeté",en:"Rejected",tone:"danger"},
  UNKNOWN_OUTCOME:{fr:"Résultat incertain",en:"Unknown outcome",tone:"warning"},
  REFERENCE_UNCONFIRMED:{fr:"Référence à confirmer",en:"Unconfirmed reference",tone:"warning"},
};
export const HIRMS_STATUS_VALUES = Object.keys(known);
export function HirmsStatusIndicator({code}: {code:string}) {
  const en=useAppLocale()==="en";
  const item=known[code];
  return <StatusBadge tone={item?.tone || "neutral"}>{item?(en?item.en:item.fr):code}</StatusBadge>;
}
