export const RETAIL_CORE_PROFILE_CODE = "RETAIL_CORE" as const;
export const RETAIL_TELCO_MOBILE_MONEY_PROFILE_CODE = "RETAIL_TELCO_MOBILE_MONEY" as const;

export const RETAIL_EXTENSION_CODES = ["MOBILE_MONEY", "TELCO"] as const;
export type RetailExtensionCode = (typeof RETAIL_EXTENSION_CODES)[number];

export type RetailBusinessProfileCode =
  | typeof RETAIL_CORE_PROFILE_CODE
  | typeof RETAIL_TELCO_MOBILE_MONEY_PROFILE_CODE;

export type RetailProfileContract = {
  profileCode: RetailBusinessProfileCode;
  requiredExtensions: readonly RetailExtensionCode[];
};

export const RETAIL_PROFILE_CONTRACTS: Readonly<Record<RetailBusinessProfileCode, RetailProfileContract>> = {
  RETAIL_CORE: {
    profileCode: RETAIL_CORE_PROFILE_CODE,
    requiredExtensions: [],
  },
  RETAIL_TELCO_MOBILE_MONEY: {
    profileCode: RETAIL_TELCO_MOBILE_MONEY_PROFILE_CODE,
    requiredExtensions: RETAIL_EXTENSION_CODES,
  },
};

export function isRetailBusinessProfileCode(value: string): value is RetailBusinessProfileCode {
  return value === RETAIL_CORE_PROFILE_CODE || value === RETAIL_TELCO_MOBILE_MONEY_PROFILE_CODE;
}

export function getRetailProfileContract(profileCode: string): RetailProfileContract | null {
  return isRetailBusinessProfileCode(profileCode) ? RETAIL_PROFILE_CONTRACTS[profileCode] : null;
}

export function retailProfileHasExtension(profileCode: string, extension: RetailExtensionCode) {
  return getRetailProfileContract(profileCode)?.requiredExtensions.includes(extension) ?? false;
}
