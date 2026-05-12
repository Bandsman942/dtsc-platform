import Image from "next/image";
import Link from "next/link";
import { dtsc } from "@/lib/dtsc";

export function DtscLogo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex min-w-0 max-w-full items-center gap-3 overflow-hidden">
      <span className="relative flex h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-dtsc-navy shadow-[0_14px_40px_rgba(0,23,54,0.18)]">
        <Image src="/dtsc-logo.png" alt="Logo DTSC" fill sizes="44px" className="object-cover" priority />
      </span>
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="block truncate text-lg font-black tracking-tight text-dtsc-ink">{dtsc.name}</span>
        <span className="block truncate text-xs font-semibold uppercase tracking-[0.18em] text-dtsc-muted">
          {dtsc.fullName}
        </span>
      </span>
    </Link>
  );
}
