import { dtsc } from "@/lib/dtsc";

export function DtscFooter({ compact = false, locale = "fr" }: { compact?: boolean; locale?: string | null }) {
  return (
    <footer className={compact ? "text-center text-xs text-dtsc-muted" : "border-t border-dtsc-border px-4 py-6 text-center text-xs text-dtsc-muted"}>
      {locale === "en" ? dtsc.copyrightEn : dtsc.copyright}
    </footer>
  );
}
