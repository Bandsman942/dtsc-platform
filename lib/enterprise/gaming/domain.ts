export const GAMING_SECTOR_CODE = "HOSPITALITY_EVENTS" as const;
export const GAMING_BUSINESS_SUBTYPE_CODE = "GAMING_LOUNGE" as const;

export const GAMING_MODULE_CODES = [
  "GAMING_DASHBOARD",
  "GAMING_STATIONS",
  "GAMING_SESSIONS",
  "GAMING_BOOKINGS",
  "GAMING_PRICING_PACKAGES",
  "GAMING_CHECKOUT",
  "GAMING_DAILY_CLOSE",
  "GAMING_TOURNAMENTS",
  "GAMING_REPORTS",
] as const;
export type GamingModuleCode = (typeof GAMING_MODULE_CODES)[number];

export const GAMING_DASHBOARD_PERMISSIONS = [
  "enterprise.gaming.overview.read",
  "enterprise.gaming.overview.manage",
] as const;
export type GamingDashboardPermission = (typeof GAMING_DASHBOARD_PERMISSIONS)[number];

export const GAMING_STATION_PERMISSIONS = [
  "enterprise.gaming.stations.read",
  "enterprise.gaming.stations.create",
  "enterprise.gaming.stations.update",
  "enterprise.gaming.stations.manage",
] as const;
export type GamingStationPermission = (typeof GAMING_STATION_PERMISSIONS)[number];

export const GAMING_SESSION_PERMISSIONS = [
  "enterprise.gaming.sessions.read",
  "enterprise.gaming.sessions.create",
  "enterprise.gaming.sessions.update",
  "enterprise.gaming.sessions.manage",
] as const;
export type GamingSessionPermission = (typeof GAMING_SESSION_PERMISSIONS)[number];

export const GAMING_BOOKING_PERMISSIONS = [
  "enterprise.gaming.bookings.read",
  "enterprise.gaming.bookings.create",
  "enterprise.gaming.bookings.update",
  "enterprise.gaming.bookings.manage",
] as const;
export type GamingBookingPermission = (typeof GAMING_BOOKING_PERMISSIONS)[number];

export const GAMING_PRICING_PERMISSIONS = [
  "enterprise.gaming.pricing.read",
  "enterprise.gaming.pricing.create",
  "enterprise.gaming.pricing.update",
  "enterprise.gaming.pricing.manage",
] as const;
export type GamingPricingPermission = (typeof GAMING_PRICING_PERMISSIONS)[number];

export const GAMING_CHECKOUT_PERMISSIONS = [
  "enterprise.gaming.checkout.read",
  "enterprise.gaming.checkout.create",
  "enterprise.gaming.checkout.update",
  "enterprise.gaming.checkout.manage",
] as const;
export type GamingCheckoutPermission = (typeof GAMING_CHECKOUT_PERMISSIONS)[number];

export const GAMING_CLOSE_PERMISSIONS = [
  "enterprise.gaming.close.read",
  "enterprise.gaming.close.create",
  "enterprise.gaming.close.update",
  "enterprise.gaming.close.manage",
] as const;
export type GamingClosePermission = (typeof GAMING_CLOSE_PERMISSIONS)[number];

export const GAMING_TOURNAMENT_PERMISSIONS = [
  "enterprise.gaming.tournaments.read",
  "enterprise.gaming.tournaments.create",
  "enterprise.gaming.tournaments.update",
  "enterprise.gaming.tournaments.manage",
] as const;
export type GamingTournamentPermission = (typeof GAMING_TOURNAMENT_PERMISSIONS)[number];

export const GAMING_REPORT_PERMISSIONS = [
  "enterprise.gaming.reports.read",
  "enterprise.gaming.reports.create",
  "enterprise.gaming.reports.manage",
] as const;
export type GamingReportPermission = (typeof GAMING_REPORT_PERMISSIONS)[number];

export const GAMING_STATION_STATUSES = ["AVAILABLE", "IN_USE", "RESERVED", "MAINTENANCE", "OUT_OF_SERVICE"] as const;
export type GamingStationStatus = (typeof GAMING_STATION_STATUSES)[number];

export const GAMING_SESSION_STATUSES = ["WAITING", "ACTIVE", "PAUSED", "ENDED", "TO_CHECKOUT", "PAID", "CANCELLED"] as const;
export type GamingSessionStatus = (typeof GAMING_SESSION_STATUSES)[number];
export const GAMING_SESSION_ACTIONS = ["START", "PAUSE", "RESUME", "EXTEND", "TRANSFER", "END", "CHECKOUT_PAID"] as const;
export type GamingSessionAction = (typeof GAMING_SESSION_ACTIONS)[number];

