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
export function assertHirmsEnvironmentEnabled(environment: HirmsEnvironment) {
  if (environment === "PRODUCTION" && process.env.HEALTH_INSURANCE_HIRMS_PRODUCTION_ENABLED !== "true") {
    throw new InsuranceConnectorError("HIRMS_PRODUCTION_NOT_ENABLED", 403);
  }
}
export function assertHirmsInvoiceSendEnabled(environment: HirmsEnvironment) {
  assertHirmsEnvironmentEnabled(environment);
  const key = environment === "PRODUCTION"
    ? "HEALTH_INSURANCE_HIRMS_PRODUCTION_INVOICE_SEND_ENABLED"
    : "HEALTH_INSURANCE_HIRMS_UAT_INVOICE_SEND_ENABLED";
  if (process.env[key] !== "true") {
    throw new InsuranceConnectorError("HIRMS_INVOICE_SENDING_DISABLED", 403);
  }
}
