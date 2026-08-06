"use client";

import { Languages, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ProductPreferencesControls() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [locale, setLocale] = useState<"fr" | "en">("fr");

  useEffect(() => {
    setMounted(true);
    setLocale(document.documentElement.lang === "en" ? "en" : "fr");
  }, []);

  function changeLocale(nextLocale: "fr" | "en") {
    document.cookie = `dtsc_locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setLocale(nextLocale);
    window.location.reload();
  }

  return (
    <div className="flex items-center gap-2" aria-label={locale === "en" ? "Display preferences" : "Préférences d’affichage"}>
      <div className="flex items-center rounded-xl border border-dtsc-border bg-dtsc-surface p-1 shadow-sm">
        <Languages className="mx-1 h-4 w-4 text-dtsc-muted" aria-hidden="true" />
        {(["fr", "en"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => changeLocale(item)}
            className={`rounded-lg px-2 py-1 text-xs font-bold uppercase transition ${locale === item ? "bg-dtsc-soft text-dtsc-blue" : "text-dtsc-muted hover:text-dtsc-blue"}`}
            aria-pressed={locale === item}
          >
            {item}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-dtsc-border bg-dtsc-surface text-dtsc-blue shadow-sm transition hover:bg-dtsc-soft"
        aria-label={resolvedTheme === "dark" ? "Utiliser le thème clair" : "Utiliser le thème sombre"}
        disabled={!mounted}
      >
        {mounted && resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  );
}
