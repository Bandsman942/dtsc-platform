"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

const LocaleContext = createContext<string | null | undefined>("fr");

export function LocaleProvider({ locale, children }: { locale?: string | null; children: ReactNode }) {
  useEffect(() => {
    const previous = document.documentElement.lang;
    const language = locale === "en" ? "en" : "fr";
    document.documentElement.lang = language;
    return () => { if (document.documentElement.lang === language) document.documentElement.lang = previous; };
  }, [locale]);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useAppLocale() {
  return useContext(LocaleContext);
}
