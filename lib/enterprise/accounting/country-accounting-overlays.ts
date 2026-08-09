import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

export type CountryAccountingOverlay = {
  code: string;
  countryCode: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string;
  compatibleFrameworkCodes: readonly string[];
  compatibleTemplateReferences: readonly string[];
  source: {
    authority: string;
    reference: string;
    verifiedAt: string;
  };
  additionalAccountRecommendations: readonly {
    code: string;
    labelFr: string;
    labelEn: string;
    rationale: string;
  }[];
  semanticMappingOverrides: readonly {
    mappingKey: string;
    accountCode: string;
  }[];
  reportingRequirements: readonly string[];
};

// Deliberately empty until a country rule has a reviewed source. Country tax rates and
// volatile national obligations must never be invented inside the common SYSCOHADA template.
export const COUNTRY_ACCOUNTING_OVERLAYS = Object.freeze([] satisfies readonly CountryAccountingOverlay[]);

export function getCountryAccountingOverlay(codeOrReference: string) {
  return COUNTRY_ACCOUNTING_OVERLAYS.find((overlay) => overlay.code === codeOrReference || `${overlay.code}@${overlay.version}` === codeOrReference);
}

export function assertCountryOverlayCompatible(input: {
  overlay: CountryAccountingOverlay;
  frameworkCode: string;
  templateReference: string;
  accountingDate: Date;
}) {
  if (!input.overlay.compatibleFrameworkCodes.includes(input.frameworkCode)) {
    throw new EnterpriseAccountingError("COUNTRY_ACCOUNTING_OVERLAY_FRAMEWORK_INCOMPATIBLE", 409, { overlayCode: input.overlay.code });
  }
  if (input.overlay.compatibleTemplateReferences.length && !input.overlay.compatibleTemplateReferences.includes(input.templateReference)) {
    throw new EnterpriseAccountingError("COUNTRY_ACCOUNTING_OVERLAY_TEMPLATE_INCOMPATIBLE", 409, { overlayCode: input.overlay.code });
  }
  const effectiveFrom = new Date(`${input.overlay.effectiveFrom}T00:00:00.000Z`);
  const effectiveTo = input.overlay.effectiveTo ? new Date(`${input.overlay.effectiveTo}T23:59:59.999Z`) : null;
  if (input.accountingDate < effectiveFrom || (effectiveTo && input.accountingDate > effectiveTo)) {
    throw new EnterpriseAccountingError("COUNTRY_ACCOUNTING_OVERLAY_NOT_EFFECTIVE", 409, { overlayCode: input.overlay.code });
  }
  if (!input.overlay.source.authority || !input.overlay.source.reference || !input.overlay.source.verifiedAt) {
    throw new EnterpriseAccountingError("COUNTRY_ACCOUNTING_OVERLAY_SOURCE_REQUIRED", 409, { overlayCode: input.overlay.code });
  }
  return input.overlay;
}
