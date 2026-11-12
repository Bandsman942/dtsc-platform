import { InsuranceConnectorError } from "./registry";

export type HirmsEnvironment = "UAT" | "PRODUCTION";
export const HIRMS_ENVIRONMENTS = ["UAT", "PRODUCTION"] as const;

/** Immutable HSL allow-list: never accept URLs from a tenant or a request. */
const HSL_HOSTS: Record<HirmsEnvironment, { api: string; token: string }> = {
  UAT: {
    api: "https://hslapi.alatlabs.com",
    token: "https://hslauth.alatlabs.com/application/o/token/",
  },
  PRODUCTION: {
    api: "https://hirmsapi.healthsystemlink.com",
    token: "https://auth.healthsystemlink.com/application/o/token/",
  },
};
export function hirmsEndpoints(environment: HirmsEnvironment) {
  return HSL_HOSTS[environment];
}

/** Production is an opt-in platform decision, not an enterprise form toggle. */
export function isHirmsProductionApprovedForOrganization(organizationId: string): boolean {
  // Fail closed: an operator must explicitly list every authorized enterprise.
  // Do not allow '*' and do not accept IDs from headers or request bodies.
  const allowed = process.env.HEALTH_INSURANCE_HIRMS_PRODUCTION_ORGANIZATION_IDS || "";
  return Boolean(organizationId) && allowed.split(",").map(value => value.trim()).includes(organizationId);
}
export function assertHirmsEnvironmentEnabled(environment: HirmsEnvironment, organizationId?: string) {
  if (environment === "PRODUCTION" && process.env.HEALTH_INSURANCE_HIRMS_PRODUCTION_ENABLED !== "true") {
    throw new InsuranceConnectorError("HIRMS_PRODUCTION_NOT_ENABLED", 403);
  }
  if (environment === "PRODUCTION" && !isHirmsProductionApprovedForOrganization(organizationId || "")) {
    // Internal transport may call with no organizationId, but outbound service must
    // enforce the org-scope before invoking this function.
    throw new InsuranceConnectorError("HIRMS_PRODUCTION_ORGANIZATION_NOT_APPROVED", 403);
  }
}
export function assertHirmsInvoiceSendEnabled(environment: HirmsEnvironment, organizationId: string) {
  assertHirmsEnvironmentEnabled(environment, organizationId);
  const key = environment === "PRODUCTION"
    ? "HEALTH_INSURANCE_HIRMS_PRODUCTION_INVOICE_SEND_ENABLED"
    : "HEALTH_INSURANCE_HIRMS_UAT_INVOICE_SEND_ENABLED";
  if (process.env[key] !== "true") {
    throw new InsuranceConnectorError("HIRMS_INVOICE_SENDING_DISABLED", 403);
  }
}