export const GAMING_BOOKING_STATUSES = ["DRAFT", "CONFIRMED", "CHECKED_IN", "NO_SHOW", "CANCELLED", "CONVERTED"] as const;
export type GamingBookingStatus = (typeof GAMING_BOOKING_STATUSES)[number];
export const GAMING_BOOKING_ACTIONS = ["CREATE", "UPDATE", "CONFIRM", "CHECK_IN", "NO_SHOW", "CANCEL", "CONVERT"] as const;
export type GamingBookingAction = (typeof GAMING_BOOKING_ACTIONS)[number];

export const GAMING_PRICING_MODES = ["FIXED_DURATION", "PER_MINUTE", "PER_HOUR", "PACKAGE"] as const;
export type GamingPricingMode = (typeof GAMING_PRICING_MODES)[number];
export const GAMING_PRICING_RULE_STATUSES = ["DRAFT", "ACTIVE", "INACTIVE"] as const;
export type GamingPricingRuleStatus = (typeof GAMING_PRICING_RULE_STATUSES)[number];
export const GAMING_PRICING_RULE_ACTIONS = ["UPDATE", "ACTIVATE", "DEACTIVATE", "ARCHIVE"] as const;
export type GamingPricingRuleAction = (typeof GAMING_PRICING_RULE_ACTIONS)[number];

export const GAMING_CHECKOUT_STATUSES = ["INVOICE_PENDING", "AWAITING_PAYMENT", "PARTIALLY_PAID", "PAID", "REFUND_PENDING", "REFUNDED", "CANCELLED"] as const;
export type GamingCheckoutStatus = (typeof GAMING_CHECKOUT_STATUSES)[number];
export const GAMING_CHECKOUT_ACTIONS = ["PREPARE", "APPROVE_INVOICE", "ADD_PAYMENT", "APPROVE_PAYMENT", "CANCEL", "REQUEST_REFUND", "APPROVE_REFUND"] as const;
export type GamingCheckoutAction = (typeof GAMING_CHECKOUT_ACTIONS)[number];

export const GAMING_DAILY_CLOSE_STATUSES = ["SUBMITTED", "VALIDATED", "REJECTED"] as const;
export type GamingDailyCloseStatus = (typeof GAMING_DAILY_CLOSE_STATUSES)[number];

export const GAMING_TOURNAMENT_FORMATS = ["SINGLE_ELIMINATION", "DOUBLE_ELIMINATION", "ROUND_ROBIN", "LEAGUE", "CUSTOM"] as const;
export type GamingTournamentFormat = (typeof GAMING_TOURNAMENT_FORMATS)[number];
export const GAMING_TOURNAMENT_STATUSES = ["DRAFT", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type GamingTournamentStatus = (typeof GAMING_TOURNAMENT_STATUSES)[number];
export const GAMING_TOURNAMENT_ACTIONS = ["UPDATE", "OPEN_REGISTRATION", "CLOSE_REGISTRATION", "START", "COMPLETE", "CANCEL", "ARCHIVE"] as const;
export type GamingTournamentAction = (typeof GAMING_TOURNAMENT_ACTIONS)[number];
export const GAMING_TOURNAMENT_REGISTRATION_STATUSES = ["REGISTERED", "CHECKED_IN", "WITHDRAWN", "DISQUALIFIED", "COMPLETED"] as const;
export type GamingTournamentRegistrationStatus = (typeof GAMING_TOURNAMENT_REGISTRATION_STATUSES)[number];
export const GAMING_TOURNAMENT_REGISTRATION_ACTIONS = ["CHECK_IN", "WITHDRAW", "DISQUALIFY", "SET_RESULT"] as const;
export type GamingTournamentRegistrationAction = (typeof GAMING_TOURNAMENT_REGISTRATION_ACTIONS)[number];

function normalizeCode(value: string | null | undefined) {
  return value?.trim().toUpperCase() || "";
}

export function isGamingLoungeSubtype(sectorCode: string | null | undefined, businessSubtypeCode: string | null | undefined) {
  return normalizeCode(sectorCode) === GAMING_SECTOR_CODE && normalizeCode(businessSubtypeCode) === GAMING_BUSINESS_SUBTYPE_CODE;
}

export function isGamingModuleCode(value: string | null | undefined): value is GamingModuleCode {
  const normalized = normalizeCode(value);
  return GAMING_MODULE_CODES.includes(normalized as GamingModuleCode);
}
