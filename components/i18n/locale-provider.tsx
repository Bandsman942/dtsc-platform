"use client";

import { createContext, useContext, type ReactNode } from "react";

const LocaleContext = createContext<string | null | undefined>("fr");

export function LocaleProvider({ locale, children }: { locale?: string | null; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useAppLocale() {
  return useContext(LocaleContext);
}
