import { BriefcaseBusiness } from "lucide-react";
import { ProductNavigationMenu, type ProductDestination } from "@/components/layout/product-navigation-menu";
import { ModuleRefreshButton } from "@/components/workspace/module-refresh-button";
import type { HostType } from "@/lib/domains";
import {
  getProductDefinition,
  getProductHref,
  getVisibleProductDefinitions,
} from "@/lib/product-registry";
import { cn } from "@/lib/utils";

type ProductNavigationProps = {
  currentHostType?: HostType;
  isDtscInternal?: boolean;
  authenticated?: boolean;
  locale?: "fr" | "en";
  compact?: boolean;
  className?: string;
};

export function ProductNavigation({
  currentHostType = "unknown",
  isDtscInternal = false,
  authenticated = true,
  locale = "fr",
  compact = false,
  className,
}: ProductNavigationProps) {
  const products = getVisibleProductDefinitions({ authenticated, isDtscInternal });
  const destinations: ProductDestination[] = products.map((product) => ({
    key: product.hostType,
    label: product.label[locale],
    href: getProductHref(product),
    visible: true,
  }));
  const currentProduct = getProductDefinition(currentHostType);
  const activeDestination =
    destinations.find((destination) => destination.key === currentProduct.hostType)
    || destinations[0];

  if (!activeDestination) return null;

  return (
    <nav className={cn("relative min-w-0", className)} aria-label={locale === "en" ? "DTSC product navigation" : "Navigation produits DTSC"}>
      {!compact ? (
        <p className="mb-2 flex items-center gap-2 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-dtsc-muted">
          <BriefcaseBusiness className="h-3.5 w-3.5" />
          {locale === "en" ? "DTSC ecosystem" : "Écosystème DTSC"}
        </p>
      ) : null}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        <ProductNavigationMenu
          activeDestination={activeDestination}
          compact={compact}
          currentHostType={currentHostType}
          destinations={destinations}
        />
        {authenticated ? <ModuleRefreshButton compact={compact} className="w-full" /> : null}
      </div>
    </nav>
  );
}
