import {
  translateEnterpriseCore,
  type EnterpriseCoreKey,
} from "@/lib/i18n";

export type { EnterpriseCoreKey } from "@/lib/i18n";

export function enterpriseCoreT(
  locale: string | null | undefined,
  key: EnterpriseCoreKey,
  vars?: Record<string, string | number>,
) {
  const template = translateEnterpriseCore(locale, key);
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(vars[name] ?? ""));
}
