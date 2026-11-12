// Extend this registry for future insurers without changing ERP Health/Pharmacy workflows.
export const HEALTH_INSURANCE_ADAPTERS = [{
  code: "HIRMS_HSL",
  labelFr: "MSO / HIRMS",
  labelEn: "MSO / HIRMS",
  sectors: ["HEALTH_CARE", "PHARMACY"],
  actions: ["VerifyMembers"],
  environment: "UAT",
  status: "PILOT",
}] as const;

export type InsuranceMemberVerification = {
  memberNumber: string;
  cardReference: string;
  serviceCode?: string;
  codeSystem?: "CPT" | "CDT" | "HCPCS" | "DRUG";
  serviceDate?: string;
};

export type InsuranceVerificationResult = {
  verified: boolean;
  memberName: string | null;
  planName: string | null;
  serviceDate: string | null;
  cover: "Active" | "NotStarted" | "Ended" | null;
  service: "Covered" | "NeedsPreAuthorisation" | "NotCovered" | "UnknownCode" | null;
  network: "Allowed" | "NeedsPreAuthorisation" | "NotAllowed" | null;
};

export type HealthInsuranceAdapter = {
  code: string;
  checkConnection(credentials: { username: string; secret: string }): Promise<void>;
  verify(credentials: { username: string; secret: string }, input: InsuranceMemberVerification): Promise<InsuranceVerificationResult>;
};

export class InsuranceConnectorError extends Error {
  constructor(public readonly code: string, public readonly httpStatus = 409, public readonly retryAfter?: number) {
    super(code);
  }
}
