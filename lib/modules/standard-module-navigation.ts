import { buildUrlForHostType, type HostType } from "@/lib/domains";
import {
  getStandardModuleDefinition,
  getStandardModuleDescription,
  getStandardModuleLabel,
  isStandardModuleNavigable,
  listStandardModuleDefinitions,
  type StandardModuleDefinition,
  type StandardModuleHost,
} from "@/lib/modules/standard-module-registry";

const HOST_TYPE_BY_STANDARD_HOST: Record<StandardModuleHost, HostType> = {
  PUBLIC: "public",
  APP: "app",
  ACCOUNT: "account",
  CONSOLE: "console",
  SUPPORT: "support",
};

export type StandardNavigationItem = {
  code: string;
  href: string;
  path: string;
  label: string;
  description: string;
  iconKey: string;
  navigationOrder: number;
  navigationGroup: string;
  host: StandardModuleHost;
};

function pathWithoutQuery(path: string) {
  return path.split(/[?#]/, 1)[0] || "/";
}

export function resolveStandardModuleHref(definitionOrCode: StandardModuleDefinition | string) {
  const definition = typeof definitionOrCode === "string"
    ? getStandardModuleDefinition(definitionOrCode)
    : definitionOrCode;
  if (!definition?.routePath) return null;
  return buildUrlForHostType(HOST_TYPE_BY_STANDARD_HOST[definition.host], definition.routePath);
}

export function toStandardNavigationItem(definition: StandardModuleDefinition, locale?: string | null): StandardNavigationItem | null {
  if (!isStandardModuleNavigable(definition) || !definition.routePath) return null;
  const href = resolveStandardModuleHref(definition);
  if (!href) return null;
  return {
    code: definition.code,
    href,
    path: pathWithoutQuery(definition.routePath),
    label: getStandardModuleLabel(definition, locale),
    description: getStandardModuleDescription(definition, locale),
    iconKey: definition.iconKey,
    navigationOrder: definition.navigationOrder,
    navigationGroup: definition.navigationGroup,
    host: definition.host,
  };
}

export function listStandardNavigationItems(options?: {
  navigationGroup?: string;
  locale?: string | null;
  includeCodes?: string[];
}) {
  const includeCodes = options?.includeCodes ? new Set(options.includeCodes) : null;
  return listStandardModuleDefinitions({ navigationGroup: options?.navigationGroup })
    .filter((definition) => !includeCodes || includeCodes.has(definition.code))
    .map((definition) => toStandardNavigationItem(definition, options?.locale))
    .filter((item): item is StandardNavigationItem => Boolean(item));
}

export function resolveStandardLegacyRoute(pathname: string) {
  for (const definition of listStandardModuleDefinitions()) {
    if (!definition.routePath) continue;
    const legacyRoute = (definition.legacyRoutes || []).find((route) => route === pathname || pathname.startsWith(`${route}/`));
    if (legacyRoute) return resolveStandardModuleHref(definition);
  }
  return null;
}
