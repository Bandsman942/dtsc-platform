"use client";

import { useAppLocale } from "@/components/i18n/locale-provider";
import fr from "@/locales/health-clinical.fr.json";
import en from "@/locales/health-clinical.en.json";
import patientsFr from "@/locales/health-patients.fr.json";
import patientsEn from "@/locales/health-patients.en.json";
import appointmentsFr from "@/locales/health-appointments.fr.json";
import appointmentsEn from "@/locales/health-appointments.en.json";

export type HealthClinicalLocale = "fr" | "en";
const dictionaries = {
  fr: { ...fr, ...patientsFr, ...appointmentsFr },
  en: { ...en, ...patientsEn, ...appointmentsEn },
} as const;
export type HealthClinicalKey = keyof typeof dictionaries.fr;

export function useHealthClinicalLocale(): HealthClinicalLocale {
  const locale = useAppLocale();
  return locale === "en" ? "en" : "fr";
}

export function healthClinicalT(
  locale: HealthClinicalLocale,
  key: HealthClinicalKey,
  values?: Record<string, string | number>,
) {
  let text = dictionaries[locale][key] || dictionaries.fr[key] || key;
  if (!values) return text;
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{{${name}}}`, String(value));
  return text;
}

export function healthClinicalStatusLabel(locale: HealthClinicalLocale, value: string) {
  const key = `status.${value}` as HealthClinicalKey;
  const localized = dictionaries[locale][key] || dictionaries.fr[key];
  return localized || value;
}

export function healthClinicalPriorityLabel(locale: HealthClinicalLocale, value: string) {
  const key = `priority.${value}` as HealthClinicalKey;
  const localized = dictionaries[locale][key] || dictionaries.fr[key];
  return localized || value;
}

export function healthClinicalDate(value: string | null | undefined, locale: HealthClinicalLocale) {
  if (!value) return healthClinicalT(locale, "common.notProvided");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return healthClinicalT(locale, "common.notProvided");
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { dateStyle: "medium" }).format(date);
}

export function healthClinicalDateTime(value: string | null | undefined, locale: HealthClinicalLocale) {
  if (!value) return healthClinicalT(locale, "common.notProvided");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return healthClinicalT(locale, "common.notProvided");
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
