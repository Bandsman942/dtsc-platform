import { BriefcaseBusiness } from "lucide-react";
import { ProductNavigationMenu, type ProductDestination } from "@/components/layout/product-navigation-menu";
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
  const destinations: ProductDestination[] = [
    { key: "public", label: "Site public", href: getPublicUrl("/"), visible: true },
    { key: "app", label: "SaaS", href: getDashboardUrl(), visible: true },
    { key: "console", label: "Console DTSC", href: getConsoleUrl("/admin"), visible: isDtscInternal },
    { key: "support", label: "Support", href: getSupportUrl("/support"), visible: true },
    { key: "account", label: "Compte", href: getSignInUrl(), visible: true },
  ];
  const visibleDestinations = destinations.filter((destination) => destination.visible);
  const activeDestination = visibleDestinations.find((destination) => destination.key === currentHostType) || visibleDestinations[0] || destinations[0];

  return (
    <nav className={cn("relative min-w-0", className)} aria-label="Navigation produits DTSC">
      {!compact && (
        <p className="mb-2 flex items-center gap-2 text-[0.66rem] font-black uppercase tracking-[0.18em] text-dtsc-muted">
          <BriefcaseBusiness className="h-3.5 w-3.5" />
          Écosystème DTSC
        </p>
      )}
      <ProductNavigationMenu
        activeDestination={activeDestination}
        compact={compact}
        currentHostType={currentHostType}
        destinations={visibleDestinations}
      />
    </nav>
  );
}
