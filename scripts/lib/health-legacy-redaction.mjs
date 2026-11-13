/**
 * P0 #1146 — Eligibility for PHI minimisation of legacy ERP projections.
 * Do not import any clinical source-of-truth model into this helper.
 */
export const DEDICATED_HEALTH_LEGACY_MODULES = Object.freeze([
  "PATIENTS", "APPOINTMENTS", "CONSULTATIONS", "MEDICAL_RECORDS",
  "CARE_TEAM", "LABORATORY", "INTERNAL_PHARMACY", "MEDICAL_BILLING",
  "INSURANCE_COVERAGE", "QUALITY_INCIDENTS", "MEDICAL_DOCUMENTS",
]);

const allowedModules = new Set(DEDICATED_HEALTH_LEGACY_MODULES);

export function isRedactionCandidate(record) {
  if (record?.sectorCode !== "HEALTH_CARE" || !allowedModules.has(record.moduleCode)) {
    return false;
  }
  const sanitizedTitle = record.moduleCode + " · historique";
  const payload = record.payloadJson;
  const safePayload = payload === null || payload === undefined ||
    (typeof payload === "object" && !Array.isArray(payload) &&
      Object.keys(payload).length === 0);
  return record.title !== sanitizedTitle || record.summary != null || !safePayload;
}

export function sanitizedLegacyFields(record) {
  if (record?.sectorCode !== "HEALTH_CARE" || !allowedModules.has(record.moduleCode)) {
    throw new Error("NOT_DEDICATED_HEALTH_PROJECTION");
  }
  return {
    title: record.moduleCode + " · historique",
    summary: null,
    payloadJson: {},
  };
}
