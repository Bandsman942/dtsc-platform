import Image from "next/image";
import Link from "next/link";
import { dtsc } from "@/lib/dtsc";

export function DtscLogo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group flex min-w-0 max-w-full items-center gap-3 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2">
      <span className="relative flex h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-dtsc-navy shadow-[0_14px_40px_rgba(0,23,54,0.18)] transition duration-300 group-hover:-rotate-2 group-hover:scale-105">
        <Image src="/dtsc-logo.png" alt="Logo DTSC" fill sizes="44px" className="object-cover" priority />
      </span>
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="block truncate text-lg font-black tracking-[-0.035em] text-dtsc-ink sm:text-xl">{dtsc.name}</span>
        <span className="block truncate text-[0.65rem] font-black uppercase tracking-[0.16em] text-dtsc-muted sm:hidden">
          Data & Tech Solutions
        </span>
        <span className="hidden truncate text-xs font-bold uppercase tracking-[0.18em] text-dtsc-muted sm:block">
          {dtsc.fullName}
        </span>
      </span>
    </Link>
  );
}
