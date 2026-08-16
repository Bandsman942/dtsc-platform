"use client";

import { useEffect, useRef } from "react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { notifyToast, type ToastTone } from "@/lib/client-toast";

function inferToastTone(message: string): ToastTone {
  if (/annul|attention|bloqu|limite|maintenance|préparation|preparation|suspend/i.test(message)) {
    return "warning";
  }
  if (/erreur|échec|echec|impossible|invalide|refus|absent|failed|error|unauthorized|forbidden|cannot|does not have|not an active member/i.test(message)) {
    return "error";
  }
  return "success";
}

const toastTitles = {
  fr: {
    error: "Action impossible",
    warning: "Attention",
    success: "Succès",
    info: "Information",
  },
  en: {
    error: "Action unavailable",
    warning: "Attention",
    success: "Success",
    info: "Information",
  },
} as const;

function titleForTone(locale: string | null | undefined, tone: ToastTone) {
  const dictionary = toastTitles[locale === "en" ? "en" : "fr"];
  if (tone === "error") return dictionary.error;
  if (tone === "warning") return dictionary.warning;
  if (tone === "success") return dictionary.success;
  return dictionary.info;
}

export function useToastMessage(message: string | null | undefined, tone?: ToastTone) {
  const locale = useAppLocale();
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
      title: titleForTone(locale, toastTone),
      description,
      tone: toastTone,
      durationMs: toastTone === "error" ? 7000 : 4600,
    });
  }, [locale, message, tone]);
}
