/**
 * Legacy generic Health records are compatibility references, not a medical
 * data API. Deny old clinical text/PII at ERP reader boundaries.
 */
const DEDICATED_HEALTH_MODULES = new Set([
  "PATIENTS","APPOINTMENTS","CONSULTATIONS","MEDICAL_RECORDS","CARE_TEAM",
  "LABORATORY","INTERNAL_PHARMACY","MEDICAL_BILLING","INSURANCE_COVERAGE",
  "QUALITY_INCIDENTS","MEDICAL_DOCUMENTS",
]);
export function safeHealthLegacyProjection<T extends {
  moduleCode: string; title: string; summary: string | null; payloadJson: unknown;
}>(record:T):T {
  if(!DEDICATED_HEALTH_MODULES.has(record.moduleCode))return record;
  return {...record,title:`${record.moduleCode} · historique`,summary:null,payloadJson:{}} as T;
}
