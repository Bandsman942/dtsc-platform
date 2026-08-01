import { HEALTH_ACCOUNTING_EVENT_MAP } from "@/lib/enterprise/accounting/sector-adapters/health";
import { PHARMACY_ACCOUNTING_EVENT_MAP } from "@/lib/enterprise/accounting/sector-adapters/pharmacy";

export const ENTERPRISE_SECTOR_ACCOUNTING_ADAPTERS = {
  PHARMACY: PHARMACY_ACCOUNTING_EVENT_MAP,
  HEALTH_CARE: HEALTH_ACCOUNTING_EVENT_MAP,
} as const;

export type EnterpriseSectorCode = keyof typeof ENTERPRISE_SECTOR_ACCOUNTING_ADAPTERS;

export function resolveSectorAccountingDirective(sector: EnterpriseSectorCode, eventType: string) {
  const registry = ENTERPRISE_SECTOR_ACCOUNTING_ADAPTERS[sector] as Record<string, { commonEvent: string | null; sourceEntityType: string; separatePosting: boolean }>;
  return registry[eventType] || null;
}
