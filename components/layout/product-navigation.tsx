import Link from "next/link";
import { BriefcaseBusiness, Globe, Headphones, LayoutDashboard, ShieldCheck, UserCircle } from "lucide-react";
import {
  getConsoleUrl,
  getDashboardUrl,
  getPublicUrl,
  getSignInUrl,
  getSupportUrl,
  type HostType,
} from "@/lib/domains";
import { cn } from "@/lib/utils";

type ProductNavigationProps = {
  currentHostType?: HostType;
  isDtscInternal?: boolean;
  compact?: boolean;
  className?: string;
};

export function ProductNavigation({
  currentHostType = "unknown",
  isDtscInternal = false,
  compact = false,
  className,
}: ProductNavigationProps) {
  const destinations = [
    { key: "public", label: "Site public", href: getPublicUrl("/"), icon: Globe, visible: true },
    { key: "app", label: "SaaS", href: getDashboardUrl(), icon: LayoutDashboard, visible: true },
    { key: "console", label: "Console DTSC", href: getConsoleUrl("/admin"), icon: ShieldCheck, visible: isDtscInternal },
    { key: "support", label: "Support", href: getSupportUrl("/support"), icon: Headphones, visible: true },
    { key: "account", label: "Compte", href: getSignInUrl(), icon: UserCircle, visible: true },
  ] as const;

  return (
    <nav className={cn("min-w-0", className)} aria-label="Navigation produits DTSC">
      {!compact && (
        <p className="mb-2 flex items-center gap-2 text-[0.66rem] font-black uppercase tracking-[0.18em] text-dtsc-muted">
          <BriefcaseBusiness className="h-3.5 w-3.5" />
          Écosystème DTSC
        </p>
      )}
      <div className={cn(compact ? "flex items-center gap-2 overflow-x-auto" : "grid gap-2")}>
        {destinations
          .filter((destination) => destination.visible)
          .map((destination) => {
            const Icon = destination.icon;
            const active = currentHostType === destination.key;
            return (
              <Link
                key={destination.key}
                href={destination.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition",
                  compact && "shrink-0",
                  active
                    ? "border-cyan-300/45 bg-cyan-400/14 text-cyan-600"
                    : "border-dtsc-border/70 bg-dtsc-page/70 text-dtsc-muted hover:border-cyan-300/45 hover:text-dtsc-blue"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{destination.label}</span>
              </Link>
            );
          })}
      </div>
    </nav>
  );
}
