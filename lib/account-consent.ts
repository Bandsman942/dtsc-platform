import { createHash } from "node:crypto";

export const ACCOUNT_CONSENT_TYPE = "ACCOUNT_TERMS_AND_PRIVACY";
export const ACCOUNT_LEGAL_DOCUMENT_VERSION = "2026-08-06";

export function resolveAccountConsentLocale(acceptLanguage: string | null | undefined) {
  return acceptLanguage?.toLowerCase().startsWith("en") ? "en" : "fr";
}

export function buildAccountConsentStatement(locale: "fr" | "en") {
  return locale === "en"
    ? `I accept the DTSC Terms of Use and Privacy Policy, version ${ACCOUNT_LEGAL_DOCUMENT_VERSION}.`
    : `J’accepte les Conditions d’utilisation et la Politique de confidentialité DTSC, version ${ACCOUNT_LEGAL_DOCUMENT_VERSION}.`;
}

export function digestAccountConsentStatement(statement: string) {
  return createHash("sha256").update(statement, "utf8").digest("hex");
}
