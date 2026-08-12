import fr from "@/locales/experience.fr.json";
import en from "@/locales/experience.en.json";

export type ExperienceLocale = "fr" | "en";
export type ExperienceCopy = typeof fr;

const copies: Record<ExperienceLocale, ExperienceCopy> = {
  fr,
  en: en as ExperienceCopy,
};

export function normalizeExperienceLocale(locale?: string | null): ExperienceLocale {
  return locale === "en" ? "en" : "fr";
}

export function getExperienceCopy(locale?: string | null): ExperienceCopy {
  return copies[normalizeExperienceLocale(locale)];
}

export function fillExperienceTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function getIntlLocale(locale?: string | null) {
  return normalizeExperienceLocale(locale) === "en" ? "en-US" : "fr-FR";
}
