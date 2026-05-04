import { dtsc } from "@/lib/dtsc";

export function DtscFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={compact ? "text-center text-xs text-dtsc-muted" : "border-t border-dtsc-border px-4 py-6 text-center text-xs text-dtsc-muted"}>
      {dtsc.copyright}
    </footer>
  );
}
