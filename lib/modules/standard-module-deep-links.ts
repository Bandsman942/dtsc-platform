import { resolveStandardModuleHref } from "@/lib/modules/standard-module-navigation";
import { getStandardModuleDefinition } from "@/lib/modules/standard-module-registry";

export type StandardModuleDeepLinkInput = {
  moduleCode: string;
  objectId?: string | null;
  section?: string | null;
  action?: string | null;
  context?: string | null;
  organizationId?: string | null;
};

const SAFE_VALUE = /^[A-Za-z0-9._:-]{1,160}$/;

function appendSafeParam(url: URL, key: string, value?: string | null) {
  const normalized = value?.trim();
  if (!normalized || !SAFE_VALUE.test(normalized)) return;
  url.searchParams.set(key, normalized);
}

export function buildStandardModuleDeepLink(input: StandardModuleDeepLinkInput) {
  const definition = getStandardModuleDefinition(input.moduleCode);
  if (!definition) return null;
  const base = resolveStandardModuleHref(definition);
  if (!base) return null;
  const url = new URL(base, "http://localhost");
  appendSafeParam(url, "objectId", input.objectId);
  appendSafeParam(url, "section", input.section);
  appendSafeParam(url, "action", input.action);
  appendSafeParam(url, "context", input.context);
  appendSafeParam(url, "organizationId", input.organizationId);
  return url.origin === "http://localhost" ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}

export function parseStandardModuleDeepLink(value: string) {
  const url = new URL(value, "http://localhost");
  const read = (key: string) => {
    const candidate = url.searchParams.get(key);
    return candidate && SAFE_VALUE.test(candidate) ? candidate : null;
  };
  return {
    pathname: url.pathname,
    objectId: read("objectId"),
    section: read("section"),
    action: read("action"),
    context: read("context"),
    organizationId: read("organizationId"),
  };
}
