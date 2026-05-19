import fr from "@/locales/fr.json";
import en from "@/locales/en.json";

type Dictionary = typeof fr;
type Locale = "fr" | "en";

const dictionaries: Record<Locale, Dictionary> = { fr, en: en as Dictionary };

export function getDictionary(locale?: string | null) {
  return dictionaries[locale === "en" ? "en" : "fr"];
}

export function translate(locale: string | null | undefined, key: string) {
  const dictionary = getDictionary(locale);
  const localized = key.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, dictionary);
  if (typeof localized === "string") {
    return localized;
  }
  const fallback = key.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, fr);
  return typeof fallback === "string" ? fallback : key;
}
