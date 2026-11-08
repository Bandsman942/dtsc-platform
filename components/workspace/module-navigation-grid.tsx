"use client";

import Link from "next/link";
import {
  Activity, ArrowUpRight, BadgeDollarSign, BarChart3, BellRing, BookOpen, Bot,
  BriefcaseBusiness, Building2, CalendarDays, ChartNoAxesCombined, CheckCheck,
  CircleHelp, ClipboardCheck, ClipboardList, Clock3, ContactRound, CreditCard,
  FileCheck2, FileSignature, FileText, FolderKanban, Funnel, GraduationCap,
  HeartPulse, Landmark, Layers3, LoaderCircle, MonitorSmartphone, PackageCheck,
  PackageSearch, Pill, ReceiptText, Settings2, ShieldCheck, ShoppingBasket,
  ShoppingCart, Truck, UsersRound, Wallet, Warehouse, Workflow, Wrench,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

/** Presentation only: callers must supply links already resolved by the server RBAC/entitlement registry. */
export type ModuleNavigationCard = {
  code: string;
  label: string;
  description: string;
  href: string;
  icon?: string | null;
  status?: "ACTIVE" | "BETA";
};

const ICONS: Record<string, LucideIcon> = {
  "activity": Activity,
  "badge-dollar-sign": BadgeDollarSign,
  "bar-chart-3": BarChart3,
  "bell-ring": BellRing,
  "book-open": BookOpen,
  "bot": Bot,
  "briefcase-business": BriefcaseBusiness,
  "building-2": Building2,
  "calendar-days": CalendarDays,
  "chart-no-axes-combined": ChartNoAxesCombined,
  "check-check": CheckCheck,
  "clipboard-check": ClipboardCheck,
  "clipboard-list": ClipboardList,
  "clock-3": Clock3,
  "contact-round": ContactRound,
  "credit-card": CreditCard,
  "file-check-2": FileCheck2,
  "file-signature": FileSignature,
  "file-text": FileText,
  "folder-kanban": FolderKanban,
  "funnel": Funnel,
  "graduation-cap": GraduationCap,
  "heart-pulse": HeartPulse,
  "landmark": Landmark,
  "layers-3": Layers3,
  "monitor-smartphone": MonitorSmartphone,
  "package-check": PackageCheck,
  "package-search": PackageSearch,
  "pill": Pill,
  "receipt-text": ReceiptText,
  "settings-2": Settings2,
  "shield-check": ShieldCheck,
  "shopping-basket": ShoppingBasket,
  "shopping-cart": ShoppingCart,
  "truck": Truck,
  "users-round": UsersRound,
  "wallet": Wallet,
  "warehouse": Warehouse,
  "workflow": Workflow,
  "wrench": Wrench,
};

function iconForCard(item: ModuleNavigationCard): LucideIcon {
  const registryIcon = item.icon?.trim().toLowerCase().replace(/_/g, "-");
  if (registryIcon && ICONS[registryIcon]) return ICONS[registryIcon];
  const code = item.code.toUpperCase();
  if (/HEALTH|PATIENT|CONSULT|MEDICAL|LAB/.test(code)) return HeartPulse;
  if (/PHARM|DRUG|MEDICINE/.test(code)) return Pill;
  if (/EDUCATION|COURSE|STUDENT/.test(code)) return GraduationCap;
  if (/FINANCE|ACCOUNT|CASH|BUDGET|PAYMENT/.test(code)) return Wallet;
  if (/RETAIL|POS|SALES|ORDER/.test(code)) return ShoppingBasket;
  if (/STOCK|INVENTORY|WAREHOUSE/.test(code)) return PackageCheck;
  if (/TASK|REQUEST|OPERAT/.test(code)) return ClipboardList;
  if (/APPROVAL|VALIDATION/.test(code)) return ClipboardCheck;
  if (/MEETING|CALENDAR/.test(code)) return CalendarDays;
  if (/WORKFLOW/.test(code)) return Workflow;
  if (/PROJECT|DELIVERABLE/.test(code)) return FolderKanban;
  if (/HUMAN|HR|EMPLOYEE|STAFF/.test(code)) return UsersRound;
  if (/DOCUMENT|CONTRACT/.test(code)) return FileText;
  if (/REPORT|ANALYTIC/.test(code)) return BarChart3;
  if (/ASSET|MAINTENANCE/.test(code)) return Wrench;
  if (/SUPPLIER|PURCHASE/.test(code)) return Truck;
  if (/AI|ASSISTANT/.test(code)) return Bot;
  if (/ADMIN|CONFIG/.test(code)) return Settings2;
  return CircleHelp;
}

export function ModuleNavigationGrid({
  items,
  ariaLabel,
  locale,
  className,
}: {
  items: readonly ModuleNavigationCard[];
  ariaLabel: string;
  locale?: string | null;
  className?: string;
}) {
  const pathname = usePathname();
  const english = locale === "en";
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setPendingCode(null);
    setSlow(false);
  }, [pathname]);

  useEffect(() => {
    if (!pendingCode) return;
    setSlow(false);
    const timeout = window.setTimeout(() => setSlow(true), 6000);
    return () => window.clearTimeout(timeout);
  }, [pendingCode]);

  function onNavigate(event: MouseEvent<HTMLAnchorElement>, code: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    setPendingCode(code);
  }

  return (
    <nav
      data-module-navigation-grid
      aria-label={ariaLabel}
      className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}
    >
      {items.map((item) => {
        const Icon = iconForCard(item);
        const pending = pendingCode === item.code;
        return (
          <Link
            key={item.code}
            href={item.href}
            data-module-navigation-card={item.code}
            data-enterprise-module-code={item.code}
            aria-label={`${english ? "Open" : "Ouvrir"} ${item.label}`}
            aria-busy={pending}
            onClick={(event) => onNavigate(event, item.code)}
            className="group flex min-h-28 min-w-0 items-start gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-left shadow-[0_6px_24px_rgba(0,23,54,0.045)] transition duration-150 hover:-translate-y-0.5 hover:border-cyan-500/60 hover:bg-dtsc-soft/55 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:translate-y-0"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-dtsc-blue dark:text-cyan-300">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-wrap items-start gap-2">
                <span className="min-w-0 break-words text-sm font-extrabold tracking-tight text-dtsc-ink sm:text-base">{item.label}</span>
                {item.status === "BETA" ? (
                  <span className="rounded-full bg-dtsc-soft px-1.5 py-0.5 text-[10px] font-bold text-dtsc-blue">Beta</span>
                ) : null}
              </span>
              <span className="mt-1 block break-words text-xs leading-5 text-dtsc-muted">{item.description}</span>
              {pending ? (
                <span role="status" className="mt-2 block text-xs font-semibold text-dtsc-blue" aria-live="polite">
                  {slow
                    ? english ? "Still loading… Check your connection or try again." : "Chargement prolongé… Vérifiez la connexion ou réessayez."
                    : english ? "Opening workspace…" : "Ouverture de l’espace…"}
                </span>
              ) : null}
            </span>
            {pending ? (
              <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-dtsc-blue" aria-hidden="true" />
            ) : (
              <ArrowUpRight className="h-4 w-4 shrink-0 text-dtsc-blue transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
