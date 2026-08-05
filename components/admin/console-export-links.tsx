import Link from "next/link";
import { Download } from "lucide-react";

type ExportLink = { href: string; label: string };

export function ConsoleExportLinks({ links, locale = "fr" }: { links: ExportLink[]; locale?: string }) {
  if (!links.length) return null;
  return (
    <div className="flex max-w-full gap-2 overflow-x-auto pb-1" aria-label={locale === "en" ? "Authorized exports" : "Exports autorisés"}>
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-black text-dtsc-ink hover:border-cyan-300" prefetch={false}>
          <Download className="h-4 w-4" />
          {link.label}
        </Link>
      ))}
    </div>
  );
}
