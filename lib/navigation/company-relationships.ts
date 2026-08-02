export const COMPANY_RELATIONSHIPS_NAVIGATION = {
  code: "COMPANY_RELATIONSHIPS",
  href: "/enterprise-links",
  labelFr: "Relations avec les entreprises",
  labelEn: "Company relationships",
  mobileLabelFr: "Entreprises",
  mobileLabelEn: "Companies",
  order: 65,
  iconKey: "building-2",
} as const;

export const COMPANY_RELATIONSHIP_USER_ACTION_STATUSES = [
  "INVITATION_PENDING",
  "USER_CONSENT_REQUIRED",
] as const;

export function getCompanyRelationshipsLabel(locale?: string | null, compact = false) {
  if (locale === "en") {
    return compact
      ? COMPANY_RELATIONSHIPS_NAVIGATION.mobileLabelEn
      : COMPANY_RELATIONSHIPS_NAVIGATION.labelEn;
  }
  return compact
    ? COMPANY_RELATIONSHIPS_NAVIGATION.mobileLabelFr
    : COMPANY_RELATIONSHIPS_NAVIGATION.labelFr;
}

export function isCompanyRelationshipsPath(pathname: string) {
  return pathname === COMPANY_RELATIONSHIPS_NAVIGATION.href
    || pathname.startsWith(`${COMPANY_RELATIONSHIPS_NAVIGATION.href}/`);
}
