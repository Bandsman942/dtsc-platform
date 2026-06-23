"use client";

import { useEffect, useRef } from "react";
import { notifyToast, type ToastTone } from "@/lib/client-toast";

function inferToastTone(message: string): ToastTone {
  if (/annul|attention|bloqu|limite|maintenance|préparation|preparation|suspend/i.test(message)) {
    return "warning";
  }
  if (/erreur|échec|echec|impossible|invalide|refus|absent|failed|error|unauthorized|forbidden/i.test(message)) {
    return "error";
  }
  return "success";
}

function titleForTone(tone: ToastTone) {
  if (tone === "error") {
    return "Action impossible";
  }
  if (tone === "warning") {
    return "Attention";
  }
  if (tone === "success") {
    return "Succès";
  }
  return "Information";
}

export function useToastMessage(message: string | null | undefined, tone?: ToastTone) {
  const lastMessageRef = useRef("");

  useEffect(() => {
    const description = typeof message === "string" ? message.trim() : "";
    if (!description) {
      lastMessageRef.current = "";
      return;
    }
    if (description === lastMessageRef.current) {
      return;
    }
    lastMessageRef.current = description;
    const toastTone = tone || inferToastTone(description);
    notifyToast({
      title: titleForTone(toastTone),
      description,
      tone: toastTone,
      durationMs: toastTone === "error" ? 7000 : 4600,
    });
  }, [message, tone]);
}
